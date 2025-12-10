export enum CargoType {
  PALLET = 'pallet',
  HUMVEE = 'humvee'
}

export interface CargoItem {
  id: string;
  type: CargoType;
  dimensions: {
    width: number;
    height: number;
    length: number;
  };
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
}

// C-17 cargo bay dimensions (approximate, in meters)
export const CARGO_BAY_DIMENSIONS = {
  width: 5.5,   // 18 feet
  height: 4.1,  // 13.5 feet  
  length: 26.8  // 88 feet
};

// Standard cargo dimensions
export const CARGO_DIMENSIONS = {
  [CargoType.PALLET]: {
    width: 2.24,  // 88 inches
    height: 1.73, // 68 inches (with cargo)
    length: 2.74  // 108 inches
  },
  [CargoType.HUMVEE]: {
    width: 2.3,   // ~7.5 feet
    height: 1.8,  // ~6 feet
    length: 4.5   // ~15 feet
  }
};
