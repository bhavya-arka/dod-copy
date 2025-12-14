# cargoTypes - Cargo Type Definitions

## Purpose

Simple cargo types and dimension constants for the 3D cargo loading simulation. Defines cargo item structure and C-17 cargo bay dimensions.

## Location

`apps/client/src/lib/cargoTypes.ts`

## Exported Types

### CargoType (Enum)
```typescript
enum CargoType {
  PALLET = 'pallet',
  HUMVEE = 'humvee'
}
```

### CargoItem
```typescript
interface CargoItem {
  id: string;
  type: CargoType;
  dimensions: {
    width: number;   // meters
    height: number;  // meters
    length: number;  // meters
  };
  position: [number, number, number];  // [x, y, z] in meters
  rotation: [number, number, number];  // [rx, ry, rz] in radians
  color: string;
}
```

## Constants

### CARGO_BAY_DIMENSIONS
C-17 cargo bay dimensions in meters:
```typescript
const CARGO_BAY_DIMENSIONS = {
  width: 5.5,    // 18 feet
  height: 4.1,   // 13.5 feet  
  length: 26.8   // 88 feet
}
```

### CARGO_DIMENSIONS
Standard cargo dimensions by type in meters:
```typescript
const CARGO_DIMENSIONS = {
  [CargoType.PALLET]: {
    width: 2.24,   // 88 inches
    height: 1.73,  // 68 inches (with cargo)
    length: 2.74   // 108 inches
  },
  [CargoType.HUMVEE]: {
    width: 2.3,    // ~7.5 feet
    height: 1.8,   // ~6 feet
    length: 4.5    // ~15 feet
  }
}
```

## Usage Example

```typescript
import { 
  CargoType, 
  CargoItem, 
  CARGO_BAY_DIMENSIONS,
  CARGO_DIMENSIONS 
} from '@/lib/cargoTypes';

// Create a new pallet
const pallet: CargoItem = {
  id: 'pallet-001',
  type: CargoType.PALLET,
  dimensions: CARGO_DIMENSIONS[CargoType.PALLET],
  position: [0, 0, 5],
  rotation: [0, 0, 0],
  color: '#4a90d9'
};

// Check if cargo fits in bay
const fitsInBay = (item: CargoItem): boolean => {
  return item.dimensions.width <= CARGO_BAY_DIMENSIONS.width &&
         item.dimensions.height <= CARGO_BAY_DIMENSIONS.height &&
         item.dimensions.length <= CARGO_BAY_DIMENSIONS.length;
};

// Get bay volume
const bayVolume = CARGO_BAY_DIMENSIONS.width * 
                  CARGO_BAY_DIMENSIONS.height * 
                  CARGO_BAY_DIMENSIONS.length;
// ~604.36 cubic meters
```

## Related Files

- `CGZoneDiagram.tsx` - Uses CARGO_BAY_DIMENSIONS for CG zone visualization
- `LoadPlan3DViewer.tsx` - Uses dimensions for 3D cargo rendering
