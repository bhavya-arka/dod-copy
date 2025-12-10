# Arka – Flight Manager Flowchart Overhaul (PACAF Demo)

You are modifying an existing web app (visible in the repo) that already has:

- A **Flight Manager** section with:
  - List of flights (callsigns, origin/destination, aircraft, weight, etc.).
  - Tabs like **Flowchart**, **Cargo Split**, **Routes & Fuel**, **Compare**.
  - Working distance / time / fuel calculations.
  - Export buttons: **Export ICODES**, **Export PDF**, **Save Changes**.
- A data model for:
  - Flights (origin, destination, ETD/ETA, aircraft type).
  - Pallets / cargo assignments.
  - Calculated metrics (weight, center of balance, weather status, etc.).

Your job is to **overhaul the Flight Manager UI and control flow** so that:

> The entire experience is driven by a **flowchart‑style designer**, where flights are starting nodes and users connect them to airbase nodes and route nodes to build, edit, and visualize the mission.

You must:
- Keep all existing calculations and exports working.
- Move all planning interactions into the flowchart paradigm.
- Define and implement clear UX flows, error states, and edge‑case handling.
- Make the codebase and UI clean enough that another AI agent can extend it.

Use the existing tech stack in the repo (inspect first). If there is already a graph/diagram library, extend it; otherwise, use a standard React diagram library such as **React Flow**.

---

## 1. Core Concepts & Data Model

### 1.1 Node Types (Graph Model)

Introduce a graph model for the Flight Manager’s “Flowchart” tab:

1. **Flight Start Node**
   - Represents a specific planned flight (e.g., `REACH01`, `REACH2`).
   - Maps 1‑to‑1 to an existing flight object in the backend.
   - Immutable identity: deleting the flight in the graph should delete the underlying flight.

   Fields (in node data):
   - `flightId` (internal ID)
   - `callsign` (e.g., REACH01)
   - `aircraftType` (`C17`, `C130`, etc.)
   - `missionDay` / `D+X` (if present)
   - `summary`:
     - pax count
     - total weight
     - pallet count
   - `statusFlags`:
     - warnings (e.g., ⚠ for high ACL usage, hazmat, etc.)

2. **Airbase Node**
   - Represents a base/airfield (origin, stop, or destination).
   - Backed by existing `bases.json` data (ICAO, name, coords, etc.).
   - Multiple flights can connect to the same Airbase node.

   Fields:
   - `baseId`
   - `name`
   - `icao`
   - `country`
   - `runwayLengthFt`
   - `weatherSummary` (if weather module is active)
   - `isOrigin` / `isDestination` flags per connection (kept in edges).

3. **Route Leg Edge**
   - Directed edge representing a **flight leg**: Flight Start Node → Airbase → Airbase → … (sequence).
   - The flight’s path is the ordered sequence of Airbase nodes connected to its Flight Start Node.

   Fields:
   - `flightId`
   - `legIndex` (0, 1, 2, … per flight)
   - `fromNodeId` / `toNodeId`
   - Derived metrics (distance, time, fuel, weather en‑route).

4. **Cargo Group Node (optional, but powerful)**
   - Logical grouping of pallets / cargo assigned to a leg or flight.
   - For now we can represent cargo at the **flight level**, but node support should be ready.
   - Node fields:
     - `groupId`
     - `flightId`
     - `legIndex` (optional)
     - `totalWeight`
     - `palletCount`
     - `priority` (e.g., ADVON, MEDICAL, STANDARD)
     - `hazmat` flag.

**Important:** All graph entities (nodes/edges) must remain in sync with the existing domain models (flight objects, routes, cargo allocations). That means:

- Changes in the graph update the underlying state.
- If existing backend code expects a list of flights with origin/destination and route legs, your flowchart edits must update those correctly.

---

## 2. Layout & High‑Level UX

### 2.1 Page Layout

Use a **three‑pane layout** for the Flight Manager → Flowchart tab:

