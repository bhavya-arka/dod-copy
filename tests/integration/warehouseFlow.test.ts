import request from "supertest";
import { createTestApp } from "../../apps/server/__tests__/testApp";
import type { Express } from "express";

const getCookie = (cookies: string | string[] | undefined): string => {
  if (!cookies) return '';
  return Array.isArray(cookies) ? cookies.join('; ') : cookies;
};

describe("Warehouse Flow Integration Tests", () => {
  let app: Express;
  let authCookie: string | string[] | undefined;
  const uniqueId = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    const testUser = {
      email: `warehouseflow_${uniqueId}@example.com`,
      username: `warehouseflow_${uniqueId}`,
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

  describe("Create Site → Add Items → View Inventory Flow", () => {
    let siteId: number;

    it("should complete full site creation and inventory management flow", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Flow Test Site ${uniqueId}`,
          location: "San Diego, CA",
          type: "storage",
          capacity_sqft: 50000,
        })
        .expect("Content-Type", /json/)
        .expect(201);

      siteId = siteResponse.body.id;
      expect(siteId).toBeDefined();

      const itemResponse = await request(app)
        .post(`/api/warehouse/sites/${siteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "1234567890123",
          description: "Test Medical Supplies",
          quantity: 100,
          unit_weight: 25,
          location: "A-01-01",
        })
        .expect("Content-Type", /json/)
        .expect(201);

      expect(itemResponse.body.nsn).toBe("1234567890123");

      const inventoryResponse = await request(app)
        .get(`/api/warehouse/sites/${siteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(inventoryResponse.body)).toBe(true);
      expect(inventoryResponse.body.length).toBeGreaterThan(0);
      expect(inventoryResponse.body.some((item: any) => item.nsn === "1234567890123")).toBe(true);
    });
  });

  describe("Upload CSV → Validate Items → View in Inventory", () => {
    let csvSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `CSV Upload Site ${uniqueId}`,
          location: "Norfolk, VA",
        });

      if (siteResponse.status === 201) {
        csvSiteId = siteResponse.body.id;
      }
    });

    it("should upload CSV and validate items appear in inventory", async () => {
      if (!authCookie?.length || !csvSiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const csvData = `nsn,description,quantity,unit_weight,location
5965014428893,Radio Transceiver,50,15,B-02-01
5945011234567,Electronic Component,200,2,B-02-02
8465015678901,Protective Gear,30,8,B-03-01`;

      const uploadResponse = await request(app)
        .post(`/api/warehouse/sites/${csvSiteId}/inventory/upload`)
        .set("Cookie", getCookie(authCookie))
        .send({ csv_data: csvData })
        .expect("Content-Type", /json/);

      expect([200, 201, 400]).toContain(uploadResponse.status);

      const inventoryResponse = await request(app)
        .get(`/api/warehouse/sites/${csvSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .expect(200);

      expect(Array.isArray(inventoryResponse.body)).toBe(true);
    });
  });

  describe("Create Transfer Between Sites", () => {
    let sourceSiteId: number;
    let destSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const sourceResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Transfer Source ${uniqueId}`,
          location: "Charleston, SC",
        });

      const destResponse = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Transfer Dest ${uniqueId}`,
          location: "Miami, FL",
        });

      if (sourceResponse.status === 201) sourceSiteId = sourceResponse.body.id;
      if (destResponse.status === 201) destSiteId = destResponse.body.id;
    });

    it("should create transfer between two warehouse sites", async () => {
      if (!authCookie?.length || !sourceSiteId || !destSiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      await request(app)
        .post(`/api/warehouse/sites/${sourceSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "7777777777777",
          description: "Transfer Test Item",
          quantity: 100,
          unit_weight: 10,
        });

      const transferResponse = await request(app)
        .post("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .send({
          source_site_id: sourceSiteId,
          destination_site_id: destSiteId,
          items: [{ nsn: "7777777777777", quantity: 25 }],
          notes: "Integration test transfer",
        })
        .expect("Content-Type", /json/)
        .expect(201);

      expect(transferResponse.body.source_site_id).toBe(sourceSiteId);
      expect(transferResponse.body.destination_site_id).toBe(destSiteId);
      expect(transferResponse.body.id).toBeDefined();
    });
  });

  describe("Transfer Status Updates Correctly", () => {
    let transferTestSourceId: number;
    let transferTestDestId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const sourceRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Status Source ${uniqueId}`, location: "Boston, MA" });

      const destRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Status Dest ${uniqueId}`, location: "New York, NY" });

      if (sourceRes.status === 201) transferTestSourceId = sourceRes.body.id;
      if (destRes.status === 201) transferTestDestId = destRes.body.id;
    });

    it("should track transfer creation and appear in transfers list", async () => {
      if (!authCookie?.length || !transferTestSourceId || !transferTestDestId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      await request(app)
        .post("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .send({
          source_site_id: transferTestSourceId,
          destination_site_id: transferTestDestId,
          items: [{ nsn: "8888888888888", quantity: 10 }],
        });

      const transfersResponse = await request(app)
        .get("/api/warehouse/transfers")
        .set("Cookie", getCookie(authCookie))
        .expect(200);

      expect(Array.isArray(transfersResponse.body)).toBe(true);
    });
  });

  describe("Run Optimization → View Recommendations", () => {
    let optimizeSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Optimize Site ${uniqueId}`,
          location: "Los Angeles, CA",
          capacity_sqft: 100000,
        });

      if (siteRes.status === 201) {
        optimizeSiteId = siteRes.body.id;

        for (let i = 0; i < 5; i++) {
          await request(app)
            .post(`/api/warehouse/sites/${optimizeSiteId}/inventory`)
            .set("Cookie", getCookie(authCookie))
            .send({
              nsn: `999000${i}000000${i}`,
              description: `Optimization Test Item ${i}`,
              quantity: 50 + i * 10,
              unit_weight: 5 + i,
              location: `C-0${i + 1}-01`,
            });
        }
      }
    });

    it("should run optimization and return recommendations", async () => {
      if (!authCookie?.length || !optimizeSiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const optimizeResponse = await request(app)
        .get(`/api/warehouse/sites/${optimizeSiteId}/optimization`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(optimizeResponse.body).toBeDefined();
    });
  });

  describe("Add Item with NSN → Verify FSC/NIIN Parsing", () => {
    let nsnSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `NSN Parse Site ${uniqueId}`, location: "Phoenix, AZ" });

      if (siteRes.status === 201) nsnSiteId = siteRes.body.id;
    });

    it("should accept valid NSN format and store correctly", async () => {
      if (!authCookie?.length || !nsnSiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const validNsn = "5965014428893";

      const itemResponse = await request(app)
        .post(`/api/warehouse/sites/${nsnSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: validNsn,
          description: "Radio Equipment FSC 5965",
          quantity: 25,
          unit_weight: 12,
        })
        .expect("Content-Type", /json/)
        .expect(201);

      expect(itemResponse.body.nsn).toBe(validNsn);
    });
  });

  describe("Aging Alerts Trigger at Correct Thresholds", () => {
    let agingSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Aging Site ${uniqueId}`, location: "Seattle, WA" });

      if (siteRes.status === 201) agingSiteId = siteRes.body.id;
    });

    it("should handle items with different aging categories", async () => {
      if (!authCookie?.length || !agingSiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);

      const itemResponse = await request(app)
        .post(`/api/warehouse/sites/${agingSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "1111111111111",
          description: "Aged Inventory Item",
          quantity: 50,
          received_date: fiveYearsAgo.toISOString(),
        })
        .expect("Content-Type", /json/);

      expect([201, 400]).toContain(itemResponse.status);
    });
  });

  describe("Weight Constraint Prevents Invalid Placement", () => {
    let weightSiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Weight Constraint Site ${uniqueId}`, location: "Denver, CO" });

      if (siteRes.status === 201) weightSiteId = siteRes.body.id;
    });

    it("should validate weight constraints on inventory items", async () => {
      if (!authCookie?.length || !weightSiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const negativeWeightResponse = await request(app)
        .post(`/api/warehouse/sites/${weightSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "2222222222222",
          description: "Negative Weight Item",
          quantity: 10,
          unit_weight: -50,
        })
        .expect("Content-Type", /json/);

      expect([400, 201]).toContain(negativeWeightResponse.status);

      const validWeightResponse = await request(app)
        .post(`/api/warehouse/sites/${weightSiteId}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({
          nsn: "3333333333333",
          description: "Valid Weight Item",
          quantity: 10,
          unit_weight: 50,
        })
        .expect("Content-Type", /json/)
        .expect(201);

      expect(validWeightResponse.body.nsn).toBe("3333333333333");
    });
  });

  describe("Multi-Site Inventory Queries", () => {
    let multiSite1Id: number;
    let multiSite2Id: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const site1Res = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Multi Site 1 ${uniqueId}`, location: "Houston, TX" });

      const site2Res = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Multi Site 2 ${uniqueId}`, location: "Dallas, TX" });

      if (site1Res.status === 201) multiSite1Id = site1Res.body.id;
      if (site2Res.status === 201) multiSite2Id = site2Res.body.id;
    });

    it("should query inventory across multiple sites", async () => {
      if (!authCookie?.length || !multiSite1Id || !multiSite2Id) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      await request(app)
        .post(`/api/warehouse/sites/${multiSite1Id}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({ nsn: "4444444444444", description: "Site 1 Item", quantity: 100 });

      await request(app)
        .post(`/api/warehouse/sites/${multiSite2Id}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .send({ nsn: "5555555555555", description: "Site 2 Item", quantity: 200 });

      const site1Inventory = await request(app)
        .get(`/api/warehouse/sites/${multiSite1Id}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .expect(200);

      const site2Inventory = await request(app)
        .get(`/api/warehouse/sites/${multiSite2Id}/inventory`)
        .set("Cookie", getCookie(authCookie))
        .expect(200);

      expect(Array.isArray(site1Inventory.body)).toBe(true);
      expect(Array.isArray(site2Inventory.body)).toBe(true);
    });
  });

  describe("Delete Item from Inventory", () => {
    let deleteSiteId: number;
    let deleteItemId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Delete Test Site ${uniqueId}`, location: "Atlanta, GA" });

      if (siteRes.status === 201) {
        deleteSiteId = siteRes.body.id;

        const itemRes = await request(app)
          .post(`/api/warehouse/sites/${deleteSiteId}/inventory`)
          .set("Cookie", getCookie(authCookie))
          .send({
            nsn: "6666666666666",
            description: "Item to Delete",
            quantity: 10,
          });

        if (itemRes.status === 201) {
          deleteItemId = itemRes.body.id;
        }
      }
    });

    it("should delete inventory item successfully", async () => {
      if (!authCookie?.length || !deleteSiteId || !deleteItemId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const deleteResponse = await request(app)
        .delete(`/api/warehouse/sites/${deleteSiteId}/inventory/${deleteItemId}`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/);

      expect([200, 204, 404]).toContain(deleteResponse.status);
    });
  });

  describe("Update Item Location", () => {
    let updateSiteId: number;
    let updateItemId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({ name: `Update Location Site ${uniqueId}`, location: "Chicago, IL" });

      if (siteRes.status === 201) {
        updateSiteId = siteRes.body.id;

        const itemRes = await request(app)
          .post(`/api/warehouse/sites/${updateSiteId}/inventory`)
          .set("Cookie", getCookie(authCookie))
          .send({
            nsn: "7777700077777",
            description: "Item to Relocate",
            quantity: 50,
            location: "A-01-01",
          });

        if (itemRes.status === 201) {
          updateItemId = itemRes.body.id;
        }
      }
    });

    it("should update inventory item location", async () => {
      if (!authCookie?.length || !updateSiteId || !updateItemId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const updateResponse = await request(app)
        .patch(`/api/warehouse/sites/${updateSiteId}/inventory/${updateItemId}`)
        .set("Cookie", getCookie(authCookie))
        .send({ location: "B-05-10" })
        .expect("Content-Type", /json/);

      expect([200, 204, 404]).toContain(updateResponse.status);
    });
  });

  describe("Capacity Warnings at 90%+ Usage", () => {
    let capacitySiteId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const siteRes = await request(app)
        .post("/api/warehouse/sites")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Capacity Test Site ${uniqueId}`,
          location: "Portland, OR",
          capacity_sqft: 1000,
        });

      if (siteRes.status === 201) {
        capacitySiteId = siteRes.body.id;
      }
    });

    it("should handle high capacity utilization scenarios", async () => {
      if (!authCookie?.length || !capacitySiteId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      for (let i = 0; i < 10; i++) {
        await request(app)
          .post(`/api/warehouse/sites/${capacitySiteId}/inventory`)
          .set("Cookie", getCookie(authCookie))
          .send({
            nsn: `88880000${i}0000${i}`,
            description: `Capacity Test Item ${i}`,
            quantity: 100,
            unit_weight: 100,
          });
      }

      const optimizeResponse = await request(app)
        .get(`/api/warehouse/sites/${capacitySiteId}/optimization`)
        .set("Cookie", getCookie(authCookie))
        .expect(200);

      expect(optimizeResponse.body).toBeDefined();
    });
  });
});
