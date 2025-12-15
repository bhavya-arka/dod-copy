import request from "supertest";
import { createTestApp } from "../testApp";
import type { Express } from "express";

describe("Auth API Integration Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("POST /api/auth/register", () => {
    const testUser = {
      email: `test${Date.now()}@example.com`,
      username: `testuser${Date.now()}`,
      password: "testpassword123",
    };

    it("should register a new user successfully", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(testUser)
        .expect("Content-Type", /json/);

      expect([201, 409]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(testUser.email);
        expect(response.body.user.username).toBe(testUser.username);
        expect(response.headers["set-cookie"]).toBeDefined();
      }
    });

    it("should reject invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: "invalid-email",
          username: "validuser",
          password: "password123",
        })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });

    it("should reject missing fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@test.com" })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });
  });

  describe("POST /api/auth/login", () => {
    it("should reject invalid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "wrongpassword",
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid email or password");
    });

    it("should reject invalid input format", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "not-an-email",
          password: "pw",
        })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should handle logout without session", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .expect(204);

      expect(response.body).toEqual({});
    });
  });

  describe("GET /api/auth/me", () => {
    it("should reject unauthenticated requests", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("should reject invalid session token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=invalid-token")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });
  });
});
