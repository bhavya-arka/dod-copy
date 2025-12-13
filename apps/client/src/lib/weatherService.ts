/**
 * PACAF Airlift Demo - Weather Service
 * 
 * Provides weather data and movement predictions for route planning.
 * Includes both real NWS API integration and simulated fallback data.
 */

import { WeatherForecast, WeatherMovement, MilitaryBase } from './routeTypes';

// Unit conversion utilities
const metersToNauticalMiles = (m: number | null): number | null => m == null ? null : m / 1852;
const metersPerSecondToKnots = (ms: number | null): number | null => ms == null ? null : ms * 1.94384;
const metersToStatuteMiles = (m: number | null): number | null => m == null ? null : m / 1609.34;

// Types for NWS API response
export interface NWSForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  temperatureTrend: string | null;
  probabilityOfPrecipitation: { value: number | null; unitCode: string } | null;
  windSpeed: string;
  windDirection: string;
  icon: string;
  shortForecast: string;
  detailedForecast: string;
}

export interface NWSCurrentConditions {
  textDescription?: string;
  temperature?: { value: number | null; unitCode: string };
  dewpoint?: { value: number | null; unitCode: string };
  windDirection?: { value: number | null; unitCode: string };
  windSpeed?: { value: number | null; unitCode: string };
  windGust?: { value: number | null; unitCode: string };
  barometricPressure?: { value: number | null; unitCode: string };
  visibility?: { value: number | null; unitCode: string };
  relativeHumidity?: { value: number | null; unitCode: string };
  heatIndex?: { value: number | null; unitCode: string };
  windChill?: { value: number | null; unitCode: string };
}

export interface NWSWeatherResponse {
  location: {
    lat: number;
    lon: number;
    city?: string;
    state?: string;
    timezone?: string;
  };
  forecast: NWSForecastPeriod[];
  forecastHourlyUrl?: string;
  currentConditions?: NWSCurrentConditions;
  generatedAt?: string;
  updateTime?: string;
  cached: boolean;
  error?: string;
}

/**
 * Fetches real weather data from NWS API via server proxy
 * @param lat Latitude
 * @param lon Longitude
 * @returns Weather data from NWS API or null if request fails
 */
export async function fetchRealWeather(lat: number, lon: number): Promise<NWSWeatherResponse | null> {
  const requestId = Math.random().toString(36).substring(7);
  console.debug(`[Weather ${requestId}] Starting fetch for coordinates: ${lat}, ${lon}`);
  
  try {
    const startTime = performance.now();
    const response = await fetch(`/api/weather/${lat}/${lon}`);
    const duration = (performance.now() - startTime).toFixed(0);
    
    console.debug(`[Weather ${requestId}] Response received in ${duration}ms, status: ${response.status}`);
    
    if (response.status === 429) {
      console.warn(`[Weather ${requestId}] Rate limited. Using fallback data.`);
      return null;
    }
    
    if (response.status === 404) {
      console.warn(`[Weather ${requestId}] Location not supported by NWS API (non-US territory). Using fallback data.`);
      return null;
    }
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`[Weather ${requestId}] API error:`, error);
      return null;
    }
    
    const data = await response.json();
    console.debug(`[Weather ${requestId}] Successfully parsed response. Cached: ${data.cached}, Periods: ${data.forecast?.length || 0}`);
    return data;
  } catch (error) {
    console.error(`[Weather ${requestId}] Failed to fetch weather data:`, error);
    return null;
  }
}

/**
 * Gets real current conditions for a base using NWS API
 * Falls back to simulated data if API fails or location not supported
 * @param base Military base to get weather for
 * @returns Weather forecast (real or simulated)
 */
