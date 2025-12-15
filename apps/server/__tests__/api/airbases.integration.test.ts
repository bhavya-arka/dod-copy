import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("Airbases API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("POST /api/airbases/resolve", () => {
    it("should resolve by base_id", async () => {
      const response = await request(app)
        .post("/api/airbases/resolve")
        .send({ airbaseId: "HICKAM" })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.resolved).toBe(true);
      expect(response.body.source).toBe("database");
      expect(response.body.base.base_id).toBe("HICKAM");
      expect(response.body.base.icao).toBe("PHIK");
      expect(response.body.coordinates).toHaveProperty("lat");
      expect(response.body.coordinates).toHaveProperty("lon");
    });

    it("should resolve by ICAO code", async () => {
      const response = await request(app)
        .post("/api/airbases/resolve")
        .send({ icao: "RODN" })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.resolved).toBe(true);
      expect(response.body.base.name).toContain("Kadena");
    });

    it("should resolve by base name", async () => {
      const response = await request(app)
        .post("/api/airbases/resolve")
        .send({ baseName: "Andersen" })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.resolved).toBe(true);
      expect(response.body.base.base_id).toBe("ANDERSEN");
    });

    it("should resolve by coordinates", async () => {
      const response = await request(app)
        .post("/api/airbases/resolve")
        .send({ lat: 21.3187, lon: -157.9224 })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.resolved).toBe(true);
      expect(response.body.source).toBe("coordinates");
    });

    it("should return 404 for unknown base", async () => {
      const response = await request(app)
        .post("/api/airbases/resolve")
        .send({ airbaseId: "UNKNOWN_BASE" })
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.resolved).toBe(false);
    });
  });
});
