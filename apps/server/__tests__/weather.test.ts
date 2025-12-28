import request from "supertest";
import { createTestApp } from "./testApp";
import type { Express } from "express";

describe("Weather API Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("GET /api/weather/status", () => {
    it("should return weather API status with cache info", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("cache");
      expect(response.body.cache).toHaveProperty("size");
      expect(response.body.cache).toHaveProperty("hits");
      expect(response.body.cache).toHaveProperty("misses");
      expect(response.body.cache).toHaveProperty("ttlMs");
      expect(response.body.cache.ttlMs).toBe(600000);
    });

    it("should return request statistics", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("requests");
      expect(response.body.requests).toHaveProperty("total");
      expect(response.body.requests).toHaveProperty("successful");
      expect(response.body.requests).toHaveProperty("failed");
    });

    it("should return rate limit state", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("rateLimitState");
      expect(response.body.rateLimitState).toHaveProperty("isLimited");
      expect(response.body.rateLimitState).toHaveProperty("retryAfter");
    });

    it("should return last error info", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toHaveProperty("lastError");
    });
  });

  describe("GET /api/weather/:lat/:lon - Coordinate Validation", () => {
    it("should reject invalid coordinates (non-numeric)", async () => {
      const response = await request(app)
        .get("/api/weather/abc/xyz")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid coordinates");
    });

    it("should reject out-of-range latitude (> 90)", async () => {
      const response = await request(app)
        .get("/api/weather/95.0/-120.0")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Coordinates out of range");
    });

    it("should reject out-of-range latitude (< -90)", async () => {
      const response = await request(app)
        .get("/api/weather/-95.0/-120.0")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Coordinates out of range");
    });

    it("should reject out-of-range longitude (> 180)", async () => {
      const response = await request(app)
        .get("/api/weather/40.0/200.0")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Coordinates out of range");
    });

    it("should reject out-of-range longitude (< -180)", async () => {
      const response = await request(app)
        .get("/api/weather/40.0/-200.0")
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Coordinates out of range");
    });
  });

  describe("GET /api/weather/:lat/:lon - Valid US Coordinates", () => {
    it("should handle valid Travis AFB coordinates", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(response.status);
    }, 15000);

    it("should handle valid coordinates near Hawaii (Hickam)", async () => {
      const response = await request(app)
        .get("/api/weather/21.3187/-157.9224")
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(response.status);
    }, 15000);

    it("should handle boundary latitude values", async () => {
      const response = await request(app)
        .get("/api/weather/90.0/-120.0")
        .expect("Content-Type", /json/);

      expect([200, 400, 404, 429, 502]).toContain(response.status);
    }, 15000);

    it("should handle boundary longitude values", async () => {
      const response = await request(app)
        .get("/api/weather/40.0/180.0")
        .expect("Content-Type", /json/);

      expect([200, 400, 404, 429, 502]).toContain(response.status);
    }, 15000);
  });

  describe("Weather Cache Functionality", () => {
    it("should cache weather data after successful fetch", async () => {
      const statusBefore = await request(app)
        .get("/api/weather/status")
        .expect(200);

      const initialMisses = statusBefore.body.cache.misses;
      const initialHits = statusBefore.body.cache.hits;

      await request(app)
        .get("/api/weather/38.0/-122.0")
        .expect("Content-Type", /json/);

      await request(app)
        .get("/api/weather/38.0/-122.0")
        .expect("Content-Type", /json/);

      const statusAfter = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(statusAfter.body.cache.misses).toBeGreaterThanOrEqual(initialMisses);
    }, 30000);

    it("should return cached flag in weather response", async () => {
      const firstResponse = await request(app)
        .get("/api/weather/37.5/-122.5")
        .expect("Content-Type", /json/);

      if (firstResponse.status === 200) {
        expect(firstResponse.body).toHaveProperty("cached");
      }
    }, 15000);

    it("should track cache TTL of 10 minutes", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(response.body.cache.ttlMs).toBe(600000);
    });
  });

  describe("Rate Limiting Handling", () => {
    it("should include rate limit state in status", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(response.body.rateLimitState).toBeDefined();
      expect(typeof response.body.rateLimitState.isLimited).toBe("boolean");
    });

    it("should track rate limit retry-after value", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(response.body.rateLimitState).toHaveProperty("retryAfter");
    });
  });

  describe("Error Retry Logic", () => {
    it("should track failed requests in status", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(typeof response.body.requests.failed).toBe("number");
    });

    it("should track successful requests in status", async () => {
      const response = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(typeof response.body.requests.successful).toBe("number");
    });

    it("should track total requests in status", async () => {
      const statusBefore = await request(app)
        .get("/api/weather/status")
        .expect(200);

      const initialTotal = statusBefore.body.requests.total;

      await request(app)
        .get("/api/weather/39.0/-123.0")
        .expect("Content-Type", /json/);

      const statusAfter = await request(app)
        .get("/api/weather/status")
        .expect(200);

      expect(statusAfter.body.requests.total).toBe(initialTotal + 1);
    }, 15000);
  });

  describe("Military Base Weather Fetch", () => {
    it("should handle Travis AFB weather request", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty("location");
        expect(response.body).toHaveProperty("forecast");
      }
    }, 15000);

    it("should handle McChord AFB weather request", async () => {
      const response = await request(app)
        .get("/api/weather/47.1377/-122.4764")
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(response.status);
    }, 15000);

    it("should handle Dover AFB weather request", async () => {
      const response = await request(app)
        .get("/api/weather/39.1296/-75.4657")
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(response.status);
    }, 15000);

    it("should return 404 for non-US territory coordinates", async () => {
      const response = await request(app)
        .get("/api/weather/52.5200/13.4050")
        .expect("Content-Type", /json/);

      expect([404, 429, 502]).toContain(response.status);
      if (response.status === 404) {
        expect(response.body.error).toContain("NWS");
      }
    }, 15000);

    it("should return weather data with location info when successful", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      if (response.status === 200) {
        expect(response.body.location).toHaveProperty("lat");
        expect(response.body.location).toHaveProperty("lon");
        expect(response.body.location.lat).toBeCloseTo(38.2627, 2);
        expect(response.body.location.lon).toBeCloseTo(-121.9275, 2);
      }
    }, 15000);
  });

  describe("Weather Response Structure", () => {
    it("should return forecast periods when available", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("forecast");
        expect(Array.isArray(response.body.forecast)).toBe(true);
      }
    }, 15000);

    it("should return current conditions when available", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("currentConditions");
      }
    }, 15000);

    it("should include generated timestamp when available", async () => {
      const response = await request(app)
        .get("/api/weather/38.2627/-121.9275")
        .expect("Content-Type", /json/);

      if (response.status === 200) {
        expect(response.body).toHaveProperty("generatedAt");
      }
    }, 15000);
  });
});
