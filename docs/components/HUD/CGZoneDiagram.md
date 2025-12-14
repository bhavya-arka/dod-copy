# CGZoneDiagram Component

## Purpose

The `CGZoneDiagram` visualizes the Center of Gravity (CG) position within the C-17 cargo bay. It provides a top-down view of the aircraft with safe, warning, and danger zones, and displays the current CG position in real-time.

## Location

`apps/client/src/components/HUD/CGZoneDiagram.tsx`

## Props Interface

```typescript
interface CGZoneDiagramProps {
  isVisible: boolean;          // Diagram visibility
  centerOfGravityX?: number;   // Lateral CG position (meters)
  centerOfGravityZ?: number;   // Longitudinal CG position (meters)
  balanceScore?: number;       // Balance score percentage (0-100)
}
```

## Constants

### CG Zone Limits
Based on C-17 cargo bay dimensions from `cargoTypes.ts`:

```typescript
const CG_ZONE_LIMITS = {
  // Safe zone: center 50% of cargo bay length
  forwardLimit: -CARGO_BAY_DIMENSIONS.length * 0.25,  // -6.7m
  aftLimit: CARGO_BAY_DIMENSIONS.length * 0.25,       // +6.7m
  leftLimit: -CARGO_BAY_DIMENSIONS.width * 0.4,       // -2.2m
  rightLimit: CARGO_BAY_DIMENSIONS.width * 0.4,       // +2.2m
  
  // Warning zones
  forwardWarningLimit: -CARGO_BAY_DIMENSIONS.length * 0.35,  // -9.38m
  aftWarningLimit: CARGO_BAY_DIMENSIONS.length * 0.35,       // +9.38m
  leftWarningLimit: -CARGO_BAY_DIMENSIONS.width * 0.45,      // -2.475m
  rightWarningLimit: CARGO_BAY_DIMENSIONS.width * 0.45,      // +2.475m
};
```

## Key Features

### SVG Diagram
- Scale: 12 pixels per meter
- Cargo bay outline with rounded corners
- Warning zone (yellow dashed rectangle)
- Safe zone (green solid rectangle)
- Center crosshair lines

### CG Position Indicator
- Animated pulsing circle at CG position
- Crosshair lines at CG location
- Color-coded by zone status

### Zone Status Detection
```typescript
type CGZoneStatus = 'safe' | 'warning' | 'danger';
```
- **Safe**: CG within central safe zone (green)
- **Warning**: CG in warning zone (yellow)
- **Danger**: CG outside warning zone (red)

### Position Data Display
- LATERAL: X position in meters
- LONGITUDINAL: Z position in meters
- BALANCE: Balance score percentage

### Legend
- Safe Zone indicator
- Warning Zone indicator
- Current CG indicator

## Visual Style

- Fixed bottom-center position (`bottom-8 left-1/2`)
- Glass panel with blue border
- Orientation labels: FORWARD, AFT, PORT, STBD
- Status badge with zone name

## Usage Example

```tsx
import CGZoneDiagram from '@/components/HUD/CGZoneDiagram';

function CargoSimulation() {
  const [cgX, setCgX] = useState(0);
  const [cgZ, setCgZ] = useState(0);
  const [balance, setBalance] = useState(100);

  return (
    <CGZoneDiagram
      isVisible={showCGZone}
      centerOfGravityX={cgX}
      centerOfGravityZ={cgZ}
      balanceScore={balance}
    />
  );
}
```

## Dependencies

- `react`
- `framer-motion` - For animations
- `../../lib/cargoTypes` - For CARGO_BAY_DIMENSIONS
