# icodesExport.ts

## Module Purpose

ICODES-compatible export module for DoD/DLA standard-compliant load plan exports. Generates A2I (Air Asset Integration) bundle format with summary, per-aircraft plans, and documentation. Supports ICODES 7.x JSON structure and SAAM-compatible manifest exports.

## Dependencies

### Internal Modules
- `./pacafTypes` - AircraftLoadPlan, AllocationResult, AircraftSpec, PalletPlacement, VehiclePlacement, AIRCRAFT_SPECS, PALLET_463L
- `./flightSplitTypes` - SplitFlight, calculateFlightWeight, calculateCenterOfBalance
- `./routeCalculations` - formatMilitaryTime

### External Libraries
None (uses native DOM APIs for download)

## Exported Interfaces

### ICODESHeader
```typescript
interface ICODESHeader {
  format_version: string;          // "7.2"
  generated_date: string;          // ISO date
  generated_time_zulu: string;     // "1430Z"
  classification: string;          // "UNCLASSIFIED"
  originator: string;              // "ARKA-PACAF-DEMO"
  mission_id: string;              // "ARKA-20250115-1430"
  exercise_name?: string;
}
```

### ICODESLoadPlan
```typescript
interface ICODESLoadPlan {
  header: ICODESHeader;
  aircraft: ICODESAircraftRecord;
  station_data: ICODESStationData[];
  pallets: ICODESPalletRecord[];
  vehicles: ICODESVehicleRecord[];
  passengers: {
    total_count: number;
    weight_lb: number;
    seating_configuration: string;
  };
  balance: ICODESBalanceData;
  summary: {
    total_positions_used: number;
    total_positions_available: number;
    utilization_percent: number;
    total_cargo_weight_lb: number;
    payload_capacity_lb: number;
    payload_used_percent: number;
  };
  remarks: string[];
  warnings: string[];
}
```

### A2IBundle
```typescript
interface A2IBundle {
  summary: A2IBundleSummary;
  load_plans: ICODESLoadPlan[];
  risks_and_warnings: A2IRisksDocument;
  manifest_csv: string;
}
```

## Exported Functions

### loadPlanToICODES

Converts an internal AircraftLoadPlan to ICODES 7.x format.

```typescript
function loadPlanToICODES(
  loadPlan: AircraftLoadPlan,
  missionId?: string
): ICODESLoadPlan
```

**Parameters:**
| Name | Type | Default | Description |
|------|------|---------|-------------|
| loadPlan | `AircraftLoadPlan` | required | Internal load plan |
| missionId | `string` | auto-generated | Custom mission ID |

**Returns:** `ICODESLoadPlan`

**JSON Output Structure:**
```json
{
  "header": {
    "format_version": "7.2",
    "generated_date": "2025-01-15",
    "generated_time_zulu": "1430Z",
    "classification": "UNCLASSIFIED",
    "originator": "ARKA-PACAF-DEMO",
    "mission_id": "ARKA-20250115-1430"
  },
  "aircraft": {
    "aircraft_id": "C17-001",
    "aircraft_type": "C-17",
    "mission_design_series": "C-17A",
    "cargo_configuration": "MIXED"
  },
  "station_data": [...],
  "pallets": [...],
  "vehicles": [...],
  "passengers": {
    "total_count": 20,
    "weight_lb": 4500,
    "seating_configuration": "SIDEWALL"
  },
  "balance": {
    "total_cargo_weight_lb": 85000,
    "center_of_gravity_percent": 27.5,
    "within_envelope": true
  },
  "summary": {
    "utilization_percent": 72.5,
    "payload_used_percent": 48.3
  },
  "remarks": ["Phase: MAIN", "Sequence: 1"],
  "warnings": []
}
```

---

### splitFlightToICODES

Converts a SplitFlight to ICODES format with recalculated balance.

```typescript
function splitFlightToICODES(
  flight: SplitFlight,
  missionId?: string
): ICODESLoadPlan
```

