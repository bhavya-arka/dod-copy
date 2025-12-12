import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, insertUserSchema } from "@shared/schema";

// Weather API cache with 5-minute TTL
interface WeatherCacheEntry {
  data: any;
  timestamp: number;
}

const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getFromWeatherCache(key: string): any | null {
  const entry = weatherCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > WEATHER_CACHE_TTL_MS) {
    weatherCache.delete(key);
    return null;
  }
  return entry.data;
}

function setWeatherCache(key: string, data: any): void {
  weatherCache.set(key, { data, timestamp: Date.now() });
}

const NWS_USER_AGENT = "(PACAF Airlift Demo, contact@example.com)";

// Extended request type with user info
interface AuthRequest extends Request {
  user?: { id: number; email: string };
}

// Auth middleware
async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const session = await storage.getSession(token);
  if (!session) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }
  
  const user = await storage.getUser(session.user_id);
  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }
  
  req.user = { id: user.id, email: user.email };
  next();
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // AUTH ROUTES (PUBLIC)
  // ============================================================================
  
  app.post("/api/auth/register", async (req, res) => {
    try {
      const parsed = insertUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }
      
      // Check for duplicate email
      const existingEmail = await storage.getUserByEmail(parsed.data.email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
      
      // Check for duplicate username
      const existingUsername = await storage.getUserByUsername(parsed.data.username);
      if (existingUsername) {
        return res.status(409).json({ error: "Username already taken" });
      }
      
      const user = await storage.createUser(parsed.data);
      const session = await storage.createSession(user.id);
      
      res.cookie('session', session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        sameSite: 'strict'
      });
      
      res.status(201).json({ 
        user: { id: user.id, email: user.email, username: user.username }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: "Failed to register" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      }
      
      const user = await storage.validatePassword(parsed.data.email, parsed.data.password);
      if (!user) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      
      const session = await storage.createSession(user.id);
      
      res.cookie('session', session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: 'strict'
      });
      
      res.json({ 
        user: { id: user.id, email: user.email, username: user.username }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", async (req, res) => {
    const token = req.cookies?.session || req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await storage.deleteSession(token);
    }
    res.clearCookie('session');
    res.status(204).send();
  });

  app.get("/api/auth/me", authMiddleware, async (req: AuthRequest, res) => {
    if (!req.user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const user = await storage.getUser(req.user.id);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json({ id: user.id, email: user.email, username: user.username });
  });

  // ============================================================================
  // WEATHER API PROXY (PUBLIC)
  // ============================================================================

  app.get("/api/weather/:lat/:lon", async (req, res) => {
    try {
      const lat = parseFloat(req.params.lat);
      const lon = parseFloat(req.params.lon);
      
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Coordinates out of range" });
      }
      
      const cacheKey = `weather:${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cachedData = getFromWeatherCache(cacheKey);
      if (cachedData) {
        return res.json({ ...cachedData, cached: true });
      }
      
      const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointsResponse = await fetch(pointsUrl, {
        headers: {
          "User-Agent": NWS_USER_AGENT,
          "Accept": "application/geo+json"
        }
      });
      
      if (pointsResponse.status === 429) {
        return res.status(429).json({ 
          error: "Rate limited by NWS API. Please try again later.",
          retryAfter: pointsResponse.headers.get("Retry-After") || "60"
        });
      }
      
      if (pointsResponse.status === 404) {
        return res.status(404).json({ 
          error: "Location not supported by NWS API. NWS only covers US territories." 
        });
      }
      
      if (!pointsResponse.ok) {
        console.error(`NWS points API error: ${pointsResponse.status}`);
        return res.status(502).json({ 
          error: "Failed to fetch weather data from NWS",
          status: pointsResponse.status
        });
      }
      
      const pointsData = await pointsResponse.json();
      const forecastUrl = pointsData.properties?.forecast;
      const forecastHourlyUrl = pointsData.properties?.forecastHourly;
      const observationStationsUrl = pointsData.properties?.observationStations;
      
      if (!forecastUrl) {
        return res.status(502).json({ error: "No forecast URL in NWS response" });
      }
      
      const forecastResponse = await fetch(forecastUrl, {
        headers: {
          "User-Agent": NWS_USER_AGENT,
          "Accept": "application/geo+json"
        }
      });
      
      if (forecastResponse.status === 429) {
        return res.status(429).json({ 
          error: "Rate limited by NWS API. Please try again later." 
        });
      }
      
      if (!forecastResponse.ok) {
        console.error(`NWS forecast API error: ${forecastResponse.status}`);
        return res.status(502).json({ 
          error: "Failed to fetch forecast data from NWS",
          status: forecastResponse.status
        });
      }
      
      const forecastData = await forecastResponse.json();
      
      let currentConditions = null;
      if (observationStationsUrl) {
        try {
          const stationsResponse = await fetch(observationStationsUrl, {
            headers: {
              "User-Agent": NWS_USER_AGENT,
              "Accept": "application/geo+json"
            }
          });
          
          if (stationsResponse.ok) {
            const stationsData = await stationsResponse.json();
            const nearestStation = stationsData.features?.[0]?.properties?.stationIdentifier;
            
            if (nearestStation) {
              const obsUrl = `https://api.weather.gov/stations/${nearestStation}/observations/latest`;
              const obsResponse = await fetch(obsUrl, {
                headers: {
                  "User-Agent": NWS_USER_AGENT,
                  "Accept": "application/geo+json"
                }
              });
              
              if (obsResponse.ok) {
                const obsData = await obsResponse.json();
                currentConditions = obsData.properties;
              }
            }
          }
        } catch (obsError) {
          console.warn("Could not fetch current conditions:", obsError);
        }
      }
      
      const result = {
        location: {
          lat,
          lon,
          city: pointsData.properties?.relativeLocation?.properties?.city,
          state: pointsData.properties?.relativeLocation?.properties?.state,
          timezone: pointsData.properties?.timeZone
        },
        forecast: forecastData.properties?.periods || [],
        forecastHourlyUrl,
        currentConditions,
        generatedAt: forecastData.properties?.generatedAt,
        updateTime: forecastData.properties?.updateTime
      };
      
      setWeatherCache(cacheKey, result);
      res.json({ ...result, cached: false });
      
    } catch (error) {
      console.error("Weather API error:", error);
      res.status(500).json({ 
        error: "Internal server error while fetching weather data",
        message: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // ============================================================================
  // FLIGHT PLANS API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const plans = await storage.getFlightPlans(req.user!.id);
      res.json(plans);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight plans" });
    }
  });

  app.get("/api/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const plan = await storage.getFlightPlan(parseInt(req.params.id), req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight plan" });
    }
  });

  app.post("/api/flight-plans", authMiddleware, async (req: AuthRequest, res) => {
    try {
      console.log('Creating flight plan with data:', JSON.stringify({
        name: req.body.name,
        status: req.body.status,
        movement_items_count: req.body.movement_items_count,
        total_weight_lb: req.body.total_weight_lb,
        aircraft_count: req.body.aircraft_count,
        has_allocation_data: !!req.body.allocation_data
      }));
      
      const plan = await storage.createFlightPlan({
        ...req.body,
        user_id: req.user!.id
      });
      console.log('Flight plan created successfully:', plan.id);
      res.status(201).json(plan);
    } catch (error) {
      console.error('Failed to create flight plan:', error);
      res.status(500).json({ error: "Failed to create flight plan", details: String(error) });
    }
  });

  app.put("/api/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const plan = await storage.updateFlightPlan(
        parseInt(req.params.id),
        req.user!.id,
        req.body
      );
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      res.json(plan);
    } catch (error) {
      res.status(500).json({ error: "Failed to update flight plan" });
    }
  });

  app.patch("/api/flight-plans/:id/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['draft', 'complete', 'archived'];
      
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: "Invalid status", 
          validStatuses 
        });
      }
      
      const plan = await storage.updateFlightPlan(
        parseInt(req.params.id),
        req.user!.id,
        { status }
      );
      
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      res.json(plan);
    } catch (error) {
      console.error('Failed to update flight plan status:', error);
      res.status(500).json({ error: "Failed to update flight plan status" });
    }
  });

  app.delete("/api/flight-plans/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightPlan(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight plan" });
    }
  });

  // ============================================================================
  // FLIGHT SCHEDULES API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const schedules = await storage.getFlightSchedules(req.user!.id);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight schedules" });
    }
  });

  app.get("/api/flight-schedules/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const schedule = await storage.getFlightSchedule(parseInt(req.params.id), req.user!.id);
      if (!schedule) {
        return res.status(404).json({ error: "Flight schedule not found" });
      }
      res.json(schedule);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight schedule" });
    }
  });

  app.post("/api/flight-schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const schedule = await storage.createFlightSchedule({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(schedule);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flight schedule" });
    }
  });

  app.delete("/api/flight-schedules/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightSchedule(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight schedule" });
    }
  });

  app.get("/api/flight-plans/:planId/schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const schedules = await storage.getFlightSchedulesByPlanId(planId, req.user!.id);
      res.json(schedules);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight schedules" });
    }
  });

  app.post("/api/flight-plans/:planId/schedules", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      const { schedules } = req.body;
      if (!Array.isArray(schedules)) {
        return res.status(400).json({ error: "schedules must be an array" });
      }
      
      await storage.deleteFlightSchedulesByPlanId(planId, req.user!.id);
      
      const createdSchedules = [];
      for (const schedule of schedules) {
        const created = await storage.createFlightSchedule({
          user_id: req.user!.id,
          flight_plan_id: planId,
          name: schedule.name || schedule.callsign || `Flight ${createdSchedules.length + 1}`,
          schedule_data: schedule,
          total_flights: 1
        });
        createdSchedules.push(created);
      }
      
      res.status(201).json(createdSchedules);
    } catch (error) {
      console.error('Failed to save flight schedules:', error);
      res.status(500).json({ error: "Failed to save flight schedules" });
    }
  });

  // ============================================================================
  // SPLIT SESSIONS API (PROTECTED)
  // ============================================================================

  app.get("/api/split-sessions", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sessions = await storage.getSplitSessions(req.user!.id);
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch split sessions" });
    }
  });

  app.get("/api/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const session = await storage.getSplitSession(parseInt(req.params.id), req.user!.id);
      if (!session) {
        return res.status(404).json({ error: "Split session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch split session" });
    }
  });

  app.post("/api/split-sessions", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const session = await storage.createSplitSession({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to create split session" });
    }
  });

  app.put("/api/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const session = await storage.updateSplitSession(
        parseInt(req.params.id),
        req.user!.id,
        req.body
      );
      if (!session) {
        return res.status(404).json({ error: "Split session not found" });
      }
      res.json(session);
    } catch (error) {
      res.status(500).json({ error: "Failed to update split session" });
    }
  });

  app.delete("/api/split-sessions/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteSplitSession(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete split session" });
    }
  });

  // ============================================================================
  // FLIGHT NODES API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans/:planId/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const nodes = await storage.getFlightNodes(planId, req.user!.id);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight nodes" });
    }
  });

  app.get("/api/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const node = await storage.getFlightNode(parseInt(req.params.id), req.user!.id);
      if (!node) {
        return res.status(404).json({ error: "Flight node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight node" });
    }
  });

  app.get("/api/flight-nodes/:id/children", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const children = await storage.getFlightNodeChildren(parseInt(req.params.id), req.user!.id);
      res.json(children);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch node children" });
    }
  });

  app.post("/api/flight-plans/:planId/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const node = await storage.createFlightNode({
        ...req.body,
        flight_plan_id: planId,
        user_id: req.user!.id
      });
      res.status(201).json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flight node" });
    }
  });

  app.put("/api/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, flight_plan_id, id, ...safeData } = req.body;
      const node = await storage.updateFlightNode(parseInt(req.params.id), req.user!.id, safeData);
      if (!node) {
        return res.status(404).json({ error: "Flight node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to update flight node" });
    }
  });

  app.delete("/api/flight-nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightNode(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight node" });
    }
  });

  // ============================================================================
  // FLIGHT EDGES API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans/:planId/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const edges = await storage.getFlightEdges(planId, req.user!.id);
      res.json(edges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight edges" });
    }
  });

  app.get("/api/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const edge = await storage.getFlightEdge(parseInt(req.params.id), req.user!.id);
      if (!edge) {
        return res.status(404).json({ error: "Flight edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch flight edge" });
    }
  });

  app.post("/api/flight-plans/:planId/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const edge = await storage.createFlightEdge({
        ...req.body,
        flight_plan_id: planId,
        user_id: req.user!.id
      });
      res.status(201).json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to create flight edge" });
    }
  });

  app.put("/api/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, flight_plan_id, id, ...safeData } = req.body;
      const edge = await storage.updateFlightEdge(parseInt(req.params.id), req.user!.id, safeData);
      if (!edge) {
        return res.status(404).json({ error: "Flight edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to update flight edge" });
    }
  });

  app.delete("/api/flight-edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteFlightEdge(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete flight edge" });
    }
  });

  // ============================================================================
  // PORT INVENTORY API (PROTECTED)
  // ============================================================================

  app.get("/api/flight-plans/:planId/port-inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const inventories = await storage.getPortInventories(planId, req.user!.id);
      res.json(inventories);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch port inventories" });
    }
  });

  app.get("/api/flight-plans/:planId/port-inventory/:airbaseId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const inventory = await storage.getPortInventory(planId, req.params.airbaseId, req.user!.id);
      if (!inventory) {
        return res.json({ 
          flight_plan_id: planId, 
          airbase_id: req.params.airbaseId, 
          incoming_cargo: [], 
          outgoing_cargo: [], 
          available_cargo: [] 
        });
      }
      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch port inventory" });
    }
  });

  app.post("/api/flight-plans/:planId/port-inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      const inventory = await storage.upsertPortInventory({
        ...req.body,
        flight_plan_id: planId,
        user_id: req.user!.id
      });
      res.status(201).json(inventory);
    } catch (error) {
      res.status(500).json({ error: "Failed to create/update port inventory" });
    }
  });

  app.put("/api/flight-plans/:planId/port-inventory/:airbaseId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }
      
      const { incoming_cargo, outgoing_cargo, available_cargo } = req.body;
      if (incoming_cargo !== undefined && !Array.isArray(incoming_cargo)) {
        return res.status(400).json({ error: "incoming_cargo must be an array" });
      }
      if (outgoing_cargo !== undefined && !Array.isArray(outgoing_cargo)) {
        return res.status(400).json({ error: "outgoing_cargo must be an array" });
      }
      if (available_cargo !== undefined && !Array.isArray(available_cargo)) {
        return res.status(400).json({ error: "available_cargo must be an array" });
      }
      
      const inventory = await storage.upsertPortInventory({
        incoming_cargo: incoming_cargo || [],
        outgoing_cargo: outgoing_cargo || [],
        available_cargo: available_cargo || [],
        flight_plan_id: planId,
        airbase_id: req.params.airbaseId,
        user_id: req.user!.id
      });
      res.json(inventory);
    } catch (error) {
      res.status(500).json({ error: "Failed to update port inventory" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
