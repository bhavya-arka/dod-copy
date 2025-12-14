# FlightSplitter Component

## Description
Full-page mission flowchart canvas interface for splitting cargo across multiple flights. Provides a Miro/Lucidflow-style sandbox for visualizing and managing flight splits with 3D cargo visualization capabilities.

## Props Interface

```typescript
interface FlightSplitterProps {
  allocationResult: AllocationResult;      // Cargo allocation results
  onClose: () => void;                     // Callback to close the splitter
  onSave: (splitFlights: SplitFlight[]) => void;  // Callback with split results
  embedded?: boolean;                      // Whether embedded in another view
  existingSplitFlights?: SplitFlight[];   // Pre-existing split configurations
}
```

## State Management

### Hooks Used
- `useState` - Local state for split flights and 3D viewer visibility
- `useCallback` - Memoized event handlers

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `splitFlights` | `SplitFlight[]` | Current split flight configurations |
| `show3DViewer` | `string \| null` | ID of flight to show in 3D viewer |

## Frameworks/Libraries Used
- **React** - Core UI framework
- **Framer Motion** - Animations (`motion`, `AnimatePresence`)

## Dependencies

### Other Components
- `MissionFlowchartCanvas` - Main flowchart canvas
- `LoadPlan3DViewer` - 3D cargo visualization

### Types/Data
- `AllocationResult`, `AircraftLoadPlan`, `AIRCRAFT_SPECS` from `pacafTypes`
- `SplitFlight`, `calculateFlightWeight` from `flightSplitTypes`
- `MilitaryBase` from `routeTypes`
- `MILITARY_BASES` from `bases`

## Key Functions

| Function | Purpose |
|----------|---------|
| `handleSave()` | Saves current split configuration and closes |
| `handleFlightsChange(flights)` | Updates split flights state |
| `handleView3D(flightId)` | Opens 3D viewer for specific flight |
| `initializeSplitFlights(result)` | Creates initial split from allocation result |

### Helper Function: initializeSplitFlights
Transforms `AllocationResult` into initial `SplitFlight[]`:
- Sets default origin (TRAVIS) and destination (HICKAM)
- Generates callsigns (REACH01, REACH02, etc.)
- Calculates departure/arrival times
- Maps pallets, rolling stock, and pax counts

## Usage Example

```tsx
import FlightSplitter from './components/FlightSplitter';

function MissionWorkspace() {
  const [showSplitter, setShowSplitter] = useState(false);
  const [allocationResult] = useState<AllocationResult>(/* ... */);

  const handleSaveSplits = (splits: SplitFlight[]) => {
    console.log('Saved splits:', splits);
    setShowSplitter(false);
  };

  return (
    <>
      <button onClick={() => setShowSplitter(true)}>Open Flight Splitter</button>
      
      {showSplitter && (
        <FlightSplitter
          allocationResult={allocationResult}
          onClose={() => setShowSplitter(false)}
          onSave={handleSaveSplits}
        />
      )}
    </>
  );
}
```

## Features
- Full-page flowchart canvas (via MissionFlowchartCanvas)
- 3D cargo visualization modal
- Supports embedded or fullscreen modes
- Persists existing split configurations