1. **Left Sidebar – Flight List & Filters**
   - Displays all flights in the scenario as cards:
     - Callsign, aircraft, origin/destination summary, weight, pax, warnings.
   - Each card is:
     - Click‑to‑focus (selects the corresponding Flight Start Node in the graph and centers on it).
     - Drag‑enabled:
       - Optional: dragging a flight card onto the canvas could create or reposition its Flight Start Node.

   Controls:
   - “+ Add Flight” button (creates a new blank flight + node).
   - Filters:
     - By aircraft type.
     - By status (has route, no route, overloaded, etc.).
   - Search bar: search by callsign, base, etc.

2. **Center Canvas – Flowchart Designer**
   - Infinite pan/zoom canvas hosting all nodes and edges.
   - Shows flight nodes on the left, airbase nodes to the right (auto layout or user‑arranged).
   - Allows:
     - Zoom (scroll / pinch).
     - Pan (click‑drag background).
     - Box select (shift+drag).
   - Node selection:
     - Single click selects.
     - Shift+click adds/removes from multi‑selection.

3. **Right Inspector Panel – Details & Editing**
   - Contextual panel that changes content based on selection:

   Cases:
   - **No selection:** show scenario summary:
     - total flights, total cargo, total distance, etc.
   - **Flight Start Node selected:**
     - Editable fields:
       - callsign
       - aircraft type (dropdown)
       - mission day/time
     - Read‑only:
       - total payload
       - ACL usage
       - warnings list
     - Route summary:
       - list of airbases in order with distance/time per leg.
   - **Airbase Node selected:**
     - Info from bases DB:
       - ICAO, name, runway length, location.
     - List of flights visiting this base (incoming/outgoing).
   - **Edge (Route Leg) selected:**
     - Distance, estimated block time, fuel.
     - Weather summary (if available).
     - Option to adjust cruise speed or alt, if that’s supported by backend.

---

## 3. Flowchart Interactions & Control Flow

### 3.1 Creating / Editing Flights via Flowchart

**Case A: Existing flights on load**

- On initial load of the Flight Manager:
  - For each existing flight:
    - Create a **Flight Start Node** and place them in a left‑aligned column (stacked vertically).
    - If the flight already has origin/destination and route legs:
      - Auto‑create Airbase nodes for each base in the flight’s route (reusing nodes if already on canvas).
      - Connect with Route Leg edges according to leg sequence.
    - Apply auto‑layout: for each flight, its airbase nodes appear roughly left‑to‑right in chronological order.

**Case B: Adding a new flight**

- When user clicks “+ Add Flight”:
  - Open a small modal:
    - Callsign (default `REACH{N+1}`)
    - Aircraft type dropdown.
    - Optional origin/destination pickers (can be set later via the flowchart).
  - After submitting:
    - Create a new flight object in state.
    - Add a Flight Start Node to the canvas in the left column.
    - No route yet → node shows a subtle “No route assigned” tag.

### 3.2 Building Routes with Nodes & Edges

**Goal:** Entire route creation is done visually.

**Flow:**

1. From a Flight Start Node, user:
   - Clicks a “+ Connect to Base” handle or port on the right side of the node.
   - This opens a **Base Picker**:

     - Option A: choose existing Airbase node on canvas.
     - Option B: create a new Airbase node from the `bases.json` list (search by ICAO, name).

2. Once chosen:
   - If new node: create the Airbase node at a reasonable position (to the right of start).
   - Create a Route Leg edge: `FlightStart -> Airbase (leg 0)`.
   - In underlying data:
     - Set the flight’s `origin` to that base (if this is the first leg).
     - Or if flight already had origin, treat this as destination or next stop, etc., respecting existing logic.

3. To add additional legs:
   - User clicks a small “+ Next Leg” handle/port on the **right side of the last Airbase node** used by that flight.
   - Again uses the Base Picker (existing or new).
   - Creates new Airbase node/edge, increments `legIndex`.

4. To reorder or remove stops:
   - Drag an Airbase node horizontally:
     - This should update leg ordering for that flight if the node is part of its sequence.
   - Or use explicit controls:
     - In the flight’s Route List in the Inspector, each base has:
       - “Move up / down” arrows.
       - “Remove from route” (with confirmation).
   - Deleting a leg or base from the route:
     - Updates edges and recalculates metrics.
     - If an Airbase node is no longer connected to any flight, optionally ghost it or delete it.

