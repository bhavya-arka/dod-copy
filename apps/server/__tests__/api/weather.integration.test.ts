import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("Weather API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("GET /api/weather/status", () => {
    it("should return weather API status", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("cache");
      expect(response.body.cache).toHaveProperty("size");
      expect(response.body.cache).toHaveProperty("hits");
      expect(response.body.cache).toHaveProperty("misses");
      expect(response.body).toHaveProperty("requests");
      expect(response.body.requests).toHaveProperty("total");
      expect(response.body.requests).toHaveProperty("successful");
      expect(response.body.requests).toHaveProperty("failed");
    });
  });

  describe("GET /api/weather/:lat/:lon", () => {
    it("should reject invalid coordinates (non-numeric)", async () => {
      const response = await request(app)
        .get("/api/weather/abc/xyz")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid coordinates");
    });

    it("should reject out-of-range latitude", async () => {
      const response = await request(app)
        .get("/api/weather/95.0/-120.0")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Coordinates out of range");
    });

    it("should reject out-of-range longitude", async () => {
      const response = await request(app)
        .get("/api/weather/40.0/-200.0")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Coordinates out of range");
    });

    it("should handle valid US coordinates", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(response.status);
    }, 15000);
  });
});
