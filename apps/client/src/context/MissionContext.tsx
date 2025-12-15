/**
 * Mission Workspace Context
 * Manages mission state, configurations, aircraft selection, and analytics across all views.
 */

import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, ReactNode } from 'react';
import { AircraftType, AllocationResult, InsightsSummary, ParseResult, ClassifiedItems } from '../lib/pacafTypes';
import { SplitFlight } from '../lib/flightSplitTypes';
import { FlightRoute, AIRCRAFT_SPECS, DEFAULT_FUEL_CONFIG, FuelCalculationConfig } from '../lib/routeTypes';

export interface MissionConfiguration {
  id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  status: 'draft' | 'complete';
  allocation_result: AllocationResult;
  split_flights: SplitFlight[];
  routes: FlightRoute[];
  notes: string;
}

export interface MissionAnalytics {
  total_aircraft: number;
  total_pallets: number;
  total_weight_lb: number;
  total_pax: number;
  total_fuel_lb: number;
  total_distance_nm: number;
  total_flight_hours: number;
  estimated_cost_usd: number;
  average_cob_percent: number;
  utilization_percent: number;
}

export interface FuelPhaseBreakdown {
  taxi_fuel_lb: number;
  climb_fuel_lb: number;
  cruise_fuel_lb: number;
  descent_fuel_lb: number;
  reserve_fuel_lb: number;
  contingency_fuel_lb: number;
  total_mission_fuel_lb: number;
}

export interface AircraftCostBreakdown {
  aircraft_id: string;
  aircraft_type: 'C-17' | 'C-130';
  distance_nm: number;
  flight_hours: number;
  payload_weight_lb: number;
  fuel_breakdown: FuelPhaseBreakdown;
  fuel_cost_usd: number;
  operating_cost_usd: number;
  total_cost_usd: number;
  fuel_efficiency_lb_per_nm: number;
  cost_per_ton_mile: number;
}

export interface FuelCostBreakdown {
  base_fuel_lb: number;
  additional_fuel_from_splits: number;
  fuel_per_aircraft: AircraftCostBreakdown[];
  cost_per_lb: number;
  total_fuel_lb: number;
  total_fuel_cost_usd: number;
  total_operating_cost_usd: number;
  total_cost_usd: number;
  average_fuel_efficiency_lb_per_nm: number;
  average_cost_per_ton_mile: number;
  fuel_config: FuelCalculationConfig;
}

interface MissionContextType {
  // Data state
  parseResult: ParseResult | null;
  classifiedItems: ClassifiedItems | null;
  allocationResult: AllocationResult | null;
  insights: InsightsSummary | null;
  splitFlights: SplitFlight[];
  routes: FlightRoute[];
  manifestId: number | null;
  
  // UI state
  selectedAircraft: AircraftType;
  selectedAircraftIndex: number;
  currentTab: MissionTab;
  isProcessing: boolean;
  error: string | null;
  
  // Configurations
  savedConfigurations: MissionConfiguration[];
  activeConfigurationId: string | null;
  
  // Analytics
  analytics: MissionAnalytics | null;
  fuelBreakdown: FuelCostBreakdown | null;
  
  // Actions
  setParseResult: (result: ParseResult) => void;
  setClassifiedItems: (items: ClassifiedItems) => void;
  setAllocationResult: (result: AllocationResult) => void;
  setInsights: (insights: InsightsSummary) => void;
  setSplitFlights: (flights: SplitFlight[]) => void;
  setRoutes: (routes: FlightRoute[]) => void;
  setManifestId: (id: number | null) => void;
  setSelectedAircraft: (type: AircraftType) => void;
  setSelectedAircraftIndex: (index: number) => void;
  setCurrentTab: (tab: MissionTab) => void;
  setIsProcessing: (processing: boolean) => void;
  setError: (error: string | null) => void;
  
  // Configuration management
  saveConfiguration: (name: string) => Promise<void>;
  updateConfiguration: (planId: number) => Promise<void>;
  updatePlanSchedules: (planId: number, flights?: SplitFlight[]) => Promise<void>;
  loadConfiguration: (id: string) => void;
  deleteConfiguration: (id: string) => void;
  compareConfigurations: (ids: string[]) => MissionConfiguration[];
  
  // Analytics
  calculateAnalytics: () => void;
  calculateFuelBreakdown: () => void;
  
