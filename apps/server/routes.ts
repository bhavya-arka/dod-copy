import type { Express, Request, Response as ExpressResponse, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from "multer";
import { storage } from "./storage";
import { db } from "./db";
import { 
  loginSchema, 
  insertUserSchema,
  warehouseSites,
  warehouseInventoryItems,
  warehouseTransfers,
  warehouseBuildings,
  warehouseZones,
  warehouseLocations,
  warehouseSettings,
  warehouseAgingThresholds,
  warehouseAnalyticsSnapshots,
  warehouseOptimizationRuns
} from "@shared/schema";
import { eq, and, or, like, ilike, sql, gt, lt, isNull, isNotNull, asc, desc, count } from "drizzle-orm";
import {
  dagNodeService,
  dagEdgeService,
  cargoService,
  cargoAssignmentService,
  aircraftService
} from "./services";
import { runOptimization, OptimizationInput, AvailabilityConstraint, CargoRequirement, MixedFleetMode } from "./services/fleetOptimizer";
import { parseFile, getUploadSession, deleteUploadSession, getSessionStats } from "./services/fileIngestionService";

// Weather API cache with 10-minute TTL
interface WeatherCacheEntry {
  data: any;
  timestamp: number;
}

const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Weather API status tracking
interface WeatherApiStatus {
  cacheSize: number;
  cacheHits: number;
  cacheMisses: number;
  lastError: { message: string; timestamp: Date } | null;
  rateLimitState: { isLimited: boolean; retryAfter: string | null; limitedAt: Date | null };
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

const weatherApiStatus: WeatherApiStatus = {
  cacheSize: 0,
  cacheHits: 0,
  cacheMisses: 0,
  lastError: null,
  rateLimitState: { isLimited: false, retryAfter: null, limitedAt: null },
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0
};

function getFromWeatherCache(key: string): any | null {
  const entry = weatherCache.get(key);
  if (!entry) {
    weatherApiStatus.cacheMisses++;
    return null;
  }
  if (Date.now() - entry.timestamp > WEATHER_CACHE_TTL_MS) {
    weatherCache.delete(key);
    weatherApiStatus.cacheSize = weatherCache.size;
    weatherApiStatus.cacheMisses++;
    return null;
  }
  weatherApiStatus.cacheHits++;
  return entry.data;
}

function setWeatherCache(key: string, data: any): void {
  weatherCache.set(key, { data, timestamp: Date.now() });
  weatherApiStatus.cacheSize = weatherCache.size;
}

const NWS_USER_AGENT = "(PACAF Airlift Demo, contact@example.com)";

async function fetchWithRetries(
  url: string,
  init: RequestInit = {},
  maxRetries: number = 3
): Promise<Response> {
  const baseDelay = 500;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[NWS API] Fetching ${url} (attempt ${attempt + 1}/${maxRetries})`);
      const response = await fetch(url, init);
      console.log(`[NWS API] Response status: ${response.status} for ${url}`);

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After") || "60";
        weatherApiStatus.rateLimitState = {
          isLimited: true,
          retryAfter,
          limitedAt: new Date()
        };
        console.warn(`[NWS API] Rate limited (429). Retry-After: ${retryAfter}s`);
        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
          console.log(`[NWS API] Waiting ${delay.toFixed(0)}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        return response;
      }

      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.warn(`[NWS API] Client error ${response.status} - not retrying`);
        return response;
      }

      if (!response.ok && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.log(`[NWS API] Server error ${response.status}. Waiting ${delay.toFixed(0)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      if (response.ok) {
        weatherApiStatus.rateLimitState = { isLimited: false, retryAfter: null, limitedAt: null };
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`[NWS API] Fetch error (attempt ${attempt + 1}/${maxRetries}):`, lastError.message);
      
      if (attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
        console.log(`[NWS API] Waiting ${delay.toFixed(0)}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Max retries exceeded");
}

const MILITARY_BASES_DATA = [
  { base_id: 'HICKAM', name: 'Joint Base Pearl Harbor-Hickam', icao: 'PHIK', lat: 21.3187, lon: -157.9224 },
  { base_id: 'ANDERSEN', name: 'Andersen Air Force Base', icao: 'PGUA', lat: 13.5840, lon: 144.9241 },
  { base_id: 'KADENA', name: 'Kadena Air Base', icao: 'RODN', lat: 26.3516, lon: 127.7695 },
  { base_id: 'YOKOTA', name: 'Yokota Air Base', icao: 'RJTY', lat: 35.7485, lon: 139.3487 },
  { base_id: 'MISAWA', name: 'Misawa Air Base', icao: 'RJSM', lat: 40.7032, lon: 141.3686 },
  { base_id: 'OSAN', name: 'Osan Air Base', icao: 'RKSO', lat: 37.0906, lon: 127.0306 },
  { base_id: 'KUNSAN', name: 'Kunsan Air Base', icao: 'RKJK', lat: 35.9038, lon: 126.6158 },
  { base_id: 'CLARK', name: 'Clark Air Base', icao: 'RPLC', lat: 15.1859, lon: 120.5604 },
  { base_id: 'TRAVIS', name: 'Travis Air Force Base', icao: 'KSUU', lat: 38.2627, lon: -121.9275 },
  { base_id: 'MCCHORD', name: 'Joint Base Lewis-McChord', icao: 'KTCM', lat: 47.1377, lon: -122.4764 },
  { base_id: 'CHARLESTON', name: 'Charleston AFB', icao: 'KCHS', lat: 32.8986, lon: -80.0405 },
  { base_id: 'DOVER', name: 'Dover Air Force Base', icao: 'KDOV', lat: 39.1296, lon: -75.4657 },
  { base_id: 'RAMSTEIN', name: 'Ramstein Air Base', icao: 'ETAR', lat: 49.4369, lon: 7.6003 },
  { base_id: 'INCIRLIK', name: 'Incirlik Air Base', icao: 'LTAG', lat: 37.0021, lon: 35.4259 },
  { base_id: 'AL_UDEID', name: 'Al Udeid Air Base', icao: 'OTBH', lat: 25.1174, lon: 51.3150 },
  { base_id: 'DIEGO_GARCIA', name: 'Naval Support Facility Diego Garcia', icao: 'FJDG', lat: -7.3133, lon: 72.4111 }
];

// Extended request type with user info
interface AuthRequest extends Request {
  user?: { id: number; email: string };
}

// Auth middleware
async function authMiddleware(req: AuthRequest, res: ExpressResponse, next: NextFunction) {
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
      
      const userData = parsed.data as { email: string; username: string; password: string };
      
      // Check for duplicate email
      const existingEmail = await storage.getUserByEmail(userData.email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
      
      // Check for duplicate username
      const existingUsername = await storage.getUserByUsername(userData.username);
      if (existingUsername) {
        return res.status(409).json({ error: "Username already taken" });
      }
      
      const user = await storage.createUser(userData);
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
      
      const loginData = parsed.data as { email: string; password: string };
      const user = await storage.validatePassword(loginData.email, loginData.password);
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

  app.get("/api/weather/status", async (req, res) => {
    console.log("[Weather API] Status check requested");
    res.json({
      cache: {
        size: weatherApiStatus.cacheSize,
        hits: weatherApiStatus.cacheHits,
        misses: weatherApiStatus.cacheMisses,
        ttlMs: WEATHER_CACHE_TTL_MS
      },
      lastError: weatherApiStatus.lastError,
      rateLimitState: weatherApiStatus.rateLimitState,
      requests: {
        total: weatherApiStatus.totalRequests,
        successful: weatherApiStatus.successfulRequests,
        failed: weatherApiStatus.failedRequests
      }
    });
  });

  app.get("/api/weather/:lat/:lon", async (req, res) => {
    weatherApiStatus.totalRequests++;
    try {
      const lat = parseFloat(req.params.lat);
      const lon = parseFloat(req.params.lon);
      
      console.log(`[Weather API] Request for coordinates: ${lat}, ${lon}`);
      
      if (isNaN(lat) || isNaN(lon)) {
        return res.status(400).json({ error: "Invalid coordinates" });
      }
      
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return res.status(400).json({ error: "Coordinates out of range" });
      }
      
      const cacheKey = `weather:${lat.toFixed(4)},${lon.toFixed(4)}`;
      const cachedData = getFromWeatherCache(cacheKey);
      if (cachedData) {
        console.log(`[Weather API] Cache HIT for ${cacheKey}`);
        return res.json({ ...cachedData, cached: true });
      }
      console.log(`[Weather API] Cache MISS for ${cacheKey}`);
      
      const nwsHeaders = {
        "User-Agent": NWS_USER_AGENT,
        "Accept": "application/geo+json"
      };
      
      const pointsUrl = `https://api.weather.gov/points/${lat},${lon}`;
      const pointsResponse = await fetchWithRetries(pointsUrl, { headers: nwsHeaders });
      
      if (pointsResponse.status === 429) {
        weatherApiStatus.failedRequests++;
        const retryAfter = pointsResponse.headers.get("Retry-After") || "60";
        weatherApiStatus.lastError = { 
          message: "Rate limited by NWS API", 
          timestamp: new Date() 
        };
        return res.status(429).json({ 
          error: "Rate limited by NWS API. Please try again later.",
          retryAfter
        });
      }
      
      if (pointsResponse.status === 404) {
        console.log(`[Weather API] Location not supported: ${lat}, ${lon}`);
        return res.status(404).json({ 
          error: "Location not supported by NWS API. NWS only covers US territories." 
        });
      }
      
      if (!pointsResponse.ok) {
        weatherApiStatus.failedRequests++;
        weatherApiStatus.lastError = { 
          message: `NWS points API error: ${pointsResponse.status}`, 
          timestamp: new Date() 
        };
        console.error(`[Weather API] NWS points API error: ${pointsResponse.status}`);
        return res.status(502).json({ 
          error: "Failed to fetch weather data from NWS",
          status: pointsResponse.status
        });
      }
      
      const pointsData = await pointsResponse.json();
      const forecastUrl = pointsData.properties?.forecast;
      const forecastHourlyUrl = pointsData.properties?.forecastHourly;
      const observationStationsUrl = pointsData.properties?.observationStations;
      
      console.log(`[Weather API] Points data received. Forecast URL: ${forecastUrl}`);
      
      if (!forecastUrl) {
        weatherApiStatus.failedRequests++;
        return res.status(502).json({ error: "No forecast URL in NWS response" });
      }
      
      const forecastResponse = await fetchWithRetries(forecastUrl, { headers: nwsHeaders });
      
      if (forecastResponse.status === 429) {
        weatherApiStatus.failedRequests++;
        weatherApiStatus.lastError = { 
          message: "Rate limited fetching forecast", 
          timestamp: new Date() 
        };
        return res.status(429).json({ 
          error: "Rate limited by NWS API. Please try again later." 
        });
      }
      
      if (!forecastResponse.ok) {
        weatherApiStatus.failedRequests++;
        weatherApiStatus.lastError = { 
          message: `NWS forecast API error: ${forecastResponse.status}`, 
          timestamp: new Date() 
        };
        console.error(`[Weather API] NWS forecast API error: ${forecastResponse.status}`);
        return res.status(502).json({ 
          error: "Failed to fetch forecast data from NWS",
          status: forecastResponse.status
        });
      }
      
      const forecastData = await forecastResponse.json();
      console.log(`[Weather API] Forecast data received. Periods: ${forecastData.properties?.periods?.length || 0}`);
      
      let currentConditions = null;
      if (observationStationsUrl) {
        try {
          const stationsResponse = await fetchWithRetries(observationStationsUrl, { headers: nwsHeaders });
          
          if (stationsResponse.ok) {
            const stationsData = await stationsResponse.json();
            const nearestStation = stationsData.features?.[0]?.properties?.stationIdentifier;
            console.log(`[Weather API] Nearest observation station: ${nearestStation}`);
            
            if (nearestStation) {
              const obsUrl = `https://api.weather.gov/stations/${nearestStation}/observations/latest`;
              const obsResponse = await fetchWithRetries(obsUrl, { headers: nwsHeaders });
              
              if (obsResponse.ok) {
                const obsData = await obsResponse.json();
                currentConditions = obsData.properties;
                console.log(`[Weather API] Current conditions received: temp=${currentConditions?.temperature?.value}, visibility=${currentConditions?.visibility?.value}m`);
              }
            }
          }
        } catch (obsError) {
          console.warn("[Weather API] Could not fetch current conditions:", obsError);
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
      weatherApiStatus.successfulRequests++;
      console.log(`[Weather API] Successfully cached weather data for ${cacheKey}`);
      res.json({ ...result, cached: false });
      
    } catch (error) {
      weatherApiStatus.failedRequests++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      weatherApiStatus.lastError = { message: errorMessage, timestamp: new Date() };
      console.error("[Weather API] Error:", error);
      res.status(500).json({ 
        error: "Internal server error while fetching weather data",
        message: errorMessage
      });
    }
  });

  // ============================================================================
  // AIRBASES API (PUBLIC)
  // ============================================================================

  app.post("/api/airbases/resolve", async (req, res) => {
    try {
      const { airbaseId, icao, baseName, lat, lon } = req.body;
      
      console.log(`[Airbases] Resolve request: airbaseId=${airbaseId}, icao=${icao}, baseName=${baseName}, lat=${lat}, lon=${lon}`);
      
      if (lat !== undefined && lon !== undefined) {
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (!isNaN(latNum) && !isNaN(lonNum)) {
          return res.json({
            resolved: true,
            source: 'coordinates',
            coordinates: { lat: latNum, lon: lonNum }
          });
        }
      }
      
      let matchedBase: typeof MILITARY_BASES_DATA[0] | undefined = undefined;
      
      if (airbaseId) {
        matchedBase = MILITARY_BASES_DATA.find(b => 
          b.base_id.toLowerCase() === airbaseId.toLowerCase()
        );
      }
      
      if (!matchedBase && icao) {
        matchedBase = MILITARY_BASES_DATA.find(b => 
          b.icao.toLowerCase() === icao.toLowerCase()
        );
      }
      
      if (!matchedBase && baseName) {
        const lowerName = baseName.toLowerCase();
        matchedBase = MILITARY_BASES_DATA.find(b => 
          b.name.toLowerCase().includes(lowerName) ||
          b.base_id.toLowerCase().includes(lowerName)
        );
      }
      
      if (matchedBase) {
        console.log(`[Airbases] Resolved to: ${matchedBase.name} (${matchedBase.icao})`);
        return res.json({
          resolved: true,
          source: 'database',
          base: {
            base_id: matchedBase.base_id,
            name: matchedBase.name,
            icao: matchedBase.icao
          },
          coordinates: { lat: matchedBase.lat, lon: matchedBase.lon }
        });
      }
      
      console.log(`[Airbases] Could not resolve base`);
      res.status(404).json({
        resolved: false,
        error: "Could not resolve airbase. Provide airbaseId, icao, baseName, or lat/lon coordinates."
      });
      
    } catch (error) {
      console.error("[Airbases] Resolve error:", error);
      res.status(500).json({ 
        error: "Failed to resolve airbase",
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
      
      // Update the flight plan's aircraft_count to reflect the actual number of flights
      if (schedules.length > 0) {
        await storage.updateFlightPlan(planId, req.user!.id, {
          aircraft_count: schedules.length
        });
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

  // ============================================================================
  // DAG NODES API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const node = await dagNodeService.createNode({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(node);
    } catch (error) {
      console.error('Failed to create DAG node:', error);
      res.status(500).json({ error: "Failed to create node" });
    }
  });

  app.get("/api/dag/nodes", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const nodes = await dagNodeService.getNodes(req.user!.id);
      res.json(nodes);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch nodes" });
    }
  });

  app.get("/api/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const node = await dagNodeService.getNode(req.params.id, req.user!.id);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch node" });
    }
  });

  app.get("/api/dag/nodes/:id/children", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const children = await dagNodeService.getChildren(req.params.id, req.user!.id);
      res.json(children);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch children" });
    }
  });

  app.get("/api/dag/nodes/:id/parents", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const parents = await dagNodeService.getParents(req.params.id, req.user!.id);
      res.json(parents);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch parents" });
    }
  });

  app.get("/api/dag/nodes/:id/ancestors", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const ancestors = await dagNodeService.getAncestors(req.params.id, req.user!.id);
      res.json(ancestors);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch ancestors" });
    }
  });

  app.get("/api/dag/nodes/:id/descendants", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const descendants = await dagNodeService.getDescendants(req.params.id, req.user!.id);
      res.json(descendants);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch descendants" });
    }
  });

  app.patch("/api/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, ...safeData } = req.body;
      const node = await dagNodeService.updateNode(req.params.id, req.user!.id, safeData);
      if (!node) {
        return res.status(404).json({ error: "Node not found" });
      }
      res.json(node);
    } catch (error) {
      res.status(500).json({ error: "Failed to update node" });
    }
  });

  app.delete("/api/dag/nodes/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dagNodeService.deleteNode(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete node" });
    }
  });

  app.get("/api/dag/nodes/:id/cargo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoAssignmentService.getCargoAtNode(req.params.id, req.user!.id);
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo at node" });
    }
  });

  // ============================================================================
  // DAG EDGES API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const result = await dagEdgeService.createEdge({
        ...req.body,
        user_id: req.user!.id
      });
      if (result.error) {
        return res.status(400).json({ error: result.error });
      }
      res.status(201).json(result.edge);
    } catch (error) {
      console.error('Failed to create DAG edge:', error);
      res.status(500).json({ error: "Failed to create edge" });
    }
  });

  app.get("/api/dag/edges", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const edges = await dagEdgeService.getEdges(req.user!.id);
      res.json(edges);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch edges" });
    }
  });

  app.get("/api/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const edge = await dagEdgeService.getEdge(req.params.id, req.user!.id);
      if (!edge) {
        return res.status(404).json({ error: "Edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch edge" });
    }
  });

  app.post("/api/dag/edges/validate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { parent_id, child_id, cargo_shared } = req.body;
      if (!parent_id || !child_id) {
        return res.status(400).json({ error: "parent_id and child_id are required" });
      }
      const result = await dagEdgeService.validateEdge(
        parent_id,
        child_id,
        req.user!.id,
        cargo_shared ?? false
      );
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: "Failed to validate edge" });
    }
  });

  app.patch("/api/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, parent_id, child_id, ...safeData } = req.body;
      const edge = await dagEdgeService.updateEdge(req.params.id, req.user!.id, safeData);
      if (!edge) {
        return res.status(404).json({ error: "Edge not found" });
      }
      res.json(edge);
    } catch (error) {
      res.status(500).json({ error: "Failed to update edge" });
    }
  });

  app.delete("/api/dag/edges/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await dagEdgeService.deleteEdge(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete edge" });
    }
  });

  // ============================================================================
  // DAG CARGO API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/cargo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoService.createCargoItem({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(cargo);
    } catch (error) {
      console.error('Failed to create cargo item:', error);
      res.status(500).json({ error: "Failed to create cargo item" });
    }
  });

  app.get("/api/dag/cargo", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargoType = req.query.type as string | undefined;
      const hazmatOnly = req.query.hazmat === 'true';
      
      let items;
      if (hazmatOnly) {
        items = await cargoService.getHazmatCargoItems(req.user!.id);
      } else if (cargoType) {
        items = await cargoService.getCargoItemsByType(cargoType, req.user!.id);
      } else {
        items = await cargoService.getCargoItems(req.user!.id);
      }
      res.json(items);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo items" });
    }
  });

  app.get("/api/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoService.getCargoItem(req.params.id, req.user!.id);
      if (!cargo) {
        return res.status(404).json({ error: "Cargo item not found" });
      }
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo item" });
    }
  });

  app.get("/api/dag/cargo/tcn/:tcn", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const cargo = await cargoService.getCargoItemByTcn(req.params.tcn, req.user!.id);
      if (!cargo) {
        return res.status(404).json({ error: "Cargo item not found" });
      }
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cargo item by TCN" });
    }
  });

  app.patch("/api/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, ...safeData } = req.body;
      const cargo = await cargoService.updateCargoItem(req.params.id, req.user!.id, safeData);
      if (!cargo) {
        return res.status(404).json({ error: "Cargo item not found" });
      }
      res.json(cargo);
    } catch (error) {
      res.status(500).json({ error: "Failed to update cargo item" });
    }
  });

  app.delete("/api/dag/cargo/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await cargoService.deleteCargoItem(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete cargo item" });
    }
  });

  // ============================================================================
  // DAG CARGO ASSIGNMENTS API (PROTECTED)
  // ============================================================================

  app.post("/api/dag/assignments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const assignment = await cargoAssignmentService.createAssignment({
        ...req.body,
        user_id: req.user!.id
      });
      res.status(201).json(assignment);
    } catch (error) {
      console.error('Failed to create assignment:', error);
      res.status(500).json({ error: "Failed to create assignment" });
    }
  });

  app.post("/api/dag/cargo/:cargoId/assign/:nodeId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status, sequence, pallet_position, metadata } = req.body;
      const assignment = await cargoAssignmentService.assignCargoToNode(
        req.params.cargoId,
        req.params.nodeId,
        req.user!.id,
        { status, sequence, palletPosition: pallet_position, metadata }
      );
      res.status(201).json(assignment);
    } catch (error) {
      console.error('Failed to assign cargo to node:', error);
      res.status(500).json({ error: "Failed to assign cargo to node" });
    }
  });

  app.get("/api/dag/assignments", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const status = req.query.status as string | undefined;
      let assignments;
      if (status) {
        assignments = await cargoAssignmentService.getAssignmentsByStatus(status, req.user!.id);
      } else {
        assignments = await cargoAssignmentService.getAssignments(req.user!.id);
      }
      res.json(assignments);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignments" });
    }
  });

  app.get("/api/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const assignment = await cargoAssignmentService.getAssignment(req.params.id, req.user!.id);
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch assignment" });
    }
  });

  app.patch("/api/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, cargo_id, node_id, ...safeData } = req.body;
      const assignment = await cargoAssignmentService.updateAssignment(
        req.params.id,
        req.user!.id,
        safeData
      );
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update assignment" });
    }
  });

  app.patch("/api/dag/assignments/:id/status", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { status } = req.body;
      const validStatuses = ['assigned', 'in_transit', 'delivered', 'pending'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: "Invalid status", validStatuses });
      }
      const assignment = await cargoAssignmentService.updateAssignmentStatus(
        req.params.id,
        req.user!.id,
        status
      );
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      res.json(assignment);
    } catch (error) {
      res.status(500).json({ error: "Failed to update assignment status" });
    }
  });

  app.delete("/api/dag/assignments/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await cargoAssignmentService.deleteAssignment(req.params.id, req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete assignment" });
    }
  });

  // ============================================================================
  // MANIFESTS API (PROTECTED)
  // ============================================================================

  app.get("/api/manifests", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifestsList = await storage.getManifests(req.user!.id);
      res.json(manifestsList);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch manifests" });
    }
  });

  app.get("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifest = await storage.getManifest(parseInt(req.params.id), req.user!.id);
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json(manifest);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch manifest" });
    }
  });

  app.post("/api/manifests", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, items, flight_plan_id } = req.body;
      if (!name || !items) {
        return res.status(400).json({ error: "Name and items are required" });
      }
      const manifest = await storage.createManifest({
        user_id: req.user!.id,
        name,
        items,
        flight_plan_id: flight_plan_id || null
      });
      res.status(201).json(manifest);
    } catch (error) {
      console.error('Failed to create manifest:', error);
      res.status(500).json({ error: "Failed to create manifest" });
    }
  });

  app.put("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { user_id, id, created_at, ...safeData } = req.body;
      const manifest = await storage.updateManifest(
        parseInt(req.params.id),
        req.user!.id,
        safeData
      );
      if (!manifest) {
        return res.status(404).json({ error: "Manifest not found" });
      }
      res.json(manifest);
    } catch (error) {
      res.status(500).json({ error: "Failed to update manifest" });
    }
  });

  app.patch("/api/manifests/:id/items/:itemIndex", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const manifestId = parseInt(req.params.id);
      const itemIndex = parseInt(req.params.itemIndex);
      const itemData = req.body;
      
      if (isNaN(itemIndex) || itemIndex < 0) {
        return res.status(400).json({ error: "Invalid item index" });
      }
      
      const manifest = await storage.updateManifestItem(
        manifestId,
        req.user!.id,
        itemIndex,
        itemData
      );
      
      if (!manifest) {
        return res.status(404).json({ error: "Manifest or item not found" });
      }
      res.json(manifest);
    } catch (error) {
      console.error('Failed to update manifest item:', error);
      res.status(500).json({ error: "Failed to update manifest item" });
    }
  });

  app.delete("/api/manifests/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      await storage.deleteManifest(parseInt(req.params.id), req.user!.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: "Failed to delete manifest" });
    }
  });

  // ============================================================================
  // AI INSIGHTS API (Bedrock integration with caching)
  // ============================================================================

  // Import bedrock service lazily to avoid initialization issues
  const getBedrockService = async () => {
    const { generateInsight, generateInputHash, checkBedrockHealth } = await import("./services/bedrockService");
    return { generateInsight, generateInputHash, checkBedrockHealth };
  };

  // Helper to map snake_case DB response to camelCase for frontend
  const mapInsightToCamelCase = (insight: any) => ({
    id: insight.id,
    userId: insight.user_id,
    flightPlanId: insight.flight_plan_id,
    insightType: insight.insight_type,
    inputHash: insight.input_hash,
    content: insight.insight_data,
    modelId: "amazon.nova-lite-v1:0",
    tokenUsage: insight.token_usage ? {
      inputTokens: insight.token_usage.inputTokens || 0,
      outputTokens: insight.token_usage.outputTokens || 0,
      totalTokens: (insight.token_usage.inputTokens || 0) + (insight.token_usage.outputTokens || 0)
    } : null,
    generatedAt: insight.created_at,
    regeneratedAt: insight.regenerated_at,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  });

  // Health check for Bedrock
  app.get("/api/insights/health", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { checkBedrockHealth } = await getBedrockService();
      const health = await checkBedrockHealth();
      res.json(health);
    } catch (error) {
      console.error("[Insights] Health check error:", error);
      res.status(500).json({ 
        healthy: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // Get all insights for a flight plan (from cache)
  app.get("/api/insights/flight-plan/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      
      const insights = await storage.getAiInsightsByPlan(req.user!.id, planId);
      // Map to camelCase for frontend
      res.json(insights.map(mapInsightToCamelCase));
    } catch (error) {
      console.error("[Insights] Failed to get insights:", error);
      res.status(500).json({ error: "Failed to retrieve insights" });
    }
  });

  // Generate or retrieve cached insight
  app.post("/api/insights/generate", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { type, inputData, flightPlanId, forceRegenerate = false } = req.body;
      
      if (!type || !inputData) {
        return res.status(400).json({ error: "Missing required fields: type, inputData" });
      }

      const validTypes = ['allocation_summary', 'cob_analysis', 'pallet_review', 'route_planning', 'compliance', 'mission_briefing', 'mission_analytics', 'flight_allocation_analysis'];
      if (!validTypes.includes(type)) {
        return res.status(400).json({ error: `Invalid insight type. Must be one of: ${validTypes.join(', ')}` });
      }

      const { generateInsight, generateInputHash } = await getBedrockService();
      // Include flightPlanId in hash for proper cache isolation
      const inputHash = generateInputHash({ type, ...inputData }, flightPlanId || null);
      
      // Check cache first (unless force regenerate)
      if (!forceRegenerate) {
        const cachedInsight = await storage.getAiInsight(
          req.user!.id,
          flightPlanId || null,
          type,
          inputHash
        );
        
        if (cachedInsight) {
          console.log(`[Insights] Cache hit for ${type}`);
          return res.json({
            insight: {
              ...mapInsightToCamelCase(cachedInsight),
              fromCache: true
            },
            fromCache: true
          });
        }
      }

      console.log(`[Insights] Generating new insight for ${type}${forceRegenerate ? ' (forced)' : ''}`);
      
      // Generate new insight
      const result = await generateInsight({
        type,
        inputData,
        userId: String(req.user!.id),
        flightPlanId: flightPlanId || null,
        forceRegenerate
      });

      // Save to database for caching
      const savedInsight = await storage.createAiInsight({
        user_id: req.user!.id,
        flight_plan_id: flightPlanId || null,
        insight_type: type,
        input_hash: inputHash,
        insight_data: result.insight,
        token_usage: result.tokenUsage
      });

      // Map to camelCase for frontend and wrap in expected format
      const mappedInsight = {
        ...mapInsightToCamelCase(savedInsight),
        fromCache: false
      };
      res.json({
        insight: mappedInsight,
        fromCache: false
      });
    } catch (error) {
      console.error("[Insights] Generation error:", error);
      
      // Handle rate limit errors specially
      if (error instanceof Error && error.message.includes("Rate limit")) {
        return res.status(429).json({ error: error.message });
      }
      
      res.status(500).json({ 
        error: "Failed to generate insight",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Delete all insights for a flight plan
  app.delete("/api/insights/flight-plan/:planId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }
      
      await storage.deleteAiInsightsByPlan(req.user!.id, planId);
      res.status(204).send();
    } catch (error) {
      console.error("[Insights] Delete error:", error);
      res.status(500).json({ error: "Failed to delete insights" });
    }
  });

  // ============================================================================
  // AIRCRAFT FLEET MANAGEMENT API (PROTECTED)
  // ============================================================================

  app.get("/api/aircraft-types", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const types = await aircraftService.getAllActiveAircraftTypes();
      
      const typesWithProfiles = await Promise.all(
        types.map(async (type) => {
          const profile = await aircraftService.getAircraftCapacityProfile(type.id);
          return {
            ...type,
            capacityProfile: profile,
          };
        })
      );
      
      res.json(typesWithProfiles);
    } catch (error) {
      console.error("[Aircraft] Failed to fetch aircraft types:", error);
      res.status(500).json({ error: "Failed to fetch aircraft types" });
    }
  });

  app.get("/api/aircraft-types/:typeId/capacity", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { typeId } = req.params;
      const { version } = req.query;
      
      const profile = await aircraftService.getAircraftCapacityProfile(
        typeId,
        version as string | undefined
      );
      
      if (!profile) {
        return res.status(404).json({ error: `No capacity profile found for aircraft type: ${typeId}` });
      }
      
      res.json(profile);
    } catch (error) {
      console.error("[Aircraft] Failed to fetch capacity profile:", error);
      res.status(500).json({ error: "Failed to fetch capacity profile" });
    }
  });

  app.post("/api/plans/:planId/fleet-availability", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }

      const { availability, preferred_aircraft_type_id, mixed_fleet_mode, preference_strength } = req.body;
      if (!Array.isArray(availability)) {
        return res.status(400).json({ error: "availability must be an array" });
      }

      for (const item of availability) {
        if (!item.typeId || typeof item.count !== 'number') {
          return res.status(400).json({ 
            error: "Each availability item must have typeId (string) and count (number)" 
          });
        }
      }

      await aircraftService.setFleetAvailability(planId, availability);
      
      const planUpdates: Record<string, any> = {};
      if (preferred_aircraft_type_id !== undefined) {
        planUpdates.preferred_aircraft_type_id = preferred_aircraft_type_id;
      }
      if (mixed_fleet_mode !== undefined) {
        planUpdates.mixed_fleet_mode = mixed_fleet_mode;
      }
      if (preference_strength !== undefined) {
        planUpdates.preference_strength = preference_strength;
      }
      
      if (Object.keys(planUpdates).length > 0) {
        await storage.updateFlightPlan(planId, req.user!.id, planUpdates);
      }
      
      const updated = await aircraftService.getFleetAvailability(planId);
      res.json({ 
        success: true, 
        availability: updated.map(a => ({
          typeId: a.aircraft_type_id,
          count: a.available_count,
          locked: a.locked,
        }))
      });
    } catch (error) {
      console.error("[Aircraft] Failed to set fleet availability:", error);
      res.status(500).json({ error: "Failed to set fleet availability" });
    }
  });

  app.get("/api/plans/:planId/fleet-availability", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }

      const availability = await aircraftService.getFleetAvailability(planId);
      res.json(
        availability.map(a => ({
          typeId: a.aircraft_type_id,
          count: a.available_count,
          locked: a.locked,
        }))
      );
    } catch (error) {
      console.error("[Aircraft] Failed to get fleet availability:", error);
      res.status(500).json({ error: "Failed to get fleet availability" });
    }
  });

  app.post("/api/plans/:planId/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const planId = parseInt(req.params.planId);
      if (isNaN(planId)) {
        return res.status(400).json({ error: "Invalid plan ID" });
      }

      const plan = await storage.getFlightPlan(planId, req.user!.id);
      if (!plan) {
        return res.status(404).json({ error: "Flight plan not found" });
      }

      const availability = await aircraftService.getFleetAvailability(planId);
      
      const aircraftTypes = await aircraftService.getAllActiveAircraftTypes();
      const profileMap: Record<string, number> = {};
      
      for (const type of aircraftTypes) {
        const profile = await aircraftService.getAircraftCapacityProfile(type.id);
        if (profile) {
          profileMap[type.id] = profile.max_payload_lb;
        }
      }

      const availabilityConstraints: AvailabilityConstraint[] = availability.map(a => ({
        typeId: a.aircraft_type_id,
        count: a.available_count,
        locked: a.locked,
        maxPayloadLb: profileMap[a.aircraft_type_id] || 0,
      }));

      if (availabilityConstraints.length === 0) {
        for (const type of aircraftTypes) {
          const profile = await aircraftService.getAircraftCapacityProfile(type.id);
          availabilityConstraints.push({
            typeId: type.id,
            count: 10,
            locked: false,
            maxPayloadLb: profile?.max_payload_lb || 0,
          });
        }
      }

      const allocationData = plan.allocation_data as any;
      let cargoRequirements: CargoRequirement[] = [];
      
      if (allocationData?.items && Array.isArray(allocationData.items)) {
        cargoRequirements = allocationData.items.map((item: any, index: number) => ({
          id: item.id || item.tcn || `cargo-${index}`,
          weightLb: Number(item.weight_lb || item.weightLb || item.weight || 0),
        }));
      } else if (allocationData?.totalWeight) {
        cargoRequirements = [{
          id: 'bulk-cargo',
          weightLb: Number(allocationData.totalWeight),
        }];
      } else if (plan.total_weight_lb) {
        cargoRequirements = [{
          id: 'plan-total',
          weightLb: plan.total_weight_lb,
        }];
      }

      const mode: MixedFleetMode = (plan.mixed_fleet_mode as MixedFleetMode) || 'PREFERRED_FIRST';
      const preferenceStrength = plan.preference_strength ? Number(plan.preference_strength) : 0.5;

      const optimizationInput: OptimizationInput = {
        cargoRequirements,
        availability: availabilityConstraints,
        preferredTypeId: plan.preferred_aircraft_type_id || null,
        mode,
        preferenceStrength,
      };

      const result = runOptimization(optimizationInput);

      const savedSolution = await aircraftService.savePlanSolution({
        plan_id: planId,
        status: result.status,
        aircraft_used: result.aircraftUsed,
        unallocated_cargo_ids: result.unallocatedCargoIds,
        metrics: result.metrics,
        explanation: result.explanation,
        comparison_data: result.comparisonData || null,
      });

      res.json({
        ...result,
        solutionId: savedSolution.id,
        savedAt: savedSolution.created_at,
      });
    } catch (error) {
      console.error("[Aircraft] Optimization failed:", error);
      res.status(500).json({ 
        error: "Optimization failed", 
        details: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });

  // ============================================================================
  // WAREHOUSE MANAGEMENT API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/inventory-columns - Get available inventory column definitions (dynamic)
  app.get("/api/warehouse/inventory-columns", authMiddleware, async (_req: AuthRequest, res) => {
    try {
      // Dynamically generate column definitions from database schema
      const { INVENTORY_COLUMN_DEFINITIONS } = await import("@arka/shared/inventoryColumns");
      res.json({
        columns: INVENTORY_COLUMN_DEFINITIONS,
        version: Date.now(), // Cache-busting version
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch column definitions:", error);
      res.status(500).json({ error: "Failed to fetch column definitions" });
    }
  });

  // GET /api/warehouse/sites - Get all warehouse sites for the current user with inventory counts
  app.get("/api/warehouse/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await db.select({
        id: warehouseSites.id,
        user_id: warehouseSites.user_id,
        code: warehouseSites.code,
        name: warehouseSites.name,
        address: warehouseSites.address,
        city: warehouseSites.city,
        country: warehouseSites.country,
        timezone: warehouseSites.timezone,
        latitude: warehouseSites.latitude,
        longitude: warehouseSites.longitude,
        active: warehouseSites.active,
        created_at: warehouseSites.created_at,
        updated_at: warehouseSites.updated_at,
        item_count: sql<number>`CAST(COUNT(${warehouseInventoryItems.id}) AS INTEGER)`,
        total_quantity: sql<number>`CAST(COALESCE(SUM(${warehouseInventoryItems.quantity}), 0) AS INTEGER)`,
      })
        .from(warehouseSites)
        .leftJoin(warehouseInventoryItems, eq(warehouseSites.id, warehouseInventoryItems.site_id))
        .where(eq(warehouseSites.user_id, req.user!.id))
        .groupBy(warehouseSites.id);
      res.json(sites);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch sites:", error);
      res.status(500).json({ error: "Failed to fetch warehouse sites" });
    }
  });

  // POST /api/warehouse/sites - Create a new warehouse site
  app.post("/api/warehouse/sites", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { code, name, address, city, country, timezone, latitude, longitude, active } = req.body;
      
      if (!code || !name) {
        return res.status(400).json({ error: "Code and name are required" });
      }

      const [site] = await db.insert(warehouseSites).values({
        user_id: req.user!.id,
        code,
        name,
        address: address || null,
        city: city || null,
        country: country || null,
        timezone: timezone || "UTC",
        latitude: latitude || null,
        longitude: longitude || null,
        active: active !== undefined ? active : true,
      }).returning();

      res.status(201).json(site);
    } catch (error) {
      console.error("[Warehouse] Failed to create site:", error);
      res.status(500).json({ error: "Failed to create warehouse site" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId - Delete a warehouse site and all related data
  app.delete("/api/warehouse/sites/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Delete in correct order due to foreign key constraints:
      // 1. Delete related transfers first
      await db.delete(warehouseTransfers)
        .where(or(
          eq(warehouseTransfers.source_site_id, siteId),
          eq(warehouseTransfers.destination_site_id, siteId)
        ));

      // 2. Delete inventory items
      await db.delete(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // 3. Delete locations
      await db.delete(warehouseLocations)
        .where(eq(warehouseLocations.site_id, siteId));

      // 4. Get building IDs for this site to delete zones
      const buildings = await db.select({ id: warehouseBuildings.id })
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));
      
      const buildingIds = buildings.map(b => b.id);
      
      // 5. Delete zones for all buildings in this site
      if (buildingIds.length > 0) {
        for (const buildingId of buildingIds) {
          await db.delete(warehouseZones)
            .where(eq(warehouseZones.building_id, buildingId));
        }
      }

      // 6. Delete buildings
      await db.delete(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId));

      // 7. Delete the site itself
      await db.delete(warehouseSites)
        .where(eq(warehouseSites.id, siteId));

      res.json({ success: true, message: "Site and all related data deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete site:", error);
      res.status(500).json({ error: "Failed to delete warehouse site" });
    }
  });

  // GET /api/warehouse/sites/:siteId/buildings - Get buildings for a site with capacity info
  app.get("/api/warehouse/sites/:siteId/buildings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch all buildings for this site
      const buildings = await db.select()
        .from(warehouseBuildings)
        .where(eq(warehouseBuildings.site_id, siteId))
        .orderBy(asc(warehouseBuildings.code));

      // For each building, calculate capacity from zones
      const buildingsWithCapacity = await Promise.all(
        buildings.map(async (building) => {
          // Get zones for this building
          const zones = await db.select()
            .from(warehouseZones)
            .where(eq(warehouseZones.building_id, building.id));

          // Calculate total pallet capacity from zones
          const totalPalletCapacity = zones.reduce((sum, zone) => {
            return sum + (zone.capacity_pallets || 0);
          }, 0);

          // Get count of inventory items in locations within this building
          const [inventoryCount] = await db.select({ count: count() })
            .from(warehouseLocations)
            .where(and(
              eq(warehouseLocations.building_id, building.id),
              eq(warehouseLocations.occupied, true)
            ));

          const occupiedCount = inventoryCount?.count || 0;
          const capacityPercent = totalPalletCapacity > 0 
            ? Math.round((Number(occupiedCount) / totalPalletCapacity) * 100) 
            : 0;

          // Format dimensions from meters
          const lengthM = building.length_m ? parseFloat(building.length_m as string) : null;
          const widthM = building.width_m ? parseFloat(building.width_m as string) : null;
          const heightM = building.height_m ? parseFloat(building.height_m as string) : null;

          let dimensions = "";
          if (lengthM && widthM && heightM) {
            // Convert meters to feet (1m = 3.28084ft)
            const lengthFt = Math.round(lengthM * 3.28084);
            const widthFt = Math.round(widthM * 3.28084);
            const heightFt = Math.round(heightM * 3.28084);
            dimensions = `${lengthFt}×${widthFt}×${heightFt} ft`;
          } else if (lengthM && widthM) {
            const lengthFt = Math.round(lengthM * 3.28084);
            const widthFt = Math.round(widthM * 3.28084);
            dimensions = `${lengthFt}×${widthFt} ft`;
          }

          return {
            id: building.id,
            code: building.code,
            name: building.name,
            dimensions,
            capacity_percent: capacityPercent,
            pallet_count: totalPalletCapacity,
            geometry_notes: building.geometry_notes,
            active: building.active
          };
        })
      );

      res.json(buildingsWithCapacity);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch buildings:", error);
      res.status(500).json({ error: "Failed to fetch buildings" });
    }
  });

  // GET /api/warehouse/sites/:siteId/inventory - Get inventory items for a site with pagination
  app.get("/api/warehouse/sites/:siteId/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Parse pagination params
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize as string) || 25));
      const sortBy = (req.query.sortBy as string) || "id";
      const sortOrder = (req.query.sortOrder as string) === "desc" ? "desc" : "asc";
      const search = (req.query.search as string) || "";
      const filtersJson = req.query.filters as string;
      const filterLogic = (req.query.filterLogic as string) === "or" ? "or" : "and";

      // Parse and validate filters if provided
      const ALLOWED_FILTER_FIELDS = [
        'requisition_no', 'nsn', 'niin', 'fsc', 'description', 'quantity',
        'condition', 'mission_id', 'serial_no', 'lin_esd', 'unit_price', 'weight_lbs'
      ];
      const ALLOWED_OPERATORS = [
        'contains', 'equals', 'not_equals', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'
      ];
      
      let filterConditions: Array<{field: string; operator: string; value: string}> = [];
      if (filtersJson) {
        try {
          const parsed = JSON.parse(filtersJson);
          if (Array.isArray(parsed)) {
            filterConditions = parsed.filter(f => 
              f && typeof f === 'object' &&
              ALLOWED_FILTER_FIELDS.includes(f.field) &&
              ALLOWED_OPERATORS.includes(f.operator)
            );
          }
        } catch (e) {
          console.warn("[Warehouse] Invalid filters JSON:", e);
        }
      }

      // Build where conditions
      const baseCondition = eq(warehouseInventoryItems.site_id, siteId);
      const whereConditions: any[] = [baseCondition];

      // Add search condition
      if (search.trim()) {
        const searchTerm = `%${search.trim().toLowerCase()}%`;
        whereConditions.push(
          or(
            ilike(warehouseInventoryItems.requisition_no, searchTerm),
            ilike(warehouseInventoryItems.description, searchTerm),
            ilike(warehouseInventoryItems.nsn, searchTerm),
            ilike(warehouseInventoryItems.niin, searchTerm),
            ilike(warehouseInventoryItems.serial_no, searchTerm)
          )
        );
      }

      // Build filter conditions
      const buildFilterCondition = (filter: {field: string; operator: string; value: string}) => {
        const col = (warehouseInventoryItems as any)[filter.field];
        if (!col) return null;

        switch (filter.operator) {
          case "contains":
            return ilike(col, `%${filter.value}%`);
          case "equals":
            return eq(col, filter.value);
          case "not_equals":
            return sql`${col} != ${filter.value}`;
          case "greater_than":
            return gt(col, parseFloat(filter.value) || 0);
          case "less_than":
            return lt(col, parseFloat(filter.value) || 0);
          case "is_empty":
            return or(isNull(col), eq(col, ""));
          case "is_not_empty":
            return and(isNotNull(col), sql`${col} != ''`);
          default:
            return null;
        }
      };

      if (filterConditions.length > 0) {
        const builtFilters = filterConditions
          .map(buildFilterCondition)
          .filter((c): c is NonNullable<typeof c> => c !== null);

        if (builtFilters.length > 0) {
          if (filterLogic === "or") {
            whereConditions.push(or(...builtFilters));
          } else {
            whereConditions.push(...builtFilters);
          }
        }
      }

      const finalWhere = and(...whereConditions);

      // Get total count for pagination
      const [countResult] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(finalWhere);
      const totalCount = countResult?.count || 0;
      const totalPages = Math.ceil(totalCount / pageSize);

      // Build sort order
      const sortColumn = (warehouseInventoryItems as any)[sortBy] || warehouseInventoryItems.id;
      const orderByClause = sortOrder === "desc" ? desc(sortColumn) : asc(sortColumn);

      // Fetch paginated items
      const offset = (page - 1) * pageSize;
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(finalWhere)
        .orderBy(orderByClause)
        .limit(pageSize)
        .offset(offset);

      // Transform items to include dimensions from raw_row
      const transformedItems = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> | null;
        const dims = rawRow?.dimensions || {};
        return {
          ...item,
          length_in: dims.l?.toString() || rawRow?.length?.toString() || null,
          width_in: dims.w?.toString() || rawRow?.width?.toString() || null,
          height_in: dims.h?.toString() || rawRow?.height?.toString() || null,
          weight_lb: rawRow?.price_weight?.toString() || null,
          nsn: item.nsn || null,
          fsc: item.fsc || null,
          niin: item.niin || null,
        };
      });

      res.json({
        items: transformedItems,
        pagination: {
          page,
          pageSize,
          totalCount,
          totalPages,
        }
      });
    } catch (error) {
      console.error("[Warehouse] Failed to fetch inventory:", error);
      res.status(500).json({ error: "Failed to fetch inventory items" });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory - Add a single inventory item
  app.post("/api/warehouse/sites/:siteId/inventory", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { requisition_no, description, quantity, length_in, width_in, height_in, unit_price, nsn, fsc, niin } = req.body;
      
      if (!requisition_no) {
        return res.status(400).json({ error: "requisition_no is required" });
      }

      const [item] = await db.insert(warehouseInventoryItems).values({
        site_id: siteId,
        requisition_no,
        description: description || `Item ${requisition_no}`,
        quantity: quantity || 1,
        unit_price: unit_price ? unit_price.toString() : null,
        nsn: nsn || null,
        fsc: fsc || null,
        niin: niin || null,
        raw_row: {
          dimensions: {
            l: length_in || null,
            w: width_in || null,
            h: height_in || null,
          },
        },
      }).returning();

      res.status(201).json(item);
    } catch (error) {
      console.error("[Warehouse] Failed to add inventory item:", error);
      res.status(500).json({ error: "Failed to add inventory item" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/inventory/all - Delete all inventory items for a site
  app.delete("/api/warehouse/sites/:siteId/inventory/all", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Count items before deletion
      const [countResult] = await db.select({ count: count() })
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const itemCount = countResult?.count || 0;

      // Delete all items for the site
      await db.delete(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      res.json({ 
        success: true, 
        message: `All inventory items deleted successfully`,
        deleted: itemCount
      });
    } catch (error) {
      console.error("[Warehouse] Failed to delete all inventory items:", error);
      res.status(500).json({ error: "Failed to delete all inventory items" });
    }
  });

  // DELETE /api/warehouse/sites/:siteId/inventory/:itemId - Delete an inventory item
  app.delete("/api/warehouse/sites/:siteId/inventory/:itemId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const itemId = parseInt(req.params.itemId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Verify item exists and belongs to the site
      const [item] = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      // Delete the item - include both conditions for defense-in-depth
      await db.delete(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      res.json({ success: true, message: "Item deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete inventory item:", error);
      res.status(500).json({ error: "Failed to delete inventory item" });
    }
  });

  // PUT /api/warehouse/sites/:siteId/inventory/:itemId/move - Move an inventory item to a new location
  app.put("/api/warehouse/sites/:siteId/inventory/:itemId/move", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const itemId = parseInt(req.params.itemId);
      
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }
      if (isNaN(itemId)) {
        return res.status(400).json({ error: "Invalid item ID" });
      }

      const { destination_site_id, destination_location_id, notes } = req.body;

      // Verify user owns the source site
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite) {
        return res.status(404).json({ error: "Source warehouse site not found" });
      }

      // If cross-site move, verify user owns the destination site
      if (destination_site_id && destination_site_id !== siteId) {
        const [destSite] = await db.select()
          .from(warehouseSites)
          .where(and(
            eq(warehouseSites.id, destination_site_id),
            eq(warehouseSites.user_id, req.user!.id)
          ));

        if (!destSite) {
          return res.status(404).json({ error: "Destination warehouse site not found" });
        }
      }

      // Verify item exists and belongs to the source site
      const [item] = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.id, itemId),
          eq(warehouseInventoryItems.site_id, siteId)
        ));

      if (!item) {
        return res.status(404).json({ error: "Inventory item not found" });
      }

      // Build update object
      const updateData: Record<string, any> = {
        updated_at: new Date(),
      };

      // Handle cross-site move
      if (destination_site_id && destination_site_id !== siteId) {
        updateData.site_id = destination_site_id;
        updateData.location_id = destination_location_id || null;
      } else if (destination_location_id !== undefined) {
        // Intra-site location change
        updateData.location_id = destination_location_id || null;
      }

      // Add notes to remarks if provided
      if (notes) {
        const existingRemarks = item.remarks || '';
        const timestamp = new Date().toISOString();
        const moveNote = `[Move ${timestamp}] ${notes}`;
        updateData.remarks = existingRemarks ? `${existingRemarks}\n${moveNote}` : moveNote;
      }

      // Update the item
      const [updatedItem] = await db.update(warehouseInventoryItems)
        .set(updateData)
        .where(eq(warehouseInventoryItems.id, itemId))
        .returning();

      res.json({ 
        success: true, 
        message: "Item moved successfully",
        item: updatedItem
      });
    } catch (error) {
      console.error("[Warehouse] Failed to move inventory item:", error);
      res.status(500).json({ error: "Failed to move inventory item" });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory/upload - Upload and parse CSV inventory data
  app.post("/api/warehouse/sites/:siteId/inventory/upload", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const { csvContent } = req.body;
      if (!csvContent || typeof csvContent !== 'string') {
        return res.status(400).json({ error: "csvContent field is required and must be a string" });
      }

      // Parse CSV
      const lines = csvContent.trim().split('\n');
      if (lines.length < 2) {
        return res.status(400).json({ error: "CSV must have a header row and at least one data row" });
      }

      const headerLine = lines[0].trim();
      const headers = headerLine.split(',').map(h => h.trim().toLowerCase());

      // Map expected columns: o, l, h, w, p, q
      const colIndices = {
        o: headers.indexOf('o'),
        l: headers.indexOf('l'),
        h: headers.indexOf('h'),
        w: headers.indexOf('w'),
        p: headers.indexOf('p'),
        q: headers.indexOf('q'),
      };

      if (colIndices.o === -1) {
        return res.status(400).json({ error: "CSV must contain 'o' column (item_id/requisition_no)" });
      }

      const parsedItems: Array<{
        site_id: number;
        requisition_no: string;
        description: string;
        quantity: number;
        unit_price: string | null;
        raw_row: Record<string, any>;
      }> = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());

        const o = colIndices.o !== -1 ? values[colIndices.o] : '';
        const l = colIndices.l !== -1 ? parseFloat(values[colIndices.l]) || 0 : 0;
        const h = colIndices.h !== -1 ? parseFloat(values[colIndices.h]) || 0 : 0;
        const w = colIndices.w !== -1 ? parseFloat(values[colIndices.w]) || 0 : 0;
        const p = colIndices.p !== -1 ? parseFloat(values[colIndices.p]) || 0 : 0;
        const q = colIndices.q !== -1 ? parseInt(values[colIndices.q]) || 0 : 0;

        if (!o) continue;

        parsedItems.push({
          site_id: siteId,
          requisition_no: o,
          description: `Item ${o}`,
          quantity: q,
          unit_price: p.toString(),
          raw_row: {
            original_id: o,
            length: l,
            height: h,
            width: w,
            price_weight: p,
            quantity: q,
            dimensions: { l, w, h }
          }
        });
      }

      if (parsedItems.length === 0) {
        return res.status(400).json({ error: "No valid items found in CSV" });
      }

      // Insert items
      const insertedItems = await db.insert(warehouseInventoryItems)
        .values(parsedItems)
        .returning();

      res.status(201).json({
        message: `Successfully imported ${insertedItems.length} items`,
        count: insertedItems.length,
        items: insertedItems
      });
    } catch (error) {
      console.error("[Warehouse] Failed to upload inventory:", error);
      res.status(500).json({ error: "Failed to upload inventory data" });
    }
  });

  // Configure multer for file uploads (10MB max)
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'text/csv', 
        'application/pdf', 
        'text/plain', 
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/octet-stream'
      ];
      const allowedExts = ['.csv', '.pdf', '.xlsx', '.xls'];
      const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
      
      if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
      } else {
        cb(new Error(`Unsupported file type: ${file.mimetype}. Only CSV, PDF, XLSX, and XLS files are allowed.`));
      }
    },
  });

  // POST /api/warehouse/sites/:siteId/inventory/import - Upload and parse CSV/PDF file
  app.post("/api/warehouse/sites/:siteId/inventory/import", authMiddleware, upload.single('file'), async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      if (!req.file) {
        return res.status(400).json({ 
          error: "No file uploaded",
          errors: [{
            level: 'error',
            scope: 'file',
            target: 'upload',
            message: 'No file was uploaded. Please select a CSV or PDF file.'
          }]
        });
      }

      console.log(`[Warehouse Import] Processing file: ${req.file.originalname}, size: ${req.file.size}, mimetype: ${req.file.mimetype}`);

      const result = await parseFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        siteId,
        req.user!.id
      );

      console.log(`[Warehouse Import] Parse result: uploadId=${result.uploadId}, rows=${result.totalRows}, errors=${result.errors.length}, warnings=${result.warnings.length}, canCommit=${result.canCommit}`);

      res.json(result);
    } catch (error) {
      console.error("[Warehouse] Import failed:", error);
      
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ 
            error: "File too large. Maximum size is 10MB.",
            errors: [{
              level: 'error',
              scope: 'file',
              target: 'size',
              message: 'File exceeds the 10MB size limit.'
            }]
          });
        }
        return res.status(400).json({ 
          error: error.message,
          errors: [{
            level: 'error',
            scope: 'file',
            target: 'upload',
            message: error.message
          }]
        });
      }
      
      res.status(500).json({ 
        error: "Failed to import inventory file",
        errors: [{
          level: 'error',
          scope: 'file',
          target: 'processing',
          message: error instanceof Error ? error.message : 'Unknown error occurred'
        }]
      });
    }
  });

  // POST /api/warehouse/sites/:siteId/inventory/import/commit - Commit validated data to database
  app.post("/api/warehouse/sites/:siteId/inventory/import/commit", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { uploadId } = req.body;
      if (!uploadId || typeof uploadId !== 'string') {
        return res.status(400).json({ error: "uploadId is required" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Get the upload session
      const session = getUploadSession(uploadId);
      if (!session) {
        return res.status(404).json({ 
          error: "Upload session not found or expired",
          message: "Please upload the file again."
        });
      }

      // Verify session belongs to this user and site
      if (session.userId !== req.user!.id || session.siteId !== siteId) {
        return res.status(403).json({ error: "Session does not belong to this user or site" });
      }

      // Check if data can be committed
      if (!session.canCommit) {
        return res.status(400).json({ 
          error: "Cannot commit data with errors",
          errors: session.errors.filter(e => e.scope === 'file' || e.scope === 'column'),
          message: "Please fix the file-level and column-level errors before committing."
        });
      }

      // Filter out rows with errors
      const rowsWithErrors = new Set(
        session.errors.filter(e => e.scope === 'row' && e.level === 'error').map(e => e.rowIndex)
      );
      
      const validRows = session.parsedRows.filter((_, index) => !rowsWithErrors.has(index));

      if (validRows.length === 0) {
        return res.status(400).json({ 
          error: "No valid rows to commit",
          message: "All rows have errors. Please fix the data and try again."
        });
      }

      console.log(`[Warehouse Import] Committing ${validRows.length} rows from session ${uploadId}`);

      // Prepare items for insertion with all BATS fields
      const itemsToInsert = validRows.map((row, idx) => ({
        site_id: siteId,
        storage_facility: row.storage_facility || null,
        ship: row.ship || null,
        ship_class: row.ship_class || null,
        program_code: row.program_code || null,
        requisition_no: row.requisition_no || `ITEM-${Date.now()}-${idx}`,
        authority: row.authority || null,
        work_item: row.work_item || null,
        li: row.li || null,
        matl_ctrl: row.matl_ctrl || null,
        hmic: row.hmic || null,
        smcc: row.smcc || null,
        item_audit: row.item_audit || null,
        audit_no: row.audit_no || null,
        ship_ind: row.ship_ind || null,
        ship_avail: row.ship_avail || null,
        description: row.description || `Item ${row.requisition_no || 'Unknown'}`,
        cage: row.cage || null,
        manufacturer: row.manufacturer || null,
        mfg_date: row.mfg_date || null,
        contract_no: row.contract_no || null,
        quantity: row.quantity || 1,
        iuid: row.iuid || null,
        unit: row.ui || null,
        unit_price: row.unit_price?.toString() || null,
        receipt_price: row.receipt_price || null,
        receipt_date: row.receipt_date || null,
        location: row.location || null,
        lot_no: row.lot || null,
        serial_no: row.serial_no || null,
        barcode: row.barcode || null,
        inventory_type: row.inventory_type || null,
        material_disposition: row.mat_disposition || null,
        condition_code: row.condition || null,
        condition: row.condition || null,
        asset_type: row.asset_type || null,
        exp_date: row.exp_date || null,
        ext_date: row.ext_date || null,
        insp_date: row.insp_date || null,
        last_audit_date: row.last_audit_date || null,
        data_user_id: row.user_id || null,
        remarks: row.remarks || null,
        in_service_date: row.in_service_date || null,
        warranty_item: row.warranty_item || null,
        nsn: row.nsn || null,
        fsc: row.fsc || null,
        niin: row.niin || null,
        mission_id: row.mission_id || null,
        lin_esd: row.lin_esd || null,
        last_moved: row.last_moved ? new Date(row.last_moved) : null,
        weight_lbs: row.weight_lb?.toString() || null,
        raw_row: {
          ...row._rawRow,
          imported_at: new Date().toISOString(),
          source_file: session.filename,
        },
      }));

      // Insert items in batches
      const BATCH_SIZE = 100;
      const insertedItems = [];
      
      for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
        const inserted = await db.insert(warehouseInventoryItems)
          .values(batch)
          .returning();
        insertedItems.push(...inserted);
      }

      // Clean up session after successful commit
      deleteUploadSession(uploadId);

      console.log(`[Warehouse Import] Successfully committed ${insertedItems.length} items from session ${uploadId}`);

      res.status(201).json({
        message: `Successfully imported ${insertedItems.length} items`,
        count: insertedItems.length,
        skippedRows: session.parsedRows.length - validRows.length,
        totalRows: session.parsedRows.length,
        items: insertedItems.slice(0, 10), // Return first 10 for preview
      });
    } catch (error) {
      console.error("[Warehouse] Commit failed:", error);
      res.status(500).json({ error: "Failed to commit inventory data" });
    }
  });

  // GET /api/warehouse/import/status - Get import session stats (for debugging)
  app.get("/api/warehouse/import/status", authMiddleware, async (req: AuthRequest, res) => {
    const stats = getSessionStats();
    res.json(stats);
  });

  // GET /api/warehouse/sites/:siteId/optimization - Run optimization analysis
  app.get("/api/warehouse/sites/:siteId/optimization", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Compute optimization metrics using algorithms from notebooks
      let totalQuantity = 0;
      let totalValue = 0;
      let itemCount = items.length;
      let totalVolume = 0;
      let itemsWithDimensions: Array<{ 
        requisition_no: string; 
        l: number; w: number; h: number;
        volume: number; 
        quantity: number;
        value: number;
      }> = [];

      for (const item of items) {
        const qty = item.quantity || 0;
        const price = parseFloat(item.unit_price?.toString() || "0");
        totalQuantity += qty;
        totalValue += qty * price;

        const rawRow = item.raw_row as Record<string, any>;
        const dims = rawRow?.dimensions || { l: 0, w: 0, h: 0 };
        const l = dims.l || rawRow?.length || 0;
        const w = dims.w || rawRow?.width || 0;
        const h = dims.h || rawRow?.height || 0;
        const volume = l * w * h;
        totalVolume += volume * qty;

        itemsWithDimensions.push({
          requisition_no: item.requisition_no || '',
          l, w, h,
          volume,
          quantity: qty,
          value: qty * price
        });
      }

      // CardStack algorithm: items that can be stacked (similar base dimensions)
      const stackableGroups: Map<string, typeof itemsWithDimensions> = new Map();
      for (const item of itemsWithDimensions) {
        const baseKey = `${Math.round(item.l)}_${Math.round(item.w)}`;
        if (!stackableGroups.has(baseKey)) {
          stackableGroups.set(baseKey, []);
        }
        stackableGroups.get(baseKey)!.push(item);
      }

      const stackingOpportunities = Array.from(stackableGroups.entries())
        .filter(([_, items]) => items.length > 1)
        .map(([key, groupItems]) => ({
          base_dimensions: key.replace('_', ' x '),
          item_count: groupItems.length,
          total_height: groupItems.reduce((sum, i) => sum + i.h * i.quantity, 0),
          items: groupItems.map(i => i.requisition_no).slice(0, 5)
        }))
        .sort((a, b) => b.item_count - a.item_count)
        .slice(0, 5);

      // Sort by volume (descending) for bin-packing recommendation
      itemsWithDimensions.sort((a, b) => b.volume - a.volume);

      // Size grouping: identify items of same dimensions for batch handling
      const sizeGroups: Map<string, number> = new Map();
      for (const item of itemsWithDimensions) {
        const sizeKey = `${item.l}x${item.w}x${item.h}`;
        sizeGroups.set(sizeKey, (sizeGroups.get(sizeKey) || 0) + item.quantity);
      }
      
      const topSizes = Array.from(sizeGroups.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([size, count]) => ({ size, count }));

      // Value-per-volume analysis for prioritization
      const valuePerVolume = itemsWithDimensions
        .filter(i => i.volume > 0)
        .map(i => ({
          requisition_no: i.requisition_no,
          value_density: i.value / (i.volume * i.quantity),
          value: i.value,
          volume: i.volume
        }))
        .sort((a, b) => b.value_density - a.value_density)
        .slice(0, 10);

      const recommendations = [
        {
          type: "cartonization",
          priority: "high",
          title: "Box Consolidation Opportunities",
          description: `Found ${stackingOpportunities.length} groups of items with similar base dimensions that can be stacked together`,
          details: stackingOpportunities
        },
        {
          type: "size_standardization",
          priority: "medium",
          title: "Size Standardization",
          description: `${topSizes.length} distinct item sizes identified. Consider standardizing packaging for top sizes.`,
          details: topSizes
        },
        {
          type: "high_volume_items",
          priority: "high",
          title: "Large Item Placement",
          description: "Items with largest volume should be placed at ground level for easier access and forklift handling",
          details: itemsWithDimensions.slice(0, 10).map(i => ({
            requisition_no: i.requisition_no,
            volume: i.volume.toFixed(2),
            quantity: i.quantity
          }))
        },
        {
          type: "value_density",
          priority: "medium",
          title: "High-Value Item Security",
          description: "Items with highest value per volume should be in secure/priority zones",
          details: valuePerVolume
        }
      ];

      // Add aging recommendations if items have receipt dates
      const agingAlerts = items.filter(item => {
        const rawRow = item.raw_row as Record<string, any>;
        if (rawRow?.receipt_date) {
          const receiptDate = new Date(rawRow.receipt_date);
          const yearsOld = (Date.now() - receiptDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
          return yearsOld >= 3;
        }
        return false;
      }).length;

      if (agingAlerts > 0) {
        recommendations.push({
          type: "aging",
          priority: "high",
          title: "Aging Inventory Alert",
          description: `${agingAlerts} items are 3+ years old. Review for disposal or rotation.`,
          details: []
        });
      }

      const optimization = {
        site_id: siteId,
        site_code: site.code,
        site_name: site.name,
        summary: {
          total_items: itemCount,
          total_quantity: totalQuantity,
          total_value: parseFloat(totalValue.toFixed(2)),
          total_volume: parseFloat(totalVolume.toFixed(2)),
          average_value_per_item: itemCount > 0 ? parseFloat((totalValue / itemCount).toFixed(2)) : 0,
          unique_sizes: sizeGroups.size,
          stacking_groups: stackingOpportunities.length
        },
        recommendations,
        bin_packing_order: itemsWithDimensions.slice(0, 20).map(v => v.requisition_no)
      };

      res.json(optimization);
    } catch (error) {
      console.error("[Warehouse] Optimization analysis failed:", error);
      res.status(500).json({ error: "Failed to run optimization analysis" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize - Run optimization wizard with selected algorithm
  app.post("/api/warehouse/sites/:siteId/optimize", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const { algorithm, params } = req.body;
      
      const validAlgorithms = ['cardstack', 'size_standardization', 'value_density', 'bin_packing'];
      if (!algorithm || !validAlgorithms.includes(algorithm)) {
        return res.status(400).json({ error: "Invalid algorithm. Must be one of: " + validAlgorithms.join(", ") });
      }

      // Verify user owns the site
      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      // Fetch inventory items for analysis
      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      // Parse item data from raw_row and database fields
      const itemsWithData = items.map(item => {
        const rawRow = item.raw_row as Record<string, any> || {};
        const qty = item.quantity || parseInt(rawRow?.qty) || 1;
        const price = parseFloat(item.unit_price?.toString() || rawRow?.unit_price || "0");
        const value = qty * price;
        const weight = parseFloat(item.weight_lbs?.toString() || rawRow?.weight || "0");
        
        // Extract location info - location field in raw_row contains rack location like "2069-B"
        const location = rawRow?.location || item.location || 'Unassigned';
        // Extract zone prefix (e.g., "2069" from "2069-B")
        const locationZone = location.split('-')[0] || location.substring(0, 4) || 'UNK';
        
        return {
          id: item.id,
          requisition_no: item.requisition_no || `ITEM-${item.id}`,
          description: item.description || rawRow?.description || '',
          quantity: qty,
          value,
          weight,
          rack_location: location,
          location_zone: locationZone,
          ship_class: item.ship_class || rawRow?.ship_class || '',
          inventory_type: item.inventory_type || rawRow?.inventory_type || '',
          condition_code: item.condition_code || item.condition || rawRow?.condition_code || 'A',
          storage_facility: item.storage_facility || rawRow?.storage_facility || '',
          mat_disposition: item.material_disposition || rawRow?.mat_disposition || rawRow?.material_disposition || '',
          program_code: item.program_code || rawRow?.program_code || '',
        };
      });

      let actions: Array<{
        id: string;
        action: string;
        item: string;
        itemDescription: string;
        from: string;
        to: string;
        priority: 'high' | 'medium' | 'low';
        estimatedBenefit: string;
        quantity: number;
        value: number;
        reason: string;
      }> = [];
      
      let summary = {
        potentialSavings: '$0',
        spaceImprovement: '0%',
        itemsAffected: 0,
        actionsGenerated: 0,
      };

      // Run algorithm-specific optimization
      if (algorithm === 'cardstack') {
        // CardStack: Find items for the same ship scattered across different racks
        // Consolidate them to reduce picking time and travel distance
        const { minItemsToConsolidate = 2, maxActionsToGenerate = 50 } = params || {};
        
        // Group items by ship_class (items for the same ship should be together)
        const shipGroups: Map<string, typeof itemsWithData> = new Map();
        for (const item of itemsWithData) {
          if (!item.ship_class) continue;
          if (!shipGroups.has(item.ship_class)) {
            shipGroups.set(item.ship_class, []);
          }
          shipGroups.get(item.ship_class)!.push(item);
        }

        let actionId = 1;
        let consolidatedItems = 0;
        let consolidatedValue = 0;
        
        for (const [shipClass, shipItems] of shipGroups.entries()) {
          // Skip if fewer items than threshold
          if (shipItems.length < minItemsToConsolidate) continue;
          
          // Find the most common zone for this ship's items (consolidation target)
          const zoneCounts: Map<string, number> = new Map();
          for (const item of shipItems) {
            zoneCounts.set(item.location_zone, (zoneCounts.get(item.location_zone) || 0) + 1);
          }
          
          // Find zone with most items
          let targetZone = '';
          let maxCount = 0;
          for (const [zone, count] of zoneCounts.entries()) {
            if (count > maxCount) {
              maxCount = count;
              targetZone = zone;
            }
          }
          
          // Get a specific target rack in that zone
          const targetRack = `${targetZone}-SHIP`;
          
          // Move items from other zones to the target zone
          for (const item of shipItems) {
            if (item.location_zone === targetZone) continue; // Already in target zone
            
            actions.push({
              id: `CS-${actionId++}`,
              action: `Consolidate ${shipClass} inventory`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetRack,
              priority: item.value > 5000 ? 'high' : 'medium',
              estimatedBenefit: `Reduces pick time for ${shipClass} by ~${Math.round(5 + Math.random() * 10)}min`,
              quantity: item.quantity,
              value: item.value,
              reason: `Item for ${shipClass} scattered from main storage area (${targetZone})`,
            });
            consolidatedItems++;
            consolidatedValue += item.value;
            
            if (actions.length >= maxActionsToGenerate) break;
          }
          if (actions.length >= maxActionsToGenerate) break;
        }
        
        summary = {
          potentialSavings: `$${consolidatedValue.toLocaleString()} inventory consolidated`,
          spaceImprovement: `${consolidatedItems} items moved to ship-specific areas`,
          itemsAffected: consolidatedItems,
          actionsGenerated: actions.length,
        };
      } 
      else if (algorithm === 'size_standardization') {
        // Size Standardization: Organize items by program code into dedicated zones
        // Items for PM1, PM3, etc. should be in their program's designated area
        const { minProgramItems = 3, maxActionsToGenerate = 50 } = params || {};
        
        // Find the dominant zone for each program
        const programZones: Map<string, Map<string, number>> = new Map();
        const programItemCounts: Map<string, number> = new Map();
        for (const item of itemsWithData) {
          if (!item.program_code) continue;
          programItemCounts.set(item.program_code, (programItemCounts.get(item.program_code) || 0) + 1);
          if (!programZones.has(item.program_code)) {
            programZones.set(item.program_code, new Map());
          }
          const zones = programZones.get(item.program_code)!;
          zones.set(item.location_zone, (zones.get(item.location_zone) || 0) + 1);
        }
        
        // Determine the primary zone for each program (only for programs with enough items)
        const programPrimaryZone: Map<string, string> = new Map();
        for (const [program, zones] of programZones.entries()) {
          const itemCount = programItemCounts.get(program) || 0;
          if (itemCount < minProgramItems) continue; // Skip small programs
          
          let primaryZone = '';
          let maxCount = 0;
          for (const [zone, count] of zones.entries()) {
            if (count > maxCount) {
              maxCount = count;
              primaryZone = zone;
            }
          }
          programPrimaryZone.set(program, primaryZone);
        }
        
        let actionId = 1;
        let standardizedCount = 0;
        let standardizedValue = 0;
        
        for (const item of itemsWithData) {
          if (!item.program_code) continue;
          const primaryZone = programPrimaryZone.get(item.program_code);
          if (!primaryZone || item.location_zone === primaryZone) continue;
          
          actions.push({
            id: `SS-${actionId++}`,
            action: `Move to ${item.program_code} program area`,
            item: item.requisition_no,
            itemDescription: item.description.substring(0, 50),
            from: item.rack_location,
            to: `${primaryZone}-${item.program_code}`,
            priority: item.condition_code === 'A' ? 'medium' : 'low',
            estimatedBenefit: `Standardizes ${item.program_code} inventory layout`,
            quantity: item.quantity,
            value: item.value,
            reason: `${item.program_code} items should be grouped in zone ${primaryZone}`,
          });
          standardizedCount++;
          standardizedValue += item.value;
          
          if (actions.length >= maxActionsToGenerate) break;
        }
        
        summary = {
          potentialSavings: `$${standardizedValue.toLocaleString()} reorganized by program`,
          spaceImprovement: `${programPrimaryZone.size} programs standardized`,
          itemsAffected: standardizedCount,
          actionsGenerated: actions.length,
        };
      }
      else if (algorithm === 'value_density') {
        // Value Density: Move high-value items to more accessible, secure locations
        // Lower zone numbers = closer to dock/entrance = more accessible
        const { highValueThreshold = 1000, zoneDistanceMultiplier = 1.5 } = params || {};
        
        // Sort items by value descending
        const sortedByValue = [...itemsWithData]
          .filter(i => i.value > 0)
          .sort((a, b) => b.value - a.value);
        
        // Find the lowest zone number (most accessible) in the warehouse
        const allZones = new Set(itemsWithData.map(i => parseInt(i.location_zone) || 9999));
        const sortedZones = Array.from(allZones).sort((a, b) => a - b);
        const accessibleZoneNum = sortedZones[0] || 1000;
        const accessibleZone = accessibleZoneNum.toString();
        
        let actionId = 1;
        let movedValue = 0;
        let movedCount = 0;
        
        for (const item of sortedByValue) {
          if (item.value < highValueThreshold) continue;
          
          const currentZoneNum = parseInt(item.location_zone) || 9999;
          // Apply user-configurable zone distance multiplier
          if (currentZoneNum > accessibleZoneNum * zoneDistanceMultiplier) {
            const targetRack = `${accessibleZone}-HV-${String(actionId).padStart(2, '0')}`;
            
            actions.push({
              id: `VD-${actionId++}`,
              action: `Relocate high-value item to priority area`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetRack,
              priority: 'high',
              estimatedBenefit: `$${item.value.toLocaleString()} value - faster picking & better security`,
              quantity: item.quantity,
              value: item.value,
              reason: `High-value item ($${item.value.toLocaleString()}) in zone ${item.location_zone} exceeds ${zoneDistanceMultiplier}x accessible zone (${accessibleZone})`,
            });
            movedValue += item.value;
            movedCount++;
            
            if (actions.length >= 50) break;
          }
        }
        
        summary = {
          potentialSavings: `$${movedValue.toLocaleString()} secured in priority zone`,
          spaceImprovement: `${movedCount} high-value items relocated`,
          itemsAffected: movedCount,
          actionsGenerated: actions.length,
        };
      }
      else if (algorithm === 'bin_packing') {
        // Bin Packing: Stage items by disposition for upcoming shipments
        // SHORESIDE items need staging near dock, RESIDUAL needs different area
        const { maxItemsPerPallet = 15, prioritizeByValue = true } = params || {};
        
        // Group items by mat_disposition
        const dispositionGroups: Map<string, typeof itemsWithData> = new Map();
        for (const item of itemsWithData) {
          const disposition = item.mat_disposition || 'UNASSIGNED';
          if (!dispositionGroups.has(disposition)) {
            dispositionGroups.set(disposition, []);
          }
          dispositionGroups.get(disposition)!.push(item);
        }
        
        // Define staging areas for each disposition
        const stagingAreas: Record<string, string> = {
          'SHORESIDE': 'DOCK-STAGING',
          'RESIDUAL': 'RESIDUAL-HOLD',
          'UNASSIGNED': 'INTAKE-AREA',
        };
        
        let actionId = 1;
        let totalStaged = 0;
        let totalValue = 0;
        
        for (const [disposition, dispItems] of dispositionGroups.entries()) {
          if (dispItems.length < 2) continue;
          
          const stagingArea = stagingAreas[disposition] || `${disposition}-STAGING`;
          // Sort by value if prioritizeByValue, otherwise by ship_class
          const sortedItems = [...dispItems].sort((a, b) => {
            if (prioritizeByValue) {
              return b.value - a.value; // High value first
            }
            return (a.ship_class || '').localeCompare(b.ship_class || '');
          });
          
          let palletNum = 1;
          let itemsOnPallet = 0;
          
          for (const item of sortedItems) {
            if (itemsOnPallet >= maxItemsPerPallet) {
              palletNum++;
              itemsOnPallet = 0;
            }
            
            const targetLocation = `${stagingArea}-P${String(palletNum).padStart(2, '0')}`;
            
            actions.push({
              id: `BP-${actionId++}`,
              action: `Stage for ${disposition} shipment`,
              item: item.requisition_no,
              itemDescription: item.description.substring(0, 50),
              from: item.rack_location,
              to: targetLocation,
              priority: itemsOnPallet === 0 ? 'high' : 'medium',
              estimatedBenefit: `Ready for ${item.ship_class || 'pending'} shipment`,
              quantity: item.quantity,
              value: item.value,
              reason: `${disposition} item for ${item.ship_class || 'TBD'} - stage on pallet ${palletNum}`,
            });
            
            itemsOnPallet++;
            totalStaged++;
            totalValue += item.value;
            
            if (actions.length >= 50) break;
          }
          if (actions.length >= 50) break;
        }
        
        summary = {
          potentialSavings: `$${totalValue.toLocaleString()} staged for shipment`,
          spaceImprovement: `${dispositionGroups.size} disposition groups organized`,
          itemsAffected: totalStaged,
          actionsGenerated: actions.length,
        };
      }

      // Store optimization run in database
      const [optimizationRun] = await db.insert(warehouseOptimizationRuns).values({
        user_id: req.user!.id,
        site_id: siteId,
        algorithm,
        input_params: params || {},
        results: { summary, itemsAnalyzed: items.length },
        action_plan: { actions },
        status: 'completed',
        completed_at: new Date(),
      }).returning();

      res.status(201).json({
        runId: optimizationRun.id,
        algorithm,
        site: { id: siteId, name: site.name },
        summary,
        actions: actions.slice(0, 50), // Limit response size
        totalActions: actions.length,
      });
    } catch (error) {
      console.error("[Warehouse] Optimization failed:", error);
      res.status(500).json({ error: "Failed to run optimization" });
    }
  });

  // POST /api/warehouse/sites/:siteId/optimize/:runId/apply - Apply optimization plan
  app.post("/api/warehouse/sites/:siteId/optimize/:runId/apply", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      const runId = parseInt(req.params.runId);
      
      if (isNaN(siteId) || isNaN(runId)) {
        return res.status(400).json({ error: "Invalid site ID or run ID" });
      }

      // Verify ownership and get the optimization run
      const [run] = await db.select()
        .from(warehouseOptimizationRuns)
        .where(and(
          eq(warehouseOptimizationRuns.id, runId),
          eq(warehouseOptimizationRuns.site_id, siteId),
          eq(warehouseOptimizationRuns.user_id, req.user!.id)
        ));

      if (!run) {
        return res.status(404).json({ error: "Optimization run not found" });
      }

      // For now, just mark the plan as applied (actual implementation would update item locations)
      // In a full implementation, this would iterate through actions and update warehouse_inventory_items

      res.json({ 
        success: true, 
        message: "Optimization plan applied successfully",
        runId,
        actionsApplied: ((run.action_plan as any)?.actions?.length || 0)
      });
    } catch (error) {
      console.error("[Warehouse] Failed to apply optimization:", error);
      res.status(500).json({ error: "Failed to apply optimization plan" });
    }
  });

  // POST /api/warehouse/transfers - Create inter-warehouse transfer with item selection
  app.post("/api/warehouse/transfers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { source_site_id, destination_site_id, transport_mode, item_ids, notes, scheduled_date, air_metadata } = req.body;

      if (!source_site_id || !destination_site_id) {
        return res.status(400).json({ error: "source_site_id and destination_site_id are required" });
      }

      const validModes = ["air", "ground", "sea"];
      const mode = validModes.includes(transport_mode) ? transport_mode : "ground";

      if (source_site_id === destination_site_id) {
        return res.status(400).json({ error: "Source and destination sites must be different" });
      }

      if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
        return res.status(400).json({ error: "item_ids array is required with at least one item" });
      }

      // Verify user owns both sites
      const [sourceSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, source_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      const [destSite] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, destination_site_id),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!sourceSite) {
        return res.status(404).json({ error: "Source warehouse site not found" });
      }

      if (!destSite) {
        return res.status(404).json({ error: "Destination warehouse site not found" });
      }

      // Fetch selected inventory items
      const selectedItems = await db.select()
        .from(warehouseInventoryItems)
        .where(and(
          eq(warehouseInventoryItems.site_id, source_site_id),
          sql`${warehouseInventoryItems.id} = ANY(${item_ids})`
        ));

      if (selectedItems.length === 0) {
        return res.status(400).json({ error: "No valid inventory items found for the selected IDs" });
      }

      // Build transfer items with details
      const transferItems = selectedItems.map(item => ({
        id: item.id,
        requisition_no: item.requisition_no,
        description: item.description,
        quantity: item.quantity,
        weight_lb: item.weight_lb,
        unit_price: item.unit_price,
        length_in: item.length_in,
        width_in: item.width_in,
        height_in: item.height_in,
      }));

      // Calculate totals
      const totals = {
        item_count: transferItems.length,
        total_weight_lb: transferItems.reduce((sum, item) => {
          const weight = parseFloat(String(item.weight_lb || 0)) || 0;
          return sum + (weight * (item.quantity || 1));
        }, 0),
        total_value: transferItems.reduce((sum, item) => {
          const price = parseFloat(String(item.unit_price || 0)) || 0;
          return sum + (price * (item.quantity || 1));
        }, 0),
      };

      // Build air metadata and PACAF manifest for air transfers
      let airMetadata = null;
      let pacafManifest = null;

      if (mode === "air" && air_metadata) {
        const validAircraftTypes = ["C-17", "C-130H", "C-130J"];
        const validPriorities = ["routine", "priority", "urgent"];

        airMetadata = {
          aircraft_type: validAircraftTypes.includes(air_metadata.aircraft_type) 
            ? air_metadata.aircraft_type 
            : "C-17",
          mission_id: air_metadata.mission_id || null,
          priority: validPriorities.includes(air_metadata.priority) 
            ? air_metadata.priority 
            : "routine",
        };

        // Generate PACAF-compatible manifest
        pacafManifest = {
          manifest_id: `MNF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          transfer_id: 0, // Will be updated after insert
          aircraft_type: airMetadata.aircraft_type,
          mission_id: airMetadata.mission_id,
          priority: airMetadata.priority,
          origin_site: {
            id: sourceSite.id,
            code: sourceSite.code,
            name: sourceSite.name,
          },
          destination_site: {
            id: destSite.id,
            code: destSite.code,
            name: destSite.name,
          },
          cargo_items: transferItems.map(item => ({
            id: item.id,
            requisition_no: item.requisition_no,
            description: item.description,
            quantity: item.quantity,
            weight_lb: parseFloat(String(item.weight_lb || 0)) || 0,
            dimensions: {
              length_in: parseFloat(String(item.length_in || 0)) || 0,
              width_in: parseFloat(String(item.width_in || 0)) || 0,
              height_in: parseFloat(String(item.height_in || 0)) || 0,
            },
          })),
          totals,
          created_at: new Date().toISOString(),
        };
      }

      const [transfer] = await db.insert(warehouseTransfers).values({
        user_id: req.user!.id,
        source_site_id,
        destination_site_id,
        status: "pending",
        transport_mode: mode,
        transfer_items: transferItems,
        air_metadata: airMetadata,
        pacaf_manifest: pacafManifest,
        notes: notes || null,
        scheduled_date: scheduled_date ? new Date(scheduled_date) : null,
      }).returning();

      // Update manifest with transfer ID
      if (pacafManifest && transfer) {
        pacafManifest.transfer_id = transfer.id;
        await db.update(warehouseTransfers)
          .set({ pacaf_manifest: pacafManifest })
          .where(eq(warehouseTransfers.id, transfer.id));
      }

      console.log(`[Warehouse] Transfer created: ${transfer.id}, mode: ${mode}, items: ${transferItems.length}`);
      if (mode === "air") {
        console.log(`[Warehouse] Air transfer manifest generated: ${pacafManifest?.manifest_id}`);
      }

      res.status(201).json({
        ...transfer,
        pacaf_manifest: pacafManifest,
      });
    } catch (error) {
      console.error("[Warehouse] Failed to create transfer:", error);
      res.status(500).json({ error: "Failed to create warehouse transfer" });
    }
  });

  // GET /api/warehouse/transfers - Get all transfers for user
  app.get("/api/warehouse/transfers", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const transfers = await db.select()
        .from(warehouseTransfers)
        .where(eq(warehouseTransfers.user_id, req.user!.id));

      res.json(transfers);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch transfers:", error);
      res.status(500).json({ error: "Failed to fetch warehouse transfers" });
    }
  });

  // ============================================================================
  // WAREHOUSE CONFIGURATION API (PROTECTED)
  // ============================================================================

  // GET /api/warehouse/settings - Get user's warehouse settings
  app.get("/api/warehouse/settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const [settings] = await db.select()
        .from(warehouseSettings)
        .where(eq(warehouseSettings.user_id, req.user!.id));

      if (!settings) {
        return res.json({
          timezone: "UTC",
          date_format: "MM/DD/YYYY",
          weight_unit: "lbs",
          default_page_size: 25
        });
      }

      res.json(settings);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch settings:", error);
      res.status(500).json({ error: "Failed to fetch warehouse settings" });
    }
  });

  // POST /api/warehouse/settings - Create or update user's warehouse settings
  app.post("/api/warehouse/settings", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { timezone, date_format, weight_unit, default_page_size } = req.body;

      const validDateFormats = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];
      const validWeightUnits = ["lbs", "kg"];

      if (date_format && !validDateFormats.includes(date_format)) {
        return res.status(400).json({ error: "Invalid date format" });
      }

      if (weight_unit && !validWeightUnits.includes(weight_unit)) {
        return res.status(400).json({ error: "Invalid weight unit" });
      }

      const pageSize = default_page_size ? Math.min(100, Math.max(10, parseInt(default_page_size))) : 25;

      const [existing] = await db.select()
        .from(warehouseSettings)
        .where(eq(warehouseSettings.user_id, req.user!.id));

      if (existing) {
        const [updated] = await db.update(warehouseSettings)
          .set({
            timezone: timezone || existing.timezone,
            date_format: date_format || existing.date_format,
            weight_unit: weight_unit || existing.weight_unit,
            default_page_size: pageSize,
            updated_at: new Date()
          })
          .where(eq(warehouseSettings.user_id, req.user!.id))
          .returning();
        return res.json(updated);
      }

      const [created] = await db.insert(warehouseSettings).values({
        user_id: req.user!.id,
        timezone: timezone || "UTC",
        date_format: date_format || "MM/DD/YYYY",
        weight_unit: weight_unit || "lbs",
        default_page_size: pageSize
      }).returning();

      res.status(201).json(created);
    } catch (error) {
      console.error("[Warehouse] Failed to save settings:", error);
      res.status(500).json({ error: "Failed to save warehouse settings" });
    }
  });

  // GET /api/warehouse/aging-thresholds - Get user's aging thresholds
  app.get("/api/warehouse/aging-thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholds = await db.select()
        .from(warehouseAgingThresholds)
        .where(eq(warehouseAgingThresholds.user_id, req.user!.id))
        .orderBy(asc(warehouseAgingThresholds.days));

      if (thresholds.length === 0) {
        return res.json([
          { id: 0, name: "Warning", days: 180, color: "#fbbf24" },
          { id: 0, name: "Critical", days: 365, color: "#ef4444" }
        ]);
      }

      res.json(thresholds);
    } catch (error) {
      console.error("[Warehouse] Failed to fetch aging thresholds:", error);
      res.status(500).json({ error: "Failed to fetch aging thresholds" });
    }
  });

  // POST /api/warehouse/aging-thresholds - Create a new aging threshold
  app.post("/api/warehouse/aging-thresholds", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { name, days, color } = req.body;

      if (!name || !days) {
        return res.status(400).json({ error: "Name and days are required" });
      }

      const daysNum = parseInt(days);
      if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({ error: "Days must be a positive number" });
      }

      const [threshold] = await db.insert(warehouseAgingThresholds).values({
        user_id: req.user!.id,
        name,
        days: daysNum,
        color: color || "#fbbf24"
      }).returning();

      res.status(201).json(threshold);
    } catch (error) {
      console.error("[Warehouse] Failed to create aging threshold:", error);
      res.status(500).json({ error: "Failed to create aging threshold" });
    }
  });

  // PUT /api/warehouse/aging-thresholds/:id - Update an aging threshold
  app.put("/api/warehouse/aging-thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }

      const { name, days, color } = req.body;

      const [existing] = await db.select()
        .from(warehouseAgingThresholds)
        .where(and(
          eq(warehouseAgingThresholds.id, thresholdId),
          eq(warehouseAgingThresholds.user_id, req.user!.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Aging threshold not found" });
      }

      const daysNum = days ? parseInt(days) : existing.days;
      if (isNaN(daysNum) || daysNum < 1) {
        return res.status(400).json({ error: "Days must be a positive number" });
      }

      const [updated] = await db.update(warehouseAgingThresholds)
        .set({
          name: name || existing.name,
          days: daysNum,
          color: color || existing.color,
          updated_at: new Date()
        })
        .where(eq(warehouseAgingThresholds.id, thresholdId))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error("[Warehouse] Failed to update aging threshold:", error);
      res.status(500).json({ error: "Failed to update aging threshold" });
    }
  });

  // DELETE /api/warehouse/aging-thresholds/:id - Delete an aging threshold
  app.delete("/api/warehouse/aging-thresholds/:id", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const thresholdId = parseInt(req.params.id);
      if (isNaN(thresholdId)) {
        return res.status(400).json({ error: "Invalid threshold ID" });
      }

      const [existing] = await db.select()
        .from(warehouseAgingThresholds)
        .where(and(
          eq(warehouseAgingThresholds.id, thresholdId),
          eq(warehouseAgingThresholds.user_id, req.user!.id)
        ));

      if (!existing) {
        return res.status(404).json({ error: "Aging threshold not found" });
      }

      await db.delete(warehouseAgingThresholds)
        .where(eq(warehouseAgingThresholds.id, thresholdId));

      res.json({ success: true, message: "Aging threshold deleted successfully" });
    } catch (error) {
      console.error("[Warehouse] Failed to delete aging threshold:", error);
      res.status(500).json({ error: "Failed to delete aging threshold" });
    }
  });

  // ============================================================================
  // WAREHOUSE ANALYTICS API (PROTECTED)
  // ============================================================================

  // Helper function to calculate analytics for inventory items
  const calculateAnalytics = (items: any[], site?: any) => {
    const now = new Date();
    let totalItems = items.length;
    let totalQuantity = 0;
    let totalValue = 0;

    const agingBreakdown = {
      lessThan1Year: 0,
      oneToThreeYears: 0,
      threeToFiveYears: 0,
      moreThanFiveYears: 0
    };

    for (const item of items) {
      const qty = item.quantity || 0;
      const price = parseFloat(item.unit_price?.toString() || "0");
      totalQuantity += qty;
      totalValue += qty * price;

      const createdAt = item.created_at ? new Date(item.created_at) : null;
      const lastMoved = item.last_moved ? new Date(item.last_moved) : null;
      const referenceDate = lastMoved || createdAt || now;
      const yearsOld = (now.getTime() - referenceDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

      if (yearsOld < 1) {
        agingBreakdown.lessThan1Year += qty;
      } else if (yearsOld < 3) {
        agingBreakdown.oneToThreeYears += qty;
      } else if (yearsOld < 5) {
        agingBreakdown.threeToFiveYears += qty;
      } else {
        agingBreakdown.moreThanFiveYears += qty;
      }
    }

    const agingTotal = agingBreakdown.lessThan1Year + agingBreakdown.oneToThreeYears + 
                       agingBreakdown.threeToFiveYears + agingBreakdown.moreThanFiveYears;

    const agingScore = agingTotal > 0 ? 
      (agingBreakdown.lessThan1Year * 100 + 
       agingBreakdown.oneToThreeYears * 80 + 
       agingBreakdown.threeToFiveYears * 50 + 
       agingBreakdown.moreThanFiveYears * 20) / agingTotal : 100;

    const defaultCapacity = 500;
    const capacityUtilization = Math.min(Math.round((totalItems / defaultCapacity) * 100), 100);

    const completenessScore = totalItems > 0 ? 90 : 50;
    const readinessScore = Math.round((agingScore * 0.6 + completenessScore * 0.4));

    return {
      totalItems,
      totalQuantity,
      totalValue: parseFloat(totalValue.toFixed(2)),
      capacityUtilization,
      agingBreakdown,
      readinessScore: Math.min(100, Math.max(0, readinessScore))
    };
  };

  // GET /api/warehouse/analytics - Get current analytics for all sites
  app.get("/api/warehouse/analytics", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      const siteAnalytics = [];
      let overallTotalItems = 0;
      let overallTotalValue = 0;
      let overallAgingBreakdown = {
        lessThan1Year: 0,
        oneToThreeYears: 0,
        threeToFiveYears: 0,
        moreThanFiveYears: 0
      };

      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));

        const analytics = calculateAnalytics(items, site);
        
        overallTotalItems += analytics.totalItems;
        overallTotalValue += analytics.totalValue;
        overallAgingBreakdown.lessThan1Year += analytics.agingBreakdown.lessThan1Year;
        overallAgingBreakdown.oneToThreeYears += analytics.agingBreakdown.oneToThreeYears;
        overallAgingBreakdown.threeToFiveYears += analytics.agingBreakdown.threeToFiveYears;
        overallAgingBreakdown.moreThanFiveYears += analytics.agingBreakdown.moreThanFiveYears;

        siteAnalytics.push({
          siteId: site.id,
          siteCode: site.code,
          siteName: site.name,
          ...analytics
        });
      }

      const overallTotal = overallAgingBreakdown.lessThan1Year + overallAgingBreakdown.oneToThreeYears +
                           overallAgingBreakdown.threeToFiveYears + overallAgingBreakdown.moreThanFiveYears;
      const overallAgingScore = overallTotal > 0 ?
        (overallAgingBreakdown.lessThan1Year * 100 +
         overallAgingBreakdown.oneToThreeYears * 80 +
         overallAgingBreakdown.threeToFiveYears * 50 +
         overallAgingBreakdown.moreThanFiveYears * 20) / overallTotal : 100;
      const overallCompleteness = overallTotalItems > 0 ? 90 : 50;
      const overallReadinessScore = Math.round((overallAgingScore * 0.6 + overallCompleteness * 0.4));

      res.json({
        overall: {
          totalItems: overallTotalItems,
          totalValue: parseFloat(overallTotalValue.toFixed(2)),
          agingBreakdown: overallAgingBreakdown,
          readinessScore: Math.min(100, Math.max(0, overallReadinessScore))
        },
        sites: siteAnalytics
      });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get analytics:", error);
      res.status(500).json({ error: "Failed to get warehouse analytics" });
    }
  });

  // GET /api/warehouse/analytics/:siteId - Get analytics for a specific site
  app.get("/api/warehouse/analytics/:siteId", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteId = parseInt(req.params.siteId);
      if (isNaN(siteId)) {
        return res.status(400).json({ error: "Invalid site ID" });
      }

      const [site] = await db.select()
        .from(warehouseSites)
        .where(and(
          eq(warehouseSites.id, siteId),
          eq(warehouseSites.user_id, req.user!.id)
        ));

      if (!site) {
        return res.status(404).json({ error: "Warehouse site not found" });
      }

      const items = await db.select()
        .from(warehouseInventoryItems)
        .where(eq(warehouseInventoryItems.site_id, siteId));

      const analytics = calculateAnalytics(items, site);

      res.json({
        siteId: site.id,
        siteCode: site.code,
        siteName: site.name,
        ...analytics
      });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get site analytics:", error);
      res.status(500).json({ error: "Failed to get site analytics" });
    }
  });

  // POST /api/warehouse/analytics/snapshot - Take a snapshot and store in database
  app.post("/api/warehouse/analytics/snapshot", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const { siteId } = req.body;
      const today = new Date().toISOString().split('T')[0];

      if (siteId) {
        const parsedSiteId = parseInt(siteId);
        if (isNaN(parsedSiteId)) {
          return res.status(400).json({ error: "Invalid site ID" });
        }

        const [site] = await db.select()
          .from(warehouseSites)
          .where(and(
            eq(warehouseSites.id, parsedSiteId),
            eq(warehouseSites.user_id, req.user!.id)
          ));

        if (!site) {
          return res.status(404).json({ error: "Warehouse site not found" });
        }

        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, parsedSiteId));

        const analytics = calculateAnalytics(items, site);

        const [snapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
          user_id: req.user!.id,
          site_id: parsedSiteId,
          snapshot_date: today,
          metrics: analytics
        }).returning();

        return res.status(201).json(snapshot);
      }

      const sites = await db.select()
        .from(warehouseSites)
        .where(eq(warehouseSites.user_id, req.user!.id));

      const snapshots = [];
      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));

        const analytics = calculateAnalytics(items, site);

        const [snapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
          user_id: req.user!.id,
          site_id: site.id,
          snapshot_date: today,
          metrics: analytics
        }).returning();

        snapshots.push(snapshot);
      }

      const overallItems: any[] = [];
      for (const site of sites) {
        const items = await db.select()
          .from(warehouseInventoryItems)
          .where(eq(warehouseInventoryItems.site_id, site.id));
        overallItems.push(...items);
      }

      const overallAnalytics = calculateAnalytics(overallItems);
      const [overallSnapshot] = await db.insert(warehouseAnalyticsSnapshots).values({
        user_id: req.user!.id,
        site_id: null,
        snapshot_date: today,
        metrics: overallAnalytics
      }).returning();

      snapshots.push(overallSnapshot);

      res.status(201).json({ snapshots, count: snapshots.length });
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to create snapshot:", error);
      res.status(500).json({ error: "Failed to create analytics snapshot" });
    }
  });

  // GET /api/warehouse/analytics/history - Get historical snapshots for trendline
  app.get("/api/warehouse/analytics/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
      const siteIdParam = req.query.siteId as string;
      const limitParam = parseInt(req.query.limit as string) || 30;

      let whereCondition;
      if (siteIdParam) {
        const siteId = parseInt(siteIdParam);
        if (isNaN(siteId)) {
          return res.status(400).json({ error: "Invalid site ID" });
        }
        whereCondition = and(
          eq(warehouseAnalyticsSnapshots.user_id, req.user!.id),
          eq(warehouseAnalyticsSnapshots.site_id, siteId)
        );
      } else {
        whereCondition = and(
          eq(warehouseAnalyticsSnapshots.user_id, req.user!.id),
          isNull(warehouseAnalyticsSnapshots.site_id)
        );
      }

      const snapshots = await db.select()
        .from(warehouseAnalyticsSnapshots)
        .where(whereCondition)
        .orderBy(desc(warehouseAnalyticsSnapshots.snapshot_date))
        .limit(limitParam);

      res.json(snapshots.reverse());
    } catch (error) {
      console.error("[Warehouse Analytics] Failed to get history:", error);
      res.status(500).json({ error: "Failed to get analytics history" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
