# FlightManagerFlowchart Component

## Description
Three-pane layout flowchart designer for managing flights with:
- Left Sidebar: Flight list with filters and search
- Center Canvas: React Flow flowchart designer
- Right Inspector: Context-sensitive details panel

## Props Interface

```typescript
interface FlightManagerFlowchartProps {
  splitFlights: SplitFlight[];
  allocationResult: AllocationResult;
  onFlightsChange: (flights: SplitFlight[]) => void;
  onFlightSelect: (flightId: string) => void;
  selectedFlightId: string | null;
  onAddFlight?: () => void;
  onSplitFlight?: (flightId: string) => void;
}
```

## State Management

### Hooks Used
- `useState` - Filter state, search query, insights
- `useMemo` - Filtered flights, statistics, node/edge computation
- `useCallback` - Event handlers
- `useEffect` - Layout updates, insight generation
- `useNodesState`, `useEdgesState` - React Flow state

## Frameworks/Libraries Used
- **React Flow (@xyflow/react)** - Flowchart canvas with MiniMap, Controls
- **Dagre** - Automatic graph layout
- **Framer Motion** - Animations

## Custom Node Types

### FlightStartNode
Flight representation with:
- Aircraft type and callsign
- Pallet/weight/PAX summary
- ACL (Allowable Cabin Load) utilization bar
- Hazmat indicator
- Route status warning

### AirbaseNode
Military base representation with:
- ICAO code and name
- Runway length and country
- Origin/destination flight counts
- Weather conditions badge

### RouteLegEdgeLabel
Edge annotation showing:
- Distance (nm)
- Time en route (hours)
- Fuel required (lbs)

## Sub-Components

### LeftSidebar
```typescript
interface LeftSidebarProps {
  flights: SplitFlight[];
  selectedFlightId: string | null;
  onFlightSelect: (id: string) => void;
  onAddFlight?: () => void;
  filter: string;
  onFilterChange: (f: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}
```
Features:
- Search by callsign, base
- Filter tabs: All, C-17, C-130, Overloaded
- Flight cards with quick stats

### RightInspector
```typescript
interface RightInspectorProps {
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  flights: SplitFlight[];
  graphState: GraphState;
  allocationResult: AllocationResult;
  onFlightUpdate: (flightId: string, updates: Partial<SplitFlight>) => void;
  onBaseSelect: (baseId: string, flightId: string, asOrigin: boolean) => void;
}
```
Shows:
- Mission summary when nothing selected
- Flight details when flight selected
- Route editor for modifying waypoints

### RouteEditor
Multi-stop route editing with:
- Add/remove waypoints
- Reorder stops
- Change stop locations

## Dependencies

### APIs/Services
- `insightsEngine` - `analyzeAllocation`
- `routeCalculations` - Distance, time, fuel calculations
- `flowchartGraphTypes` - Graph state management utilities

### Data
- `MILITARY_BASES` - Base definitions
- `flightSplitTypes` - Flight validation and calculations

## Key Functions

| Function | Purpose |
|----------|---------|
| `getLayoutedElements()` | Applies Dagre layout with custom dimensions |
| `RouteEditor.handleAddWaypoint()` | Adds intermediate stop |
| `RouteEditor.handleRemoveStop()` | Removes waypoint |
| `RouteEditor.handleMoveStop()` | Reorders route stops |

## Usage Example

```tsx
import FlightManagerFlowchart from './components/FlightManagerFlowchart';

function MissionWorkspace() {
  const [flights, setFlights] = useState<SplitFlight[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <FlightManagerFlowchart
      splitFlights={flights}
      allocationResult={allocationResult}
      onFlightsChange={setFlights}
      onFlightSelect={setSelected}
      selectedFlightId={selected}
      onAddFlight={() => console.log('Add new flight')}
    />
  );
}
```

## Layout Configuration
- Direction: Left-to-Right ('LR')
- Flight nodes: 220 × 200
- Airbase nodes: 180 × 120
- Node separation: 100px
- Rank separation: 200px
