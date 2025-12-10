# Route Planning, Visualization & Flight Dynamics Module
## Version: 0.1 – Dec 2025
## Scope
Add a new module on top of the existing load‑planning demo that lets a planner:

1. Upload/select a movement CSV (existing flow).
2. Define **start, stops, and destination** using:
   - A dropdown of known **military bases**, and/or  
   - Manually entered **lat/long coordinates**.
3. Build **multi‑leg flight plans** (complex routes) and assign which **aircraft + pallets/UTCs/pax** go on which leg.
4. Continuously compute and display:
   - Distances per leg and total route distance
   - Time en route per leg and total mission time
   - Simple fuel usage estimates
   - Live weather / winds impact (via public APIs)
   - Basic pitch / climb / bank / yaw envelope info for realism
5. Show all of this via **graphs + maps + dashboards**, updating in real time as:
   - The route is edited
   - Weather/wind data changes
   - Load plans or aircraft selections change

---

## 1. High‑Level User Stories

1. **Planner builds a route:**
   - “I upload the CSV, select C‑17, choose Hickam → Andersen → Kadena → destination, and see distance and time for each leg.”

2. **Route + load‑plan integration:**
   - “I assign pallets and vehicles to specific aircraft and legs, and the system shows which cargo is on which leg and when it arrives.”

3. **Weather & winds:**
   - “I toggle on ‘Fetch live winds’ and see ETAs and fuel margins update based on headwinds/tailwinds.”

4. **What‑if routing:**
   - “If I add a staging stop, I want to see how that changes total flight hours, fuel, and number of aircraft legs.”

5. **Pitch / yaw / bank sanity checks:**
   - “For tight legs near mountainous or contested areas, I want confirmation that the nominal bank angles, turn radius, and climb rates are within safe envelopes for C‑17/C‑130.”

6. **Optimization insight:**
   - “I want a one‑click comparison: current plan vs a naive ‘point‑to‑point’ plan, including extra distance flown, flight hours, and a rough cost delta.”

---

## 2. Inputs

### 2.1 Movement Data
Reuse movement CSV from core spec:

- `item_id, utc_id, description, quantity, weight_each_lb, total_weight_lb, length_in, width_in, height_in, type, advon_flag, hazmat_flag, pallet_id, axle_weights`

### 2.2 Route Definition Inputs

1. **Base dropdown:**
   - Backed by static JSON: `bases.json`
   - Fields per base:
     - `base_id` (e.g., HICKAM)
     - `name`
     - `icao` (e.g., PHIK, RJTY)
     - `iata` (optional)
     - `latitude_deg`
     - `longitude_deg`
     - `country`
     - `timezone`
     - `runway_length_ft` (for info only)
   - Seed list with major PACAF/AMC relevant bases, but design table to be extendable.

2. **Manual coordinate entry:**
   - User can input `lat, lon` directly.
   - Validated with:
     - Lat ∈ [-90, 90]
     - Lon ∈ [-180, 180]

3. **Aircraft & load‑plan linkage:**
   - For each **leg**, user chooses:
     - Aircraft type: `C17` or `C130`
     - Which **aircraft instance** from load‑plan set (e.g., `C17-1`, `C17-2`)
     - Which **load plan version** (if multiple per aircraft)
   - Internally, legs store a list of `assigned_pallet_ids` + `assigned_vehicle_ids`.

### 2.3 Settings

- Cruise speed by aircraft type (editable defaults):
  - C‑17: 450 KTAS
  - C‑130: 320 KTAS
- Fuel burn approximations (for optional savings calcs):
  - C‑17: `fuel_lb_per_nm`
  - C‑130: `fuel_lb_per_nm`
- Taxi + climb/descend overhead:
  - 0.5 hr per leg as default (configurable).

---

## 3. Data Sources / APIs

### 3.1 Weather & Wind API (generic)

Abstract interface; implementation can be any public aviation/weather API.

