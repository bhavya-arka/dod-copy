import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { loginSchema, insertUserSchema } from "@shared/schema";
import {
  dagNodeService,
  dagEdgeService,
  cargoService,
  cargoAssignmentService
} from "./services";

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

  const httpServer = createServer(app);
  return httpServer;
}
