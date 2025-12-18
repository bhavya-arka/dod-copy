export type MixedFleetMode = 'PREFERRED_FIRST' | 'OPTIMIZE_COST' | 'MIN_AIRCRAFT' | 'USER_LOCKED';
export type SolutionStatus = 'FEASIBLE' | 'PARTIAL' | 'INFEASIBLE';

export interface CostParams {
  costPerSortie: number;
  costPerHour: number;
  hoursPerLeg: number;
}

export interface AircraftCostModel {
  [typeId: string]: CostParams;
}

const DEFAULT_COST_MODEL: AircraftCostModel = {
  C17: { costPerSortie: 85000, costPerHour: 15000, hoursPerLeg: 4 },
  C130H: { costPerSortie: 28000, costPerHour: 5500, hoursPerLeg: 3 },
  C130J: { costPerSortie: 32000, costPerHour: 6000, hoursPerLeg: 2.5 },
};

export interface ScoringWeights {
  preference: number;
  cost: number;
  aircraft: number;
}

const POLICY_WEIGHTS: Record<MixedFleetMode, ScoringWeights> = {
  PREFERRED_FIRST: { preference: 0.5, cost: 0.3, aircraft: 0.2 },
  OPTIMIZE_COST: { preference: 0.1, cost: 0.6, aircraft: 0.3 },
  MIN_AIRCRAFT: { preference: 0.1, cost: 0.4, aircraft: 0.5 },
  USER_LOCKED: { preference: 1.0, cost: 0.0, aircraft: 0.0 },
};

export interface FleetCandidate {
  aircraftUsed: Record<string, number>;
  totalCapacity: number;
  totalCost: number;
  totalAircraft: number;
  preferenceScore: number;
}

export interface OptimizationMetrics {
  totalCost: number;
  totalAircraft: number;
  utilization: number;
  cobAverage: number;
}

export interface ComparisonData {
  preferredOnlySolution: {
    status: SolutionStatus;
    aircraftUsed: Record<string, number>;
    totalCost: number;
    totalAircraft: number;
  } | null;
  chosenSolutionRationale: string;
}

export interface OptimizationResult {
  status: SolutionStatus;
  aircraftUsed: Record<string, number>;
  unallocatedCargoIds: string[];
  metrics: OptimizationMetrics;
  explanation: string;
  comparisonData?: ComparisonData;
}

export interface CargoRequirement {
  id: string;
  weightLb: number;
}

export interface AvailabilityConstraint {
  typeId: string;
  count: number;
  locked: boolean;
  maxPayloadLb: number;
}

export interface OptimizationInput {
  cargoRequirements: CargoRequirement[];
  availability: AvailabilityConstraint[];
  preferredTypeId: string | null;
  mode: MixedFleetMode;
  preferenceStrength: number;
}

function calculateFleetCost(aircraftUsed: Record<string, number>, costModel: AircraftCostModel = DEFAULT_COST_MODEL): number {
  let totalCost = 0;
  for (const [typeId, count] of Object.entries(aircraftUsed)) {
    const params = costModel[typeId];
    if (params) {
      const costPerFlight = params.costPerSortie + (params.costPerHour * params.hoursPerLeg);
      totalCost += costPerFlight * count;
    }
  }
  return totalCost;
}

function calculatePreferenceScore(
  aircraftUsed: Record<string, number>,
  preferredTypeId: string | null,
  totalAircraft: number
): number {
  if (!preferredTypeId || totalAircraft === 0) return 1.0;
  const preferredCount = aircraftUsed[preferredTypeId] || 0;
  return preferredCount / totalAircraft;
}