export async function getRealBaseWeather(base: MilitaryBase): Promise<WeatherForecast> {
  console.debug(`[Weather] Fetching real weather for base: ${base.name} (${base.icao})`);
  
  const nwsData = await fetchRealWeather(base.latitude_deg, base.longitude_deg);
  
  if (nwsData && (nwsData.currentConditions || (nwsData.forecast && nwsData.forecast.length > 0))) {
    const conditions = nwsData.currentConditions;
    const forecast = nwsData.forecast[0];
    const hasForecast = forecast !== undefined;
    const hasConditions = conditions !== undefined && conditions !== null;
    const dataSource: 'observations' | 'forecast' = hasConditions ? 'observations' : 'forecast';
    
    console.debug(`[Weather] Processing NWS data for ${base.icao} (hasConditions: ${hasConditions}, hasForecast: ${hasForecast})`);
    
    let tempC: number | null = null;
    if (hasConditions && conditions.temperature?.value !== null && conditions.temperature?.value !== undefined) {
      tempC = conditions.temperature.unitCode?.includes('degC') 
        ? conditions.temperature.value 
        : (conditions.temperature.value - 32) * 5/9;
    } else if (hasForecast && forecast.temperature !== null && forecast.temperature !== undefined) {
      tempC = forecast.temperatureUnit === 'F' 
        ? (forecast.temperature - 32) * 5/9 
        : forecast.temperature;
      console.debug(`[Weather] ${base.icao}: Using forecast temperature ${forecast.temperature}°${forecast.temperatureUnit} → ${Math.round(tempC)}°C`);
    }
    
    let dewpointC: number | null = null;
    if (hasConditions && conditions.dewpoint?.value !== null && conditions.dewpoint?.value !== undefined) {
      dewpointC = conditions.dewpoint.unitCode?.includes('degC')
        ? conditions.dewpoint.value
        : (conditions.dewpoint.value - 32) * 5/9;
    } else if (tempC !== null) {
      dewpointC = tempC - 5;
    }
    
    let windDirDeg: number | null = null;
    if (hasConditions && conditions.windDirection?.value !== null && conditions.windDirection?.value !== undefined) {
      windDirDeg = conditions.windDirection.value;
    } else if (hasForecast && forecast.windDirection) {
      const dirMap: Record<string, number> = {
        'N': 0, 'NNE': 22, 'NE': 45, 'ENE': 67, 'E': 90, 'ESE': 112, 'SE': 135, 'SSE': 157,
        'S': 180, 'SSW': 202, 'SW': 225, 'WSW': 247, 'W': 270, 'WNW': 292, 'NW': 315, 'NNW': 337
      };
      windDirDeg = dirMap[forecast.windDirection] ?? null;
    }
    
    let windSpeedKt: number | null = null;
    if (hasConditions && conditions.windSpeed?.value !== null && conditions.windSpeed?.value !== undefined) {
      const windSpeedMs = conditions.windSpeed.value;
      windSpeedKt = conditions.windSpeed.unitCode?.includes('m_s-1')
        ? metersPerSecondToKnots(windSpeedMs) || windSpeedMs * 1.944
        : conditions.windSpeed.unitCode?.includes('km_h-1')
          ? windSpeedMs * 0.54
          : windSpeedMs;
    } else if (hasForecast && forecast.windSpeed) {
      const windMatch = forecast.windSpeed.match(/(\d+)/);
      if (windMatch) {
        const windMph = parseInt(windMatch[1], 10);
        windSpeedKt = windMph * 0.868976;
        console.debug(`[Weather] ${base.icao}: Using forecast wind "${forecast.windSpeed}" → ${Math.round(windSpeedKt)}kt`);
      }
    }
    
    let visibilitySm: number | null = null;
    let visibilityNm: number | null = null;
    if (hasConditions && conditions.visibility?.value !== null && conditions.visibility?.value !== undefined) {
      const visibilityM = conditions.visibility.value;
      visibilitySm = conditions.visibility.unitCode?.includes('m')
        ? metersToStatuteMiles(visibilityM) || visibilityM / 1609.34
        : visibilityM;
      visibilityNm = conditions.visibility.unitCode?.includes('m')
        ? metersToNauticalMiles(visibilityM)
        : null;
    }
    
    let pressureInhg: number | null = null;
    if (hasConditions && conditions.barometricPressure?.value !== null && conditions.barometricPressure?.value !== undefined) {
      const pressurePa = conditions.barometricPressure.value;
      pressureInhg = pressurePa / 3386.39;
    }
    
    let flightConditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null = null;
    let ceilingFt: number | null = null;
    if (visibilitySm !== null) {
      ceilingFt = 10000;
      flightConditions = 'VFR';
      if (ceilingFt < 500 || visibilitySm < 1) flightConditions = 'LIFR';
      else if (ceilingFt < 1000 || visibilitySm < 3) flightConditions = 'IFR';
      else if (ceilingFt < 3000 || visibilitySm < 5) flightConditions = 'MVFR';
    }
    
    let precipitation: 'rain' | 'snow' | 'freezing_rain' | 'thunderstorm' | 'none' | null = null;
    const desc = (conditions?.textDescription || forecast?.shortForecast || '').toLowerCase();
    if (desc) {
      precipitation = 'none';
      if (desc.includes('thunder')) precipitation = 'thunderstorm';
      else if (desc.includes('freezing')) precipitation = 'freezing_rain';
      else if (desc.includes('snow') || desc.includes('sleet')) precipitation = 'snow';
      else if (desc.includes('rain') || desc.includes('shower')) precipitation = 'rain';
    }
    
    console.debug(`[Weather] ${base.icao}: temp=${tempC !== null ? Math.round(tempC) + '°C' : 'N/A'}, wind=${windSpeedKt !== null ? Math.round(windSpeedKt) + 'kt' : 'N/A'}@${windDirDeg ?? 'N/A'}°, vis=${visibilitySm !== null ? Math.round(visibilitySm) + 'sm' : 'N/A'}, conditions=${flightConditions ?? 'N/A'}, source=${dataSource}`);
    
    return {
      timestamp: new Date(),
      location: { lat: base.latitude_deg, lon: base.longitude_deg },
      wind_direction_deg: windDirDeg,
      wind_speed_kt: windSpeedKt !== null ? Math.round(windSpeedKt) : null,
      visibility_sm: visibilitySm !== null ? Math.round(visibilitySm) : null,
      visibility_nm: visibilityNm !== null ? Math.round(visibilityNm * 10) / 10 : null,
      ceiling_ft: ceilingFt,
      temperature_c: tempC !== null ? Math.round(tempC) : null,
      dewpoint_c: dewpointC !== null ? Math.round(dewpointC) : null,
      pressure_inhg: pressureInhg !== null ? Math.round(pressureInhg * 100) / 100 : null,
      conditions: flightConditions,
      precipitation,
      dataSource
    };
  }
  
  console.debug(`[Weather] Using fallback simulated data for ${base.icao} - No NWS data available`);
  return getBaseWeather(base);
}

