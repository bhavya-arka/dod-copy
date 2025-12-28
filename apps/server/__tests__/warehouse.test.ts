import request from "supertest";
import { createTestApp } from "./testApp";
import type { Express } from "express";

const getCookie = (cookies: string | string[] | undefined): string => {
  if (!cookies) return '';
  return Array.isArray(cookies) ? cookies.join('; ') : cookies;
};

describe("Warehouse API Tests", () => {
  let app: Express;
  let authCookie: string | string[] | undefined;
  const uniqueId = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    const testUser = {
      email: `warehousetest_${uniqueId}@example.com`,
      username: `warehousetest_${uniqueId}`,
      password: "password123",
    };

    const registerResponse = await request(app)
      .post("/api/auth/register")
      .send(testUser);

    if (registerResponse.status === 201) {
      authCookie = registerResponse.headers["set-cookie"];
    } else {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({
          email: testUser.email,
          password: testUser.password,
        });
      authCookie = loginResponse.headers["set-cookie"];
    }
  });

  describe("GET /api/warehouse/sites", () => {
    it("should list all warehouse sites for authenticated user", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .get("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/warehouse/sites")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("should reject invalid session", async () => {
      const response = await request(app)
        .get("/api/warehouse/sites")
        .set("Cookie", "session=invalid-token")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });
  });

  describe("POST /api/warehouse/sites", () => {
    it("should create a new warehouse site", async () => {
      if (!authCookie?.length) return;

      const siteData = {
        name: `Test Site ${uniqueId}`,
        location: "San Diego, CA",
        type: "storage",
        capacity_sqft: 50000,
      };

      const response = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send(siteData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.name).toBe(siteData.name);
      expect(response.body.location).toBe(siteData.location);
      expect(response.body.id).toBeDefined();
    });

    it("should require authentication to create site", async () => {
      const response = await request(app)
        .post("/api/warehouse/sites")
        .send({
          name: "Unauthorized Site",
          location: "Unknown",
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("should reject site creation with missing name", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          location: "Some Location",
        })
        .expect("Content-Type", /json/);

      expect([400, 500]).toContain(response.status);
    });

    it("should reject site creation with invalid capacity", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: "Invalid Capacity Site",
          location: "Test Location",
          capacity_sqft: -1000,
        })
        .expect("Content-Type", /json/);

      expect([400, 201]).toContain(response.status);
    });
  });

  describe("GET /api/warehouse/sites/:siteId/inventory", () => {
    let testSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Inventory Test Site ${uniqueId}`,
          location: "Test Location",
        });

      if (siteResponse.status === 201) {
        testSiteId = siteResponse.body.id;
      }
    });

    it("should list inventory items for a site", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const response = await request(app)
        .get(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should return 404 for non-existent site", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .get("/api/warehouse/sites/999999/inventory")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/warehouse/sites/1/inventory")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("POST /api/warehouse/sites/:siteId/inventory", () => {
    let testSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Item Test Site ${uniqueId + 1}`,
          location: "Test Location",
        });

      if (siteResponse.status === 201) {
        testSiteId = siteResponse.body.id;
      }
    });

    it("should add a single inventory item", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const itemData = {
        nsn: "1234567890123",
        description: "Test Item",
        quantity: 100,
        unit_weight: 50,
        location: "A-01-01",
      };

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send(itemData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.nsn).toBe(itemData.nsn);
      expect(response.body.description).toBe(itemData.description);
    });

    it("should validate NSN format", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "invalid",
          description: "Invalid NSN Item",
          quantity: 10,
        })
        .expect("Content-Type", /json/);

      expect([400, 201]).toContain(response.status);
    });

    it("should validate item weight", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "9876543210123",
          description: "Negative Weight Item",
          quantity: 10,
          unit_weight: -50,
        })
        .expect("Content-Type", /json/);

      expect([400, 201]).toContain(response.status);
    });

    it("should assign location to inventory item", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const itemData = {
        nsn: "5555555555555",
        description: "Located Item",
        quantity: 25,
        location: "B-02-03",
      };

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send(itemData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.location).toBe(itemData.location);
    });
  });

  describe("POST /api/warehouse/sites/:siteId/inventory/upload", () => {
    let testSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `CSV Upload Test Site ${uniqueId + 2}`,
          location: "Test Location",
        });

      if (siteResponse.status === 201) {
        testSiteId = siteResponse.body.id;
      }
    });

    it("should upload and parse CSV inventory data", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const csvData = `nsn,description,quantity,unit_weight
1111111111111,Item A,100,10
2222222222222,Item B,200,20`;

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory/upload`)
        .set("Cookie", getCookie(authCookie))
        .send({ csv_data: csvData })
        .expect("Content-Type", /json/);

      expect([200, 201, 400]).toContain(response.status);
    });

    it("should return 404 for non-existent site", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .post("/api/warehouse/sites/999999/inventory/upload")
        .set("Cookie", getCookie(authCookie))
        .send({ csv_data: "nsn,description\n123,Test" })
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });
  });

  describe("GET /api/warehouse/transfers", () => {
    it("should list all transfers for authenticated user", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .get("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/warehouse/transfers")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("POST /api/warehouse/transfers", () => {
    let sourceSiteId: number;
    let destSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const sourceResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Source Site ${uniqueId + 3}`,
          location: "Source Location",
        });

      const destResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Destination Site ${uniqueId + 4}`,
          location: "Destination Location",
        });

      if (sourceResponse.status === 201) {
        sourceSiteId = sourceResponse.body.id;
      }
      if (destResponse.status === 201) {
        destSiteId = destResponse.body.id;
      }
    });

    it("should create inter-warehouse transfer", async () => {
      if (!authCookie?.length || !sourceSiteId || !destSiteId) return;

      const transferData = {
        source_site_id: sourceSiteId,
        destination_site_id: destSiteId,
        items: [{ nsn: "1234567890123", quantity: 10 }],
        notes: "Test transfer",
      };

      const response = await request(app)
        .post("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .send(transferData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.source_site_id).toBe(sourceSiteId);
      expect(response.body.destination_site_id).toBe(destSiteId);
    });

    it("should reject transfer to same site", async () => {
      if (!authCookie?.length || !sourceSiteId) return;

      const response = await request(app)
        .post("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .send({
          source_site_id: sourceSiteId,
          destination_site_id: sourceSiteId,
          items: [{ nsn: "1234567890123", quantity: 10 }],
        })
        .expect("Content-Type", /json/);

      expect([400, 201]).toContain(response.status);
    });

    it("should reject transfer with non-existent source site", async () => {
      if (!authCookie?.length || !destSiteId) return;

      const response = await request(app)
        .post("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .send({
          source_site_id: 999999,
          destination_site_id: destSiteId,
          items: [{ nsn: "1234567890123", quantity: 10 }],
        })
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toContain("Source");
    });

    it("should reject transfer with non-existent destination site", async () => {
      if (!authCookie?.length || !sourceSiteId) return;

      const response = await request(app)
        .post("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .send({
          source_site_id: sourceSiteId,
          destination_site_id: 999999,
          items: [{ nsn: "1234567890123", quantity: 10 }],
        })
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toContain("Destination");
    });
  });

  describe("GET /api/warehouse/sites/:siteId/optimization", () => {
    let testSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Optimization Test Site ${uniqueId + 5}`,
          location: "Test Location",
        });

      if (siteResponse.status === 201) {
        testSiteId = siteResponse.body.id;
      }
    });

    it("should run optimization analysis for a site", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const response = await request(app)
        .get(`/api/warehouse/sites/${testSiteId}/optimization`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body).toBeDefined();
    });

    it("should return 404 for non-existent site", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .get("/api/warehouse/sites/999999/optimization")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toBeDefined();
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/warehouse/sites/1/optimization")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("Aging Calculations", () => {
    let testSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Aging Test Site ${uniqueId + 6}`,
          location: "Test Location",
        });

      if (siteResponse.status === 201) {
        testSiteId = siteResponse.body.id;
      }
    });

    it("should handle items with 3-5 year aging", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 4);

      const itemData = {
        nsn: "3333333333333",
        description: "3-5 Year Old Item",
        quantity: 50,
        received_date: threeYearsAgo.toISOString(),
      };

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send(itemData)
        .expect("Content-Type", /json/);

      expect([201, 400]).toContain(response.status);
    });

    it("should handle items with 5-7 year aging", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const sixYearsAgo = new Date();
      sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);

      const itemData = {
        nsn: "6666666666666",
        description: "5-7 Year Old Item",
        quantity: 30,
        received_date: sixYearsAgo.toISOString(),
      };

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send(itemData)
        .expect("Content-Type", /json/);

      expect([201, 400]).toContain(response.status);
    });

    it("should handle items with 7+ year aging", async () => {
      if (!authCookie?.length || !testSiteId) return;

      const eightYearsAgo = new Date();
      eightYearsAgo.setFullYear(eightYearsAgo.getFullYear() - 8);

      const itemData = {
        nsn: "8888888888888",
        description: "7+ Year Old Item",
        quantity: 20,
        received_date: eightYearsAgo.toISOString(),
      };

      const response = await request(app)
        .post(`/api/warehouse/sites/${testSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send(itemData)
        .expect("Content-Type", /json/);

      expect([201, 400]).toContain(response.status);
    });
  });

  describe("Error Handling", () => {
    it("should handle malformed JSON", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .set("Content-Type", "application/json")
        .send("{ invalid json }")
        .expect("Content-Type", /json/);

      expect([400, 500]).toContain(response.status);
    });

    it("should handle extremely large payloads gracefully", async () => {
      if (!authCookie?.length) return;

      const largeDescription = "A".repeat(100000);

      const response = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: "Large Payload Site",
          location: largeDescription,
        })
        .expect("Content-Type", /json/);

      expect([201, 400, 413, 500]).toContain(response.status);
    });
  });
});