export function generateCandidateFleets(
  totalWeightLb: number,
  availability: AvailabilityConstraint[],
  preferredTypeId: string | null
): FleetCandidate[] {
  const candidates: FleetCandidate[] = [];
  
  const availableTypes = availability.filter(a => a.count > 0 && a.maxPayloadLb > 0);
  
  if (availableTypes.length === 0) {
    return [{
      aircraftUsed: {},
      totalCapacity: 0,
      totalCost: 0,
      totalAircraft: 0,
      preferenceScore: 0,
    }];
  }

  const sortedTypes = [...availableTypes].sort((a, b) => b.maxPayloadLb - a.maxPayloadLb);
  
  const generateMix = (
    index: number,
    remainingWeight: number,
    currentMix: Record<string, number>,
    usedCounts: Record<string, number>
  ) => {
    if (remainingWeight <= 0) {
      const totalAircraft = Object.values(currentMix).reduce((a, b) => a + b, 0);
      const totalCapacity = sortedTypes.reduce(
        (sum, t) => sum + (currentMix[t.typeId] || 0) * t.maxPayloadLb,
        0
      );
      candidates.push({
        aircraftUsed: { ...currentMix },
        totalCapacity,
        totalCost: calculateFleetCost(currentMix),
        totalAircraft,
        preferenceScore: calculatePreferenceScore(currentMix, preferredTypeId, totalAircraft),
      });
      return;
    }

    if (index >= sortedTypes.length) {
      let canFillRemaining = false;
      for (const t of sortedTypes) {
        const used = usedCounts[t.typeId] || 0;
        if (used < t.count) {
          canFillRemaining = true;
          break;
        }
      }
      
      if (!canFillRemaining && Object.keys(currentMix).length > 0) {
        const totalAircraft = Object.values(currentMix).reduce((a, b) => a + b, 0);
        const totalCapacity = sortedTypes.reduce(
          (sum, t) => sum + (currentMix[t.typeId] || 0) * t.maxPayloadLb,
          0
        );
        candidates.push({
          aircraftUsed: { ...currentMix },
          totalCapacity,
          totalCost: calculateFleetCost(currentMix),
          totalAircraft,
          preferenceScore: calculatePreferenceScore(currentMix, preferredTypeId, totalAircraft),
        });
      }
      return;
    }

    const type = sortedTypes[index];
    const maxAvailable = type.count - (usedCounts[type.typeId] || 0);
    const maxNeeded = Math.ceil(remainingWeight / type.maxPayloadLb);
    const maxToUse = Math.min(maxAvailable, maxNeeded);

    for (let count = maxToUse; count >= 0; count--) {
      const newMix = { ...currentMix };
      const newUsed = { ...usedCounts };
      
      if (count > 0) {
        newMix[type.typeId] = (newMix[type.typeId] || 0) + count;
        newUsed[type.typeId] = (newUsed[type.typeId] || 0) + count;
      }
      
      const capacityProvided = count * type.maxPayloadLb;
      generateMix(index + 1, remainingWeight - capacityProvided, newMix, newUsed);
      
      if (candidates.length > 100) break;
    }
  };

  generateMix(0, totalWeightLb, {}, {});

  if (candidates.length === 0) {
    let bestEffortMix: Record<string, number> = {};
    let totalCapacity = 0;
    
    for (const type of sortedTypes) {
      const used = type.count;
      if (used > 0) {
        bestEffortMix[type.typeId] = used;
        totalCapacity += used * type.maxPayloadLb;
      }
    }
    
    const totalAircraft = Object.values(bestEffortMix).reduce((a, b) => a + b, 0);
    candidates.push({
      aircraftUsed: bestEffortMix,
      totalCapacity,
      totalCost: calculateFleetCost(bestEffortMix),
      totalAircraft,
      preferenceScore: calculatePreferenceScore(bestEffortMix, preferredTypeId, totalAircraft),
    });
  }

  return candidates;
}

