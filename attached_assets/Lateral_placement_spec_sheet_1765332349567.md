# Arka – Lateral & Vertical Placement Spec (3D/2D/Parsing/CoB)

## 0. Objective

Ensure that **all cargo placement (especially loaders, vehicles, pallets)** in both 2D and 3D views:

1. Obeys **USAF-style loading rules** for lateral spacing, longitudinal spacing, and vertical clearances.
2. Prevents illegal overlap/interpenetration of 3D geometry.
3. Produces accurate **Center of Balance (CoB)** and weight distribution.
4. Stays consistent between:
   - Parsed input data  
   - Internal cargo layout model  
   - 2D bay diagram  
   - 3D visualization  

---

## 1. Data Model – What Every Placed Item Must Know

Each cargo object after parsing/classification must have:

```ts
interface PlacedCargo {
  id: string;
  lead_tcn: string | null;
  description: string;

  // Physical properties (inches / pounds)
  length_in: number;   // X axis (aircraft fore–aft)
  width_in: number;    // Y axis (left–right)
  height_in: number;   // Z axis (floor–up)
  weight_lb: number;

  cargo_type: "PALLETIZED" | "ROLLING_STOCK" | "LOOSE_CARGO" | "PAX_RECORD";

  // Placement within aircraft
  aircraft_id: string;
  deck: "MAIN" | "RAMP";
  x_start_in: number;  // distance from aircraft reference (RDL 0)
  y_center_in: number; // lateral centerline offset (+R, -L)
  z_floor_in: number;  // should be 0 for floor cargo

  // Derived
  x_end_in: number; // x_start_in + length_in
  y_left_in: number;
  y_right_in: number;
  z_top_in: number;

  // Flags
  is_hazardous?: boolean;
  scg_code?: string;   // for explosives, future use
}
The same model drives 2D, 3D, and CoB calculations.

2. Lateral Placement Rules (Left–Right)
2.1 Fuselage Width Envelope
For each aircraft type (starting with C‑17):

Define max_half_width_in for usable cargo (e.g. ~98 in from centerline).

Enforce:

pseudo
Copy code
y_left_in  >= -max_half_width_in
y_right_in <=  max_half_width_in
Items violating this are invalid placements.

2.2 Lateral Spacing Between Cargo Items
For any two cargo items A and B on the same deck and overlapping along X:

Compute lateral gap:

pseudo
Copy code
gap_lr = max( A.y_left_in, B.y_left_in )   // not needed directly, see below
overlap_lr = min(A.y_right_in, B.y_right_in) - max(A.y_left_in, B.y_left_in)
Rules:

No interpenetration
If overlap_lr > 0 and X overlap > 0 and Z overlap > 0 → 3D collision → invalid.

Minimum lateral clearance (rolling stock)
If both items are ROLLING_STOCK (vehicles, loaders, trailers)
and they have protrusions (flag in cargo definition or description check),
require ≥ 2 inches lateral clearance:

pseudo
Copy code
if rolling_stock_pair && overlap_lr > -2:  // -2 to allow ≥ 2" gap
    invalid: "INSUFFICIENT_LATERAL_CLEARANCE"
Palletized cargo on pallets
For pure pallets (463L), no minimum lateral gap is required beyond no collision.

Future: SCG / hazardous spacing
If is_hazardous and SCG codes incompatible → enforce special standoff (future feature placeholder).

2.3 Centerline Logic
Palletized cargo defaults to centerline: y_center_in = 0.

Rolling stock may be:

Centered, or

Offset if allowed by clearances.

2D/3D UIs must display offset clearly (e.g., shaded floor lanes).

3. Longitudinal Placement & Spacing (Fore–Aft)
Even though you asked lateral‑focused, longitudinal rules must also be enforced for valid CoB.

3.1 Basic Spacing
For any two items on same deck with overlapping lateral/Z:

Compute X overlap:

pseudo
Copy code
overlap_x = min(A.x_end_in, B.x_end_in) - max(A.x_start_in, B.x_start_in)
Rules:

No interpenetration: if overlap_x > 0 and Y/Z overlap > 0 → collision.

Preferred longitudinal clearance for vehicles: at least 4 inches between rolling stock.
If you allow 0" spacing, each must be independently restrained and not blocking tie-downs (future tie‑down engine).

For now, spec:

pseudo
Copy code
if rolling_stock_pair and overlap_x > -4:
    warning or error depending on strictness
3.2 Section Boundaries
Forward boundary of cargo floor: x >= cargo_floor_start_in.

Aft boundary (ramp end): x_end_in <= cargo_floor_start_in + cargo_floor_length_in + ramp_length_in.

4. Vertical Limits & Clearance (Floor–Up)
Vertical limits are important and must be enforced because aircraft have:

Hard internal height limits.

Ramp‑specific height limits.

4.1 Deck Height Envelopes
For each aircraft and station or section define max_height_in.

Example logic:

ts
Copy code
interface HeightZone {
  x_start_in: number;
  x_end_in: number;
  max_height_in: number;
}
For each cargo item:

pseudo
Copy code
for zone in height_zones where item.x range intersects zone:
    if item.height_in > zone.max_height_in:
        invalid: "OVERHEIGHT_FOR_ZONE"
If the item spans multiple zones, enforce against the minimum height limit within its span.

4.2 Ramp‑Specific Height Limits
Define a RAMP deck with its own max_height_in (typically lower).

Any cargo placed on ramp must comply with ramp height limit.

5. 3D & 2D Component Requirements
5.1 Shared Geometry Engine
Single source of truth for collision detection and bounds checking; both 2D and 3D components call the same geometry functions.

Core functions:

ts
Copy code
function checkBounds(item: PlacedCargo, aircraft: AircraftGeometry): ValidationIssue[];
function checkCollisions(items: PlacedCargo[]): ValidationIssue[];
function checkHeightLimits(item: PlacedCargo, heightZones: HeightZone[]): ValidationIssue[];
function computeCoB(items: PlacedCargo[], aircraft: AircraftGeometry): number; // percent
5.2 3D Component
Renders each cargo item at (x_start_in, y_center_in, height_in) scaled.

Shows color state:

Green: valid

Yellow: warnings (clearance minimal, high CoB, etc.)

Red: invalid / overlapping / overheight.

Shows CoB arrow at correct X position based on computeCoB.

Optionally, draw transparent fuselage envelope so you can see when items exceed height or width.

5.3 2D Floor Plan
Top‑down view using same coordinates.

Draws:

Cargo rectangles with labels.

Aircraft centerline.

Height zones and station numbers.

On hover, show same data as 3D (dims, weight, bounds, validity).

6. Parsing Layer – Ensuring Placement Data is Valid
Parsing must populate geometry‑relevant fields correctly:

Convert all dims to inches and weight to pounds.

Classify cargo_type (palletized vs rolling stock) using the pallet parsing spec you already created.

For palletized cargo:

Snap length_in and width_in to 463L dims if near (88×108).

For rolling stock:

Preserve actual dims; do not force them into pallet dims.

Invalid or suspicious rows must never be auto‑placed; they must be flagged.

7. CoB Calculation – Integration with Placement
7.1 Required Inputs
For each aircraft:

Define:

ref_rdl_in (reference datum location).

moment_arm_in for each pallet/vehicle station if you’re using station‑based math;
or use continuous X coordinates with the ref datum.

7.2 Formula
For each placed item:

pseudo
Copy code
item_arm_in = (item.x_start_in + item.x_end_in) / 2 - ref_rdl_in
item_moment = item_arm_in * item.weight_lb
Then:

pseudo
Copy code
total_weight = Σ item.weight_lb
total_moment = Σ item_moment

cob_arm_in = total_moment / total_weight
To convert to percentage of cargo bay:

pseudo
Copy code
cob_percent = (cob_arm_in - bay_start_in) / (bay_length_in) * 100
7.3 Valid Range
Define per‑aircraft allowed CoB range in inches or percent.

If cob_percent outside allowed range → invalid load.

If near boundaries (e.g. within 5%) → warning.

3D & 2D must both show CoB in same position and highlight state.

8. Validation Pipeline (Order of Checks)
When user adds/moves/removes cargo, run in this order:

Bounds Check (checkBounds)

width / height / length vs aircraft envelope.

Collision Check (checkCollisions)

3D intersection.

Lateral & Longitudinal Clearance Check

Extra spacing rules for rolling stock.

Height Zones Check (checkHeightLimits).

CoB Calculation (computeCoB)

mark tail‑heavy / nose‑heavy states.

Result Aggregation

Items may have multiple issues; UI shows icons & messages.

No export to ICODES unless no errors at aircraft level.

9. Implementation Checklist for Builder
 Implement shared geometry module with:

bounds check

collision check

lateral/longitudinal clearance logic

height zone enforcement

CoB calculation

 Wire 2D & 3D components to this module; remove any duplicated incorrect math.

 Update parsing layer to:

normalize units

classify cargo correctly

set item dims (pallet vs rolling stock) correctly.

 Ensure 3D CoB arrow uses computeCoB() — no ad‑hoc approximations.

 Add regression tests:

loaders adjacent (valid)

loaders overlapping by 1" (invalid)

overheight pallet in ramp zone (invalid)

heavy aft‑loaded configuration producing invalid CoB.

