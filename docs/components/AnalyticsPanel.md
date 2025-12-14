# AnalyticsPanel Component

## Description
Comprehensive analytics display showing mission statistics, fuel costs, configuration comparison, and AI-generated insights. Features interactive charts and detailed cost breakdowns per aircraft.

## Props Interface

```typescript
interface AnalyticsPanelProps {
  onSaveConfiguration: (name: string) => void;  // Callback to save current config
}
```

## State Management

### Hooks Used
- `useState` - Config name, dialogs, compare mode, selections
- `useMemo` - Chart data computations
- `useEffect` - AI feedback generation
- `useMission` - Mission context for analytics data

### State Variables
| State | Type | Purpose |
|-------|------|---------|
| `configName` | `string` | Configuration save name input |
| `showSaveDialog` | `boolean` | Save dialog visibility |
| `compareMode` | `boolean` | Configuration comparison mode |
| `selectedForCompare` | `string[]` | Selected configs for comparison (max 3) |
| `aiFeedback` | `string[]` | Generated AI insights |
| `selectedAircraftId` | `string \| null` | Aircraft for detailed view |

## Frameworks/Libraries Used
- **React** - Core UI framework
- **Framer Motion** - Animations
- **Recharts** - Charts (PieChart, BarChart)

## Dependencies

### Context
- `useMission` - Mission context providing:
  - `analytics: MissionAnalytics`
  - `fuelBreakdown: FuelCostBreakdown`
  - `allocationResult: AllocationResult`
  - `savedConfigurations: MissionConfiguration[]`

### Types from MissionContext
```typescript
interface MissionAnalytics {
  total_aircraft: number;
  total_pallets: number;
  total_weight_lb: number;
  total_pax: number;
  total_distance_nm: number;
  total_flight_hours: number;
  average_cob_percent: number;
  utilization_percent: number;
}

interface FuelCostBreakdown {
  total_fuel_lb: number;
  total_fuel_cost_usd: number;
  total_operating_cost_usd: number;
  total_cost_usd: number;
  average_cost_per_ton_mile: number;
  average_fuel_efficiency_lb_per_nm: number;
  additional_fuel_from_splits: number;
  cost_per_lb: number;
  fuel_config: { reserve_fuel_percent, contingency_fuel_percent };
  fuel_per_aircraft: AircraftCostBreakdown[];
}
```

## Chart Color Scheme

```typescript
const CHART_COLORS = {
  fuel: '#3b82f6',        // Blue
  operating: '#10b981',   // Green
  taxi: '#94a3b8',        // Slate
  climb: '#f59e0b',       // Amber
  cruise: '#3b82f6',      // Blue
  descent: '#8b5cf6',     // Purple
  reserve: '#ef4444',     // Red
  contingency: '#f97316'  // Orange
};
```

## Chart Data (Memoized)

| Data | Source | Purpose |
|------|--------|---------|
| `costBreakdownData` | `fuelBreakdown` | Fuel vs Operating cost pie chart |
| `fuelPhaseData` | `fuel_per_aircraft` | Fuel by flight phase bar chart |
| `aircraftComparisonData` | `fuel_per_aircraft` | Per-aircraft cost comparison |
| `selectedAircraftDetails` | `fuel_per_aircraft` | Selected aircraft breakdown |

## Sub-Components

### StatCard
Simple stat display component:
```typescript
function StatCard({ label, value }: { label: string; value: string | number })
```

### AircraftDetailView
Detailed breakdown for selected aircraft showing fuel phases as bar chart.

### ConfigurationComparison
Side-by-side comparison of saved configurations (up to 3).

## Key Functions

| Function | Purpose |
|----------|---------|
| `handleSave()` | Saves configuration with entered name |
| `toggleCompareSelection(id)` | Toggles config in comparison (max 3) |
| `generateQuickInsights()` | Generates AI feedback from analytics |

## Usage Example

```tsx
import AnalyticsPanel from './components/AnalyticsPanel';

function MissionWorkspace() {
  const handleSaveConfig = async (name: string) => {
    await mission.saveConfiguration(name);
    console.log(`Saved: ${name}`);
  };

  return (
    <MissionProvider>
      <AnalyticsPanel onSaveConfiguration={handleSaveConfig} />
    </MissionProvider>
  );
}
```

## Analytics Sections

### Mission Summary (2/3 width)
- Total Aircraft, Pallets, Weight, PAX
- Distance, Flight Hours, Avg CoB, Utilization

### Cost Breakdown
- Fuel Cost, Operating Cost, Total Cost, Cost/Ton-Mile
- Pie chart: Cost distribution
- Bar chart: Fuel by flight phase

### Fuel Efficiency Metrics
- Total Fuel, Avg lb/NM
- Additional from splits
- JP-8 cost per lb
- Reserve/Contingency percentages

### Per-Aircraft Comparison
- Stacked bar chart (fuel + operating)
- Clickable list for detailed view
- Expandable detail panel

### AI Insights
- Purple-themed card
- Bullet-pointed recommendations

### Right Sidebar (1/3 width)
- Saved Configurations list
- Configuration comparison (when enabled)
- Export Options (ICODES, PDF, SAAM CSV)
- Fuel Rate Reference (C-17, C-130)

### Save Dialog
Modal for entering configuration name before saving.
