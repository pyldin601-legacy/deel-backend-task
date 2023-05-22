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
    await request.get("/contracts").expect(400);
  });

  it("should return a list of contracts belonging to a profile_id", async () => {
    await request.get("/contracts").expect(200);
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
