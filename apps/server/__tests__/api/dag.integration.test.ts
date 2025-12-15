import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("DAG API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("DAG Nodes - Protected Routes", () => {
    it("GET /api/dag/nodes should require authentication", async () => {
      const response = await request(app)
        .get("/api/dag/nodes")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("POST /api/dag/nodes should require authentication", async () => {
      const response = await request(app)
        .post("/api/dag/nodes")
        .send({ label: "Test Node", type: "flight" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("PUT /api/dag/nodes/:id should require authentication", async () => {
      const response = await request(app)
        .put("/api/dag/nodes/1")
        .send({ label: "Updated Node" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("DELETE /api/dag/nodes/:id should require authentication", async () => {
      const response = await request(app)
        .delete("/api/dag/nodes/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("DAG Edges - Protected Routes", () => {
    it("GET /api/dag/edges should require authentication", async () => {
      const response = await request(app)
        .get("/api/dag/edges")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("POST /api/dag/edges should require authentication", async () => {
      const response = await request(app)
        .post("/api/dag/edges")
        .send({ source_node_id: 1, target_node_id: 2 })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("DELETE /api/dag/edges/:id should require authentication", async () => {
      const response = await request(app)
        .delete("/api/dag/edges/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });
});
