# Dashboard

## Description

Main dashboard for authenticated users to manage their flight plans. Displays a filterable list of saved plans with CRUD operations, status management, and flight schedule previews.

## Props Interface

```typescript
interface DashboardProps {
  user: User;                           // Current authenticated user
  onLogout: () => void;                 // Logout handler
  onStartNew: () => void;               // Create new flight plan
  onLoadPlan: (planId: number) => void; // Load existing plan by ID
}
```

## Internal Types

```typescript
interface FlightScheduleInfo {
  id: number;
  name: string;
  schedule_data: {
    callsign?: string;
    origin_icao?: string;
    destination_icao?: string;
    scheduled_departure?: string;
    scheduled_arrival?: string;
    is_modified?: boolean;
  };
}

interface FlightPlanSummary {
  id: number;
  name: string;
  status: 'draft' | 'complete' | 'archived';
  created_at: string;
  updated_at: string;
  movement_items_count: number;
  total_weight_lb: number;
  aircraft_count: number;
  schedules?: FlightScheduleInfo[];
}
```

## State Management

### Local State
```typescript
const [plans, setPlans] = useState<FlightPlanSummary[]>([]);     // All flight plans
const [isLoading, setIsLoading] = useState(true);                 // Loading state
const [error, setError] = useState<string | null>(null);          // Error message
const [activeTab, setActiveTab] = useState<'all' | 'draft' | 'complete'>('all'); // Filter tab
```

### Hooks Used
- `useState` - Local state management
- `useEffect` - Fetch plans on mount
- `useCallback` - Memoized API functions

## Frameworks/Libraries

| Library | Purpose |
|---------|---------|
| React | Core UI framework |
| Framer Motion | List animations |

## Dependencies

### Types
- `User` from `../hooks/useAuth`

### APIs
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/flight-plans` | GET | Fetch all user flight plans |
| `/api/flight-plans/:id/schedules` | GET | Fetch schedules for a plan |
| `/api/flight-plans/:id` | DELETE | Delete a flight plan |
| `/api/flight-plans/:id/status` | PATCH | Update plan status |

## Key Functions

### `fetchPlans()`
Fetches all flight plans and their associated schedules:
1. Fetches plan list from `/api/flight-plans`
2. For each plan, fetches schedules from `/api/flight-plans/:id/schedules`
3. Combines data and updates state

### `handleDelete(id: number)`
Deletes a flight plan after user confirmation:
1. Shows confirmation dialog
2. Sends DELETE request
3. Updates local state and refreshes list

### `handleMarkComplete(id: number)`
Marks a draft plan as complete:
1. Sends PATCH request with `{ status: 'complete' }`
2. Refreshes plan list on success

### `refreshPlans()`
Wrapper for `fetchPlans` used as a refresh callback.

### `formatDate(dateStr: string)`
Formats ISO date strings for display using `toLocaleDateString`.

## Itinerary Calculation Logic

The component calculates mission itineraries from schedule data:
```typescript
// Collect all origins and destinations
const origins = new Set<string>();
const destinations = new Set<string>();

// Find start points (origins never appearing as destinations)
const startBases = [...origins].filter(o => !destinations.has(o));

// Find end points (destinations never appearing as origins)
const endBases = [...destinations].filter(d => !origins.has(d));

// Intermediate stops (appear as both)
const intermediateBases = [...allBases].filter(b => origins.has(b) && destinations.has(b));
```

## Usage Example

```tsx
import Dashboard from './components/Dashboard';
import { useAuth } from '../hooks/useAuth';

function DashboardPage() {
  const { user, logout } = useAuth();

  if (!user) return <Redirect to="/login" />;

  return (
    <Dashboard
      user={user}
      onLogout={logout}
      onStartNew={() => navigate('/new')}
      onLoadPlan={(id) => navigate(`/plan/${id}`)}
    />
  );
}
```

## Filter Tabs

| Tab | Filter |
|-----|--------|
| All Plans | Shows all plans |
| Drafts | `status === 'draft'` |
| Complete | `status === 'complete'` |

## Plan Card Features

- **Status indicator**: Left border color (green=complete, amber=draft)
- **Status badge**: Colored pill showing status
- **Metrics badges**: Items count, weight, flights/aircraft count
- **Itinerary display**: Visual route chain with start/intermediate/end bases
- **Flight details**: Callsigns and routes for first 4 flights
- **Actions**: Mark Complete (drafts only), Open, Delete