**Edge Cases:**

- **Multiple flights visiting the same base:**
  - They should share the same Airbase node on the canvas.
  - Each flight gets its own edges/leg objects.
- **User creates a loop (flight returns to same base):**
  - This is allowed: `Base A -> Base B -> Base A`.
  - Ensure leg indices still increment per segment and distance/time are calculated correctly.
- **Orphan Flight nodes (no base attached):**
  - Show a warning icon on the flight card and node: “No route assigned”.
  - Exports should treat such flights as excluded or incomplete with a clear message.

### 3.3 Cargo & Pallets in Flowchart Context

The current “Cargo Split” behavior is still needed, but the flowchart should:

- Show **per‑flight cargo summary** in the Flight Start Node:
  - `8P – 73K` style indicator.
  - Mouseover tooltip: pallet count, hazmat presence, etc.
- Optionally:
  - Add an inline list of pallet IDs in the Inspector when a flight is selected.
  - Allow user to open the Cargo Split tab in context from a button: “Edit Cargo Split for this Flight”.

The underlying cargo assignment logic stays where it is; the flowchart simply surfaces aggregated data and warnings.

---

## 4. Synchronization With Other Tabs

The **Flowchart tab becomes the source of truth** for route structure.

### 4.1 Cargo Split Tab

- Reads:
  - Flights list + route definitions from the shared state.
- When user redistributes pallets between flights there:
  - Update flight payload totals.
  - Immediately update:
    - Flight Start Node badges (payload, pallet count, warnings).
    - Any Cards in Routes & Fuel and Compare tabs.

### 4.2 Routes & Fuel Tab

- Should become a **read‑only visualization + control panel** driven by the flowchart.
- The per‑flight cards (origin, destination, distance, time, fuel) should reflect legs defined in the graph.
- Changing route in Flowchart instantly recalculates:
  - Distance, flight time, block time, fuel.
- If there’s still an ability to tweak route parameters here (e.g., alt/speed), ensure:
  - Those tweaks write back into the shared route model.
  - They don’t de‑sync with the flowchart.

### 4.3 Compare Tab

- Compares alternative scenarios / flight mixes.
- Must use the same unified sources:
  - flights
  - routes
  - fuel
- Ensure no duplicated models exist; there should be **one canonical mission state**.

---

## 5. Saving, Exporting, and Unsaved Changes

### 5.1 Save Behavior

- When user changes any of:
  - graph layout (which nodes/edges exist, route order),
  - flight parameters,
  - cargo assignments,
- Mark the state as **dirty**.

- Show subtle “Unsaved Changes” indicator near the **Save Changes** button.

- On click:
  - Persist to the backend or local storage as the project already does.
  - Clear the dirty flag.
  - Show small toast: “Mission saved”.

### 5.2 Export Buttons (ICODES / PDF)

- **Export ICODES**:
  - Must work off post‑flowchart mission state:
    - flights with route legs
    - cargo distribution
    - per‑flight summaries.
  - Should fail gracefully if:
    - any flight has no origin/destination, or
    - payload data is missing.
  - In that case, show a dialog listing blocking issues:
    - e.g., `REACH02: no destination assigned; cannot export`.

- **Export PDF**:
  - Should contain:
    - Summary of flights and routes.
    - Key metrics (distance, fuel, pax).
    - Optional small static snapshot of the flowchart (if easy; otherwise leave as future work and note in comments).

---

## 6. Error Handling & Edge Cases

Implement robust validation and errors across the flowchart:

1. **Invalid Route Paths**
   - Flight without origin or destination:
     - Warn in Flight Node + side panel.
   - Route with only one base where flight is defined as multi‑leg:
     - Treat as one‑leg origin→destination; clarify in UI.
2. **Overloaded Aircraft**
   - If ACL > limit for a flight:
     - Show red warning on Flight Node and in list.
     - Add to global warnings summary.
