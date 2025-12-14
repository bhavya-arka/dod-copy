/**
 * Weather Service Tests
 * Tests for weather conditions, warnings, and impact analysis
 */

import {
  getBaseWeather,
  getActiveWeatherSystems,
  generateForecastPositions,
  willWeatherAffectRoute,
  formatWindData,
  getConditionsColor,
  formatWeatherValue
} from '../../lib/weatherService';
import { MILITARY_BASES, getBaseById } from '../../lib/bases';

describe('Weather Service - Base Weather', () => {
  test('should generate weather for Hickam', () => {
    const hickam = getBaseById('HICKAM')!;
    const weather = getBaseWeather(hickam);
    
    expect(weather.wind_direction_deg).toBeGreaterThanOrEqual(0);
    expect(weather.wind_direction_deg).toBeLessThan(360);
    expect(weather.wind_speed_kt).toBeGreaterThan(0);
  });

  test('should generate weather for all bases', () => {
    MILITARY_BASES.forEach(base => {
      const weather = getBaseWeather(base);
      expect(weather).toBeDefined();
      expect(weather.conditions).toMatch(/^(VFR|MVFR|IFR|LIFR)$/);
    });
  });

  test('should include temperature and dewpoint', () => {
    const kadena = getBaseById('KADENA')!;
    const weather = getBaseWeather(kadena);
    
    expect(weather.temperature_c).toBeDefined();
    expect(weather.dewpoint_c).toBeDefined();
    expect(weather.temperature_c).toBeGreaterThan(weather.dewpoint_c!);
  });

  test('should include pressure reading', () => {
    const yokota = getBaseById('YOKOTA')!;
    const weather = getBaseWeather(yokota);
    
    expect(weather.pressure_inhg).toBeGreaterThan(28);
    expect(weather.pressure_inhg).toBeLessThan(32);
  });
});

describe('Weather Service - Weather Systems', () => {
  test('should return active weather systems', () => {
    const systems = getActiveWeatherSystems();
    
    expect(Array.isArray(systems)).toBe(true);
    expect(systems.length).toBeGreaterThan(0);
  });

  test('should have forecast positions for each system', () => {
    const systems = getActiveWeatherSystems();
    
    systems.forEach(system => {
      expect(system.forecast_positions).toBeDefined();
      expect(system.forecast_positions.length).toBeGreaterThan(0);
    });
  });

  test('should identify systems that affect flight ops', () => {
    const systems = getActiveWeatherSystems();
    
    const affecting = systems.filter(s => s.affects_flight_ops);
    const notAffecting = systems.filter(s => !s.affects_flight_ops);
    
    expect(affecting.length).toBeGreaterThan(0);
    expect(notAffecting.length).toBeGreaterThan(0);
  });
});

describe('Weather Service - Forecast Position Generation', () => {
  test('should generate positions for specified hours', () => {
    const wx = {
      id: 'TEST-001',
      type: 'front' as const,
      name: 'Test Front',
      current_position: { lat: 35.0, lon: 140.0 },
      velocity_kt: 15,
      heading_deg: 45,
      forecast_positions: [],
      severity: 'moderate' as const,
      affects_flight_ops: true
    };
    
    const result = generateForecastPositions(wx, 24);
    
    expect(result.forecast_positions.length).toBe(5);
  });

  test('should calculate position movement based on velocity', () => {
    const wx = {
      id: 'TEST-002',
      type: 'storm' as const,
      name: 'Test Storm',
      current_position: { lat: 20.0, lon: 130.0 },
      velocity_kt: 10,
      heading_deg: 90,
      forecast_positions: [],
      severity: 'severe' as const,
      affects_flight_ops: true
    };
    
    const result = generateForecastPositions(wx, 12);
    const lastPos = result.forecast_positions[result.forecast_positions.length - 1];
    
    expect(lastPos.position.lon).toBeGreaterThan(wx.current_position.lon);
  });
});

describe('Weather Service - Route Impact Analysis', () => {
  test('should analyze weather impact on route', () => {
    const hickam = getBaseById('HICKAM')!;
    const kadena = getBaseById('KADENA')!;
    
    const result = willWeatherAffectRoute(hickam, kadena, new Date());
    
    expect(result).toHaveProperty('affected');
    expect(result).toHaveProperty('systems');
    expect(result).toHaveProperty('recommendation');
    expect(typeof result.recommendation).toBe('string');
  });

  test('should provide recommendation for affected routes', () => {
    const hickam = getBaseById('HICKAM')!;
    const yokota = getBaseById('YOKOTA')!;
    
    const result = willWeatherAffectRoute(hickam, yokota, new Date());
    
    expect(result.recommendation.length).toBeGreaterThan(0);
  });
});

describe('Weather Service - Wind Data Formatting', () => {
  test('should format wind as direction/speed', () => {
    const formatted = formatWindData(270, 15);
    expect(formatted).toBe('270/15KT');
  });

  test('should format wind with gusts', () => {
    const formatted = formatWindData(180, 20, 30);
    expect(formatted).toBe('180/20G30KT');
  });

  test('should pad direction to 3 digits', () => {
    const formatted = formatWindData(45, 10);
    expect(formatted).toBe('045/10KT');
  });

  test('should handle null values', () => {
    expect(formatWindData(null, 10)).toBe('N/A');
    expect(formatWindData(90, null)).toBe('N/A');
    expect(formatWindData(null, null)).toBe('N/A');
  });
});

describe('Weather Service - Conditions Colors', () => {
  test('should return green for VFR', () => {
    expect(getConditionsColor('VFR')).toBe('#22c55e');
  });

  test('should return blue for MVFR', () => {
    expect(getConditionsColor('MVFR')).toBe('#3b82f6');
  });

  test('should return red for IFR', () => {
    expect(getConditionsColor('IFR')).toBe('#ef4444');
  });

  test('should return purple for LIFR', () => {
    expect(getConditionsColor('LIFR')).toBe('#a855f7');
  });

  test('should handle null conditions', () => {
    expect(getConditionsColor(null)).toBe('#ef4444');
  });
});

describe('Weather Service - Value Formatting', () => {
  test('should format value with unit', () => {
    expect(formatWeatherValue(25, '°C')).toBe('25°C');
    expect(formatWeatherValue(10, ' sm')).toBe('10 sm');
  });

  test('should return N/A for null values', () => {
    expect(formatWeatherValue(null, '°C')).toBe('N/A');
  });
});
