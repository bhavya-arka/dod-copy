import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("Manifests API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("Protected Routes - Unauthenticated", () => {
    it("GET /api/manifests should require authentication", async () => {
      const response = await request(app)
        .get("/api/manifests")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("POST /api/manifests should require authentication", async () => {
      const response = await request(app)
        .post("/api/manifests")
        .send({ name: "Test Manifest", items: [] })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("GET /api/manifests/:id should require authentication", async () => {
      const response = await request(app)
        .get("/api/manifests/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("PUT /api/manifests/:id should require authentication", async () => {
      const response = await request(app)
        .put("/api/manifests/1")
        .send({ name: "Updated Manifest" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("DELETE /api/manifests/:id should require authentication", async () => {
      const response = await request(app)
        .delete("/api/manifests/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("PATCH /api/manifests/:id/items/:itemIndex should require authentication", async () => {
      const response = await request(app)
        .patch("/api/manifests/1/items/0")
        .send({ hazmat: true })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });
});
