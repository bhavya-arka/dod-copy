/**
 * @arka/utils - Solver Module
 * 
 * Aircraft allocation, palletization, edge case handling, and flight utilities.
 */

export {
  validatePrebuiltPallet,
  resetPalletCounter,
  palletizeLooseItems,
  processPalletization,
  type PalletizationResult
} from './palletizationEngine';

export {
  calculateCenterOfBalance,
  solveAircraftAllocation,
  quickEstimateAircraft,
  calculateMinimumAircraft,
  type SolverInput
} from './aircraftSolver';

export * from './edgeCaseHandler';

export {
  calculateFlightWeight,
  validateFlightLoad,
  calculateFlightCenterOfBalance,
  estimateWeatherDelay,
  reoptimizePalletPlacement
} from './flightSplitUtils';
