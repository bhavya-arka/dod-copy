/**
 * PACAF Airlift Demo - Weather Service
 * 
 * Provides simulated weather data and movement predictions for route planning.
 * In production, this would connect to actual weather APIs (NOAA, military weather services).
 */

import { WeatherForecast, WeatherMovement, MilitaryBase } from '../types';

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
    precipitation: 'none'
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

export function formatWindData(direction: number, speed: number, gust?: number): string {
  const dirStr = direction.toString().padStart(3, '0');
  if (gust) {
    return `${dirStr}/${speed}G${gust}KT`;
  }
  return `${dirStr}/${speed}KT`;
}

export function getConditionsColor(conditions: 'VFR' | 'MVFR' | 'IFR' | 'LIFR'): string {
  switch (conditions) {
    case 'VFR': return '#22c55e';
    case 'MVFR': return '#3b82f6';
    case 'IFR': return '#ef4444';
    case 'LIFR': return '#a855f7';
    default: return '#94a3b8';
  }
}
