# insightsEngine.ts

## Module Purpose

AI Insights Engine for PACAF airlift operations. Generates summaries, anomaly detection, and optimization recommendations based on movement lists and allocation results. Provides actionable, data-driven insights for cargo planning and fleet utilization.

## Dependencies

### Internal Modules
- `./pacafTypes` - MovementItem, ClassifiedItems, AllocationResult, AIInsight, InsightsSummary, AircraftLoadPlan, AIRCRAFT_SPECS

### External Libraries
None

## Exported Interfaces

### AIInsight
```typescript
interface AIInsight {
  id: string;
  category: 'weight_driver' | 'risk_factor' | 'hazmat' | 'inefficiency' | 'recommendation';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  affected_items?: string[];
  recommendation?: string;
}
```

### InsightsSummary
```typescript
interface InsightsSummary {
  insights: AIInsight[];
  weight_drivers: Array<{
    item_id: string;
    description: string;
    weight: number;
    percent_of_total: number;
  }>;
  volume_drivers: Array<{
    item_id: string;
    description: string;
    volume_cuft: number;
    percent_of_total: number;
  }>;
  critical_items: MovementItem[];
  optimization_opportunities: string[];
}
```

## Exported Functions

### analyzeMovementList

Comprehensive analysis of movement list items before allocation.

```typescript
function analyzeMovementList(
  items: MovementItem[],
  classifiedItems: ClassifiedItems
): InsightsSummary
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| items | `MovementItem[]` | All movement items |
| classifiedItems | `ClassifiedItems` | Items classified by type (pallets, rolling stock, PAX, etc.) |

**Returns:** `InsightsSummary`

**Insights Generated:**

| ID | Category | Severity | Trigger |
|----|----------|----------|---------|
| `weight_concentration` | weight_driver | info | Top 3 items > 50% of total weight |
| `c17_required` | risk_factor | warning | Vehicles exceed C-130 ramp width |
| `rolling_stock_summary` | recommendation | info | Any rolling stock present |
| `hazmat_present` | hazmat | warning | HAZMAT items detected |
| `height_optimization` | inefficiency | warning | Pallets > 96" (reduced capacity) |
| `pax_planning` | recommendation | info | PAX items present |
| `critical_items` | risk_factor | warning | Items > 8,000 lbs or > 100" |

**Optimization Opportunities:**
- Loose item consolidation (> 5 items)
- PAX/HAZMAT separation
- Aircraft type recommendations

---

### analyzeAllocation

Analyzes completed allocation for issues and optimization.

```typescript
function analyzeAllocation(
  result: AllocationResult
): AIInsight[]
```

**Insights Generated:**

| ID | Category | Severity | Trigger |
|----|----------|----------|---------|
| `low_utilization` | inefficiency | warning | Average utilization < 70% |
| `high_utilization` | recommendation | info | Average utilization > 90% |
| `cob_warning_{id}` | risk_factor | critical | CoB outside envelope |
| `unloaded_items` | risk_factor | critical | Items couldn't be loaded |
| `near_max_weight` | risk_factor | warning | Aircraft > 95% payload |
| `position_limited` | inefficiency | info | All positions full but < 80% weight |

**Example Output:**
```typescript
[
  {
    id: 'low_utilization',
    category: 'inefficiency',
    severity: 'warning',
    title: 'Low Aircraft Utilization: 65%',
    description: 'Fleet has 45K lbs of unused capacity. Consolidating loads could reduce aircraft count.',
    recommendation: 'Consider reducing to 3 aircraft at 85% utilization target.'
  },
  {
    id: 'cob_warning_C17-002',
    category: 'risk_factor',
    severity: 'critical',
    title: 'CoB OUT OF LIMITS: C17-002',
    description: 'Center of Balance at 35.2% is too aft. Safe envelope is 15-35%.',
    affected_items: ['C17-002'],
    recommendation: 'Shift approximately 50K lbs of cargo forward to correct balance.'
  }
]
```

---

### explainAircraftCount

Generates natural language explanation of aircraft requirements.

```typescript
function explainAircraftCount(result: AllocationResult): string
```

**Returns:** Multi-line explanation string

**Example:**
```
The solver determined 4 C-17 aircraft are required.

ADVON Phase: 1 aircraft
MAIN Phase: 3 aircraft

Limiting Factors:
- Weight constraint: 3 aircraft needed (250,000 lbs / 85,000 lbs per aircraft)
- Position constraint: 4 aircraft needed (72 pallets / 18 positions per aircraft)
- Rolling stock: 3 vehicles loaded first per aircraft
```

---

### explainSecondAircraft

Explains why a second aircraft was needed.

```typescript
function explainSecondAircraft(result: AllocationResult): string
```

**Returns:** Explanation with specific items loaded on second aircraft

---

### identifyWeightConstrainedPallet

Finds the most weight-constrained pallet in the allocation.

```typescript
function identifyWeightConstrainedPallet(result: AllocationResult): string
```

**Returns:** Formatted string with pallet details

**Example:**
```
Most weight-constrained pallet: PAL-007 on C17-001
Utilization: 98%
Contents: Generator 15kW (3,500 lbs), Tool Kit (1,200 lbs)
Total weight: 9,800 lbs
```

---

### generateQuickInsights

Generates concise insights for analytics panel display.

```typescript
function generateQuickInsights(
  allocationResult: AllocationResult,
  fuelBreakdown?: {
    base_fuel_lb: number;
    additional_fuel_from_splits: number;
    cost_per_lb: number;
  } | null
): string[]
```

**Returns:** Array of insight strings (typically 3-5)

**Example Output:**
```typescript
[
  "Excellent fleet efficiency at 92% utilization. All aircraft well-loaded.",
  "Center of Balance averaging 27.5% across fleet - optimally centered in safe envelope.",
  "Large 5-aircraft formation. Stagger departures by 15-30 min to avoid airspace congestion.",
  "3 HAZMAT pallets on 2 aircraft. Ensure certified load crews and proper segregation."
]
```

**Insights Include:**
- Fleet utilization assessment
- Center of balance status
- Fuel cost impact from splits
- Formation size recommendations
- HAZMAT summary

## Thresholds Reference

| Metric | Low | Target | High |
|--------|-----|--------|------|
| Fleet Utilization | < 70% | 85% | > 90% |
| CoB Optimal Range | - | 27-28% | - |
| Near Max Weight | - | - | > 95% |
| Underutilized Aircraft | < 50% | - | - |

## Edge Cases and Error Handling

1. **Empty items array**: Returns empty insights with zero totals
2. **Single aircraft**: No second aircraft explanation available
3. **No pallets**: Weight-constrained pallet function returns "No pallets are weight-constrained"
4. **Division by zero**: Checks for non-zero totals before percentage calculations
5. **Missing fuel breakdown**: Skips fuel-related insights

## Notes

- Volume calculated as (L × W × H) / 1728 cubic feet
- PAX weight: 225 lbs per person (includes gear)
- Overheight penalty: Pallets > 96" limited to 8,000 lbs (vs 10,000 lbs)
- C-17 PAX capacity: 102, C-130 PAX capacity: 92
- All percentages rounded to whole numbers in descriptions
