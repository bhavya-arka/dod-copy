# BottomStatusTicker Component

## Purpose

The `BottomStatusTicker` displays mission progress and status messages at the bottom of the simulation interface. It shows real-time progress, status history, and current active operations.

## Location

`apps/client/src/components/HUD/BottomStatusTicker.tsx`

## Props Interface

```typescript
interface BottomStatusTickerProps {
  isVisible: boolean;         // Panel visibility
  isAnimating: boolean;       // Whether optimization is running
  currentStep: string;        // Current operation description
  completionProgress: number; // Progress percentage (0-100)
}
```

## Key Features

### Progress Header
- Yellow pulsing status indicator
- "MISSION STATUS" label
- Animated progress bar (yellow-to-orange gradient)
- Percentage display

### Status History
- Maintains last 5 status messages
- Auto-timestamps each message (HH:MM:SS format)
- Fading opacity for older messages
- Newest message at the top

### Active Status Display
- Shown only when `isAnimating` is true
- Spinning indicator with pulsing animation
- Current step description

## Visual Style

- Fixed bottom position, centered (`bottom-4 left-1/2`)
- Width: 80% of viewport (max 5xl)
- Glass panel with angular styling
- Slide-up animation on enter/exit

## State Management

```typescript
const [statusHistory, setStatusHistory] = useState<string[]>([]);
```

Status history is updated via useEffect when `currentStep` changes:
- Adds timestamp prefix
- Keeps only last 5 messages

## Usage Example

```tsx
import BottomStatusTicker from '@/components/HUD/BottomStatusTicker';

function CargoSimulation() {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');

  return (
    <BottomStatusTicker
      isVisible={showTicker}
      isAnimating={isOptimizing}
      currentStep={currentStep}
      completionProgress={progress}
    />
  );
}
```

## Animation Details

- Entry: Slides up from y=120, scales from 0.9
- Exit: Slides down, scales to 0.9
- Duration: 0.6s with ease-out curve
- Progress bar: 0.8s animated width transition

## Dependencies

- `react`
- `framer-motion` - For animations
