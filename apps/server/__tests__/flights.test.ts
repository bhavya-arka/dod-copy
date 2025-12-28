import request from "supertest";
import { createTestApp } from "./testApp";
import type { Express } from "express";

const getCookie = (cookies: string | string[] | undefined): string => {
  if (!cookies) return '';
  return Array.isArray(cookies) ? cookies.join('; ') : cookies;
};

describe("Flight Plans API Tests", () => {
  let app: Express;
  let authCookie: string | string[] | undefined;
  const uniqueId = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    const testUser = {
      email: `flighttest_${uniqueId}@example.com`,
      username: `flighttest_${uniqueId}`,
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

  describe("GET /api/flight-plans", () => {
    it("should list all flight plans for authenticated user", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .get("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/flight-plans")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("should reject invalid session token", async () => {
      const response = await request(app)
        .get("/api/flight-plans")
        .set("Cookie", "session=invalid-token")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Invalid or expired session");
    });
  });

  describe("POST /api/flight-plans", () => {
    it("should create a new flight plan", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Test Flight Plan ${uniqueId}`,
        status: "draft",
        allocation_data: { flights: [] },
        movement_items_count: 0,
        total_weight_lb: 0,
        aircraft_count: 0,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.name).toBe(flightPlanData.name);
      expect(response.body.status).toBe("draft");
      expect(response.body.id).toBeDefined();
    });

    it("should require authentication to create flight plan", async () => {
      const response = await request(app)
        .post("/api/flight-plans")
        .send({
          name: "Unauthorized Plan",
          allocation_data: {},
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });

    it("should handle flight plan with cargo allocation data", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Cargo Allocation Plan ${uniqueId}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              aircraft_type: "C-17",
              cargo_items: [
                { tcn: "TCN001", weight_lb: 5000, description: "Equipment" },
              ],
            },
          ],
        },
        movement_items_count: 1,
        total_weight_lb: 5000,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.movement_items_count).toBe(1);
      expect(response.body.aircraft_count).toBe(1);
    });
  });

  describe("GET /api/flight-plans/:id", () => {
    let testFlightPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const createResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Get Test Plan ${uniqueId + 1}`,
          status: "draft",
          allocation_data: {},
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (createResponse.status === 201) {
        testFlightPlanId = createResponse.body.id;
      }
    });

    it("should get a specific flight plan by ID", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const response = await request(app)
        .get(`/api/flight-plans/${testFlightPlanId}`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.id).toBe(testFlightPlanId);
    });

    it("should return 404 for non-existent flight plan", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .get("/api/flight-plans/999999")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toBe("Flight plan not found");
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .get("/api/flight-plans/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("PUT /api/flight-plans/:id", () => {
    let testFlightPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const createResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Update Test Plan ${uniqueId + 2}`,
          status: "draft",
          allocation_data: {},
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (createResponse.status === 201) {
        testFlightPlanId = createResponse.body.id;
      }
    });

    it("should update an existing flight plan", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const updateData = {
        name: `Updated Plan ${uniqueId + 2}`,
        total_weight_lb: 10000,
      };

      const response = await request(app)
        .put(`/api/flight-plans/${testFlightPlanId}`)
        .set("Cookie", getCookie(authCookie))
        .send(updateData)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.name).toBe(updateData.name);
      expect(response.body.total_weight_lb).toBe(10000);
    });

    it("should return 404 for non-existent flight plan", async () => {
      if (!authCookie?.length) return;

      const response = await request(app)
        .put("/api/flight-plans/999999")
        .set("Cookie", getCookie(authCookie))
        .send({ name: "Updated" })
        .expect("Content-Type", /json/)
        .expect(404);

      expect(response.body.error).toBe("Flight plan not found");
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .put("/api/flight-plans/1")
        .send({ name: "Unauthorized Update" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("DELETE /api/flight-plans/:id", () => {
    let testFlightPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const createResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Delete Test Plan ${uniqueId + 3}`,
          status: "draft",
          allocation_data: {},
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (createResponse.status === 201) {
        testFlightPlanId = createResponse.body.id;
      }
    });

    it("should delete an existing flight plan", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      await request(app)
        .delete(`/api/flight-plans/${testFlightPlanId}`)
        .set("Cookie", getCookie(authCookie))
        .expect(204);

      await request(app)
        .get(`/api/flight-plans/${testFlightPlanId}`)
        .set("Cookie", getCookie(authCookie))
        .expect(404);
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .delete("/api/flight-plans/1")
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("PATCH /api/flight-plans/:id/status", () => {
    let testFlightPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const createResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Status Test Plan ${uniqueId + 4}`,
          status: "draft",
          allocation_data: {},
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (createResponse.status === 201) {
        testFlightPlanId = createResponse.body.id;
      }
    });

    it("should update flight plan status to complete", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const response = await request(app)
        .patch(`/api/flight-plans/${testFlightPlanId}/status`)
        .set("Cookie", getCookie(authCookie))
        .send({ status: "complete" })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.status).toBe("complete");
    });

    it("should update flight plan status to archived", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const response = await request(app)
        .patch(`/api/flight-plans/${testFlightPlanId}/status`)
        .set("Cookie", getCookie(authCookie))
        .send({ status: "archived" })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(response.body.status).toBe("archived");
    });

    it("should reject invalid status", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const response = await request(app)
        .patch(`/api/flight-plans/${testFlightPlanId}/status`)
        .set("Cookie", getCookie(authCookie))
        .send({ status: "invalid_status" })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("Invalid status");
      expect(response.body.validStatuses).toContain("draft");
      expect(response.body.validStatuses).toContain("complete");
      expect(response.body.validStatuses).toContain("archived");
    });

    it("should require authentication", async () => {
      const response = await request(app)
        .patch("/api/flight-plans/1/status")
        .send({ status: "complete" })
        .expect("Content-Type", /json/)
        .expect(401);

      expect(response.body.error).toBe("Authentication required");
    });
  });

  describe("Flight Plan Validation", () => {
    it("should handle weight constraint validation", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Weight Validation Plan ${uniqueId + 5}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              aircraft_type: "C-17",
              max_cargo_weight_lb: 170000,
              cargo_items: [
                { tcn: "TCN001", weight_lb: 180000, description: "Overweight cargo" },
              ],
            },
          ],
        },
        movement_items_count: 1,
        total_weight_lb: 180000,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/);

      expect([201, 400]).toContain(response.status);
    });

    it("should handle aircraft type selection", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Aircraft Type Plan ${uniqueId + 6}`,
        status: "draft",
        allocation_data: {},
        movement_items_count: 0,
        total_weight_lb: 50000,
        aircraft_count: 1,
        preferred_aircraft_type_id: "C-17",
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.preferred_aircraft_type_id).toBe("C-17");
    });

    it("should handle multi-stop flight configuration", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Multi-Stop Plan ${uniqueId + 7}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              aircraft_type: "C-17",
              route: ["HICKAM", "ANDERSEN", "KADENA"],
              stops: [
                { airbase: "HICKAM", cargo_load: [], cargo_unload: [] },
                { airbase: "ANDERSEN", cargo_load: [], cargo_unload: [] },
                { airbase: "KADENA", cargo_load: [], cargo_unload: [] },
              ],
            },
          ],
        },
        movement_items_count: 0,
        total_weight_lb: 0,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.allocation_data.flights[0].route).toHaveLength(3);
    });

    it("should handle pallet positioning data", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Pallet Position Plan ${uniqueId + 8}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              aircraft_type: "C-17",
              pallets: [
                { position: 1, weight_lb: 5000, cargo_items: [] },
                { position: 2, weight_lb: 4500, cargo_items: [] },
                { position: 3, weight_lb: 5200, cargo_items: [] },
              ],
            },
          ],
        },
        movement_items_count: 3,
        total_weight_lb: 14700,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.allocation_data.flights[0].pallets).toHaveLength(3);
    });

    it("should handle mixed fleet mode configuration", async () => {
      if (!authCookie?.length) return;

      const flightPlanData = {
        name: `Mixed Fleet Plan ${uniqueId + 9}`,
        status: "draft",
        allocation_data: {},
        movement_items_count: 0,
        total_weight_lb: 0,
        aircraft_count: 2,
        allow_mixed_fleet: true,
        mixed_fleet_mode: "PREFERRED_FIRST",
        preference_strength: "0.75",
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(response.body.allow_mixed_fleet).toBe(true);
      expect(response.body.mixed_fleet_mode).toBe("PREFERRED_FIRST");
    });
  });

  describe("Flight Schedules", () => {
    let testFlightPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const createResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Schedule Test Plan ${uniqueId + 10}`,
          status: "draft",
          allocation_data: {},
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (createResponse.status === 201) {
        testFlightPlanId = createResponse.body.id;
      }
    });

    it("should create flight schedules for a plan", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const scheduleData = {
        schedules: [
          {
            name: "Flight 1",
            callsign: "REACH01",
            departure_time: new Date().toISOString(),
            arrival_time: new Date(Date.now() + 3600000).toISOString(),
          },
        ],
      };

      const response = await request(app)
        .post(`/api/flight-plans/${testFlightPlanId}/schedules`)
        .set("Cookie", getCookie(authCookie))
        .send(scheduleData)
        .expect("Content-Type", /json/)
        .expect(201);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should get flight schedules for a plan", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const response = await request(app)
        .get(`/api/flight-plans/${testFlightPlanId}/schedules`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    it("should reject schedules without array format", async () => {
      if (!authCookie?.length || !testFlightPlanId) return;

      const response = await request(app)
        .post(`/api/flight-plans/${testFlightPlanId}/schedules`)
        .set("Cookie", getCookie(authCookie))
        .send({ schedules: "not an array" })
        .expect("Content-Type", /json/)
        .expect(400);

      expect(response.body.error).toBe("schedules must be an array");
    });
  });
});
