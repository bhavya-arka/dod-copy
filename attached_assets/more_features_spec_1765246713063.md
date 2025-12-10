# Arka PACAF Demo – Feature Spec: “Better Than ICODES”

## 0. Context for This Task

You are modifying an existing project that already:
- Parses a **movement CSV** (UTCs, pallets, vehicles, PAX, hazmat, etc.).
- Generates **load plans** for C‑17 / C‑130 using ACL rules.
- Can export **ICODES‑style** load plans and A2I/SAM bundles (at least in basic form).
- Has some route / visualization scaffolding.

Your job: **upgrade the product** so that, if a US Air Force SNCO compared it to ICODES + ETA‑Teams + Tapestry, they’d say:

> “This actually makes my life easier and faster, while staying compatible with ICODES/A2I.”

Below are the features you must **verify, implement, or improve**.  
If something already exists, **refine it** to match the spec rather than duplicating.

Use the existing tech stack (inspect the repo first) and follow its patterns.

---

## 1. Data Ingestion & Validation – “Zero‑Friction Ingest”

### 1.1 Movement CSV ingest

**Goal:** Drag‑and‑drop a sanitized CSV and be ready to plan in < 5 seconds.

**Requirements:**

- Reuse existing CSV schema if present; otherwise, implement:

  ```text
  item_id, utc_id, description, quantity, weight_each_lb,
  total_weight_lb, length_in, width_in, height_in,
  type, advon_flag, hazmat_flag, pallet_id, axle_weights, notes
Implement a robust ingest pipeline:

Auto‑detect CSV delimiter.

Trim whitespace, normalize headers.

Convert booleans (TRUE/FALSE/true/false) reliably.

Parse axle_weights as a list if present (e.g. “[4000,3950]”).

1.2 Validation rules
Implement a validation layer that produces structured errors and friendly UI messages:

Checks:

total_weight_lb == quantity * weight_each_lb (warn on mismatch).

Dimensions > 0 for palletizable / rolling stock.

Overheight / overwidth vs aircraft constraints (C‑17, C‑130 from spec).

Hazmat + PAX compatibility (no mixing where rules forbid).

type ∈ {PALLETIZABLE, ROLLING_STOCK, PAX, PREBUILT_PALLET}.

For each row, produce:

severity: "ERROR" | "WARNING" | "INFO"

code: short string (e.g. "ZERO_WEIGHT", "OVERSIZE_C130")

message: human readable

suggestion: how user can fix it

1.3 UI for ingest & validation
After upload, show:

Summary banner: X items, Y errors, Z warnings.

Filterable table of errors (by severity, UTC, type).

Button: “Proceed anyway (ignore non‑critical warnings)”.

If an item is completely invalid (e.g., zero dimensions and zero weight), exclude it from planning but list it in an “Excluded Items” panel.

2. Automatic Aircraft Count & Multi‑Aircraft Load Planning
This is one of the main differentiators vs ICODES.

2.1 Aircraft capability model
Ensure there is a central configuration for aircraft:

C‑17:

ACL (allowable cabin load) in lb.

Number of pallet positions.

Max dimensions for palletizable cargo.

Rolling‑stock rules (max length/width/height, axle limits).

C‑130:

Separate ACL, pallet positions, dimensional and weight constraints.

Implement this as one config file or constant module.
All planning logic must read from this, not hard‑code numbers in multiple places.

2.2 Pack items into aircraft automatically
Design a planning pipeline:

Filter items:

Group by type (palletizable, rolling stock, pax).

Tag ADVON vs non‑ADVON by advon_flag or notes.

Priority ordering:

Load sequence:

ADVON items and MED_PRIORITY first.

Core mission cargo.

Filler/low priority.

Aircraft assignment:

For the initial demo, use a greedy but deterministic algorithm:

For each aircraft of chosen type:

Fill pallets until either ACL or pallet slots are nearly maxed.

Place rolling stock respecting length/width/height constraints.

Keep/compute center‑of‑balance placeholder (even if approximate).

When capacity is exceeded, open a new aircraft and continue.

Output:

A list of aircraft instances, e.g.:

json
Copy code
{
  "aircraft_id": "C17-1",
  "type": "C17",
  "total_payload_lb": 168900,
  "pallets": [...],
  "rolling_stock": [...],
  "pax": [...],
  "warnings": [...]
}
2.3 “How many aircraft?” summary
From that result, produce:

Totals by type:

text
Copy code
7 x C-17
2 x C-130
Utilization:

text
Copy code
Average ACL utilization per C-17: 82%
Max / Min ACL utilization
Number of underutilized sorties (e.g. < 50% ACL)
UI: show a Summary card for aircraft count and utilization on top of the load planning view.

3. Scenario-Ready Outputs for A2I / ICODES
Goal: system outputs must be directly usable in existing DoD workflows.

3.1 ICODES-compatible load plans
We don’t need to simulate ICODES completely, but we must produce:

Per‑aircraft load plan payload that can be mapped to an ICODES load plan:

Pallet positions with assigned items.

Rolling stock position/axle weights.

Overall load weight and center of balance placeholders.

Basic tie‑down summary (even simplified).

Format:

JSON object per aircraft in a folder, e.g. exports/icodes/aircraft_<id>.json.

Keep field names descriptive and consistent (no abbreviations).

3.2 A2I/SAM bundle
Create an export bundle function that produces:

summary.json – high‑level info (aircraft counts, totals, warnings).

load_plans/ – per‑aircraft JSON load plans.

docs/:

mission_summary.pdf or mission_summary.md (text describing the plan).

risks_and_warnings.md (hazmat, PAX, underutilization, etc).

Implementation detail:

If there is already an export function, extend it to include these additional files/fields.

Add a button in the UI: “Export A2I/SAM Bundle”.

4. What-If Planning & Rapid Re‑Planning
This is where we outperform ICODES.

4.1 Scenario objects
Define a “scenario” object:

json
Copy code
{
  "scenario_id": "string",
  "name": "string",
  "aircraft_mix": { "C17": 6, "C130": 4 },
  "advon_first": true,
  "rules": {
    "max_acl_fraction": 0.95,
    "allow_mixed_hazmat_pax": false
  },
  "results": {
    "aircraft": [...],
    "metrics": { ... }
  }
}
Store scenarios in memory and optionally in a local file/DB.

4.2 What-if controls in the UI
Add a “What‑if” panel:

Controls:

Slider / input for # of C‑17, # of C‑130.

Checkbox: “ADVON first”.

Checkbox: “Allow hazmat + pax on same aircraft” (demo: keep false, show warning if user tries).

Button:

“Recompute Plan” – re-run planner with modified parameters.

4.3 Delta comparison
After recompute:

Show diff vs previous scenario:

Change in aircraft count.

Change in ACL utilization.

Change in total sorties.

Change in estimated fuel (tie to your route/fuel model if available, or stub with TODO).

Implement a small diff view:

text
Copy code
Scenario A -> Scenario B:
- C-17 sorties: 7 -> 6  (-1)
- Total payload: 420,000 lb (unchanged)
- Est. fuel: -4.3%
- Critical path arrival: -2.1 hours
5. Route, Timeline & Weather Integration (Tie‑in Only)
You already have a separate spec for route + graphs; here we only define integration hooks from this feature set:

5.1 Aircraft → route legs
Ensure each aircraft load plan can be associated with route legs:

Add optional fields:

json
Copy code
{
  "aircraft_id": "C17-1",
  "assigned_route_legs": ["LEG-1", "LEG-2"]
}
If route module is present, allow:

Selection of aircraft and leg assignments from a dropdown.

Once assigned, route module can compute distances, ETAs, etc.

5.2 Metrics back to load planner
Support a simple feedback loop:

Route module publishes metrics:

json
Copy code
{
  "aircraft_id": "C17-1",
  "total_distance_nm": 4200,
  "total_block_time_hr": 11.3,
  "fuel_estimate_lb": 85000
}
Display this on each aircraft card in the load planner view.

6. Explainability & Operator‑Friendly Reasoning
Goal: SNCO must understand why the system chose a given plan.

6.1 Per-aircraft explanation
For each aircraft, generate a structured explanation string:

Example:

text
Copy code
C17-1:
- Filled to 92% of ACL (158,000 / 171,000 lb).
- 16 pallets + 1 rolling-stock vehicle.
- Rolling stock positioned to keep center of balance within limits.
- Advanced echelon (ADVON) items loaded on this aircraft to arrive first.
Store this as explanation in the aircraft object.

6.2 Aggregate explanation / “why 7 aircraft?”
Implement a function that analyzes all aircraft and returns:

The “bottleneck” items:

e.g., single heavy vehicle that forces an extra sortie.

The ACL / dimensional constraints that prevent packing them tighter.

Text example:

text
Copy code
We require 7 C-17s because:
- Vehicle XR-55 (15,500 lb, oversize for C-130) must travel alone with
  support pallets due to dimensional constraints.
- Remaining pallets cannot be safely combined into fewer aircraft without
  exceeding 95% ACL or pallet position limits.
Expose this explanation in UI as a “Why this many aircraft?” link.

7. Compatibility & Non‑Disruptive Deployment
Do NOT try to “replace ICODES” in the demo.
The story is augmentation, not replacement.

Implementation expectations:

Keep a clear boundary:

Planning engine → our code.

ICODES → downstream consumer.

Provide easily exportable, well‑structured data so ICODES users can trust and trace.

Add a short “Compliance Notes” section in docs/output:

List simplifying assumptions vs full ICODES.

Make it obvious this is a demo / prototype, not a certified tool.

8. QoL Features & UX Improvements
This section is explicitly about “how to implement” user‑friendly improvements.

8.1 UI/UX basics
Loading states:

Show spinners while planning and exporting.

Error states:

Clear, dismissible error banners.

Keyboard:

Ctrl+Z / Cmd+Z for last change to scenario parameters (if feasible).

8.2 Scenario management
Allow:

Save scenario (name + timestamp).

Load scenario from a list.

Duplicate scenario.

Optional: auto‑save “Last Scenario” and load it by default on startup.

8.3 Search & filter
Anywhere lists are long (items, aircraft, errors):

Add search by:

utc_id

description

aircraft_id

Add filters:

ADVON only

MED_PRIORITY only

HAZMAT only

Under/overutilized aircraft

8.4 Performance logging
Add simple performance metrics (e.g., console logs or small debug pane):

csv_load_ms

planning_ms

export_ms

The goal is to ensure the planning loop feels instantaneous to a human operator.

9. Implementation Checklist for Replit Builder
When you start, do this in order:

Inspect existing code:

Identify modules for CSV ingest, planning, export, UI.

Do not duplicate functionality; extend where necessary.

Implement / tighten:

Data validation layer with structured errors.

Centralized aircraft capability config.

Multi‑aircraft load planner that outputs structured aircraft objects.

Scenario abstraction + what‑if recompute.

A2I/SAM export bundle structure.

Explanations for aircraft count and load allocation.

Wire up UI components:

Ingest + validation view.

Aircraft summary cards with utilization.

Scenario controls and diff views.

“Why this many aircraft?” explanation links.

Add QoL features:

Filters, search, basic keyboard support.

Scenario save/load.

Performance logs.

Test / Demo flows:

Use provided mock CSVs.

Confirm:

Aircraft count is consistent.

Warnings appear for hazmat/pax violations.

Export bundle files are created correctly.

Explanations are human‑readable.

10. Output
When you're done, the system should be able to:

Take a sanitized movement CSV for a 12‑ship fighter package.

Ingest and validate it with clear messages.

Compute required aircraft count automatically.

Generate multi‑aircraft load plans with priorities (ADVON, medical, hazmat).

Explain why that number of aircraft is needed.

Export ICODES‑compatible and A2I‑friendly artifacts.

Let users run rapid what‑if scenarios with visual feedback and minimal clicks.