import { Router, Request, Response } from "express";

const router = Router();

interface WeatherCacheEntry {
  data: any;
  timestamp: number;
}

const weatherCache = new Map<string, WeatherCacheEntry>();
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

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
): Promise<globalThis.Response> {
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

router.get("/weather/status", async (req: Request, res: Response) => {
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

router.get("/weather/:lat/:lon", async (req: Request, res: Response) => {
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

router.post("/airbases/resolve", async (req: Request, res: Response) => {
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

export default router;