const WEATHER_SYSTEMS: WeatherMovement[] = [
  {
    id: 'WX001',
    type: 'front',
    name: 'Cold Front Alpha',
    current_position: { lat: 35.0, lon: 140.0 },
    velocity_kt: 15,
    heading_deg: 45,
    forecast_positions: [],
    severity: 'moderate',
    affects_flight_ops: true
  },
  {
    id: 'WX002',
    type: 'storm',
    name: 'Tropical Depression Beta',
    current_position: { lat: 18.0, lon: 135.0 },
    velocity_kt: 8,
    heading_deg: 315,
    forecast_positions: [],
    severity: 'severe',
    affects_flight_ops: true
  },
  {
    id: 'WX003',
    type: 'pressure_system',
    name: 'High Pressure System',
    current_position: { lat: 40.0, lon: 155.0 },
    velocity_kt: 5,
    heading_deg: 90,
    forecast_positions: [],
    severity: 'minor',
    affects_flight_ops: false
  }
];

export function generateForecastPositions(wx: WeatherMovement, hours: number = 72): WeatherMovement {
  const positions: Array<{ timestamp: Date; position: { lat: number; lon: number } }> = [];
  const now = new Date();
  
  for (let h = 0; h <= hours; h += 6) {
    const distanceNm = wx.velocity_kt * h;
    const headingRad = wx.heading_deg * (Math.PI / 180);
    
    const latChange = (distanceNm / 60) * Math.cos(headingRad);
    const lonChange = (distanceNm / 60) * Math.sin(headingRad) / Math.cos(wx.current_position.lat * Math.PI / 180);
    
    positions.push({
      timestamp: new Date(now.getTime() + h * 60 * 60 * 1000),
      position: {
        lat: wx.current_position.lat + latChange,
        lon: wx.current_position.lon + lonChange
      }
    });
  }
  
  return { ...wx, forecast_positions: positions };
}

