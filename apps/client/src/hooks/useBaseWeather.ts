/**
 * useBaseWeather Hook
 * Fetches weather data for multiple military bases with loading and error states.
 * Extracted from RoutePlanner component for reusability.
 */

import { useState, useCallback } from 'react';
import { MilitaryBase } from '../lib/routeTypes';
import { WeatherForecast } from '../lib/routeTypes';
import { getRealBaseWeather, getBaseWeather } from '../lib/weatherService';

interface UseBaseWeatherResult {
  weatherData: Map<string, WeatherForecast>;
  weatherErrors: Map<string, boolean>;
  isLoading: boolean;
  fetchWeatherForBases: (bases: MilitaryBase[]) => Promise<void>;
  getWeatherForBase: (baseId: string) => WeatherForecast | undefined;
  hasError: (baseId: string) => boolean;
}

export function useBaseWeather(): UseBaseWeatherResult {
  const [weatherData, setWeatherData] = useState<Map<string, WeatherForecast>>(new Map());
  const [weatherErrors, setWeatherErrors] = useState<Map<string, boolean>>(new Map());
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchWeatherForBases = useCallback(async (bases: MilitaryBase[]) => {
    setIsLoading(true);
    const newWeatherData = new Map<string, WeatherForecast>();
    const newErrors = new Map<string, boolean>();

    await Promise.all(
      bases.map(async (base) => {
        try {
          const weather = await getRealBaseWeather(base);
          newWeatherData.set(base.base_id, weather);
          newErrors.set(base.base_id, false);
        } catch (error) {
          console.error(`Failed to fetch weather for ${base.base_id}:`, error);
          const fallback = getBaseWeather(base);
          newWeatherData.set(base.base_id, fallback);
          newErrors.set(base.base_id, true);
        }
      })
    );

    setWeatherData(newWeatherData);
    setWeatherErrors(newErrors);
    setIsLoading(false);
  }, []);

  const getWeatherForBase = useCallback((baseId: string): WeatherForecast | undefined => {
    return weatherData.get(baseId);
  }, [weatherData]);

  const hasError = useCallback((baseId: string): boolean => {
    return weatherErrors.get(baseId) ?? false;
  }, [weatherErrors]);

  return {
    weatherData,
    weatherErrors,
    isLoading,
    fetchWeatherForBases,
    getWeatherForBase,
    hasError,
  };
}

export default useBaseWeather;
