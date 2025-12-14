# MissionFlowchartCanvas Component

## Description
Full-page Miro/Lucidflow-style interactive flowchart builder for mission planning. Features full-viewport canvas with pan/zoom, auto-spawned nodes, color coding (hazmat: yellow, ADVON: orange), edge annotations, and floating HUD controls.

## Props Interface

```typescript
interface MissionFlowchartCanvasProps {
  splitFlights: SplitFlight[];
  allocationResult: AllocationResult;
  onFlightsChange: (flights: SplitFlight[]) => void;
  onBack?: () => void;
  onSave?: () => void;
  onView3D?: (flightId: string) => void;
}
```

## State Management

### Hooks Used
- `useState` - UI state (modals, selections, tools)
- `useMemo` - Node/edge generation, flight analysis
- `useCallback` - Event handlers, DAG operations
- `useEffect` - DAG data loading, layout updates
- `useNodesState`, `useEdgesState` - React Flow state
- `useReactFlow` - React Flow instance access
- `useAuth` - User authentication context
- Custom `useDagPersistence` hook - DAG persistence to backend

### Key State Variables
| State | Type | Purpose |
|-------|------|---------|
| `selectedFlightId` | `string \| null` | Selected flight for details |
| `selectedAirbaseId` | `string \| null` | Selected airbase for details |
| `showFlightModal` | `boolean` | Flight detail modal visibility |
| `showAirbaseModal` | `boolean` | Airbase modal visibility |
| `activeTool` | `string` | Current canvas tool |
| `isAutoLayoutEnabled` | `boolean` | Auto-layout toggle |

## Custom Hook: useDagPersistence

```typescript
interface UseDagPersistenceOptions {
  userId: number | null;
  enabled: boolean;
  onLoadedNodes?: (nodes: Node[]) => void;
  onLoadedEdges?: (edges: Edge[]) => void;
}

interface UseDagPersistenceResult {
  isLoading: boolean;
  syncStatus: DagSyncStatus;  // 'idle' | 'loading' | 'saving' | 'saved' | 'error'
  error: string | null;
  hasDagData: boolean;
  saveNode: (node: Node) => Promise<void>;
  saveEdge: (edge: Edge) => Promise<void>;
  updateNodePosition: (nodeId: string, position: { x: number; y: number }) => void;
  deleteNode: (nodeId: string) => Promise<void>;
  deleteEdge: (edgeId: string) => Promise<void>;
  loadDagData: () => Promise<{ nodes: Node[]; edges: Edge[] } | null>;
}
```

Features:
- Debounced position updates (1 second)
- Node ID mapping for backend sync
- Error handling and status tracking

## Frameworks/Libraries Used
- **React Flow (@xyflow/react)** - Full flowchart system
- **Dagre** - Graph layout
- **Framer Motion** - Animations
- **React Icons (fi, md, tb, bi)** - Icon library

## Custom Node Types

### FlightNode (FlightNodeData)
```typescript
interface FlightNodeData {
  nodeType: 'flight';
  flightId: string;
  callsign: string;
  displayName?: string;
  aircraftType: 'C-17' | 'C-130';
  isHazmat: boolean;
  isAdvon: boolean;
  heaviestItems: Array<{ name: string; weight: number }>;
  summary: { palletCount, rollingStockCount, paxCount, totalWeight };
  originIcao?: string;
  destinationIcao?: string;
  availableToPickup?: { palletCount, totalWeight };
  onExportPDF?: (flightId: string) => void;
  onExportICODES?: (flightId: string) => void;
  onView3D?: (flightId: string) => void;
}
```

### AirbaseNode (AirbaseNodeData)
```typescript
interface AirbaseNodeData {
  nodeType: 'airbase';
  baseId: string;
  name: string;
  icao: string;
  country: string;
  runwayLengthFt: number;
  isOrigin: boolean;
  isDestination: boolean;
  incomingFlights: string[];
  outgoingFlights: string[];
  availableCargo: { palletCount, totalWeight };
}
```

### RouteEdge (RouteEdgeData)
```typescript
interface RouteEdgeData {
  distance: number;
  timeHours: number;
  fuelLb: number;
  flightId: string;
  isHazmat: boolean;
  isAdvon: boolean;
}
```

## Dependencies

### APIs/Services
- `dagApiClient` - DAG persistence API
- `dagMappers` - React Flow ↔ DAG conversions
- `insightsEngine` - `analyzeAllocation`
- `routeCalculations` - Distance, time, fuel calculations
- `weatherService` - `getBaseWeather`
- `pdfExport` - PDF export functions
- `icodesExport` - ICODES export functions

### Other Components
- None (self-contained canvas)

## Key Functions

| Function | Purpose |
|----------|---------|
| `handleNodeDoubleClick()` | Opens flight/airbase detail modal |
| `handleExportPDF()` | Exports flight to PDF |
| `handleExportICODES()` | Exports flight to ICODES format |
| `generateFlightNodes()` | Creates React Flow nodes from flights |
| `generateEdges()` | Creates route edges between nodes |

## Usage Example

```tsx
import MissionFlowchartCanvas from './components/MissionFlowchartCanvas';

function FlightSplitter({ allocationResult }) {
  const [flights, setFlights] = useState<SplitFlight[]>([]);

  return (
    <MissionFlowchartCanvas
      splitFlights={flights}
      allocationResult={allocationResult}
      onFlightsChange={setFlights}
      onBack={() => navigate(-1)}
      onSave={() => console.log('Saved')}
      onView3D={(id) => console.log('View 3D:', id)}
    />
  );
}
```

## Canvas Features
- Pan and zoom navigation
- MiniMap for overview
- Background grid (dots pattern)
- Auto-layout with Dagre
- DAG persistence to backend
- PDF and ICODES export per flight
- 3D viewer integration
- Color-coded nodes by cargo type
