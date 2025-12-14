# MissionWorkspace

## Description

Unified tabbed interface for mission planning after CSV upload. Displays flights, routes, schedules, weather, cargo split, and analytics in a minimalist glass UI design.

## Props Interface

```typescript
interface LoadedPlanInfo {
  id: number;
  name: string;
  status: 'draft' | 'complete' | 'archived';
}

interface MissionWorkspaceProps {
  onBack?: () => void;                    // Navigate back
  onHome?: () => void;                    // Navigate to home
  onDashboard?: () => void;               // Navigate to dashboard
  loadedPlan?: LoadedPlanInfo | null;     // Currently loaded flight plan info
  onPlanStatusChange?: (newStatus: 'draft' | 'complete' | 'archived') => void; // Status update callback
}
```

## State Management

### Local State
```typescript
const [manifestViewMode, setManifestViewMode] = useState<'table' | 'spreadsheet'>('spreadsheet');
```

### Context State (from MissionContext)
The component uses `useMission()` hook to access:
- `currentTab` - Active tab identifier
- `allocationResult` - Aircraft allocation data
- `classifiedItems` - Categorized cargo items
- `insights` - Analytics data
- `splitFlights` - Configured flight splits
- `routes` - Route information
- Various setters and calculation methods

### Hooks Used
- `useState` - Local view mode state
- `useEffect` - Trigger analytics calculations on data changes
- `useMemo` - Memoized manifest data transformation
- `useCallback` - Memoized handlers
- `useMission` - Custom context hook for mission state

## Frameworks/Libraries

| Library | Purpose |
|---------|---------|
| React | Core UI framework |
| Framer Motion | Tab transition animations |
| Lucide React | Icons (`Table`, `Grid3X3`) |

## Dependencies

### Context
- `useMission` from `../context/MissionContext`

### Components
- `MissionNavbar` - Navigation header with tabs
- `LoadPlanViewer` - Flight load plan visualization
- `FlightSplitter` - Cargo split configuration
- `AnalyticsPanel` - Mission analytics display
- `EditableSpreadsheet` - Editable manifest table

### Services
- `getBaseWeather` from `../lib/weatherService` - Weather data for bases

### Types
- `SplitFlight` from `../lib/flightSplitTypes`
- `MovementItem`, `ClassifiedItems` from `../lib/pacafTypes`
- `SpreadsheetColumn`, `SpreadsheetRow` from `./EditableSpreadsheet`

## Key Functions

### `handleSplitSave(flights: SplitFlight[])`
Saves split flight configuration and persists to API if plan is loaded.

### `handleManifestDataChange(newData: SpreadsheetRow[])`
Updates classified items when manifest data is edited in spreadsheet view. Reconstructs the `ClassifiedItems` object with proper categorization.

### `renderTabContent()`
Renders content for the active tab:
- `flights` - LoadPlanViewer component
- `manifest` - Editable spreadsheet or table view
- `schedules` - Flight schedule list
- `weather` - Weather cards for bases
- `cargo_split` - FlightSplitter component
- `analytics` - AnalyticsPanel component

## Manifest Columns Configuration

```typescript
const manifestColumns: SpreadsheetColumn[] = [
  { key: 'description', label: 'Description', width: 200, editable: true },
  { key: 'length_in', label: 'Length (in)', width: 90, type: 'number', editable: true },
  { key: 'width_in', label: 'Width (in)', width: 90, type: 'number', editable: true },
  { key: 'height_in', label: 'Height (in)', width: 90, type: 'number', editable: true },
  { key: 'weight_each_lb', label: 'Weight (lb)', width: 100, type: 'number', editable: true },
  { key: 'type', label: 'Type', width: 120, editable: false },
  { key: 'tcn', label: 'Lead TCN', width: 140, editable: true },
  { key: 'pax_count', label: 'PAX', width: 60, type: 'number', editable: true },
  { key: 'hazmat_flag', label: 'HAZMAT', width: 80, type: 'checkbox', editable: true },
  { key: 'advon_flag', label: 'ADVON', width: 80, type: 'checkbox', editable: true },
];
```

## Usage Example

```tsx
import MissionWorkspace from './components/MissionWorkspace';
import { MissionProvider } from '../context/MissionContext';

function MissionPage() {
  const loadedPlan = { id: 1, name: 'Mission Alpha', status: 'draft' as const };

  return (
    <MissionProvider
      allocationResult={allocationData}
      classifiedItems={classifiedData}
      selectedAircraft="C-17"
      insights={insightsData}
    >
      <MissionWorkspace
        loadedPlan={loadedPlan}
        onDashboard={() => navigate('/dashboard')}
        onPlanStatusChange={(status) => updatePlanStatus(status)}
      />
    </MissionProvider>
  );
}
```

## Tab Views

| Tab | Description |
|-----|-------------|
| `flights` | Aircraft load plans with ICODES-style visualization |
| `manifest` | Editable cargo manifest in table or spreadsheet format |
| `schedules` | Flight schedule display with departure/arrival times |
| `weather` | Weather conditions at origin/destination bases |
| `cargo_split` | Configure how cargo is split across flights |
| `analytics` | Mission analytics and fuel breakdown |
