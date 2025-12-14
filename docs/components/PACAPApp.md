# PACAPApp

## Description

Main application orchestrator for the PACAF Airlift Demo. This component manages the complete workflow from movement list upload through load plan generation, screen transitions, and aircraft allocation.

## Props Interface

```typescript
interface PACAPAppProps {
  onDashboard?: () => void;    // Callback to navigate to dashboard
  onLogout?: () => void;       // Callback to handle user logout
  userEmail?: string;          // Current user's email for display
}
```

## State Management

### Main State Object
```typescript
interface AppState {
  currentScreen: AppScreen;              // 'upload' | 'brief' | 'load_plans' | 'route_planning' | 'mission_workspace'
  selectedAircraft: AircraftType;        // 'C-17' | 'C-130'
  movementData: ParseResult | null;      // Parsed movement list data
  classifiedItems: ClassifiedItems | null; // Categorized cargo items
  allocationResult: AllocationResult | null; // Aircraft allocation results
  insights: InsightsSummary | null;      // Analytics and insights
  isProcessing: boolean;                 // Loading state during processing
  error: string | null;                  // Error message display
}
```

### Hooks Used
- `useState` - Primary state container for application state
- `useCallback` - Memoized event handlers and processing functions

## Frameworks/Libraries

| Library | Purpose |
|---------|---------|
| React | Core UI framework |
| Framer Motion | Screen transition animations (`AnimatePresence`, `motion.div`) |

## Dependencies

### Services/APIs
- `parseMovementList` from `../lib/movementParser` - CSV/data parsing
- `classifyItems` from `../lib/classificationEngine` - Cargo categorization
- `solveAircraftAllocation` from `../lib/aircraftSolver` - Aircraft allocation algorithm
- `analyzeMovementList`, `analyzeAllocation` from `../lib/insightsEngine` - Analytics generation

### Components
- `UploadScreen` - File upload interface
- `UrgentBriefScreen` - Quick briefing display
- `LoadPlanViewer` - Detailed load plan visualization
- `RoutePlanner` - Route planning interface
- `MissionWorkspace` - Complete mission workspace
- `MissionProvider` - Context provider for mission state

### Types
- `AppScreen`, `AppState`, `AircraftType`, `ParseResult`, `ClassifiedItems`, `AllocationResult`, `InsightsSummary` from `../lib/pacafTypes`

## Key Functions

### `processMovementList(content: string, filename: string)`
Main data processing pipeline that:
1. Parses the movement list CSV content
2. Classifies items into cargo categories
3. Runs aircraft allocation solver
4. Generates insights and analytics
5. Transitions to mission workspace on success

### `handleFileUpload(content: string, filename: string)`
Wrapper callback passed to UploadScreen for file handling.

### `handleAircraftSelect(type: AircraftType)`
Updates selected aircraft type and re-processes allocation if data exists.

### `handleLoadSampleData()`
Loads built-in sample CSV data for demonstration purposes.

### `handleViewLoadPlans()`
Navigates to the load plans screen.

### `handleBack()`
Implements back navigation logic between screens.

### `handleHome()`
Resets application to initial upload screen state.

### `handleRoutePlanning()`
Navigates to route planning screen.

### `handleMissionWorkspace()`
Navigates to mission workspace screen.

### `handleExport()`
Placeholder for PDF export functionality.

## Usage Example

```tsx
import PACAPApp from './components/PACAPApp';

function App() {
  const handleDashboard = () => {
    // Navigate to dashboard
  };

  const handleLogout = () => {
    // Handle logout logic
  };

  return (
    <PACAPApp
      onDashboard={handleDashboard}
      onLogout={handleLogout}
      userEmail="user@example.com"
    />
  );
}
```

## Screen Flow

```
upload → mission_workspace (after successful processing)
       ↓
     brief → load_plans → route_planning
                        ↓
                  mission_workspace
```

## Sample Data

The component includes built-in sample CSV data with 18 cargo items for demonstration, including various equipment types and passenger entries.