**Input:**
- Route polyline or sequence of waypoints (lat, lon)
- Altitude (cruise level, e.g., FL300)
- Time of departure (UTC)

**Output (per leg or per segment):**
- `wind_direction_deg`
- `wind_speed_kt`
- `temperature_c`
- Optional: `turbulence_risk`, `icing_risk`

System computes **headwind/tailwind component**:

```text
wind_component = wind_speed_kt * cos(track_deg - wind_direction_deg)
ground_speed = cruise_speed_kt - headwind_component
3.2 Optional Flight Routing API
Not required for MVP; route = great‑circle between bases.
Future hook: use API for airway routing, step climbs.

4. Core Calculations
4.1 Great‑Circle Distance
For each leg between waypoints (lat1, lon1) and (lat2, lon2):

text
Copy code
R = 3440.065 (nautical miles)
Δlat = lat2 - lat1
Δlon = lon2 - lon1

a = sin²(Δlat / 2) + cos(lat1) * cos(lat2) * sin²(Δlon / 2)
c = 2 * atan2( sqrt(a), sqrt(1 - a) )
distance_nm = R * c
Store:

distance_nm

distance_km = distance_nm * 1.852

4.2 Time En Route (no wind)
text
Copy code
time_enroute_hr = distance_nm / cruise_speed_kt
block_time_hr = time_enroute_hr + taxi_climb_descent_overhead_hr
4.3 Time En Route (with wind)
Use ground_speed_kt = cruise_speed_kt - headwind_component (may be + tailwind):

text
Copy code
time_enroute_hr = distance_nm / ground_speed_kt
If ground_speed_kt < cruise_speed_kt * 0.5, flag:

“High headwind: check fuel and routing.”

4.4 Fuel Estimate
Even if rough, define explicit formula:

text
Copy code
fuel_required_lb = reserve_factor * (distance_nm * fuel_lb_per_nm)
reserve_factor = 1.25  (25% buffer by default)
Per leg and total for route.

4.5 Payload per Leg
For each leg:

payload_weight_leg = Σ weight of pallets & vehicles assigned to that leg

payload_utilization = payload_weight_leg / aircraft_acl

5. Route Builder UI / UX
5.1 Route Builder Panel
Layout:

Left side:

CSV/movement selection

Base dropdown (start, waypoints, destination)

+ Add Leg button

Drag‑and‑drop list of legs (reorderable)

Right side:

Map (world map or theater map) showing:

Bases as nodes

Legs as arcs (colored by aircraft type)

Dynamic info cards:

Distance per leg

Time per leg

Fuel per leg

Payload per leg

5.2 Leg Editor
For each leg:

Dropdown: Origin base

Dropdown: Destination base

Dropdown: Aircraft type

Dropdown: Aircraft ID from load‑plan list

“Assign Cargo” widget:

Filter pallets/vehicles by:

UTC

ADVON vs main

HAZMAT

Checkboxes to include/exclude on this leg.

Real‑time validation:

Warn if:

payload_weight_leg > aircraft_acl

HAZMAT + PAX on same leg

Assigned pallets exceed pallet positions

5.3 Real‑Time Update Behavior
Whenever user:

Changes route (adds/removes legs)

Changes aircraft type

Changes assigned cargo

Enables/disables “use live winds”

The system:

Recomputes distances & times.

Recomputes fuel.

Regenerates graphs.

Updates insight widgets in <2 seconds for visible routes.

6. Graphs & Visualizations
6.1 Route Map
Interactive map (Leaflet/Mapbox/OpenLayers).

Each leg drawn as an arc, color‑coded:

Blue = C‑17

Green = C‑130

Orange = leg carrying MEDICAL_PRIORITY items

Red outline = leg with HAZMAT

Hover card:

Distance (nm)

Time en route

Payload weight

Fuel estimate

of pallets / vehicles
6.2 Timeline / Gantt View
X‑axis = time

Y‑axis = aircraft IDs (C17-1, C17-2, etc.)

Bars = legs flown by each aircraft

Gaps between legs = ground time (configurable)

Use to show:

Total mission duration

Which aircraft are critical path

6.3 Payload vs Distance Graph
For each leg:

X‑axis = leg index or distance

Y‑axis = payload utilization (% of ACL)

Helps visualize underfilled/overfilled legs.

6.4 Fuel & Headwind Graph
X‑axis = legs or cumulative distance

Y‑axis (left) = fuel required per leg

Y‑axis (right) = net headwind/tailwind component

7. Pitch / Yaw / Turn & Climb Envelopes (Simple Model)
This is not a full flight simulator. It’s a sanity‑check overlay for realism.

7.1 Bank Angle / Turn Radius
Approx formula:

text
Copy code
turn_radius_nm = (ground_speed_kt^2) / (11.26 * tan(bank_angle_deg))
Default planning bank angle: 25°

Display for each leg:

Minimum turn radius at planned speed

Message if route requires unrealistically tight turns at that speed (for now assume all long‑range legs have adequate turn space; this is mostly informational).

7.2 Climb / Descent Profile
For each leg:

Assume:

Climb rate: 1,500–2,000 ft/min

Descent rate: 1,500 ft/min

Compute approximate climb/descent time segments and show:

% of leg in climb

% of leg in cruise

% of leg in descent

Use this to:

Refine “block time” more realistically if desired.

7.3 Pitch / Yaw Indicators
No detailed equations needed; present:

“Nominal pitch/climb envelope is within normal parameters for this route”

If climb > planned service ceiling for given weight, flag:

“Planned cruise level exceeds recommended ceiling for payload — adjust altitude or payload.”

8. AI Insights for Route & Flight Feature
8.1 Route Efficiency Insight
Compute:

text
Copy code
baseline_distance = sum(distance_nm for naive direct leg(s))
planned_distance = sum(distance_nm for current route)
delta_distance_nm = planned_distance - baseline_distance
Show cost of complexity vs tighter routing:

Extra distance

Extra time

Extra fuel

8.2 Aircraft & Leg Optimization
Compare:

Naive plan:

All aircraft fly start → destination direct.

Staged plan:

Current multi‑stop route.

Compute and display:

Δ total flight hours

Δ number of legs

Estimated fuel savings (or increase)

8.3 Risk & Priority Callouts
“MEDICAL_PRIORITY cargo is currently scheduled to arrive on leg 3; if moved to leg 1, arrival is X hours earlier.”

“HAZMAT loaded on legs 2 and 4; check PAX allocation before finalizing.

9. Non‑Functional Requirements
Local/offline first:

If weather API unavailable:

Use standard atmosphere + nominal winds = 0 kt.

Show banner: “Live weather not available; using nominal conditions.”

Performance:

Recompute route metrics and update graphs within 2 seconds for up to:

50 aircraft

100 legs total

Explainability:

Every metric in graphs must be traceable:

Clicking on a graph element reveals the formula and the raw numbers used.

10. Integration Points with Existing Demo
Movement CSV selection:

This module reuses the same data loader and item IDs.

Load plan per aircraft:

Route legs refer to load‑plan artifacts generated by the existing solver:

aircraft_id

load_plan_id

pallet_ids

Export:

Add a new section in A2I export bundle:

/route_summary.pdf

/route_metrics.json

/route_visuals/ (PNG images of map & graphs)

11. Test Cases (High‑Level)
Simple two‑leg route (Hickam → Andersen → Destination):

Validate distances vs external calculator.

Check time & fuel scaling with different aircraft speeds.

Route with live wind = strong headwind:

Verify ETAs increase when headwind is applied.

Route with medical priority cargo:

AI recommends shifting MED pallets to earlier leg.

Route with HAZMAT + PAX:

System blocks or warns when both placed on same leg/aircraft.

No API connectivity:

System falls back to nominal conditions and clearly indicates this.