export function scoreSolution(
  candidate: FleetCandidate,
  mode: MixedFleetMode,
  totalWeightLb: number,
  maxPossibleCost: number,
  maxPossibleAircraft: number
): number {
  const weights = POLICY_WEIGHTS[mode];
  
  const costScore = maxPossibleCost > 0 ? 1 - (candidate.totalCost / maxPossibleCost) : 1;
  const aircraftScore = maxPossibleAircraft > 0 ? 1 - (candidate.totalAircraft / maxPossibleAircraft) : 1;
  
  const utilization = totalWeightLb > 0 && candidate.totalCapacity > 0
    ? Math.min(1, totalWeightLb / candidate.totalCapacity)
    : 0;
  
  const adjustedPreferenceScore = candidate.preferenceScore;
  
  const score = 
    (weights.preference * adjustedPreferenceScore) +
    (weights.cost * Math.max(0, costScore)) +
    (weights.aircraft * Math.max(0, aircraftScore)) +
    (0.1 * utilization);
  
  return score;
}

export function runOptimization(input: OptimizationInput): OptimizationResult {
  const { cargoRequirements, availability, preferredTypeId, mode, preferenceStrength } = input;
  
  const totalWeightLb = cargoRequirements.reduce((sum, c) => sum + c.weightLb, 0);
  const cargoIds = cargoRequirements.map(c => c.id);
  
  if (totalWeightLb === 0) {
    return {
      status: 'FEASIBLE',
      aircraftUsed: {},
      unallocatedCargoIds: [],
      metrics: {
        totalCost: 0,
        totalAircraft: 0,
        utilization: 0,
        cobAverage: 0,
      },
      explanation: 'No cargo to allocate.',
    };
  }

  const candidates = generateCandidateFleets(totalWeightLb, availability, preferredTypeId);
  
  if (candidates.length === 0) {
    return {
      status: 'INFEASIBLE',
      aircraftUsed: {},
      unallocatedCargoIds: cargoIds,
      metrics: {
        totalCost: 0,
        totalAircraft: 0,
        utilization: 0,
        cobAverage: 0,
      },
      explanation: 'No aircraft available to carry cargo.',
    };
  }

  const maxCost = Math.max(...candidates.map(c => c.totalCost), 1);
  const maxAircraft = Math.max(...candidates.map(c => c.totalAircraft), 1);

  let bestCandidate = candidates[0];
  let bestScore = scoreSolution(bestCandidate, mode, totalWeightLb, maxCost, maxAircraft);
  
  for (const candidate of candidates.slice(1)) {
    const score = scoreSolution(candidate, mode, totalWeightLb, maxCost, maxAircraft);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  let preferredOnlySolution: {
    status: SolutionStatus;
    aircraftUsed: Record<string, number>;
    totalCost: number;
    totalAircraft: number;
  } | null = null;
  if (preferredTypeId && mode !== 'PREFERRED_FIRST') {
    const preferredOnlyCandidates = candidates.filter(c => {
      const types = Object.keys(c.aircraftUsed);
      return types.length === 1 && types[0] === preferredTypeId;
    });
    
    if (preferredOnlyCandidates.length > 0) {
      const bestPreferred = preferredOnlyCandidates.reduce((best, c) => 
        c.totalCapacity >= totalWeightLb && c.totalCost < best.totalCost ? c : best
      , preferredOnlyCandidates[0]);
      
      if (bestPreferred.totalCapacity >= totalWeightLb) {
        preferredOnlySolution = {
          status: 'FEASIBLE' as SolutionStatus,
          aircraftUsed: bestPreferred.aircraftUsed,
          totalCost: bestPreferred.totalCost,
          totalAircraft: bestPreferred.totalAircraft,
        };
      }
    }
  }

  const isFeasible = bestCandidate.totalCapacity >= totalWeightLb;
  const status: SolutionStatus = isFeasible ? 'FEASIBLE' : 
    bestCandidate.totalAircraft > 0 ? 'PARTIAL' : 'INFEASIBLE';

  const unallocatedWeight = Math.max(0, totalWeightLb - bestCandidate.totalCapacity);
  let unallocatedCargoIds: string[] = [];
  
  if (unallocatedWeight > 0) {
    let weightToRemove = unallocatedWeight;
    const sortedCargo = [...cargoRequirements].sort((a, b) => b.weightLb - a.weightLb);
    for (const cargo of sortedCargo) {
      if (weightToRemove <= 0) break;
      unallocatedCargoIds.push(cargo.id);
      weightToRemove -= cargo.weightLb;
    }
  }

  const utilization = bestCandidate.totalCapacity > 0 
    ? (totalWeightLb - unallocatedWeight) / bestCandidate.totalCapacity 
    : 0;

  const explanation = generateExplanation(
    status,
    bestCandidate,
    mode,
    preferredTypeId,
    totalWeightLb,
    unallocatedCargoIds.length
  );

  const comparisonData: ComparisonData | undefined = preferredOnlySolution ? {
    preferredOnlySolution,
    chosenSolutionRationale: generateRationale(bestCandidate, preferredOnlySolution, mode),
  } : undefined;

  return {
    status,
    aircraftUsed: bestCandidate.aircraftUsed,
    unallocatedCargoIds,
    metrics: {
      totalCost: bestCandidate.totalCost,
      totalAircraft: bestCandidate.totalAircraft,
      utilization: Math.round(utilization * 100) / 100,
      cobAverage: utilization,
    },
    explanation,
    comparisonData,
  };
}

function generateExplanation(
  status: SolutionStatus,
  candidate: FleetCandidate,
  mode: MixedFleetMode,
  preferredTypeId: string | null,
  totalWeightLb: number,
  unallocatedCount: number
): string {
  const aircraftList = Object.entries(candidate.aircraftUsed)
    .map(([type, count]) => `${count}x ${type}`)
    .join(', ');
  
  const costStr = `$${candidate.totalCost.toLocaleString()}`;
  
  if (status === 'INFEASIBLE') {
    return 'Unable to allocate cargo with available aircraft fleet.';
  }
  
  if (status === 'PARTIAL') {
    return `Partial allocation using ${aircraftList} (${candidate.totalAircraft} aircraft) for ${costStr}. ` +
      `${unallocatedCount} cargo items remain unallocated due to capacity constraints.`;
  }

  let modeDescription = '';
  switch (mode) {
    case 'PREFERRED_FIRST':
      modeDescription = preferredTypeId 
        ? `Prioritizing ${preferredTypeId} per preference settings.`
        : 'Using preferred aircraft first policy.';
      break;
    case 'OPTIMIZE_COST':
      modeDescription = 'Optimizing for lowest total cost.';
      break;
    case 'MIN_AIRCRAFT':
      modeDescription = 'Minimizing total aircraft count.';
      break;
    case 'USER_LOCKED':
      modeDescription = 'Using user-locked aircraft assignments.';
      break;
  }

  return `Optimal fleet: ${aircraftList} (${candidate.totalAircraft} total) for ${costStr}. ${modeDescription}`;
}

function generateRationale(
  chosen: FleetCandidate,
  preferredOnly: { totalCost: number; totalAircraft: number },
  mode: MixedFleetMode
): string {
  const costDiff = preferredOnly.totalCost - chosen.totalCost;
  const aircraftDiff = preferredOnly.totalAircraft - chosen.totalAircraft;
  
  if (costDiff === 0 && aircraftDiff === 0) {
    return 'Mixed fleet solution matches preferred-only solution.';
  }

  const parts: string[] = [];
  
  if (costDiff > 0) {
    parts.push(`saves $${costDiff.toLocaleString()}`);
  } else if (costDiff < 0) {
    parts.push(`costs $${Math.abs(costDiff).toLocaleString()} more`);
  }
  
  if (aircraftDiff > 0) {
    parts.push(`uses ${aircraftDiff} fewer aircraft`);
  } else if (aircraftDiff < 0) {
    parts.push(`uses ${Math.abs(aircraftDiff)} more aircraft`);
  }

  const modeText = mode === 'OPTIMIZE_COST' ? 'cost optimization' :
    mode === 'MIN_AIRCRAFT' ? 'aircraft minimization' : 'preference settings';

  return `Chosen solution ${parts.join(' and ')} compared to preferred-only option, based on ${modeText} policy.`;
}
