/**
 * Weather Service Tests
 * Tests for weather forecasting and impact analysis
 */

import {
  getBaseWeather,
  willWeatherAffectRoute,
  getActiveWeatherSystems
} from '../apps/client/src/lib/weatherService';
import { MILITARY_BASES } from '../apps/client/src/lib/bases';

describe('Base Weather', () => {
  test('should return weather for known base', () => {
    const base = MILITARY_BASES[0];
    const weather = getBaseWeather(base);
    
    expect(weather).toBeDefined();
    expect(weather.wind_speed_kt).toBeGreaterThanOrEqual(0);
  });

  test('should include temperature', () => {
    const base = MILITARY_BASES[0];
    const weather = getBaseWeather(base);
    
    expect(weather.temperature_c).toBeDefined();
  });

  test('should include visibility', () => {
    const base = MILITARY_BASES[0];
    const weather = getBaseWeather(base);
    
    expect(weather.visibility_sm).toBeGreaterThan(0);
  });

  test('should include ceiling', () => {
    const base = MILITARY_BASES[0];
    const weather = getBaseWeather(base);
    
    expect(weather.ceiling_ft).toBeDefined();
  });

  test('should include conditions category', () => {
    const base = MILITARY_BASES[0];
    const weather = getBaseWeather(base);
    
    expect(['VFR', 'MVFR', 'IFR', 'LIFR']).toContain(weather.conditions);
  });

  test('should include wind direction', () => {
    const base = MILITARY_BASES[0];
    const weather = getBaseWeather(base);
    
    expect(weather.wind_direction_deg).toBeGreaterThanOrEqual(0);
    expect(weather.wind_direction_deg).toBeLessThan(360);
  });
});

describe('Active Weather Systems', () => {
  test('should return array of weather systems', () => {
    const systems = getActiveWeatherSystems();
    
    expect(Array.isArray(systems)).toBe(true);
  });

  test('weather systems should have required properties', () => {
    const systems = getActiveWeatherSystems();
    
    if (systems.length > 0) {
      expect(systems[0].type).toBeDefined();
      expect(systems[0].current_position.lat).toBeDefined();
      expect(systems[0].current_position.lon).toBeDefined();
    }
  });

  test('weather systems should have forecast positions', () => {
    const systems = getActiveWeatherSystems();
    
    if (systems.length > 0) {
      expect(systems[0].forecast_positions).toBeDefined();
      expect(systems[0].forecast_positions.length).toBeGreaterThan(0);
    }
  });
});

describe('Route Weather Impact', () => {
  test('should analyze weather impact on route', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const impact = willWeatherAffectRoute(origin, destination, new Date());
    
    expect(impact).toBeDefined();
    expect(impact.affected).toBeDefined();
  });

  test('should return systems array', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const impact = willWeatherAffectRoute(origin, destination, new Date());
    
    expect(Array.isArray(impact.systems)).toBe(true);
  });

  test('should include recommendation', () => {
    const origin = MILITARY_BASES[0];
    const destination = MILITARY_BASES[1];
    
    const impact = willWeatherAffectRoute(origin, destination, new Date());
    
    expect(impact.recommendation).toBeDefined();
    expect(impact.recommendation.length).toBeGreaterThan(0);
  });
});
