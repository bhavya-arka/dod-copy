# MissionNavbar Component

## Description
Persistent navigation bar with dashboard access, aircraft switcher, tab navigation, and user controls. Features minimalist glass UI design with dropdown menus for aircraft selection and user actions.

## Props Interface

```typescript
interface MissionNavbarProps {
  onDashboard: () => void;                // Callback to navigate to dashboard
  showTabs?: boolean;                     // Show/hide tab navigation (default: true)
  loadedPlan?: LoadedPlanInfo | null;     // Currently loaded flight plan info
  onPlanStatusChange?: (newStatus: 'draft' | 'complete' | 'archived') => void;
}

interface LoadedPlanInfo {
  id: number;
  name: string;
  status: 'draft' | 'complete' | 'archived';
}
```

## State Management

### Hooks Used
- `useState` - Dropdown visibility, status update loading
- `useMission` - Mission context for tabs, aircraft, analytics
- `useAuth` - User authentication

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `showAircraftDropdown` | `boolean` | Aircraft selector visibility |
| `showUserMenu` | `boolean` | User menu visibility |
| `isUpdatingStatus` | `boolean` | Status update loading state |

## Frameworks/Libraries Used
- **React** - Core UI framework
- **Framer Motion** - Dropdown animations

## Dependencies

### Context
- `MissionContext` - `useMission` for mission state and actions
- `useAuth` - User authentication hook

### Types
- `MissionTab` from `MissionContext`

## Navigation Tabs

```typescript
const TABS: Array<{ id: MissionTab; label: string; icon: string }> = [
  { id: 'flights', label: 'Flights', icon: '✈️' },
  { id: 'manifest', label: 'Manifest', icon: '📋' },
  { id: 'cargo_split', label: 'Flight Manager', icon: '📦' },
  { id: 'schedules', label: 'Schedules', icon: '📅' },
  { id: 'weather', label: 'Weather', icon: '🌤️' },
  { id: 'analytics', label: 'Analytics', icon: '📊' }
];
```

## Key Functions

| Function | Purpose |
|----------|---------|
| `handleMarkComplete()` | Updates plan status to 'complete' via API |
| `handleLogout()` | Logs out user and navigates to dashboard |

### API Calls
```typescript
// Mark plan as complete
PATCH /api/flight-plans/${loadedPlan.id}/status
Body: { status: 'complete' }
```

## Usage Example

```tsx
import MissionNavbar from './components/MissionNavbar';

function MissionWorkspace() {
  const [loadedPlan, setLoadedPlan] = useState<LoadedPlanInfo | null>({
    id: 1,
    name: 'Operation Thunder',
    status: 'draft'
  });

  return (
    <div>
      <MissionNavbar
        onDashboard={() => navigate('/dashboard')}
        showTabs={true}
        loadedPlan={loadedPlan}
        onPlanStatusChange={(status) => {
          setLoadedPlan(prev => prev ? { ...prev, status } : null);
        }}
      />
      {/* Main content */}
    </div>
  );
}
```

## UI Features

### Left Section
- Back button with ARKA branding
- Loaded plan info with status badge
- "Mark Complete" button (for draft plans)
- Tab navigation (when `showTabs` and allocation exists)

### Right Section
- Aircraft dropdown selector (shows current aircraft, weight)
- Quick stats badges (aircraft count, pallets, weight)
- Save Plan button
- User avatar menu with:
  - Username and email
  - Dashboard link
  - Sign Out action

### Visual Design
- Glass morphism styling (`bg-white/80 backdrop-blur-xl`)
- Sticky top positioning
- Smooth animations on dropdowns
- Responsive (some elements hidden on mobile)
