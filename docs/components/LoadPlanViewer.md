# LoadPlanViewer

## Description

A comprehensive 2D load plan viewer component that displays ICODES-style load plans for aircraft with a sidebar navigation. Supports both 2D ICODES diagrams and interactive 3D visualization, with manifest editing functionality and multiple export options.

## Props Interface

```typescript
interface LoadPlanViewerProps {
  allocationResult: AllocationResult;      // Complete cargo allocation result with load plans
  insights: InsightsSummary;               // Summary insights for the allocation
  onBack: () => void;                      // Handler for back navigation
  onHome?: () => void;                     // Handler for home navigation
  onExport: () => void;                    // Handler for export action
  onRoutePlanning?: () => void;            // Handler for route planning navigation
  onMissionWorkspace?: () => void;         // Handler for mission workspace navigation
  onDashboard?: () => void;                // Handler for dashboard navigation
  onLogout?: () => void;                   // Handler for logout action
  userEmail?: string;                      // Current user's email
  hideNavigation?: boolean;                // Whether to hide navigation elements (default: false)
  flightPlanId?: number;                   // Flight plan ID for saving edits
  onAllocationUpdate?: (updated: AllocationResult) => void; // Callback when allocation is updated
}
```

## State Management

### Hooks Used
- `useState` - Multiple state variables for UI and editing state

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `selectedPlan` | `AircraftLoadPlan \| null` | Currently selected aircraft load plan |
| `activeTab` | `'advon' \| 'main' \| 'all'` | Active filter tab for load plans |
| `viewMode` | `'2d' \| '3d'` | Toggle between 2D and 3D visualization |
| `showExportMenu` | `boolean` | Export dropdown visibility |
| `showExplanation` | `boolean` | Aircraft count explanation panel visibility |
| `isEditing` | `boolean` | Whether in manifest editing mode |
| `hasUnsavedChanges` | `boolean` | Tracks if there are unsaved edits |
| `editedAllocation` | `AllocationResult` | Working copy of allocation for editing |
| `isSaving` | `boolean` | Saving state indicator |
| `saveError` | `string \| null` | Error message from save operation |
| `saveSuccess` | `boolean` | Success indicator for save operation |
| `showUnsavedModal` | `boolean` | Unsaved changes modal visibility |
| `pendingNavigation` | `(() => void) \| null` | Pending navigation action |

## Frameworks/Libraries Used

| Library | Purpose |
|---------|---------|
| React | Core framework |
| framer-motion | Animations (AnimatePresence, motion) |

## Dependencies

### Components
- `ICODESViewer` - 2D ICODES diagram visualization
- `LoadPlan3DViewer` - 3D aircraft visualization

### Services/APIs
- `pdfExport` - PDF export functionality (`exportLoadPlansToPDF`, `exportSingleLoadPlanToPDF`)
- `icodesExport` - ICODES export utilities (`downloadAllICODESPlans`, `downloadA2IBundle`, `generateA2IBundle`, `downloadManifestCSV`)
- `explanationEngine` - Aircraft count explanation (`generateWhyThisManyAircraft`)
- REST API - `PUT /api/flight-plans/:id` for saving edits

### Types
- `AllocationResult`, `AircraftLoadPlan`, `InsightsSummary`, `PalletPlacement`, `VehiclePlacement` from `pacafTypes`

## Key Functions

| Function | Purpose |
|----------|---------|
| `handleExportPDF()` | Exports all load plans to PDF |
| `handleExportSinglePDF()` | Exports currently selected load plan to PDF |
| `handleExportICODES()` | Downloads all ICODES plans in JSON format |
| `handleExportA2IBundle()` | Downloads A2I/SAM mission bundle |
| `handleExportManifest()` | Downloads cargo manifest as CSV |
| `handleEnterEditMode()` | Enters manifest editing mode with deep clone |
| `handleCancelEdit()` | Cancels editing and reverts changes |
| `handleSave()` | Saves edited allocation to server |
| `updatePalletField()` | Updates pallet weight or description |
| `updateVehicleField()` | Updates vehicle weight or description |
| `updatePalletPosition()` | Updates pallet position index |
| `interceptNavigation()` | Intercepts navigation when unsaved changes exist |

## Sub-Components

### UnsavedChangesModal
Modal dialog that appears when navigating away with unsaved changes.

```typescript
interface UnsavedChangesModalProps {
  isOpen: boolean;
  onNavigateAnyway: () => void;
  onGoBack: () => void;
}
```

## Usage Example

```tsx
import LoadPlanViewer from './components/LoadPlanViewer';

function MissionPage() {
  const [allocation, setAllocation] = useState<AllocationResult>(initialAllocation);
  
  return (
    <LoadPlanViewer
      allocationResult={allocation}
      insights={missionInsights}
      onBack={() => navigate('/upload')}
      onDashboard={() => navigate('/dashboard')}
      onRoutePlanning={() => navigate('/routes')}
      onExport={() => console.log('Export triggered')}
      flightPlanId={123}
      onAllocationUpdate={setAllocation}
      userEmail="user@example.com"
    />
  );
}
```

## Features

1. **Phase Filtering** - Filter load plans by ADVON, MAIN, or All
2. **2D/3D Toggle** - Switch between ICODES diagrams and 3D visualization
3. **Manifest Editing** - Inline editing of pallet/vehicle weights and descriptions
4. **Export Options** - PDF, ICODES JSON, A2I Bundle, Manifest CSV
5. **Unsaved Changes Protection** - Modal prevents accidental navigation loss
6. **Aircraft Explanation** - "Why X aircraft?" explanation panel
