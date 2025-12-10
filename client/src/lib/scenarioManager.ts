/**
 * Scenario Management
 * Handles saving, loading, and comparing load planning scenarios
 * Supports what-if analysis and rapid re-planning
 */

import { AllocationResult, AircraftType, ClassifiedItems } from './pacafTypes';
import { SplitFlight } from './flightSplitTypes';
import { FlightRoute } from './routeTypes';

// ============================================================================
// SCENARIO TYPES
// ============================================================================

export interface ScenarioRules {
  max_acl_fraction: number;
  allow_mixed_hazmat_pax: boolean;
  advon_first: boolean;
  balance_loads: boolean;
}

export interface Scenario {
  scenario_id: string;
  name: string;
  created_at: Date;
  updated_at: Date;
  aircraft_mix: Record<AircraftType, number>;
  rules: ScenarioRules;
  results?: AllocationResult;
  split_flights?: SplitFlight[];
  routes?: FlightRoute[];
  metrics?: ScenarioMetrics;
}

export interface ScenarioMetrics {
  total_aircraft: number;
  total_weight_lb: number;
  avg_utilization_percent: number;
  min_utilization_percent: number;
  max_utilization_percent: number;
  cob_violations: number;
  hazmat_flights: number;
  estimated_fuel_lb?: number;
  estimated_flight_hours?: number;
}

