import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("Flight Schedules API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("Protected Routes - Unauthenticated", () => {
    it("GET /api/flight-schedules should require authentication", async () => {
      const response = await request(app)
        .get("/api/flight-schedules")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("POST /api/flight-schedules should require authentication", async () => {
      const response = await request(app)
        .post("/api/flight-schedules")
        .send({
          flight_plan_id: 1,
          aircraft_id: "AC001",
          departure_time: new Date().toISOString(),
          arrival_time: new Date().toISOString(),
          departure_base: "HICKAM",
          arrival_base: "ANDERSEN",
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("GET /api/flight-plans/:id/schedules should require authentication", async () => {
      const response = await request(app)
        .get("/api/flight-plans/1/schedules")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("PUT /api/flight-schedules/:id should require authentication", async () => {
      const response = await request(app)
        .put("/api/flight-schedules/1")
        .send({ aircraft_id: "AC002" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("DELETE /api/flight-schedules/:id should require authentication", async () => {
      const response = await request(app)
        .delete("/api/flight-schedules/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });
});
