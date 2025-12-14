# LeftControlPanel Component

## Purpose

The `LeftControlPanel` provides cockpit-style simulation controls for the C-17 cargo loading simulation. It includes simulation controls, cargo management, speed adjustment, and tactical briefing alerts.

## Location

`apps/client/src/components/HUD/LeftControlPanel.tsx`

## Props Interface

```typescript
interface LeftControlPanelProps {
  isVisible: boolean;                    // Panel visibility
  isMinimized: boolean;                  // Whether panel is collapsed
  onToggleMinimize: () => void;          // Toggle minimize state
  isAnimating: boolean;                  // Whether simulation is running
  animationSpeed: number;                // Current speed multiplier (0.5-2.0)
  setAnimationSpeed: (speed: number) => void;  // Speed setter
  allowRotation: boolean;                // Allow cargo rotation option
  setAllowRotation: (allow: boolean) => void;
  showCGZone: boolean;                   // Show CG zone diagram option
  setShowCGZone: (show: boolean) => void;
  onStart: () => void;                   // Start simulation
  onPause: () => void;                   // Pause simulation
  onReset: () => void;                   // Reset simulation
  onAddPallet: () => void;               // Add pallet callback
  onAddHumvee: () => void;               // Add humvee callback
  missionStatus: string;                 // Current mission status
}
```

## Key Features

### Tab Navigation
- **CTRL (Control)**: Simulation controls and options
- **CARGO**: Cargo inventory and add cargo buttons
- **BRIEF (Tactical)**: Tactical briefing alerts

### Control Tab
- Mission status indicator with pulse animation
- START/PAUSE/RESET buttons with enable/disable states
- Speed control knob (SVG dial, 0.5x - 2.0x)
- Toggle switches for rotation and CG zone display

### Cargo Tab
- Pallet and Humvee count display with icons
- Add 463L Pallet button
- Add M1114 Humvee button

### Tactical Tab
- Auto-generated tactical alerts based on cargo configuration
- Alert types: info, warning, error with color coding

## Internal Components

### AlertMessage
```typescript
interface AlertMessageProps {
  message: string;
  type: 'info' | 'warning' | 'error';
}
```

## Visual Style

- Fixed left sidebar (`left-4 top-32 bottom-8`)
- Collapsible/expandable (50px minimized, 300px expanded)
- Animated scan line effect
- Glass panel with angular styling

## Usage Example

```tsx
import LeftControlPanel from '@/components/HUD/LeftControlPanel';

function CargoSimulation() {
  const [speed, setSpeed] = useState(1.0);
  const [rotation, setRotation] = useState(true);
  const [showCG, setShowCG] = useState(false);

  return (
    <LeftControlPanel
      isVisible={true}
      isMinimized={false}
      onToggleMinimize={() => setMinimized(!minimized)}
      isAnimating={isRunning}
      animationSpeed={speed}
      setAnimationSpeed={setSpeed}
      allowRotation={rotation}
      setAllowRotation={setRotation}
      showCGZone={showCG}
      setShowCGZone={setShowCG}
      onStart={handleStart}
      onPause={handlePause}
      onReset={handleReset}
      onAddPallet={addPallet}
      onAddHumvee={addHumvee}
      missionStatus="READY"
    />
  );
}
```

## Dependencies

- `react`
- `framer-motion` - For animations
