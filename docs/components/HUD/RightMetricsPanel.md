# RightMetricsPanel Component

## Purpose

The `RightMetricsPanel` displays real-time cargo bay metrics, utilization statistics, optimization scores, and tactical briefing information during the C-17 cargo simulation.

## Location

`apps/client/src/components/HUD/RightMetricsPanel.tsx`

## Props Interface

```typescript
interface RightMetricsPanelProps {
  isVisible: boolean;                    // Panel visibility
  isMinimized: boolean;                  // Collapsed state
  onToggleMinimize: () => void;          // Toggle minimize
  volumeUtilization: number;             // Bay utilization percentage (0-100)
  totalItems: number;                    // Total cargo items
  palletCount: number;                   // Number of pallets
  humveeCount: number;                   // Number of humvees
  estimatedVolume: number;               // Current cargo volume in M³
  isOptimal: boolean;                    // Whether load is optimal
  optimizationScore?: number;            // Optimization score (0-100)
  freeSpace?: number;                    // Free space in M³
  weightDistribution?: number;           // Weight distribution score
  balanceScore?: number;                 // Balance score percentage
  currentOptimizationStep?: OptimizationStep | null;  // Current step details
}
```

## Internal Types

```typescript
interface OptimizationStep {
  stepId: number;
  description: string;
  cargoId: string;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
  rotation: [number, number, number];
  reasoning: string;
}
```

## Key Features

### Bay Utilization
- Animated progress bar with color coding:
  - Green: < 70%
  - Yellow: 70-90%
  - Red: > 90%
- Volume display (current / 858 M³ capacity)

### Cargo Manifest
- 463L Pallets count
- M1114 Humvees count
- Total items summary

### Efficiency Status
- Status indicator: OPTIMAL, SUBOPTIMAL, CRITICAL
- Color-coded status badge

### Enhanced Optimization Metrics (when optimizationScore > 0)
- Optimization score with progress bar
- Free space analysis
- Weight distribution percentage
- Balance score percentage
- Current optimization step details

### Tactical Briefing
- Context-aware tips based on utilization level
- Animated tip cards with icons

## Internal Components

### AnimatedCounter
Smooth number animation component:
```typescript
const AnimatedCounter = ({ value, duration = 500 }: { value: number; duration?: number }) => { ... }
```

## Visual Style

- Fixed right sidebar (`right-4 top-20 bottom-8`)
- Collapsible (50px minimized, 260px expanded)
- Glass panel with angular styling
- Animated counters for smooth value transitions

## Usage Example

```tsx
import RightMetricsPanel from '@/components/HUD/RightMetricsPanel';

function CargoSimulation() {
  return (
    <RightMetricsPanel
      isVisible={true}
      isMinimized={false}
      onToggleMinimize={() => setMinimized(!minimized)}
      volumeUtilization={65}
      totalItems={7}
      palletCount={5}
      humveeCount={2}
      estimatedVolume={557.7}
      isOptimal={true}
      optimizationScore={85}
      freeSpace={300.3}
      weightDistribution={92}
      balanceScore={88}
      currentOptimizationStep={null}
    />
  );
}
```

## Dependencies

- `react`
- `framer-motion` - For animations
