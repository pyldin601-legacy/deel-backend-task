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
