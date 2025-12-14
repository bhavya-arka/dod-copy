# FlightFlowchart Component

## Description
Interactive node-based visualization of flight splits and cargo distribution using React Flow. Displays flights as nodes with connections showing relationships, capacity utilization, and validation status.

## Props Interface

```typescript
interface FlightFlowchartProps {
  splitFlights: SplitFlight[];            // Flight configurations to visualize
  allocationResult: AllocationResult;     // Original allocation data
  onFlightSelect: (flightId: string) => void;  // Flight selection callback
  onSplitFlight: (flightId: string) => void;   // Split action callback
  onMergeFlight?: (sourceId: string, targetId: string) => void;  // Optional merge callback
  selectedFlightId: string | null;        // Currently selected flight
}
```

## Internal Types

```typescript
interface FlightNodeData {
  [key: string]: unknown;
  flight: SplitFlight;
  isSelected: boolean;
  hasErrors: boolean;
  hasWarnings: boolean;
  onSelect: () => void;
  onSplit: () => void;
  onDoubleClick: () => void;
}
```

## State Management

### Hooks Used
- `useState` - Detail modal and insights state
- `useMemo` - Memoized nodes/edges computation
- `useCallback` - Flight warning calculations
- `useEffect` - Layout updates and insight generation
- `useNodesState`, `useEdgesState` - React Flow state management

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `detailModalFlight` | `SplitFlight \| null` | Flight shown in detail modal |
| `insights` | `AIInsight[]` | AI-generated insights |
| `nodes` | `Node[]` | React Flow node state |
| `edges` | `Edge[]` | React Flow edge state |

## Frameworks/Libraries Used
- **React Flow (@xyflow/react)** - Node-based flowchart visualization
- **Dagre** - Graph layout algorithm

## Dependencies

### APIs/Services
- `insightsEngine` - `analyzeAllocation` for AI insights
- `routeCalculations` - `formatMilitaryTime`
- `flightSplitTypes` - `calculateFlightWeight`, `validateFlightLoad`

### Types
- `SplitFlight` from `flightSplitTypes`
- `AllocationResult`, `AIInsight` from `pacafTypes`

## Key Functions

| Function | Purpose |
|----------|---------|
| `getFlightWarnings(flight)` | Calculates error/warning status based on weight and CoB |
| `getLayoutedElements(nodes, edges, direction)` | Applies Dagre layout to nodes |
| `FlightNode` | Custom node component with flight details |
| `FlightDetailModal` | Modal showing detailed flight information |

### Custom Node: FlightNode
Displays:
- Aircraft type icon and callsign
- Origin → Destination route
- Pallet count and weight
- Capacity utilization bar
- Departure time
- Split action button
- Error/warning indicators

### Dagre Layout
- Direction: Left-to-Right ('LR')
- Node dimensions: 200 × 180
- Node separation: 80px
- Rank separation: 100px

## Usage Example

```tsx
import FlightFlowchart from './components/FlightFlowchart';

function FlightManager() {
  const [selectedFlight, setSelectedFlight] = useState<string | null>(null);
  const [splitFlights, setSplitFlights] = useState<SplitFlight[]>([]);
  const [allocationResult] = useState<AllocationResult>(/* ... */);

  return (
    <FlightFlowchart
      splitFlights={splitFlights}
      allocationResult={allocationResult}
      onFlightSelect={setSelectedFlight}
      onSplitFlight={(id) => console.log('Split:', id)}
      selectedFlightId={selectedFlight}
    />
  );
}
```

## Visual Features
- Color-coded nodes (green: normal, amber: warning, red: error)
- Animated edges between related flights
- Overview panel with flight statistics
- Legend for status colors
- Detail modal on double-click
