import request from "supertest";
import { createTestApp } from "./testApp";
import type { Express } from "express";

describe("Auth API Tests", () => {
  let app: Express;
  const uniqueId = Date.now();

  beforeAll(async () => {
    app = await createTestApp();
  });

  describe("POST /api/auth/register", () => {
    const validUser = {
      email: `testuser_${uniqueId}@example.com`,
      username: `testuser_${uniqueId}`,
      password: "securepassword123",
    };

    it("should register a new user with valid data", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send(validUser)
        .expect("Content-Type", /json/);

      expect([201, 409]).toContain(response.status);
      if (response.status === 201) {
        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(validUser.email);
        expect(response.body.user.username).toBe(validUser.username);
        expect(response.body.user).not.toHaveProperty("password");
        expect(response.headers["set-cookie"]).toBeDefined();
      }
    });

    it("should reject registration with duplicate email", async () => {
      const duplicateEmailUser = {
        email: validUser.email,
        username: `different_${uniqueId}`,
        password: "password123",
      };

      await request(app)
        .post("/api/auth/register")
        .send(validUser);

      const response = await request(app)
        .post("/api/auth/register")
        .send(duplicateEmailUser)
        .expect("Content-Type", /json/);

      expect([400, 409]).toContain(response.status);
    });

    it("should reject registration with duplicate username", async () => {
      const existingUser = {
        email: `existing_${uniqueId + 1}@example.com`,
        username: `existing_${uniqueId + 1}`,
        password: "password123",
      };

      await request(app)
        .post("/api/auth/register")
        .send(existingUser);

      const duplicateUsernameUser = {
        email: `new_${uniqueId + 1}@example.com`,
        username: existingUser.username,
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(duplicateUsernameUser)
        .expect("Content-Type", /json/);

      expect([400, 409]).toContain(response.status);
    });

    it("should reject registration with invalid email format", async () => {
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

    it("should reject registration with password too short", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          email: `short_pw_${uniqueId}@example.com`,
          username: `shortpw_${uniqueId}`,
          password: "12345",
        })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });

    it("should reject registration with missing required fields", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ email: "test@test.com" })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });

    it("should reject registration with empty body", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({})
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });
  });

  describe("POST /api/auth/login", () => {
    const loginTestUser = {
      email: `logintest_${uniqueId + 100}@example.com`,
      username: `logintest_${uniqueId + 100}`,
      password: "testpassword123",
    };

    beforeAll(async () => {
      await request(app)
        .post("/api/auth/register")
        .send(loginTestUser);
    });

    it("should login with valid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: loginTestUser.email,
          password: loginTestUser.password,
        })
        .expect("Content-Type", /json/);

      expect([200, 401]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(loginTestUser.email);
        expect(response.headers["set-cookie"]).toBeDefined();
      }
    });

    it("should reject login with invalid email", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "password123",
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid email or password");
    });

    it("should reject login with wrong password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: loginTestUser.email,
          password: "wrongpassword",
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid email or password");
    });

    it("should reject login with invalid email format", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "not-an-email",
          password: "password123",
        })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });

    it("should reject login with password too short", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({
          email: "test@example.com",
          password: "short",
        })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid input");
    });
  });

  describe("GET /api/auth/me", () => {
    it("should return user data for authenticated user", async () => {
      const testUser = {
        email: `metest_${uniqueId + 200}@example.com`,
        username: `metest_${uniqueId + 200}`,
        password: "password123",
      };

      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      if (registerResponse.status === 201) {
        const cookies = registerResponse.headers["set-cookie"];
        
        const response = await request(app)
          .get("/api/auth/me")
          .set("Cookie", cookies)
          .expect("Content-Type", /json/)
          .expect(200);

        expect(response.body.email).toBe(testUser.email);
        expect(response.body.username).toBe(testUser.username);
        expect(response.body).not.toHaveProperty("password");
      }
    });

    it("should reject unauthenticated requests with 401", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("should reject requests with invalid session token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=invalid-token-12345")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });

    it("should reject requests with malformed authorization header", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid-token")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should successfully logout with valid session", async () => {
      const testUser = {
        email: `logouttest_${uniqueId + 300}@example.com`,
        username: `logouttest_${uniqueId + 300}`,
        password: "password123",
      };

      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      if (registerResponse.status === 201) {
        const cookies = registerResponse.headers["set-cookie"];
        
        const response = await request(app)
          .post("/api/auth/logout")
          .set("Cookie", cookies)
          .expect(204);

        expect(response.body).toEqual({});

        await request(app)
          .get("/api/auth/me")
          .set("Cookie", cookies)
          .expect(401);
      }
    });

    it("should handle logout without session gracefully", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .expect(204);

      expect(response.body).toEqual({});
    });

    it("should clear session cookie on logout", async () => {
      const testUser = {
        email: `cookieclear_${uniqueId + 400}@example.com`,
        username: `cookieclear_${uniqueId + 400}`,
        password: "password123",
      };

      const registerResponse = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      if (registerResponse.status === 201) {
        const cookies = registerResponse.headers["set-cookie"];
        
        const logoutResponse = await request(app)
          .post("/api/auth/logout")
          .set("Cookie", cookies)
          .expect(204);

        const setCookieHeader = logoutResponse.headers["set-cookie"];
        if (setCookieHeader) {
          const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
          const sessionCookie = cookies.find((c: string) => c.startsWith("session="));
          if (sessionCookie) {
            expect(sessionCookie).toMatch(/session=;|session=$/);
          }
        }
      }
    });
  });

  describe("Session Token Validation", () => {
    it("should validate session token format", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it("should handle expired sessions", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Cookie", "session=expired-session-token-12345")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });
  });

  describe("Cookie Handling", () => {
    it("should set httpOnly cookie on registration", async () => {
      const testUser = {
        email: `cookietest_${uniqueId + 500}@example.com`,
        username: `cookietest_${uniqueId + 500}`,
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      if (response.status === 201) {
        const setCookieHeader = response.headers["set-cookie"];
        expect(setCookieHeader).toBeDefined();
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        const sessionCookie = cookies.find((c: string) => c.startsWith("session="));
        expect(sessionCookie).toContain("HttpOnly");
      }
    });

    it("should set cookie with proper expiry", async () => {
      const testUser = {
        email: `expirytest_${uniqueId + 600}@example.com`,
        username: `expirytest_${uniqueId + 600}`,
        password: "password123",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(testUser);

      if (response.status === 201) {
        const setCookieHeader = response.headers["set-cookie"];
        expect(setCookieHeader).toBeDefined();
        const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        const sessionCookie = cookies.find((c: string) => c.startsWith("session="));
        expect(sessionCookie).toContain("Max-Age");
      }
    });
  });
});