**Additional Remarks:** Includes callsign, route (ICAO codes), and departure time

---

### generateA2IBundle

Creates a complete A2I bundle from allocation results.

```typescript
function generateA2IBundle(
  allocationResult: AllocationResult,
  splitFlights?: SplitFlight[]
): A2IBundle
```

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| allocationResult | `AllocationResult` | Complete allocation with all load plans |
| splitFlights | `SplitFlight[]` | Optional split flight data |

**Returns:** `A2IBundle`
```typescript
{
  summary: {
    bundle_id: string;
    generated_date: string;
    mission_id: string;
    classification: string;
    aircraft_summary: {
      total_aircraft: number;
      by_type: Record<string, number>;
      advon_count: number;
      main_count: number;
    };
    cargo_summary: {
      total_weight_lb: number;
      total_pallets: number;
      total_vehicles: number;
      total_pax: number;
      hazmat_present: boolean;
    };
    utilization_metrics: {
      average_acl_percent: number;
      min_acl_percent: number;
      max_acl_percent: number;
      underutilized_count: number;
    };
    validation: {
      all_plans_valid: boolean;
      cob_violations: number;
      weight_violations: number;
      warnings_count: number;
    };
  };
  load_plans: ICODESLoadPlan[];
  risks_and_warnings: {
    hazmat_items: [...];
    pax_hazmat_conflicts: [...];
    underutilized_sorties: [...];
    cob_concerns: [...];
    general_warnings: [...];
  };
  manifest_csv: string;  // CSV format manifest
}
```

---

### downloadICODESLoadPlan

Downloads a single ICODES load plan as JSON file.

```typescript
function downloadICODESLoadPlan(loadPlan: ICODESLoadPlan): void
```

**Filename:** `ICODES_{aircraft_id}_{date}.json`

---

### downloadA2IBundle

Downloads complete A2I bundle as JSON file.

```typescript
function downloadA2IBundle(bundle: A2IBundle): void
```

**Filename:** `A2I_BUNDLE_{mission_id}.json`

**Bundle Format:**
```json
{
  "_bundle_format": "A2I_COMPATIBLE",
  "_version": "1.0",
  "summary.json": "...",
  "risks_and_warnings.json": "...",
  "manifest.csv": "...",
  "load_plans/C17-001.json": "..."
}
```

---

### downloadManifestCSV

Downloads cargo manifest as CSV file.

```typescript
function downloadManifestCSV(bundle: A2IBundle): void
```

**CSV Columns:**
```
ITEM_ID,DESCRIPTION,PALLET_ID,AIRCRAFT_ID,WEIGHT_LB,HAZMAT
```

---

### downloadAllICODESPlans

Downloads all load plans as a single JSON file.

```typescript
function downloadAllICODESPlans(allocationResult: AllocationResult): void
```

**Filename:** `ICODES_ALL_PLANS_{mission_id}.json`

---

### downloadSplitFlightsICODES

Downloads split flights as ICODES format.

```typescript
function downloadSplitFlightsICODES(flights: SplitFlight[]): void
```

## Warnings Generated

The module automatically generates warnings for:
- Center of balance outside envelope
- HAZMAT materials aboard
- Aircraft at >95% payload capacity
- Aircraft overweight

## Edge Cases and Error Handling

1. **Empty allocation**: Returns valid bundle with zero aircraft
2. **No HAZMAT**: hazmat_items array is empty
3. **Missing pallet data**: Uses empty arrays
4. **Special characters in descriptions**: CSV escapes quotes with ""
5. **Browser download**: Uses Blob/URL.createObjectURL pattern

## Notes

- Mission ID format: `ARKA-{YYYYMMDD}-{HHMM}`
- Zulu time format: `{HHMM}Z`
- All weights are rounded to nearest pound
- Utilization percentages are rounded to 1 decimal place
- Passenger weight calculated at 225 lbs per person (with gear)
- Tiedown count: ceil(weight / 5000) × 2
- Shoring required: weight > 15,000 lbs
