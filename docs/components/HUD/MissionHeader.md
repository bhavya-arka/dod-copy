# MissionHeader Component

## Purpose

The `MissionHeader` component displays a fixed header at the top of the C-17 cargo simulation interface. It provides a real-time summary of cargo counts, mission status, and navigation controls.

## Location

`apps/client/src/components/HUD/MissionHeader.tsx`

## Props Interface

```typescript
interface MissionHeaderProps {
  palletCount: number;        // Number of 463L pallets loaded
  humveeCount: number;        // Number of M1114 Humvees loaded
  totalItems: number;         // Total cargo items
  missionStatus: string;      // Current status: 'ACTIVE' | 'PAUSED' | 'COMPLETE' | 'READY'
  isAnimating?: boolean;      // Whether cargo optimization is running
  onBackToSelection?: () => void;  // Callback for back navigation
}
```

## Key Features

1. **Animated Entry**: Uses Framer Motion for smooth slide-in animation from top
2. **Back Navigation**: Optional back button when `onBackToSelection` is provided
3. **Cargo Summary Display**:
   - Pallet count (PLT) with blue indicator
   - Humvee count (HMV) with green indicator
   - Total items (TOT) with yellow indicator
4. **Mission Status Indicator**: Color-coded status badge (hidden during animation)
   - Green: ACTIVE
   - Yellow: PAUSED
   - Blue: COMPLETE

## Visual Style

- Fixed position at top-left (`top-2 left-4`)
- Glass panel with angular styling
- Military-style typography
- Glow effects on status indicators

## Usage Example

```tsx
import MissionHeader from '@/components/HUD/MissionHeader';

function CargoSimulation() {
  return (
    <MissionHeader
      palletCount={5}
      humveeCount={2}
      totalItems={7}
      missionStatus="ACTIVE"
      isAnimating={false}
      onBackToSelection={() => navigate('/selection')}
    />
  );
}
```

## Dependencies

- `react`
- `framer-motion` - For animations
