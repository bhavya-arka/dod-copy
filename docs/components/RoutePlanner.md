# RoutePlanner Component

## Description
Multi-leg flight planning component with distance, time, fuel calculations, weather prediction, and flight scheduling. Provides a comprehensive interface for route planning with support for multiple flight legs, weather monitoring, and cargo management.

## Props Interface

```typescript
interface RoutePlannerProps {
  allocationResult?: AllocationResult;  // Cargo allocation results from previous step
  onBack: () => void;                   // Callback to navigate back
  onHome?: () => void;                  // Optional callback to navigate home
  hideNavigation?: boolean;             // Hide navigation controls
}
```

## Internal Types

```typescript
interface LegConfig {
  id: string;
  origin_id: string;
  destination_id: string;
  aircraft_id: string;
  departure_time: Date;
}

type ViewTab = 'routes' | 'schedule' | 'weather' | 'cargo';
```

## State Management

### Hooks Used
- `useState` - Local state for legs, settings, tabs, scheduled flights, weather data
- `useMemo` - Memoized calculations for aircraft, weather systems, route totals, insights
- `useCallback` - Memoized event handlers for scheduling flights
- `useEffect` - Weather data fetching when weather tab is active

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `legs` | `LegConfig[]` | Route leg configurations |
| `settings` | `RouteSettings` | Route calculation settings |
| `selectedLeg` | `string \| null` | Currently selected leg ID |
| `activeTab` | `ViewTab` | Current view tab |
| `scheduledFlights` | `ScheduledFlight[]` | List of scheduled flights |
| `showFlightSplitter` | `boolean` | Toggle flight splitter modal |
| `savedSplitFlights` | `SplitFlight[]` | Saved split flight configurations |
| `baseWeatherData` | `Map<string, WeatherForecast>` | Weather data per base |
| `weatherLoading` | `boolean` | Weather fetch loading state |
| `weatherErrors` | `Map<string, boolean>` | Weather fetch error states |

## Frameworks/Libraries Used
- **React** - Core UI framework
- **Framer Motion** - Animations (`motion` component)

## Dependencies

### APIs/Services
- `weatherService` - `getActiveWeatherSystems`, `getBaseWeather`, `getRealBaseWeather`, `willWeatherAffectRoute`, `formatWindData`, `getConditionsColor`
- `flightScheduler` - `createScheduledFlight`, `checkScheduleConflicts`, `generateCallsign`
- `routeCalculations` - `createRouteLeg`, `calculateRouteTotals`, `formatFlightTime`, `formatDistance`, `formatMilitaryTime`, `formatMilitaryDateTime`

### Other Components
- `FlightSplitter` - Flight splitting functionality

### Data
- `MILITARY_BASES` - Base location data from `../lib/bases`
- `routeTypes` - Type definitions for routes, weather, scheduling
- `pacafTypes` - `AllocationResult` type
- `flightSplitTypes` - `SplitFlight` type

## Key Functions

| Function | Purpose |
|----------|---------|
| `addLeg()` | Adds a new leg to the route based on last leg's destination |
| `removeLeg(id)` | Removes a leg from the route (minimum 1 required) |
| `updateLeg(id, updates)` | Updates specific leg configuration |
| `scheduleFlightFromLeg(leg)` | Creates a scheduled flight from leg configuration |
| `removeScheduledFlight(id)` | Removes a scheduled flight |

### Memoized Computations
| Computation | Purpose |
|-------------|---------|
| `availableAircraft` | Extracts aircraft list from allocation result |
| `weatherSystems` | Gets active weather systems |
| `calculatedLegs` | Calculates full leg details with distances/times |
| `routeTotals` | Aggregate route statistics |
| `scheduleConflicts` | Detects scheduling conflicts |
| `insights` | Generates route optimization insights |

## Usage Example

```tsx
import RoutePlanner from './components/RoutePlanner';

function MissionWorkspace() {
  const [allocationResult, setAllocationResult] = useState<AllocationResult | null>(null);
  
  return (
    <RoutePlanner
      allocationResult={allocationResult}
      onBack={() => navigate('/dashboard')}
      onHome={() => navigate('/')}
    />
  );
}
```

## Tab Views
1. **Routes** - Main route planning with leg editor and insights
2. **Schedule** - Flight schedule table with conflict detection
3. **Weather** - Active weather systems and base conditions
4. **Cargo** - Cargo split management with FlightSplitter integration
