const supertest = require("supertest");
const app = require("./app");
const { seed } = require("./seed");

let request;
beforeEach(async () => {
  await seed();
  request = supertest(app);
});

describe("on GET /contracts", () => {
  it("should fail with 400 if profile_id header not set", async () => {
    await request.get("/contracts").expect(401);
  });

  it("should return a list of contracts belonging to a client", async () => {
    const response = await request.get("/contracts").set("profile_id", 3);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        ClientId: 3,
        ContractorId: 8,
        createdAt: expect.any(String),
        id: 5,
        status: "new",
        terms: "bla bla bla",
        updatedAt: expect.any(String),
      },
      {
        ClientId: 3,
        ContractorId: 7,
        createdAt: expect.any(String),
        id: 6,
        status: "in_progress",
        terms: "bla bla bla",
        updatedAt: expect.any(String),
      },
    ]);
  });

  it("should return a list of contracts belonging to a contractor", async () => {
    const response = await request.get("/contracts").set("profile_id", 8);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        ClientId: 3,
        ContractorId: 8,
        createdAt: expect.any(String),
        id: 5,
        status: "new",
        terms: "bla bla bla",
        updatedAt: expect.any(String),
      },
      {
        ClientId: 4,
        ContractorId: 8,
        createdAt: expect.any(String),
        id: 9,
        status: "in_progress",
        terms: "bla bla bla",
        updatedAt: expect.any(String),
      },
    ]);
  });
});

describe("on GET /contracts/:id", () => {
  it("should fail with 401 if profile_id header not set", async () => {
    await request.get("/contracts/3").expect(401);
  });

  it("should fail with 403 if contract belongs to another profile_id", async () => {
    await request.get("/contracts/3").set("profile_id", 1).expect(403);
  });
});

describe("on GET /jobs/unpaid", () => {
  it("should fail with 401 if profile_id header not set", async () => {
    await request.get("/jobs/unpaid").expect(401);
  });

  it("should return list of unpaid jobs", async () => {
    const response = await request.get("/jobs/unpaid").set("profile_id", 6);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        id: 2,
        description: "work",
        price: 201,
        paid: null,
        paymentDate: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        ContractId: 2,
        Contract: expect.objectContaining({
          status: "in_progress",
        }),
      },
      {
        id: 3,
        description: "work",
        price: 202,
        paid: null,
        paymentDate: null,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
        ContractId: 3,
        Contract: expect.objectContaining({
          status: "in_progress",
        }),
      },
    ]);
  });
});

describe("on POST /jobs/:job_id/pay", () => {
  it("should fail with 401 if profile_id header not set", async () => {
    await request.post("/jobs/3/pay").expect(401);
  });

  it("should pay the job", async () => {
    await request.post("/jobs/3/pay").set("profile_id", 2).expect(200);
  });

  it("should fail with 409 if the job already paid", async () => {
    await request.post("/jobs/14/pay").set("profile_id", 2).expect(409);
  });

  it("should fail with 401 if client has insufficient funds", async () => {
    await request
      .post("/jobs/5/pay")
      .set("profile_id", 4)
      .expect(401, "INSUFFICIENT_FUNDS");
  });
});

describe("on POST /balances/deposit/:userId", () => {
  // it("should fail with 401 if profile_id header not set", async () => {
  //   await request.post("/balances/deposit/3").expect(401);
  // });
});

describe("on GET /admin/best-profession?start=<date>&end=<date>", () => {});

describe("on GET /admin/best-clients?start=<date>&end=<date>&limit=<integer>", () => {});
