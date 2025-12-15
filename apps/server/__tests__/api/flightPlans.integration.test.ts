import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("Flight Plans API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("Protected Routes - Unauthenticated", () => {
    it("GET /api/flight-plans should require authentication", async () => {
      const response = await request(app)
        .get("/api/flight-plans")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("POST /api/flight-plans should require authentication", async () => {
      const response = await request(app)
        .post("/api/flight-plans")
        .send({ name: "Test Plan" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("PUT /api/flight-plans/:id should require authentication", async () => {
      const response = await request(app)
        .put("/api/flight-plans/1")
        .send({ name: "Updated Plan" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("DELETE /api/flight-plans/:id should require authentication", async () => {
      const response = await request(app)
        .delete("/api/flight-plans/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("PATCH /api/flight-plans/:id/status should require authentication", async () => {
      const response = await request(app)
        .patch("/api/flight-plans/1/status")
        .send({ status: "complete" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("Protected Routes - Invalid Session", () => {
    it("should reject requests with invalid session token", async () => {
      const response = await request(app)
        .get("/api/flight-plans")
        .set("Cookie", "session=invalid-token-12345")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });
  });
});