export function getActiveWeatherSystems(): WeatherMovement[] {
  return WEATHER_SYSTEMS.map(wx => generateForecastPositions(wx));
}

export function getBaseWeather(base: MilitaryBase): WeatherForecast {
  const now = new Date();
  const baseHash = base.base_id.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  
  const windDir = (baseHash * 17) % 360;
  const windSpeed = 5 + (baseHash % 20);
  const temp = 15 + ((baseHash * 3) % 25) - 10;
  const visibility = 6 + (baseHash % 5);
  const ceiling = 2000 + (baseHash % 8000);
  
  let conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' = 'VFR';
  if (ceiling < 500 || visibility < 1) conditions = 'LIFR';
  else if (ceiling < 1000 || visibility < 3) conditions = 'IFR';
  else if (ceiling < 3000 || visibility < 5) conditions = 'MVFR';
  
  return {
    timestamp: now,
    location: { lat: base.latitude_deg, lon: base.longitude_deg },
    wind_direction_deg: windDir,
    wind_speed_kt: windSpeed,
    visibility_sm: visibility,
    ceiling_ft: ceiling,
    temperature_c: temp,
    dewpoint_c: temp - 5,
    pressure_inhg: 29.92 + ((baseHash % 100) - 50) / 100,
    conditions,
    precipitation: 'none',
    dataSource: 'simulated'
  };
}

export function willWeatherAffectRoute(
  origin: MilitaryBase,
  destination: MilitaryBase,
  departureTime: Date
): { affected: boolean; systems: WeatherMovement[]; recommendation: string } {
  const systems = getActiveWeatherSystems();
  const affectingSystems: WeatherMovement[] = [];
  
  const midLat = (origin.latitude_deg + destination.latitude_deg) / 2;
  const midLon = (origin.longitude_deg + destination.longitude_deg) / 2;
  
  for (const wx of systems) {
    if (!wx.affects_flight_ops) continue;
    
    for (const pos of wx.forecast_positions) {
      const timeDiff = Math.abs(pos.timestamp.getTime() - departureTime.getTime()) / (1000 * 60 * 60);
      if (timeDiff > 12) continue;
      
      const distance = Math.sqrt(
        Math.pow(pos.position.lat - midLat, 2) + 
        Math.pow(pos.position.lon - midLon, 2)
      ) * 60;
      
      if (distance < 200) {
        affectingSystems.push(wx);
        break;
      }
    }
  }
  
  let recommendation = 'Clear weather expected along route.';
  if (affectingSystems.length > 0) {
    if (affectingSystems.some(s => s.severity === 'severe')) {
      recommendation = 'SEVERE WEATHER ALERT: Consider delaying departure or alternate routing.';
    } else {
      recommendation = 'Weather system may impact route. Monitor conditions closely.';
    }
  }
  
  return {
    affected: affectingSystems.length > 0,
    systems: affectingSystems,
    recommendation
  };
}

export function formatWindData(direction: number | null, speed: number | null, gust?: number | null): string {
  if (direction === null || speed === null) {
    return 'N/A';
  }
  const dirStr = direction.toString().padStart(3, '0');
  if (gust) {
    return `${dirStr}/${speed}G${gust}KT`;
  }
  return `${dirStr}/${speed}KT`;
}

export function getConditionsColor(conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null): string {
  switch (conditions) {
    case 'VFR': return '#22c55e';
    case 'MVFR': return '#3b82f6';
    case 'IFR': return '#ef4444';
    case 'LIFR': return '#a855f7';
    case null: return '#ef4444';
    default: return '#94a3b8';
  }
}

export function formatWeatherValue(value: number | null, unit: string): JSX.Element | string {
  if (value === null) {
    return 'N/A';
  }
  return `${value}${unit}`;
}
