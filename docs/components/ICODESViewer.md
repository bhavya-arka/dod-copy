# ICODESViewer

## Description

A 2D top-down visualization component that renders ICODES-style aircraft diagrams. Displays pallet positions, weight indicators, HAZMAT icons, rolling stock, and Center of Balance visualization. Features hover tooltips, fullscreen mode, and an optional spreadsheet view for cargo data.

## Props Interface

```typescript
interface ICODESViewerProps {
  loadPlan: AircraftLoadPlan;  // The aircraft load plan to visualize
  showCoB?: boolean;           // Show Center of Balance indicator (default: true)
  showWeights?: boolean;       // Show weight labels on pallets (default: true)
  compact?: boolean;           // Use compact layout with smaller scale (default: false)
}
```

## State Management

### Hooks Used
- `useState` - UI state for tooltip, fullscreen, and view mode
- `useMemo` - Memoized spreadsheet columns and data transformation

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `tooltip` | `TooltipData \| null` | Current tooltip data (position and content) |
| `isFullscreen` | `boolean` | Fullscreen overlay visibility |
| `viewMode` | `'diagram' \| 'spreadsheet'` | Toggle between diagram and spreadsheet views |

### Internal Types
```typescript
interface TooltipData {
  x: number;              // Screen X position
  y: number;              // Screen Y position
  type: 'pallet' | 'vehicle' | 'position';
  title: string;          // Tooltip header
  details: { label: string; value: string }[];  // Key-value detail rows
}
```

## Frameworks/Libraries Used

| Library | Purpose |
|---------|---------|
| React | Core framework |
| framer-motion | Animations (AnimatePresence, motion) |
| lucide-react | Icons (Maximize2, X, ZoomIn, Table, LayoutGrid) |

## Dependencies

### Components
- `EditableSpreadsheet` - Spreadsheet view for cargo data

### Types
- `AircraftLoadPlan`, `AircraftType`, `AIRCRAFT_SPECS`, `PalletPlacement`, `VehiclePlacement`, `PALLET_463L`, `PAX_WEIGHT_LB` from `pacafTypes`

## Sub-Components

### ICODESDiagram
The core SVG diagram renderer with hover interactions.

```typescript
interface ICODESDiagramProps extends ICODESViewerProps {
  scale: number;                                    // Scaling factor for dimensions
  isFullscreen?: boolean;                           // Whether in fullscreen mode
  onTooltipChange: (tooltip: TooltipData | null) => void;  // Tooltip state setter
}
```

### ICODESMiniViewer
A compact, minimal version for thumbnail displays.

```typescript
function ICODESMiniViewer({ loadPlan }: { loadPlan: AircraftLoadPlan })
```

## Key Functions

| Function | Purpose |
|----------|---------|
| `handlePalletHover(e, placement, index)` | Generates tooltip data for pallet hover |
| `handleVehicleHover(e, vehicle)` | Generates tooltip data for vehicle hover |

## Spreadsheet Configuration

### Columns
```typescript
const spreadsheetColumns: SpreadsheetColumn[] = [
  { key: 'position', label: 'Pos', type: 'number', editable: false },
  { key: 'type', label: 'Type', editable: false },
  { key: 'tcnId', label: 'TCN/ID', editable: false },
  { key: 'items', label: 'Contents', editable: false },
  { key: 'weight', label: 'Weight (lbs)', type: 'number' },
  { key: 'height', label: 'Height (in)', type: 'number' },
  { key: 'location', label: 'Location', editable: false },
  { key: 'hazmat', label: 'HAZMAT', type: 'checkbox' },
];
```

## Visual Elements

### Aircraft Diagram
- Cargo bay rectangle with aircraft-type-specific nose/tail shapes
- C-17 uses rounded nose curves, C-130 uses angular shapes
- FWD/AFT labels for orientation
- Dimension indicators (length and width)

### Pallets
- Blue rectangles for standard pallets
- Red outline/fill for HAZMAT cargo
- Position number labels
- Weight indicators (optional)
- Orange dot for overheight (>96")

### Rolling Stock
- Green rectangles with "RS" label
- L/R indicators for lateral positioning

### Center of Balance
- Dashed vertical line with triangle indicator
- Green when in envelope, red when out of envelope
- "CoB" label

## Statistics Panel

Displays 5 metrics at bottom:
1. **Pallets** - Used/Total positions
2. **Vehicles** - Rolling stock count
3. **PAX** - Passenger count with weight
4. **Seat Util** - Seat utilization percentage
5. **CoB** - Center of Balance percentage

## Usage Example

```tsx
import ICODESViewer, { ICODESMiniViewer } from './components/ICODESViewer';

function LoadPlanDisplay() {
  const loadPlan: AircraftLoadPlan = {
    aircraft_id: 'C17-001',
    aircraft_type: 'C-17',
    aircraft_spec: AIRCRAFT_SPECS['C-17'],
    pallets: [...],
    rolling_stock: [...],
    center_of_balance: 450,
    cob_in_envelope: true,
    cob_percent: 42.5,
    total_weight: 125000,
    payload_used_percent: 78.5,
    pax_count: 50,
    seat_capacity: 100,
    // ... other properties
  };

  return (
    <div className="space-y-4">
      {/* Full viewer with all features */}
      <ICODESViewer 
        loadPlan={loadPlan} 
        showCoB={true}
        showWeights={true}
      />
      
      {/* Compact version for lists */}
      <ICODESMiniViewer loadPlan={loadPlan} />
    </div>
  );
}
```

## Features

1. **Top-Down Diagram** - SVG-based aircraft visualization
2. **Hover Tooltips** - Detailed cargo info on hover
3. **Fullscreen Mode** - Expanded view with larger scale
4. **Spreadsheet View** - Tabular cargo data display
5. **Weight Visualization** - Optional weight labels on pallets
6. **HAZMAT Indicators** - Visual warnings for hazardous materials
7. **Overheight Markers** - Orange dots for cargo >96"
8. **Center of Balance** - CoB line with envelope status
9. **Dimension Rulers** - Length and width measurements

## Scale Modes

| Mode | Scale | Use Case |
|------|-------|----------|
| Compact | 0.3 | Thumbnail/list views |
| Normal | 0.5 | Standard display |
| Fullscreen | 0.8 | Detailed inspection |
