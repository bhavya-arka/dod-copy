/**
 * PACAF Airlift Demo - Flight Split Utilities
 * Functions for calculating flight weights, validating loads, and optimizing placement.
 */

import {
  SplitFlight,
  PalletPlacement,
  AIRCRAFT_SPECS
} from '../types';

export function calculateFlightWeight(flight: SplitFlight): number {
  const palletWeight = flight.pallets.reduce((sum, p) => sum + p.pallet.gross_weight, 0);
  const vehicleWeight = flight.rolling_stock.reduce((sum, v) => sum + v.weight, 0);
  const paxWeight = flight.pax_count * 225; // Standard pax weight with gear
  return palletWeight + vehicleWeight + paxWeight;
}

export function validateFlightLoad(flight: SplitFlight): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const weight = calculateFlightWeight(flight);
  
  const maxPayload = flight.aircraft_type === 'C-17' ? 170900 : 42000;
  const maxPallets = flight.aircraft_type === 'C-17' ? 18 : 6;
  const cobMin = flight.aircraft_type === 'C-17' ? 20 : 18;
  const cobMax = flight.aircraft_type === 'C-17' ? 35 : 33;
  
  if (weight > maxPayload) {
    issues.push(`Overweight: ${weight.toLocaleString()} lbs exceeds ${maxPayload.toLocaleString()} lbs max`);
  }
  
  if (flight.pallets.length > maxPallets) {
    issues.push(`Too many pallets: ${flight.pallets.length} exceeds ${maxPallets} positions`);
  }
  
  if (flight.center_of_balance_percent < cobMin || flight.center_of_balance_percent > cobMax) {
    issues.push(`Center of balance ${flight.center_of_balance_percent.toFixed(1)}% outside safe envelope (${cobMin}-${cobMax}%)`);
  }
  
  return { valid: issues.length === 0, issues };
}

export function calculateFlightCenterOfBalance(flight: SplitFlight): number {
  if (flight.pallets.length === 0 && flight.rolling_stock.length === 0) {
    return 27.5; // Default center
  }
  
  let totalMoment = 0;
  let totalWeight = 0;
  
  flight.pallets.forEach((placement) => {
    totalMoment += placement.pallet.gross_weight * placement.position_coord;
    totalWeight += placement.pallet.gross_weight;
  });
  
  flight.rolling_stock.forEach((vehicle) => {
    totalMoment += vehicle.weight * vehicle.position.z;
    totalWeight += vehicle.weight;
  });
  
  if (totalWeight === 0) return 27.5;
  
  const spec = AIRCRAFT_SPECS[flight.aircraft_type];
  const avgPosition = totalMoment / totalWeight;
  return (avgPosition / spec.cargo_length) * 100;
}

export function estimateWeatherDelay(
  flight: SplitFlight, 
  weatherSystems: Array<{ severity: string; affects_flight_ops: boolean }>
): number {
  let delay = 0;
  
  for (const wx of weatherSystems) {
    if (!wx.affects_flight_ops) continue;
    
    switch (wx.severity) {
      case 'minor':
        delay += 15;
        break;
      case 'moderate':
        delay += 45;
        break;
      case 'severe':
        delay += 120;
        break;
    }
  }
  
  return delay;
}

export function reoptimizePalletPlacement(flight: SplitFlight): SplitFlight {
  if (flight.pallets.length === 0) return flight;
  
  const spec = AIRCRAFT_SPECS[flight.aircraft_type];
  const positionCoords = spec.position_coords;
  const maxMainPositions = flight.aircraft_type === 'C-17' ? 16 : 5;
  const cargoLength = spec.cargo_length;
  const cobMin = flight.aircraft_type === 'C-17' ? 20 : 18;
  const cobMax = flight.aircraft_type === 'C-17' ? 35 : 33;
  const targetCob = (cobMin + cobMax) / 2;
  const targetPosition = (targetCob / 100) * cargoLength;
  
  const sortedPallets = [...flight.pallets].sort((a, b) => 
    b.pallet.gross_weight - a.pallet.gross_weight
  );
  
  const numPallets = sortedPallets.length;
  const maxPositions = Math.min(numPallets, positionCoords.length);
  
  const centerPositionIdx = positionCoords.findIndex(coord => coord >= targetPosition);
  const actualCenterIdx = centerPositionIdx >= 0 ? centerPositionIdx : Math.floor(positionCoords.length / 2);
  
  const selectedIndices: number[] = [];
  let left = actualCenterIdx;
  let right = actualCenterIdx + 1;
  let useLeft = true;
  
  while (selectedIndices.length < maxPositions) {
    if (useLeft && left >= 0) {
      selectedIndices.push(left);
      left--;
    } else if (!useLeft && right < positionCoords.length) {
      selectedIndices.push(right);
      right++;
    } else if (left >= 0) {
      selectedIndices.push(left);
      left--;
    } else if (right < positionCoords.length) {
      selectedIndices.push(right);
      right++;
    } else {
      break;
    }
    useLeft = !useLeft;
  }
  
  selectedIndices.sort((a, b) => a - b);
  
  const optimizedPlacements: PalletPlacement[] = [];
  
  for (let i = 0; i < numPallets && i < selectedIndices.length; i++) {
    const posIdx = selectedIndices[i];
    const pallet = sortedPallets[i];
    
    optimizedPlacements.push({
      pallet: { ...pallet.pallet },
      position_index: posIdx,
      position_coord: positionCoords[posIdx],
      is_ramp: posIdx >= maxMainPositions
    });
  }
  
  optimizedPlacements.sort((a, b) => a.position_index - b.position_index);
  
  const optimizedFlight: SplitFlight = {
    ...flight,
    pallets: optimizedPlacements,
    is_modified: true
  };
  
  optimizedFlight.total_weight_lb = calculateFlightWeight(optimizedFlight);
  optimizedFlight.center_of_balance_percent = calculateFlightCenterOfBalance(optimizedFlight);
  
  return optimizedFlight;
}
