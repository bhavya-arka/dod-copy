# UrgentBriefScreen

## Description

Quick 1-click briefing output screen designed for leadership meetings requiring instant aircraft estimates. Displays aircraft counts and key metrics in a visually impactful dark-themed layout.

## Props Interface

```typescript
interface UrgentBriefScreenProps {
  parseResult: ParseResult;              // Parsed movement list data
  allocationResult: AllocationResult;    // Aircraft allocation results
  insights: InsightsSummary;             // Analytics and weight drivers
  onViewLoadPlans: () => void;           // Navigate to detailed load plans
  onBack: () => void;                    // Navigate back
  onHome?: () => void;                   // Navigate to home (optional)
}
```

## State Management

This is a stateless presentational component. All data is passed via props.

### Hooks Used
None - pure presentational component.

## Frameworks/Libraries

| Library | Purpose |
|---------|---------|
| React | Core UI framework |
| Framer Motion | Staggered entrance animations |

## Dependencies

### Types
- `AllocationResult` from `../lib/pacafTypes` - Aircraft allocation data
- `ParseResult` from `../lib/pacafTypes` - Parsed movement data
- `InsightsSummary` from `../lib/pacafTypes` - Analytics summary
- `AircraftType` from `../lib/pacafTypes` (imported but unused - candidate for cleanup)

## Key Data Displayed

### Primary Metrics (Large Numbers)
| Metric | Description | Color |
|--------|-------------|-------|
| ADVON Aircraft | Advance echelon aircraft count | Blue |
| TOTAL AIRCRAFT | Combined aircraft requirement | White (highlighted) |
| MAIN Aircraft | Main body aircraft count | Green |

### Secondary Metrics
| Metric | Source |
|--------|--------|
| Total Pallets | `allocationResult.total_pallets` |
| Rolling Stock | `allocationResult.total_rolling_stock` |
| Personnel | `allocationResult.total_pax` |
| Items Validated | `summary.valid_items` |

### Weight Distribution
Visual progress bar showing total weight against fleet capacity.
```typescript
// Capacity calculation (assumes C-17 payload)
capacity = allocationResult.total_aircraft * 170900
utilization = (allocationResult.total_weight / capacity) * 100
```

### Top 5 Heaviest Items
Lists items from `insights.weight_drivers` with:
- Rank number
- Description
- Weight in lbs
- Percentage of total weight

### Warnings
Displays allocation warnings from `allocationResult.warnings` in amber styling.

## Usage Example

```tsx
import UrgentBriefScreen from './components/UrgentBriefScreen';

function BriefingPage() {
  return (
    <UrgentBriefScreen
      parseResult={parsedData}
      allocationResult={allocationData}
      insights={insightsData}
      onViewLoadPlans={() => navigate('/load-plans')}
      onBack={() => navigate(-1)}
      onHome={() => navigate('/')}
    />
  );
}
```

## Animation Sequence

| Element | Delay | Animation |
|---------|-------|-----------|
| Title | 0ms | Fade in + slide up |
| Big Numbers Grid | 100ms | Fade in + scale |
| Weight Distribution | 200ms | Fade in + slide up |
| Key Stats Grid | 300ms | Fade in + slide up |
| Heaviest Items | 400ms | Fade in + slide up |
| Warnings | 500ms | Fade in + slide up |
| View Button | 600ms | Fade in + slide up |

## Visual Theme

Dark theme with:
- Gradient background: `from-slate-900 via-blue-900 to-slate-900`
- Glassmorphism cards: `bg-slate-800/50 backdrop-blur`
- Border accents for emphasis
- Blue shadow glow on primary metric