  // Reset
  resetMission: () => void;
}

export type MissionTab = 'flights' | 'manifest' | 'schedules' | 'weather' | 'cargo_split' | 'analytics';

const MissionContext = createContext<MissionContextType | null>(null);

export function useMission(): MissionContextType {
  const context = useContext(MissionContext);
  if (!context) {
    throw new Error('useMission must be used within a MissionProvider');
  }
  return context;
}

interface MissionProviderProps {
  children: ReactNode;
  allocationResult?: AllocationResult | null;
  classifiedItems?: ClassifiedItems | null;
  selectedAircraft?: AircraftType;
  insights?: InsightsSummary | null;
}

export function MissionProvider({ 
  children, 
  allocationResult: initialAllocation,
  classifiedItems: initialClassified,
  selectedAircraft: initialAircraft = 'C-17',
  insights: initialInsights
}: MissionProviderProps) {
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [classifiedItems, setClassifiedItems] = useState<ClassifiedItems | null>(initialClassified || null);
  const [allocationResult, setAllocationResult] = useState<AllocationResult | null>(initialAllocation || null);
  const [insights, setInsights] = useState<InsightsSummary | null>(initialInsights || null);
  const [splitFlights, setSplitFlights] = useState<SplitFlight[]>([]);
  const [routes, setRoutes] = useState<FlightRoute[]>([]);
  const [manifestId, setManifestId] = useState<number | null>(null);
  
  const [selectedAircraft, setSelectedAircraft] = useState<AircraftType>(initialAircraft);
  const [selectedAircraftIndex, setSelectedAircraftIndex] = useState(0);
  const [currentTab, setCurrentTab] = useState<MissionTab>('flights');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [savedConfigurations, setSavedConfigurations] = useState<MissionConfiguration[]>([]);
  const [activeConfigurationId, setActiveConfigurationId] = useState<string | null>(null);
  
  const [analytics, setAnalytics] = useState<MissionAnalytics | null>(null);
  const [fuelBreakdown, setFuelBreakdown] = useState<FuelCostBreakdown | null>(null);

  useEffect(() => {
    if (allocationResult) {
      const timer = setTimeout(() => {
        calculateAnalyticsInternal();
        calculateFuelBreakdownInternal();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [allocationResult, splitFlights, routes]);

  const calculateAnalyticsInternal = () => {
    if (!allocationResult) {
      setAnalytics(null);
      return;
    }

    const plans = allocationResult.load_plans;
    
    let totalFuel = 0;
    let totalDistance = 0;
    let totalFlightHours = 0;
    
    for (const route of routes) {
      totalDistance += route.total_distance_nm;
      const aircraftType: 'C-17' | 'C-130' = plans[0]?.aircraft_spec.name.includes('C-17') ? 'C-17' : 'C-130';
      const specs = AIRCRAFT_SPECS[aircraftType];
      const cruiseTime = route.total_distance_nm / specs.cruise_speed_kt;
      const hours = specs.taxi_time_hr + specs.climb_time_hr + cruiseTime + specs.descent_time_hr;
      totalFlightHours += hours;
      
      const missionFuel = (specs.fuel_burn_taxi_lb_hr * specs.taxi_time_hr) +
                          (specs.fuel_burn_climb_lb_hr * specs.climb_time_hr) +
                          (specs.fuel_burn_cruise_lb_hr * cruiseTime) +
                          (specs.fuel_burn_descent_lb_hr * specs.descent_time_hr);
      totalFuel += missionFuel * (1 + DEFAULT_FUEL_CONFIG.reserve_fuel_percent + DEFAULT_FUEL_CONFIG.contingency_fuel_percent);
    }

    const totalWeight = allocationResult.total_weight;
    const totalPallets = allocationResult.total_pallets;
    const totalPax = allocationResult.total_pax;
    const aircraftCount = plans.length + (splitFlights.length > plans.length ? splitFlights.length - plans.length : 0);
    
    const avgCob = plans.length > 0 ? plans.reduce((sum, p) => sum + p.cob_percent, 0) / plans.length : 0;
    const maxCapacity = plans.reduce((sum, p) => sum + p.aircraft_spec.max_payload, 0);
    const utilization = maxCapacity > 0 ? (totalWeight / maxCapacity) * 100 : 0;
    
    setAnalytics({
      total_aircraft: aircraftCount,
      total_pallets: totalPallets,
      total_weight_lb: totalWeight,
      total_pax: totalPax,
      total_fuel_lb: totalFuel,
      total_distance_nm: totalDistance,
      total_flight_hours: totalFlightHours,
      estimated_cost_usd: totalFuel * DEFAULT_FUEL_CONFIG.fuel_cost_per_lb,
      average_cob_percent: avgCob,
      utilization_percent: utilization
    });
  };

  const calculateFuelBreakdownInternal = () => {
    if (!allocationResult) {
      setFuelBreakdown(null);
      return;
    }

    const plans = allocationResult.load_plans;
    const fuelConfig = DEFAULT_FUEL_CONFIG;
    
    const fuelPerAircraft: AircraftCostBreakdown[] = [];
    let baseFuel = 0;
    
    const originalAircraftCount = plans.length;
    const currentAircraftCount = splitFlights.length > 0 ? splitFlights.length : originalAircraftCount;
    
    for (let i = 0; i < currentAircraftCount; i++) {
      const flight = splitFlights[i];
      const plan = plans[i % plans.length];
      const aircraftType: 'C-17' | 'C-130' = plan?.aircraft_spec.name.includes('C-17') ? 'C-17' : 'C-130';
      const specs = AIRCRAFT_SPECS[aircraftType];
      
      const route = routes[i];
      const distance = route?.total_distance_nm ?? 0;
      const payloadWeight = flight?.total_weight_lb ?? plan?.total_weight ?? 0;
      
      const cruiseTime = distance > 0 ? distance / specs.cruise_speed_kt : 0;
      const totalFlightHours = specs.taxi_time_hr + specs.climb_time_hr + cruiseTime + specs.descent_time_hr;
      
      const taxiFuel = specs.fuel_burn_taxi_lb_hr * specs.taxi_time_hr;
      const climbFuel = specs.fuel_burn_climb_lb_hr * specs.climb_time_hr;
      let cruiseFuel = specs.fuel_burn_cruise_lb_hr * cruiseTime;
      const descentFuel = specs.fuel_burn_descent_lb_hr * specs.descent_time_hr;
      
      const payloadRatio = payloadWeight / specs.max_payload_lb;
      const payloadPenalty = 1 + (payloadRatio * specs.payload_fuel_penalty_factor);
      cruiseFuel = cruiseFuel * payloadPenalty;
      
      const missionFuel = taxiFuel + climbFuel + cruiseFuel + descentFuel;
      const reserveFuel = missionFuel * fuelConfig.reserve_fuel_percent;
      const contingencyFuel = missionFuel * fuelConfig.contingency_fuel_percent;
      const totalFuel = missionFuel + reserveFuel + contingencyFuel;
      
      const fuelCost = totalFuel * fuelConfig.fuel_cost_per_lb;
      const operatingCost = totalFlightHours * specs.operating_cost_per_hr;
      const totalCost = fuelCost + operatingCost;
      
      const fuelEfficiency = distance > 0 ? totalFuel / distance : 0;
      const tonMiles = (payloadWeight / 2000) * distance;
      const costPerTonMile = tonMiles > 0 ? totalCost / tonMiles : 0;
      
      fuelPerAircraft.push({
        aircraft_id: flight?.callsign || plan?.aircraft_id || `Aircraft-${i + 1}`,
        aircraft_type: aircraftType,
        distance_nm: distance,
        flight_hours: totalFlightHours,
        payload_weight_lb: payloadWeight,
        fuel_breakdown: {
          taxi_fuel_lb: taxiFuel,
          climb_fuel_lb: climbFuel,
          cruise_fuel_lb: cruiseFuel,
          descent_fuel_lb: descentFuel,
          reserve_fuel_lb: reserveFuel,
          contingency_fuel_lb: contingencyFuel,
          total_mission_fuel_lb: totalFuel
        },
        fuel_cost_usd: fuelCost,
        operating_cost_usd: operatingCost,
        total_cost_usd: totalCost,
        fuel_efficiency_lb_per_nm: fuelEfficiency,
        cost_per_ton_mile: costPerTonMile
      });
      
      if (i < originalAircraftCount) {
        baseFuel += totalFuel;
      }
    }
    
    const totalFuelLb = fuelPerAircraft.reduce((sum, a) => sum + a.fuel_breakdown.total_mission_fuel_lb, 0);
    const totalFuelCost = fuelPerAircraft.reduce((sum, a) => sum + a.fuel_cost_usd, 0);
    const totalOperatingCost = fuelPerAircraft.reduce((sum, a) => sum + a.operating_cost_usd, 0);
    const totalCost = fuelPerAircraft.reduce((sum, a) => sum + a.total_cost_usd, 0);
    const additionalFuel = Math.max(0, totalFuelLb - baseFuel);
    
    const totalDistance = fuelPerAircraft.reduce((sum, a) => sum + a.distance_nm, 0);
    const avgFuelEfficiency = totalDistance > 0 ? totalFuelLb / totalDistance : 0;
    
    const totalTonMiles = fuelPerAircraft.reduce((sum, a) => {
      return sum + (a.payload_weight_lb / 2000) * a.distance_nm;
    }, 0);
    const avgCostPerTonMile = totalTonMiles > 0 ? totalCost / totalTonMiles : 0;
    
    setFuelBreakdown({
      base_fuel_lb: baseFuel,
      additional_fuel_from_splits: additionalFuel,
      fuel_per_aircraft: fuelPerAircraft,
      cost_per_lb: fuelConfig.fuel_cost_per_lb,
      total_fuel_lb: totalFuelLb,
      total_fuel_cost_usd: totalFuelCost,
      total_operating_cost_usd: totalOperatingCost,
      total_cost_usd: totalCost,
      average_fuel_efficiency_lb_per_nm: avgFuelEfficiency,
      average_cost_per_ton_mile: avgCostPerTonMile,
      fuel_config: fuelConfig
    });
  };

  const calculateAnalytics = useCallback(() => {
    if (!allocationResult) {
      setAnalytics(null);
      return;
    }

    const plans = allocationResult.load_plans;
    
    let totalFuel = 0;
    let totalDistance = 0;
    let totalFlightHours = 0;
    
    for (const route of routes) {
      totalDistance += route.total_distance_nm;
      const aircraftType: 'C-17' | 'C-130' = plans[0]?.aircraft_spec.name.includes('C-17') ? 'C-17' : 'C-130';
      const specs = AIRCRAFT_SPECS[aircraftType];
      const cruiseTime = route.total_distance_nm / specs.cruise_speed_kt;
      const hours = specs.taxi_time_hr + specs.climb_time_hr + cruiseTime + specs.descent_time_hr;
      totalFlightHours += hours;
      
      const missionFuel = (specs.fuel_burn_taxi_lb_hr * specs.taxi_time_hr) +
                          (specs.fuel_burn_climb_lb_hr * specs.climb_time_hr) +
                          (specs.fuel_burn_cruise_lb_hr * cruiseTime) +
                          (specs.fuel_burn_descent_lb_hr * specs.descent_time_hr);
      totalFuel += missionFuel * (1 + DEFAULT_FUEL_CONFIG.reserve_fuel_percent + DEFAULT_FUEL_CONFIG.contingency_fuel_percent);
    }

    const totalWeight = allocationResult.total_weight;
    const totalPallets = allocationResult.total_pallets;
    const totalPax = allocationResult.total_pax;
    const aircraftCount = plans.length + (splitFlights.length > plans.length ? splitFlights.length - plans.length : 0);
    
    const avgCob = plans.length > 0 ? plans.reduce((sum, p) => sum + p.cob_percent, 0) / plans.length : 0;
    const maxCapacity = plans.reduce((sum, p) => sum + p.aircraft_spec.max_payload, 0);
    const utilization = maxCapacity > 0 ? (totalWeight / maxCapacity) * 100 : 0;
    
    setAnalytics({
      total_aircraft: aircraftCount,
      total_pallets: totalPallets,
      total_weight_lb: totalWeight,
      total_pax: totalPax,
      total_fuel_lb: totalFuel,
      total_distance_nm: totalDistance,
      total_flight_hours: totalFlightHours,
      estimated_cost_usd: totalFuel * DEFAULT_FUEL_CONFIG.fuel_cost_per_lb,
      average_cob_percent: avgCob,
      utilization_percent: utilization
    });
  }, [allocationResult, splitFlights, routes]);

  const calculateFuelBreakdown = useCallback(() => {
    if (!allocationResult) {
      setFuelBreakdown(null);
      return;
    }

    const plans = allocationResult.load_plans;
    const fuelConfig = DEFAULT_FUEL_CONFIG;
    
    const fuelPerAircraft: AircraftCostBreakdown[] = [];
    let baseFuel = 0;
    
    const originalAircraftCount = plans.length;
    const currentAircraftCount = splitFlights.length > 0 ? splitFlights.length : originalAircraftCount;
    
    for (let i = 0; i < currentAircraftCount; i++) {
      const flight = splitFlights[i];
      const plan = plans[i % plans.length];
      const aircraftType: 'C-17' | 'C-130' = plan?.aircraft_spec.name.includes('C-17') ? 'C-17' : 'C-130';
      const specs = AIRCRAFT_SPECS[aircraftType];
      
      const route = routes[i];
      const distance = route?.total_distance_nm ?? 0;
      const payloadWeight = flight?.total_weight_lb ?? plan?.total_weight ?? 0;
      
      const cruiseTime = distance > 0 ? distance / specs.cruise_speed_kt : 0;
      const totalFlightHours = specs.taxi_time_hr + specs.climb_time_hr + cruiseTime + specs.descent_time_hr;
      
      const taxiFuel = specs.fuel_burn_taxi_lb_hr * specs.taxi_time_hr;
      const climbFuel = specs.fuel_burn_climb_lb_hr * specs.climb_time_hr;
      let cruiseFuel = specs.fuel_burn_cruise_lb_hr * cruiseTime;
      const descentFuel = specs.fuel_burn_descent_lb_hr * specs.descent_time_hr;
      
      const payloadRatio = payloadWeight / specs.max_payload_lb;
      const payloadPenalty = 1 + (payloadRatio * specs.payload_fuel_penalty_factor);
      cruiseFuel = cruiseFuel * payloadPenalty;
      
      const missionFuel = taxiFuel + climbFuel + cruiseFuel + descentFuel;
      const reserveFuel = missionFuel * fuelConfig.reserve_fuel_percent;
      const contingencyFuel = missionFuel * fuelConfig.contingency_fuel_percent;
      const totalFuel = missionFuel + reserveFuel + contingencyFuel;
      
      const fuelCost = totalFuel * fuelConfig.fuel_cost_per_lb;
      const operatingCost = totalFlightHours * specs.operating_cost_per_hr;
      const totalCost = fuelCost + operatingCost;
      
      const fuelEfficiency = distance > 0 ? totalFuel / distance : 0;
      const tonMiles = (payloadWeight / 2000) * distance;
      const costPerTonMile = tonMiles > 0 ? totalCost / tonMiles : 0;
      
      fuelPerAircraft.push({
        aircraft_id: flight?.callsign || plan?.aircraft_id || `Aircraft-${i + 1}`,
        aircraft_type: aircraftType,
        distance_nm: distance,
        flight_hours: totalFlightHours,
        payload_weight_lb: payloadWeight,
        fuel_breakdown: {
          taxi_fuel_lb: taxiFuel,
          climb_fuel_lb: climbFuel,
          cruise_fuel_lb: cruiseFuel,
          descent_fuel_lb: descentFuel,
          reserve_fuel_lb: reserveFuel,
          contingency_fuel_lb: contingencyFuel,
          total_mission_fuel_lb: totalFuel
        },
        fuel_cost_usd: fuelCost,
        operating_cost_usd: operatingCost,
        total_cost_usd: totalCost,
        fuel_efficiency_lb_per_nm: fuelEfficiency,
        cost_per_ton_mile: costPerTonMile
      });
      
      if (i < originalAircraftCount) {
        baseFuel += totalFuel;
      }
    }
    
    const totalFuelLb = fuelPerAircraft.reduce((sum, a) => sum + a.fuel_breakdown.total_mission_fuel_lb, 0);
    const totalFuelCost = fuelPerAircraft.reduce((sum, a) => sum + a.fuel_cost_usd, 0);
    const totalOperatingCost = fuelPerAircraft.reduce((sum, a) => sum + a.operating_cost_usd, 0);
    const totalCost = fuelPerAircraft.reduce((sum, a) => sum + a.total_cost_usd, 0);
    const additionalFuel = Math.max(0, totalFuelLb - baseFuel);
    
    const totalDistance = fuelPerAircraft.reduce((sum, a) => sum + a.distance_nm, 0);
    const avgFuelEfficiency = totalDistance > 0 ? totalFuelLb / totalDistance : 0;
    
    const totalTonMiles = fuelPerAircraft.reduce((sum, a) => {
      return sum + (a.payload_weight_lb / 2000) * a.distance_nm;
    }, 0);
    const avgCostPerTonMile = totalTonMiles > 0 ? totalCost / totalTonMiles : 0;
    
    setFuelBreakdown({
      base_fuel_lb: baseFuel,
      additional_fuel_from_splits: additionalFuel,
      fuel_per_aircraft: fuelPerAircraft,
      cost_per_lb: fuelConfig.fuel_cost_per_lb,
      total_fuel_lb: totalFuelLb,
      total_fuel_cost_usd: totalFuelCost,
      total_operating_cost_usd: totalOperatingCost,
      total_cost_usd: totalCost,
      average_fuel_efficiency_lb_per_nm: avgFuelEfficiency,
      average_cost_per_ton_mile: avgCostPerTonMile,
      fuel_config: fuelConfig
    });
  }, [allocationResult, splitFlights, routes]);

  const saveConfiguration = useCallback(async (name: string) => {
    if (!allocationResult) return;
    
    const config: MissionConfiguration = {
      id: `config-${Date.now()}`,
      name,
      created_at: new Date(),
      updated_at: new Date(),
      status: 'draft',
      allocation_result: allocationResult,
      split_flights: splitFlights,
      routes,
      notes: ''
    };
    
    setSavedConfigurations(prev => [...prev, config]);
    setActiveConfigurationId(config.id);
    
    try {
      const itemCount = allocationResult.total_pallets + 
                        allocationResult.total_rolling_stock + 
                        (allocationResult.total_pax > 0 ? 1 : 0);
      
      const response = await fetch('/api/flight-plans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          name,
          status: 'draft',
          allocation_data: {
            allocation_result: allocationResult,
            split_flights: splitFlights,
            routes
          },
          movement_items_count: Math.max(itemCount, 1),
          total_weight_lb: Math.round(allocationResult.total_weight) || 0,
          aircraft_count: allocationResult.total_aircraft || 1
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to save flight plan:', await response.text());
        return;
      }
      
      const savedPlan = await response.json();
      
      if (splitFlights.length > 0 && savedPlan.id) {
        const schedulesToSave = splitFlights.map(flight => ({
          callsign: flight.callsign,
          aircraft_type: flight.aircraft_type,
          aircraft_id: flight.aircraft_id,
          origin_icao: flight.origin.icao,
          origin_name: flight.origin.name,
          destination_icao: flight.destination.icao,
          destination_name: flight.destination.name,
          scheduled_departure: flight.scheduled_departure.toISOString(),
          scheduled_arrival: flight.scheduled_arrival.toISOString(),
          total_weight_lb: flight.total_weight_lb,
          pax_count: flight.pax_count,
          pallet_count: flight.pallets.length,
          rolling_stock_count: flight.rolling_stock.length,
          center_of_balance_percent: flight.center_of_balance_percent,
          is_modified: flight.is_modified || false
        }));
        
        try {
          const scheduleResponse = await fetch(`/api/flight-plans/${savedPlan.id}/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ schedules: schedulesToSave })
          });
          
          if (!scheduleResponse.ok) {
            console.error('Failed to save flight schedules:', await scheduleResponse.text());
          }
        } catch (scheduleError) {
          console.error('Failed to save flight schedules:', scheduleError);
        }
      }
    } catch (error) {
      console.error('Failed to save flight plan to database:', error);
    }
  }, [allocationResult, splitFlights, routes]);

  const updateConfiguration = useCallback(async (planId: number) => {
    if (!allocationResult) return;
    
    try {
      const itemCount = allocationResult.total_pallets + 
                        allocationResult.total_rolling_stock + 
                        (allocationResult.total_pax > 0 ? 1 : 0);
      
      const response = await fetch(`/api/flight-plans/${planId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          allocation_data: {
            allocation_result: allocationResult,
            split_flights: splitFlights,
            routes
          },
          movement_items_count: Math.max(itemCount, 1),
          total_weight_lb: Math.round(allocationResult.total_weight) || 0,
          aircraft_count: allocationResult.total_aircraft || 1
        }),
      });
      
      if (!response.ok) {
        console.error('Failed to update flight plan:', await response.text());
        return;
      }
      
      if (splitFlights.length > 0) {
        await updatePlanSchedules(planId, splitFlights);
      }
    } catch (error) {
      console.error('Failed to update flight plan:', error);
    }
  }, [allocationResult, splitFlights, routes]);

  const updatePlanSchedules = useCallback(async (planId: number, flights?: SplitFlight[]) => {
    const flightsToSave = flights || splitFlights;
    if (flightsToSave.length === 0) return;
    
    const schedulesToSave = flightsToSave.map(flight => ({
      callsign: flight.callsign,
      aircraft_type: flight.aircraft_type,
      aircraft_id: flight.aircraft_id,
      origin_icao: flight.origin.icao,
      origin_name: flight.origin.name,
      destination_icao: flight.destination.icao,
      destination_name: flight.destination.name,
      scheduled_departure: flight.scheduled_departure.toISOString(),
      scheduled_arrival: flight.scheduled_arrival.toISOString(),
      total_weight_lb: flight.total_weight_lb,
      pax_count: flight.pax_count,
      pallet_count: flight.pallets.length,
      rolling_stock_count: flight.rolling_stock.length,
      center_of_balance_percent: flight.center_of_balance_percent,
      is_modified: flight.is_modified || false
    }));
    
    try {
      const response = await fetch(`/api/flight-plans/${planId}/schedules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ schedules: schedulesToSave })
      });
      
      if (!response.ok) {
        console.error('Failed to update flight schedules:', await response.text());
      }
    } catch (error) {
      console.error('Failed to update flight schedules:', error);
    }
  }, [splitFlights]);

  const loadConfiguration = useCallback((id: string) => {
    const config = savedConfigurations.find(c => c.id === id);
    if (!config) return;
    
    setAllocationResult(config.allocation_result);
    setSplitFlights(config.split_flights);
    setRoutes(config.routes);
    setActiveConfigurationId(id);
  }, [savedConfigurations]);

  const deleteConfiguration = useCallback((id: string) => {
    setSavedConfigurations(prev => prev.filter(c => c.id !== id));
    if (activeConfigurationId === id) {
      setActiveConfigurationId(null);
    }
  }, [activeConfigurationId]);

  const compareConfigurations = useCallback((ids: string[]) => {
    return savedConfigurations.filter(c => ids.includes(c.id));
  }, [savedConfigurations]);

  const resetMission = useCallback(() => {
    setParseResult(null);
    setClassifiedItems(null);
    setAllocationResult(null);
    setInsights(null);
    setSplitFlights([]);
    setRoutes([]);
    setManifestId(null);
    setSelectedAircraftIndex(0);
    setCurrentTab('flights');
    setError(null);
    setActiveConfigurationId(null);
    setAnalytics(null);
    setFuelBreakdown(null);
  }, []);

  const value = useMemo(() => ({
    parseResult,
    classifiedItems,
    allocationResult,
    insights,
    splitFlights,
    routes,
    manifestId,
    selectedAircraft,
    selectedAircraftIndex,
    currentTab,
    isProcessing,
    error,
    savedConfigurations,
    activeConfigurationId,
    analytics,
    fuelBreakdown,
    setParseResult,
    setClassifiedItems,
    setAllocationResult,
    setInsights,
    setSplitFlights,
    setRoutes,
    setManifestId,
    setSelectedAircraft,
    setSelectedAircraftIndex,
    setCurrentTab,
    setIsProcessing,
    setError,
    saveConfiguration,
    updateConfiguration,
    updatePlanSchedules,
    loadConfiguration,
    deleteConfiguration,
    compareConfigurations,
    calculateAnalytics,
    calculateFuelBreakdown,
    resetMission
  }), [
    parseResult, classifiedItems, allocationResult, insights, splitFlights, routes, manifestId,
    selectedAircraft, selectedAircraftIndex, currentTab, isProcessing, error,
    savedConfigurations, activeConfigurationId, analytics, fuelBreakdown,
    saveConfiguration, updateConfiguration, updatePlanSchedules, loadConfiguration, deleteConfiguration, compareConfigurations,
    calculateAnalytics, calculateFuelBreakdown, resetMission
  ]);

  return (
    <MissionContext.Provider value={value}>
      {children}
    </MissionContext.Provider>
  );
}

export default MissionContext;
