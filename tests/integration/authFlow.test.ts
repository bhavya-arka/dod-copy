import request from "supertest";
import { createTestApp } from "../../apps/server/__tests__/testApp";
import type { Express } from "express";

describe("Auth Flow Integration Tests", () => {
  let app: Express;
  const uniqueId = Date.now();
  const testUser = {
    email: `authflow_${uniqueId}@example.com`,
    username: `authflow_${uniqueId}`,
    password: "securePassword123!",
  };

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("Full Registration → Login → Access Protected Route Flow", () => {
    let sessionCookie: string | string[] | undefined;

    it("should complete full auth flow: register → login → access protected route", async () => {
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(testUser)
        .expect("Content-Type", /json/);

      expect([201, 409]).toContain(registerResponse.status);
      
      if (registerResponse.status === 201) {
        sessionCookie = registerResponse.headers["set-cookie"];
        expect(registerResponse.body.user).toBeDefined();
        expect(registerResponse.body.user.email).toBe(testUser.email);
      } else {
        const loginResponse = await request(app)
          .post("/api/auth/login")
          .send({ email: testUser.email, password: testUser.password })
          .expect(200);
        sessionCookie = loginResponse.headers["set-cookie"];
      }

      expect(sessionCookie).toBeDefined();

      const meResponse = await request(app)
        .get("/api/auth/me")
        .set("Cookie", sessionCookie!)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(meResponse.body.email).toBe(testUser.email);
      expect(meResponse.body.username).toBe(testUser.username);
    });
  });

  describe("Registration with Duplicate Email Fails", () => {
    const duplicateUser = {
      email: `duplicate_${uniqueId}@example.com`,
      username: `duplicate_${uniqueId}`,
      password: "password123",
    };

    it("should reject registration with duplicate email", async () => {
      await request(app)
        .post("/api/auth/register")
        .send(duplicateUser);

      const duplicateResponse = await request(app)
        .post("/api/auth/register")
        .send({
          ...duplicateUser,
          username: `different_${uniqueId}`,
        })
        .expect("Content-Type", /json/)
        .expect(409);

      expect(duplicateResponse.body.error).toBe("Email already registered");
    });
  });

  describe("Login with Wrong Password Shows Error", () => {
    const wrongPassUser = {
      email: `wrongpass_${uniqueId}@example.com`,
      username: `wrongpass_${uniqueId}`,
      password: "correctPassword123",
    };

    beforeAll(async () => {
      await request(app)
        .post("/api/auth/register")
        .send(wrongPassUser);
    });

    it("should reject login with wrong password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: wrongPassUser.email,
          password: "wrongPassword123",
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid email or password");
    });
  });

  describe("Logout Clears Session", () => {
    const logoutUser = {
      email: `logout_${uniqueId}@example.com`,
      username: `logout_${uniqueId}`,
      password: "password123",
    };

    it("should clear session on logout", async () => {
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(logoutUser);

      const sessionCookie = registerResponse.status === 201 
        ? registerResponse.headers["set-cookie"]
        : (await request(app).post("/api/auth/login").send({
            email: logoutUser.email,
            password: logoutUser.password,
          })).headers["set-cookie"];

      expect(sessionCookie).toBeDefined();

      const logoutResponse = await request(app)
        .post("/api/auth/logout")
        .set("Cookie", sessionCookie!)
        .expect(204);

      const clearCookieHeader = logoutResponse.headers["set-cookie"];
      expect(clearCookieHeader).toBeDefined();

      const meResponse = await request(app)
        .get("/api/auth/me")
        .set("Cookie", sessionCookie!)
        .expect(401);

      expect(meResponse.body.error).toBe("Invalid or expired session");
    });
  });

  describe("Session Persists Across Requests", () => {
    const persistUser = {
      email: `persist_${uniqueId}@example.com`,
      username: `persist_${uniqueId}`,
      password: "password123",
    };

    it("should maintain session across multiple requests", async () => {
      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(persistUser);

      const sessionCookie = registerResponse.status === 201 
        ? registerResponse.headers["set-cookie"]
        : (await request(app).post("/api/auth/login").send({
            email: persistUser.email,
            password: persistUser.password,
          })).headers["set-cookie"];

      expect(sessionCookie).toBeDefined();

      for (let i = 0; i < 5; i++) {
        const meResponse = await request(app)
          .get("/api/auth/me")
          .set("Cookie", sessionCookie!)
          .expect(200);

        expect(meResponse.body.email).toBe(persistUser.email);
      }

      const sitesResponse = await request(app)
        .get("/api/warehouse/sites")
        .set("Cookie", sessionCookie!)
        .expect(200);

      expect(Array.isArray(sitesResponse.body)).toBe(true);
    });
  });

  describe("Expired/Invalid Session Redirects to Login", () => {
    it("should reject requests with invalid session token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=completely-invalid-token-12345")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });

    it("should reject requests with empty session", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });
  });

  describe("Multiple Login Sessions", () => {
    const multiSessionUser = {
      email: `multisession_${uniqueId}@example.com`,
      username: `multisession_${uniqueId}`,
      password: "password123",
    };

    it("should allow multiple concurrent login sessions", async () => {
      await request(app)
        .post("/api/auth/register")
        .send(multiSessionUser);

      const login1Response = await request(app)
        .post("/api/auth/login")
        .send({
          email: multiSessionUser.email,
          password: multiSessionUser.password,
        })
        .expect(200);

      const session1Cookie = login1Response.headers["set-cookie"];

      const login2Response = await request(app)
        .post("/api/auth/login")
        .send({
          email: multiSessionUser.email,
          password: multiSessionUser.password,
        })
        .expect(200);

      const session2Cookie = login2Response.headers["set-cookie"];

      expect(session1Cookie).toBeDefined();
      expect(session2Cookie).toBeDefined();
      expect(session1Cookie).not.toEqual(session2Cookie);

      const me1Response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", session1Cookie!)
        .expect(200);

      const me2Response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", session2Cookie!)
        .expect(200);

      expect(me1Response.body.email).toBe(multiSessionUser.email);
      expect(me2Response.body.email).toBe(multiSessionUser.email);
    });
  });

  describe("Password Reset Flow Simulation", () => {
    it("should handle password-related edge cases gracefully", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "anypassword",
        })
        .expect(401);

      expect(response.body.error).toBe("Invalid email or password");

      const shortPassResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "12345",
        })
        .expect(400);

      expect(shortPassResponse.body.error).toBe("Invalid input");
    });
  });
});
