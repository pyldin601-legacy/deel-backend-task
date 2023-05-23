const express = require("express");
const bodyParser = require("body-parser");
const z = require("zod");
const {
  Op,
  Transaction: { ISOLATION_LEVELS },
} = require("sequelize");
const { sequelize } = require("./model");
const { serialize, serializeAll } = require("./serializer");
const { getProfile } = require("./middleware/getProfile");

const app = express();
app.use(bodyParser.json());
app.set("sequelize", sequelize);
app.set("models", sequelize.models);

/**
 * Handles a GET request to get list of non-terminated contracts.
 */
app.get("/contracts", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const profileId = req.profile.get("id");
  const contracts = await Contract.findAll({
    where: {
      [Op.or]: [{ ContractorId: profileId }, { ClientId: profileId }],
      status: { [Op.not]: "terminated" },
    },
  });

  return res.json(serializeAll(contracts, null));
});

/**
 * Handles a GET request to get the contract.
 */
app.get("/contracts/:id", getProfile, async (req, res) => {
  const { Contract } = req.app.get("models");
  const profileId = req.profile;
  const { id } = req.params;
  const contract = await Contract.findOne({ where: { id } });

  if (!contract) {
    return res.status(404).end();
  }

  if (
    contract.get("ClientId") !== profileId ||
    contract.get("ContractorId") !== profileId
  ) {
    return res.status(403).end();
  }

  return res.json(serialize(contract, null));
});

/**
 * Handles a GET request to get the list of unpaid jobs.
 */
app.get("/jobs/unpaid", getProfile, async (req, res) => {
  const { Contract, Job } = req.app.get("models");
  const profileId = req.profile.get("id");

  const jobs = await Job.findAll({
    include: [
      {
        model: Contract,
        required: true,
        where: {
          [Op.or]: [{ ContractorId: profileId }, { ClientId: profileId }],
          status: { [Op.not]: "terminated" },
        },
      },
    ],
    where: { paid: { [Op.not]: true } },
  });

  return res.json(serializeAll(jobs, null));
});

/**
 * Handles a POST request to pay for a job.
 */
app.post("/jobs/:id/pay", getProfile, async (req, res) => {
  const { Job, Profile, Contract } = req.app.get("models");
  const { profile } = req;
  const { id } = req.params;

  if (profile.type !== "client") {
    return res.status(403).end("WRONG_PROFILE_TYPE");
  }

  return sequelize.transaction(
    async (transaction) => {
      const client = await Profile.findOne({
        where: { id: profile.id },
        lock: true,
        transaction,
      });

      const job = await Job.findOne({
        where: { id },
        lock: true,
        include: [
          {
            model: Contract,
            include: [{ model: Profile, lock: true, as: "Contractor" }],
          },
        ],
        transaction,
      });

      if (!job) {
        return res.status(404).end("JOB_NOT_FOUND");
      }

      if (job.get("paid")) {
        return res.status(409).end("JOB_ALREADY_PAID");
      }

      if (client.get("balance") < job.get("price")) {
        return res.status(401).end("INSUFFICIENT_FUNDS");
      }

      const contract = await job.getContract();
      const contractor = await contract.getContractor();

      await Promise.all([
        contractor.increment("balance", {
          by: job.get("price"),
          transaction,
        }),
        profile.decrement("balance", {
          by: job.get("price"),
          transaction,
        }),
        job.update({ paid: true }, { transaction }),
      ]);

      return res.status(200).end();
    },
    { isolationLevel: ISOLATION_LEVELS.SERIALIZABLE }
  );
});

/**
 * Handles a POST request to deposit funds into a user's balance.
 */
app.post("/balances/deposit/:id", async (req, res) => {
  const { Job, Profile, Contract } = req.app.get("models");
  const { id } = req.params;
  const { amount: amountToDeposit } = req.body;

  if (amountToDeposit <= 0) {
    return res.status(400).end("DEPOSIT_AMOUNT_TOO_LOW");
  }

  return sequelize.transaction(
    async (transaction) => {
      const client = await Profile.findOne({
        where: { id },
        lock: true,
        transaction,
      });

      const jobs = await Job.findAll({
        include: [
          {
            model: Contract,
            required: true,
            where: {
              ClientId: client.id,
              status: { [Op.not]: "terminated" },
            },
          },
        ],
        where: { paid: { [Op.not]: true } },
        transaction,
      });
      const totalJobsToPay = jobs.reduce((acc, m) => acc + m.price, 0);
      const maxDepositAmount = totalJobsToPay * 0.25;

      if (amountToDeposit > maxDepositAmount) {
        return res.status(400).end("DEPOSIT_LIMIT_EXCEEDED");
      }

      await client.increment("balance", { by: amountToDeposit, transaction });

      return res.status(200).end();
    },
    { isolationLevel: ISOLATION_LEVELS.SERIALIZABLE }
  );
});

const BestProfessionQueryParams = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

app.get("/admin/best-profession", async (req, res) => {
  const { Profile, Contract, Job } = req.app.get("models");

  const parseResult = BestProfessionQueryParams.safeParse(req.query);

  if (!parseResult.success) {
    return res.status(400).json({
      errors: parseResult.error.issues,
    });
  }
  const parsedParams = parseResult.data;

  const topProfession = await Profile.findOne({
    attributes: {
      include: [[sequelize.fn("SUM", sequelize.col("price")), "totalEarned"]],
    },
    where: { type: "contractor" },
    order: [[sequelize.literal("totalEarned"), "DESC"]],
    group: "profession",
    include: [
      {
        model: Contract,
        attributes: [],
        as: "Contractor",
        required: true,
        duplicating: false,
        include: [
          {
            model: Job,
            attributes: [],
            required: true,
            duplicating: false,
            where: {
              paid: true,
              paymentDate: {
                [Op.between]: [parsedParams.start, parsedParams.end],
              },
            },
          },
        ],
      },
    ],
  });

  if (!topProfession) {
    return res.status(409).end("INSUFFICIENT_DATA");
  }

  const profession = topProfession.get("profession");
  const totalEarned = topProfession.get("totalEarned");

  return res.status(200).json({ profession, totalEarned });
});

const BestClientsQueryParams = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  limit: z.coerce.number().positive().default(2),
});

app.get("/admin/best-clients", async (req, res) => {
  const { Profile, Contract, Job } = req.app.get("models");

  const parseResult = BestClientsQueryParams.safeParse(req.query);

  if (!parseResult.success) {
    return res.status(400).json({
      errors: parseResult.error.issues,
    });
  }
  const parsedParams = parseResult.data;

  const topClients = await Profile.findAll({
    attributes: {
      include: [[sequelize.fn("sum", sequelize.literal("price")), "totalPaid"]],
    },
    where: { type: "client" },
    order: [[sequelize.fn("sum", sequelize.literal("price")), "DESC"]],
    group: [["Client.id"]],
    limit: parsedParams.limit,
    include: [
      {
        model: Contract,
        attributes: [],
        duplicating: false,
        as: "Client",
        required: true,
        include: [
          {
            model: Job,
            attributes: [],
            duplicating: false,
            required: true,
            where: {
              paid: true,
              paymentDate: {
                [Op.between]: [parsedParams.start, parsedParams.end],
              },
            },
          },
        ],
      },
    ],
  });

  return res.status(200).json(serializeAll(topClients));
});

module.exports = app;
