import * as THREE from 'three';

export interface VehicleDimension {
  length: number;
  width: number;
  height: number;
  name: string;
}

export type VehicleCode = keyof typeof VEHICLE_DIMENSIONS;

export const VEHICLE_DIMENSIONS = {
  LMTV: { length: 22, width: 8, height: 10, name: 'Light Medium Tactical Vehicle' },
  FMTV_5T: { length: 24, width: 8, height: 10, name: 'Family of Medium Tactical Vehicles 5-Ton' },
  HEMTT_CARGO: { length: 33, width: 8.5, height: 10.5, name: 'Heavy Expanded Mobility Tactical Truck' },
  HEMTT_TANKER: { length: 33, width: 8.5, height: 11, name: 'HEMTT Fuel Tanker' },
  HET: { length: 55, width: 12, height: 12.5, name: 'Heavy Equipment Transporter' },
  MTVR: { length: 27, width: 8.5, height: 11, name: 'Medium Tactical Vehicle Replacement' },
  PLS: { length: 32, width: 8.5, height: 11, name: 'Palletized Load System' },
  M915A5: { length: 24, width: 8, height: 10.5, name: 'M915A5 Truck Tractor' },
  HMMWV: { length: 15, width: 7, height: 6, name: 'High Mobility Multipurpose Wheeled Vehicle' },

  C17: { length: 174, width: 170, height: 55, name: 'C-17 Globemaster III' },
  C130: { length: 98, width: 132, height: 38, name: 'C-130 Hercules' },

  LMSR: { length: 950, width: 105, height: 195, name: 'Large Medium-Speed Roll-on/Roll-off' },
  TAO: { length: 677, width: 97, height: 130, name: 'Fleet Oiler' },
  TAKR: { length: 946, width: 106, height: 195, name: 'Fast Sealift Ship' },
} as const;

export const VEHICLE_CATEGORIES = {
  LAND: ['LMTV', 'FMTV_5T', 'HEMTT_CARGO', 'HEMTT_TANKER', 'HET', 'MTVR', 'PLS', 'M915A5', 'HMMWV'] as VehicleCode[],
  AIR: ['C17', 'C130'] as VehicleCode[],
  SEA: ['LMSR', 'TAO', 'TAKR'] as VehicleCode[],
} as const;

export const VEHICLE_COLORS: Record<string, string> = {
  LMTV: '#556B2F',
  FMTV_5T: '#556B2F',
  HEMTT_CARGO: '#556B2F',
  HEMTT_TANKER: '#708090',
  HET: '#2F4F4F',
  MTVR: '#556B2F',
  PLS: '#556B2F',
  M915A5: '#556B2F',
  HMMWV: '#556B2F',
  C17: '#A9A9A9',
  C130: '#A9A9A9',
  LMSR: '#4682B4',
  TAO: '#4682B4',
  TAKR: '#4682B4',
};

export const ftToM = (ft: number): number => ft * 0.3048;

export const mToFt = (m: number): number => m / 0.3048;

export const inToM = (inches: number): number => inches * 0.0254;

export const mToIn = (m: number): number => m / 0.0254;

export interface VehicleScale {
  x: number;
  y: number;
  z: number;
}

export function getVehicleDimensions(vehicleCode: string): VehicleDimension | null {
  const code = vehicleCode.toUpperCase() as VehicleCode;
  return VEHICLE_DIMENSIONS[code] || null;
}

export function getVehicleScale(vehicleCode: string, scaleFactor = 1): VehicleScale | null {
  const dims = getVehicleDimensions(vehicleCode);
  if (!dims) return null;

  return {
    x: ftToM(dims.width) * scaleFactor,
    y: ftToM(dims.height) * scaleFactor,
    z: ftToM(dims.length) * scaleFactor,
  };
}

export function getVehicleScaleVector(vehicleCode: string, scaleFactor = 1): THREE.Vector3 | null {
  const scale = getVehicleScale(vehicleCode, scaleFactor);
  if (!scale) return null;
  return new THREE.Vector3(scale.x, scale.y, scale.z);
}

export const FORMATION = {
  LONGITUDINAL_GAP_MULTIPLIER: 1.5,
  LATERAL_GAP_MULTIPLIER: 1.2,
  TERRAIN_OFFSET_M: 0.05,
  MIN_SPACING_M: 2,
  CONVOY_COLUMN_WIDTH: 3,
} as const;

export interface FormationConfig {
  longitudinalGap?: number;
  lateralGap?: number;
  columns?: number;
  terrainOffset?: number;
}

export function calculateFormationSpacing(
  vehicleCode: string,
  config: FormationConfig = {}
): { longitudinal: number; lateral: number } | null {
  const dims = getVehicleDimensions(vehicleCode);
  if (!dims) return null;

  const longitudinalMultiplier = config.longitudinalGap ?? FORMATION.LONGITUDINAL_GAP_MULTIPLIER;
  const lateralMultiplier = config.lateralGap ?? FORMATION.LATERAL_GAP_MULTIPLIER;

  return {
    longitudinal: Math.max(ftToM(dims.length) * longitudinalMultiplier, FORMATION.MIN_SPACING_M),
    lateral: Math.max(ftToM(dims.width) * lateralMultiplier, FORMATION.MIN_SPACING_M),
  };
}

export function getVehicleCategory(vehicleCode: string): 'LAND' | 'AIR' | 'SEA' | null {
  const code = vehicleCode.toUpperCase() as VehicleCode;
  if (VEHICLE_CATEGORIES.LAND.includes(code)) return 'LAND';
  if (VEHICLE_CATEGORIES.AIR.includes(code)) return 'AIR';
  if (VEHICLE_CATEGORIES.SEA.includes(code)) return 'SEA';
  return null;
}

export function getVehicleColor(vehicleCode: string): string {
  const code = vehicleCode.toUpperCase();
  return VEHICLE_COLORS[code] || '#556B2F';
}

export function isValidVehicleCode(code: string): code is VehicleCode {
  return code.toUpperCase() in VEHICLE_DIMENSIONS;
}

export function getAllVehicleCodes(): VehicleCode[] {
  return Object.keys(VEHICLE_DIMENSIONS) as VehicleCode[];
}

export function getVehiclesByCategory(category: 'LAND' | 'AIR' | 'SEA'): VehicleCode[] {
  return VEHICLE_CATEGORIES[category];
}