export interface ScenarioComparison {
  scenario_a_id: string;
  scenario_b_id: string;
  aircraft_delta: number;
  weight_delta: number;
  utilization_delta: number;
  fuel_delta?: number;
  time_delta?: number;
  summary_text: string;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

export const DEFAULT_RULES: ScenarioRules = {
  max_acl_fraction: 0.95,
  allow_mixed_hazmat_pax: false,
  advon_first: true,
  balance_loads: true
};

// ============================================================================
// SCENARIO MANAGEMENT
// ============================================================================

let scenarios: Map<string, Scenario> = new Map();
let currentScenarioId: string | null = null;

export function generateScenarioId(): string {
  return `SCN-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

export function createScenario(
  name: string,
  aircraftMix: Record<AircraftType, number> = { 'C-17': 0, 'C-130': 0 },
  rules: Partial<ScenarioRules> = {}
): Scenario {
  const scenario: Scenario = {
    scenario_id: generateScenarioId(),
    name,
    created_at: new Date(),
    updated_at: new Date(),
    aircraft_mix: aircraftMix,
    rules: { ...DEFAULT_RULES, ...rules }
  };
  
  scenarios.set(scenario.scenario_id, scenario);
  return scenario;
}

export function getScenario(scenarioId: string): Scenario | undefined {
  return scenarios.get(scenarioId);
}

export function updateScenario(
  scenarioId: string,
  updates: Partial<Omit<Scenario, 'scenario_id' | 'created_at'>>
): Scenario | null {
  const existing = scenarios.get(scenarioId);
  if (!existing) return null;
  
  const updated: Scenario = {
    ...existing,
    ...updates,
    updated_at: new Date()
  };
  
  scenarios.set(scenarioId, updated);
  return updated;
}

export function duplicateScenario(scenarioId: string, newName?: string): Scenario | null {
  const original = scenarios.get(scenarioId);
  if (!original) return null;
  
  const duplicate: Scenario = {
    ...original,
    scenario_id: generateScenarioId(),
    name: newName || `${original.name} (Copy)`,
    created_at: new Date(),
    updated_at: new Date()
  };
  
  scenarios.set(duplicate.scenario_id, duplicate);
  return duplicate;
}

export function deleteScenario(scenarioId: string): boolean {
  return scenarios.delete(scenarioId);
}

export function listScenarios(): Scenario[] {
  return Array.from(scenarios.values()).sort(
    (a, b) => b.updated_at.getTime() - a.updated_at.getTime()
  );
}

export function setCurrentScenario(scenarioId: string | null): void {
  currentScenarioId = scenarioId;
}

export function getCurrentScenario(): Scenario | null {
  if (!currentScenarioId) return null;
  return scenarios.get(currentScenarioId) || null;
}

// ============================================================================
// METRICS CALCULATION
// ============================================================================

export function calculateScenarioMetrics(result: AllocationResult): ScenarioMetrics {
  const utilizations = result.load_plans.map(p => p.payload_used_percent);
  const avgUtil = utilizations.length > 0 
    ? utilizations.reduce((a, b) => a + b, 0) / utilizations.length 
    : 0;
  
  const cobViolations = result.load_plans.filter(p => !p.cob_in_envelope).length;
  const hazmatFlights = result.load_plans.filter(p => 
    p.pallets.some(pl => pl.pallet.hazmat_flag) || 
    p.rolling_stock.some(v => v.item.hazmat_flag)
  ).length;
  
  return {
    total_aircraft: result.total_aircraft,
    total_weight_lb: result.total_weight,
    avg_utilization_percent: Math.round(avgUtil * 10) / 10,
    min_utilization_percent: Math.round(Math.min(...utilizations) * 10) / 10,
    max_utilization_percent: Math.round(Math.max(...utilizations) * 10) / 10,
    cob_violations: cobViolations,
    hazmat_flights: hazmatFlights
  };
}

// ============================================================================
// SCENARIO COMPARISON
// ============================================================================

export function compareScenarios(
  scenarioAId: string,
  scenarioBId: string
): ScenarioComparison | null {
  const a = scenarios.get(scenarioAId);
  const b = scenarios.get(scenarioBId);
  
  if (!a?.metrics || !b?.metrics) return null;
  
  const aircraftDelta = b.metrics.total_aircraft - a.metrics.total_aircraft;
  const weightDelta = b.metrics.total_weight_lb - a.metrics.total_weight_lb;
  const utilizationDelta = b.metrics.avg_utilization_percent - a.metrics.avg_utilization_percent;
  
  const parts: string[] = [];
  
  if (aircraftDelta !== 0) {
    parts.push(`Aircraft: ${a.metrics.total_aircraft} → ${b.metrics.total_aircraft} (${aircraftDelta > 0 ? '+' : ''}${aircraftDelta})`);
  }
  
  if (Math.abs(utilizationDelta) > 1) {
    parts.push(`Utilization: ${a.metrics.avg_utilization_percent.toFixed(0)}% → ${b.metrics.avg_utilization_percent.toFixed(0)}%`);
  }
  
  const fuelDelta = a.metrics.estimated_fuel_lb && b.metrics.estimated_fuel_lb
    ? b.metrics.estimated_fuel_lb - a.metrics.estimated_fuel_lb
    : undefined;
  
  if (fuelDelta !== undefined) {
    const fuelPct = (fuelDelta / (a.metrics.estimated_fuel_lb || 1)) * 100;
    parts.push(`Est. fuel: ${fuelPct > 0 ? '+' : ''}${fuelPct.toFixed(1)}%`);
  }
  
  return {
    scenario_a_id: scenarioAId,
    scenario_b_id: scenarioBId,
    aircraft_delta: aircraftDelta,
    weight_delta: weightDelta,
    utilization_delta: utilizationDelta,
    fuel_delta: fuelDelta,
    summary_text: parts.length > 0 ? parts.join('\n') : 'No significant differences'
  };
}

// ============================================================================
// PERSISTENCE (Local Storage)
// ============================================================================

const STORAGE_KEY = 'arka_scenarios';

export function saveScenarios(): void {
  try {
    const data = Array.from(scenarios.entries()).map(([id, scenario]) => ({
      ...scenario,
      created_at: scenario.created_at.toISOString(),
      updated_at: scenario.updated_at.toISOString()
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('Failed to save scenarios:', error);
  }
}

export function loadScenarios(): void {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return;
    
    const parsed = JSON.parse(data);
    scenarios = new Map(
      parsed.map((s: Scenario & { created_at: string; updated_at: string }) => [
        s.scenario_id,
        {
          ...s,
          created_at: new Date(s.created_at),
          updated_at: new Date(s.updated_at)
        }
      ])
    );
  } catch (error) {
    console.error('Failed to load scenarios:', error);
  }
}

export function clearScenarios(): void {
  scenarios.clear();
  localStorage.removeItem(STORAGE_KEY);
}

// ============================================================================
// AUTO-SAVE
// ============================================================================

export function getLastScenario(): Scenario | null {
  const list = listScenarios();
  return list.length > 0 ? list[0] : null;
}

export function autoSaveScenario(
  name: string,
  result: AllocationResult,
  splitFlights?: SplitFlight[],
  routes?: FlightRoute[]
): Scenario {
  const scenario = createScenario(name, {
    [result.aircraft_type]: result.total_aircraft
  } as Record<AircraftType, number>);
  
  updateScenario(scenario.scenario_id, {
    results: result,
    split_flights: splitFlights,
    routes: routes,
    metrics: calculateScenarioMetrics(result)
  });
  
  saveScenarios();
  return scenario;
}