3. **Incompatible Bases**
   - If runway length < required for aircraft type:
     - Show warning icon on Airbase node.
     - In route leg metrics, display “Runway below recommended length for C‑17; use caution”.
4. **Disconnected Nodes**
   - Orphan Airbase nodes (no edges):
     - Style them as “dimmed/ghosted”.
     - Option: “clean up unused bases” button.

---

## 7. Implementation Guidance

### 7.1 Use Existing Patterns First

- Inspect the repo:
  - Identify where flights, routes, and cargo models are defined.
  - Find current Flight Manager tab and Flowchart stub.
- **Do not create a parallel model**; instead:
  - Wrap the existing mission state in a graph adapter layer.

Example concept:

```ts
// Pseudocode
type GraphState = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

function missionStateToGraph(mission: MissionState): GraphState { ... }
function graphToMissionState(graph: GraphState, oldMission: MissionState): MissionState { ... }
Use these conversion functions in the Flowchart tab:

On load: mission → graph.

On change: graph → mission → push to global state.

7.2 Flowchart Library
If the repo already uses a diagram library:

Extend it with the node/edge types defined above.

If not:

Install and configure React Flow (or similar).

Set up:

custom node components (FlightStartNode, AirbaseNode).

custom edge styles for RouteLegEdge (solid lines, directional arrows).

7.3 Styling & Performance
Keep design consistent with the current UI (colors, rounded corners, cards).

Ensure:

smooth pan/zoom.

no huge re-renders when moving nodes (memoization, proper keying).

Limit expensive recomputations:

For example, only recompute distance/fuel when leg endpoints change, not on every drag pixel.

8. UX Quality of Life Features
Implement the following QoL details:

Keyboard Shortcuts

Del / Backspace: delete selected node/edge (with confirmation if it deletes a flight).

Esc: clear selection.

Ctrl+Z / Cmd+Z: undo last graph edit (if project already uses state history) – if not practical, leave TODO comments.

Tooltips & Legends

Legend in top-right:

Node shapes/colors meaning.

Hovering a Flight Start Node:

Show quick metrics.

Hovering Route Leg:

Show distance/time/fuel details.

Autosave (optional)

Autosave every N seconds or after a period of inactivity.

Make it configurable or clearly visible in code comments.

Responsive Design

Flowchart should be usable on smaller laptop resolutions:

Sidebar collapsible.

Inspector collapsible.

Canvas taking majority of width.

9. Testing & Demo Expectations
Before finishing, verify the following flows manually (and document with comments or simple unit tests where applicable):

Basic route creation

Start with 2 flights, no routes.

Using flowchart, connect:

REACH01: TRAVIS (KSUU) → HICKAM (PHIK).

REACH2: TRAVIS (KSUU) → HICKAM (PHIK).

Confirm:

Distances & fuel in Routes & Fuel tab are correct.

Exports work.

Multi‑stop route

Add an intermediate airbase node (e.g., WAKE).

Build route: TRAVIS → WAKE → HICKAM.

Confirm:

Three legs exist.

Metrics are updated.

Compare tab sees correct totals.

Deleting / reordering stops

Remove intermediate base; confirm route reverts to direct leg.

Reorder stops via Inspector.

Graph visually updates and metrics recompute.

Edge cases

Overloaded flight (manipulate cargo to exceed ACL).

Route to a base with too short runway for aircraft.

Orphan nodes and flights without routes.

Document any intentional limitations clearly in comments.

10. Output
When you are done, the Flight Manager should provide:

A flowchart‑based mission designer where:

Flights are starting nodes.

Airbases are connected via route leg edges.

Users can drag, connect, reorder, and inspect routes visually.

A unified mission state used across:

Cargo Split

Routes & Fuel

Compare

ICODES / PDF exports.

Robust UX with clear error messages, warnings, and no surprising behavior.

This overhaul should make it easy for another agent (or human dev) to later:

Add real‑time weather API hooks.

Add advanced optimization logic.

Extend node types and metrics without rewriting the core UX.

yaml
Copy code
