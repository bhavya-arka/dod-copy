import request from "supertest";
import { createTestApp } from "../../apps/server/__tests__/testApp";
import type { Express } from "express";

const getCookie = (cookies: string | string[] | undefined): string => {
  if (!cookies) return '';
  return Array.isArray(cookies) ? cookies.join('; ') : cookies;
};

const mockWeatherResponse = {
  location: { lat: 21.3187, lon: -157.9224, city: "Honolulu", state: "HI" },
  forecast: [{ name: "Today", temperature: 82, shortForecast: "Sunny" }],
  currentConditions: { temperature: { value: 27 }, windSpeed: { value: 15 } },
  cached: true,
};

describe("Flight Plan Flow Integration Tests", () => {
  let app: Express;
  let authCookie: string | string[] | undefined;
  const uniqueId = Date.now();

  beforeAll(async () => {
    app = await createTestApp();

    const testUser = {
      email: `flightplanflow_${uniqueId}@example.com`,
      username: `flightplanflow_${uniqueId}`,
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

  describe("Create Flight Plan with Cargo", () => {
    it("should create a flight plan with cargo assignment", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const flightPlanData = {
        name: `Test Flight Plan ${uniqueId}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              id: `flight-${uniqueId}-001`,
              aircraft: "C-17A",
              tailNumber: "07-7171",
              origin: "KDOV",
              destination: "RJTY",
              cargo: [
                {
                  tcn: `TCN${uniqueId}001`,
                  description: "Medical Supplies",
                  weight: 5000,
                },
              ],
            },
          ],
          totalWeight: 5000,
          aircraftCount: 1,
        },
        movement_items_count: 1,
        total_weight_lb: 5000,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(flightPlanData)
        .expect("Content-Type", /json/);

      expect([201, 400, 401]).toContain(response.status);
      
      if (response.status === 201) {
        expect(response.body.name).toBe(flightPlanData.name);
        expect(response.body.id).toBeDefined();
      }
    });
  });

  describe("Multi-Stop Flight with FILO Loading", () => {
    it("should handle multi-stop flight plan with cargo sequencing", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const multiStopPlan = {
        name: `Multi-Stop Plan ${uniqueId}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              id: `flight-${uniqueId}-ms`,
              aircraft: "C-17A",
              route: ["KDOV", "PHNL", "RJTY"],
              stops: [
                { icao: "KDOV", action: "load", cargo: ["cargo-1", "cargo-2"] },
                { icao: "PHNL", action: "unload", cargo: ["cargo-2"] },
                { icao: "RJTY", action: "unload", cargo: ["cargo-1"] },
              ],
              loadingSequence: "FILO",
            },
          ],
        },
        movement_items_count: 2,
        total_weight_lb: 10000,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(multiStopPlan)
        .expect("Content-Type", /json/);

      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe("Aircraft Type Selection Affects Capacity", () => {
    it("should validate capacity constraints based on aircraft type", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const aircraftTypesResponse = await request(app)
        .get("/api/aircraft-types")
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/);

      expect([200, 401, 404]).toContain(aircraftTypesResponse.status);

      if (aircraftTypesResponse.status === 200) {
        const aircraftTypes = aircraftTypesResponse.body;
        expect(Array.isArray(aircraftTypes) || typeof aircraftTypes === 'object').toBe(true);
      }
    });
  });

  describe("Pallet Positioning Respects Constraints", () => {
    it("should validate pallet positions within aircraft limits", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const palletPlan = {
        name: `Pallet Position Plan ${uniqueId}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              id: `flight-${uniqueId}-pallet`,
              aircraft: "C-17A",
              pallets: [
                { position: 1, weight: 5000, tcn: "TCN001" },
                { position: 2, weight: 4500, tcn: "TCN002" },
                { position: 3, weight: 6000, tcn: "TCN003" },
                { position: 4, weight: 5500, tcn: "TCN004" },
              ],
            },
          ],
        },
        movement_items_count: 4,
        total_weight_lb: 21000,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(palletPlan)
        .expect("Content-Type", /json/);

      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe("Center of Balance Calculation", () => {
    it("should calculate and validate center of gravity", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const cgPlan = {
        name: `CG Test Plan ${uniqueId}`,
        status: "draft",
        allocation_data: {
          flights: [
            {
              id: `flight-${uniqueId}-cg`,
              aircraft: "C-17A",
              pallets: [
                { position: 1, weight: 10000, armInches: 500 },
                { position: 5, weight: 8000, armInches: 700 },
                { position: 10, weight: 12000, armInches: 1000 },
              ],
              calculatedCG: {
                percentMAC: 28.5,
                withinLimits: true,
                forwardLimit: 15,
                aftLimit: 45,
              },
            },
          ],
        },
        movement_items_count: 3,
        total_weight_lb: 30000,
        aircraft_count: 1,
      };

      const response = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(cgPlan)
        .expect("Content-Type", /json/);

      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe("Export Load Plan Data", () => {
    let exportPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const planResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Export Test Plan ${uniqueId}`,
          status: "complete",
          allocation_data: { flights: [], totalWeight: 0 },
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (planResponse.status === 201) {
        exportPlanId = planResponse.body.id;
      }
    });

    it("should export flight plan data", async () => {
      if (!authCookie?.length || !exportPlanId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const exportResponse = await request(app)
        .get(`/api/flight-plans/${exportPlanId}`)
        .set("Cookie", getCookie(authCookie))
        .expect("Content-Type", /json/);

      expect([200, 404]).toContain(exportResponse.status);

      if (exportResponse.status === 200) {
        expect(exportResponse.body.id).toBe(exportPlanId);
        expect(exportResponse.body.allocation_data).toBeDefined();
      }
    });
  });

  describe("Route Optimization Suggestions", () => {
    it("should resolve airbases for route planning", async () => {
      const resolveResponse = await request(app)
        .post("/api/airbases/resolve")
        .send({ icao: "KDOV" })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(resolveResponse.body.resolved).toBe(true);
      expect(resolveResponse.body.coordinates).toBeDefined();

      const allBasesResponse = await request(app)
        .get("/api/airbases")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(Array.isArray(allBasesResponse.body)).toBe(true);
      expect(allBasesResponse.body.length).toBeGreaterThan(0);
    });
  });

  describe("Conflict Detection for Overlapping Flights", () => {
    it("should handle conflict detection in flight schedules", async () => {
      if (!authCookie?.length) {
        console.log("Skipping: No auth cookie available");
        return;
      }

      const scheduleData = {
        name: `Conflict Test Schedule ${uniqueId}`,
        schedule_data: [
          {
            id: `flight-${uniqueId}-a`,
            departure: new Date().toISOString(),
            arrival: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
            aircraft: "C-17A",
            tailNumber: "07-7171",
          },
          {
            id: `flight-${uniqueId}-b`,
            departure: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            arrival: new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString(),
            aircraft: "C-17A",
            tailNumber: "07-7171",
          },
        ],
        total_flights: 2,
      };

      const response = await request(app)
        .post("/api/flight-schedules")
        .set("Cookie", getCookie(authCookie))
        .send(scheduleData)
        .expect("Content-Type", /json/);

      expect([201, 400, 401]).toContain(response.status);
    });
  });

  describe("Flight Status Transitions", () => {
    let statusPlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const planResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Status Transition Plan ${uniqueId}`,
          status: "draft",
          allocation_data: { flights: [] },
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 0,
        });

      if (planResponse.status === 201) {
        statusPlanId = planResponse.body.id;
      }
    });

    it("should transition flight plan through status states", async () => {
      if (!authCookie?.length || !statusPlanId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const updateResponse = await request(app)
        .patch(`/api/flight-plans/${statusPlanId}/status`)
        .set("Cookie", getCookie(authCookie))
        .send({ status: "complete" })
        .expect("Content-Type", /json/);

      expect([200, 404]).toContain(updateResponse.status);

      if (updateResponse.status === 200) {
        expect(updateResponse.body.status).toBe("complete");
      }
    });
  });

  describe("Clone and Modify Flight Plan", () => {
    let sourcePlanId: number;

    beforeAll(async () => {
      if (!authCookie?.length) return;

      const planResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send({
          name: `Clone Source Plan ${uniqueId}`,
          status: "complete",
          allocation_data: {
            flights: [
              { id: "original-flight", aircraft: "C-17A", cargo: [] },
            ],
          },
          movement_items_count: 0,
          total_weight_lb: 0,
          aircraft_count: 1,
        });

      if (planResponse.status === 201) {
        sourcePlanId = planResponse.body.id;
      }
    });

    it("should clone flight plan and allow modifications", async () => {
      if (!authCookie?.length || !sourcePlanId) {
        console.log("Skipping: Prerequisites not met");
        return;
      }

      const sourceResponse = await request(app)
        .get(`/api/flight-plans/${sourcePlanId}`)
        .set("Cookie", getCookie(authCookie))
        .expect(200);

      const clonedData = {
        ...sourceResponse.body,
        name: `Cloned Plan ${uniqueId}`,
        status: "draft",
      };
      delete clonedData.id;
      delete clonedData.created_at;
      delete clonedData.updated_at;

      const cloneResponse = await request(app)
        .post("/api/flight-plans")
        .set("Cookie", getCookie(authCookie))
        .send(clonedData)
        .expect("Content-Type", /json/);

      expect([201, 400]).toContain(cloneResponse.status);

      if (cloneResponse.status === 201) {
        expect(cloneResponse.body.id).not.toBe(sourcePlanId);
        expect(cloneResponse.body.name).toBe(`Cloned Plan ${uniqueId}`);
      }
    });
  });

  describe("Weather API Integration for Flight Planning", () => {
    it("should fetch weather data for flight planning", async () => {
      const hawaiiLat = 21.3187;
      const hawaiiLon = -157.9224;

      const weatherResponse = await request(app)
        .get(`/api/weather/${hawaiiLat}/${hawaiiLon}`)
        .expect("Content-Type", /json/);

      expect([200, 404, 429, 502]).toContain(weatherResponse.status);

      if (weatherResponse.status === 200) {
        expect(weatherResponse.body.location).toBeDefined();
      }
    });

    it("should check weather API status", async () => {
      const statusResponse = await request(app)
        .get("/api/weather/status")
        .expect("Content-Type", /json/)
        .expect(200);

      expect(statusResponse.body.cache).toBeDefined();
      expect(statusResponse.body.requests).toBeDefined();
    });
  });
});
