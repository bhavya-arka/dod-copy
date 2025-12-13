
**Filename:**
`3D_CARGO_LOADER_SPEC.md`

---

````markdown
# 🚛 3D Cargo Loader Visualization System — Functional & Technical Specification

## 1. Overview
The **3D Cargo Loader Visualizer** is an interactive web-based system that displays how cargo—palletized goods and rolling stock—is loaded into aircraft such as the **C-17 Globemaster III** and **C-130 Hercules**.

It integrates backend loader algorithms with frontend 2D/3D visualization to provide accurate, operationally useful renderings of cargo layout, weight distribution, and center-of-gravity (CoG) calculations.

The tool must be:
- Interactive and intuitive (mouse, keyboard, touch).
- Operationally valid for mission prep, verification, and training.
- Responsive and suitable for mobile and desktop.

---

## 2. Core Objectives
- 🎥 Visualize cargo layout in 3D for spatial awareness.
- ✅ Validate load integrity (fit, weight, clearance).
- 🔗 Integrate with loader algorithms and manifests.
- 🚗 Support pallets, rolling stock, containers, and loose equipment.
- 📊 Provide interactive insights (CoG, sequence, weight).
- 🧠 Offer seamless UX for mission planners and loadmasters.

---

## 3. Data Model

### 3.1 Source Data (CSV)
Example columns:

| Column | Description |
|--------|--------------|
| Description | Cargo item name |
| Length (in) | Item length |
| Width (in) | Item width |
| Height (in) | Item height |
| Weight (lbs) | Gross weight |
| Lead TCN | Tracking number |
| PAX | Personnel indicator |

### 3.2 Derived Data
System derives:

| Field | Formula / Rule |
|-------|----------------|
| `dimensions_meters` | Inches → meters |
| `volume_m3` | L × W × H |
| `weight_kg` | lbs × 0.4536 |
| `type` | From description (pallet / vehicle / etc.) |
| `id` | From TCN or index |
| `slot`, `x`, `y`, `z`, `rotation` | Assigned by loader |

### 3.3 Loader Output Schema
```json
{
  "aircraft": "C-17",
  "cargo": [
    {
      "id": "FYS3P112S200080XX",
      "description": "AFE SUPPLIES 6 SHI",
      "dimensions": { "x": 2.23, "y": 2.74, "z": 2.03 },
      "weight": 2328,
      "position": { "x": 10.2, "y": 1.5, "z": 0.0 },
      "rotation": 90,
      "type": "pallet",
      "status": "placed"
    }
  ]
}
````

---

## 4. Visualization Design

### 4.1 Cargo Bay Environment

* Accurate 3D model of aircraft interior.
* Scaled in meters.
* Includes floor grid, ramp, markings, lighting.

### 4.2 Cargo Representation

| Cargo Type    | Representation     | Color  | Notes           |
| ------------- | ------------------ | ------ | --------------- |
| Palletized    | Box mesh           | Blue   | Label top       |
| Rolling Stock | Vehicle silhouette | Olive  | Include arrow   |
| Containers    | Transparent boxes  | Orange | Show contents   |
| Unknown       | Wireframe box      | Red    | Warning tooltip |

### 4.3 Scene Composition

* Scene units = meters.
* Positions from loader logic.
* Optional grid snapping for QA.

---

## 5. Interaction & Controls

### 5.1 Desktop

| Control | Action                   |
| ------- | ------------------------ |
| Orbit   | Right-drag               |
| Pan     | Middle-drag / Shift+drag |
| Zoom    | Scroll / Ctrl+drag       |
| WASD    | Camera move              |
| R       | Reset view               |
| M       | Toggle measure           |
| H       | Toggle heatmap           |

Mouse:

* Hover → Tooltip
* Click → Info panel
* Double-click → Focus camera

### 5.2 Mobile / Touch

| Gesture       | Action         |
| ------------- | -------------- |
| Pinch         | Zoom           |
| 2-finger drag | Pan            |
| 1-finger drag | Orbit          |
| Tap           | Select cargo   |
| Long-press    | Measure/select |

---

## 6. UI Components

### 6.1 Main 3D Viewport

* Central R3F scene.
* Modes: Normal / Wireframe / Heatmap / CoG.
* Optional FPS counter.

### 6.2 Info Panel

Displays:

* Cargo name + TCN
* Dimensions, weight, volume
* Coordinates & rotation
* Operational metadata

Actions:

* Highlight / Snap / Move / Show path

### 6.3 Sidebar Controls

* Filter by cargo type
* View modes
* Sequence animation
* Export JSON/CSV
* Analytics toggles

### 6.4 2D Mini-Map

* Top-down orthographic map
* Click to focus
* Shows CoG + slot states

---

## 7. Analytical Features

### 7.1 Weight Distribution

* Heatmap on floor grid
* Gradient Blue → Red
* Tooltip per zone

### 7.2 Center of Gravity

```
CoG = Σ(mᵢ * rᵢ) / Σ(mᵢ)
```

Visualized as glowing sphere.
Optional safe zone overlay.

### 7.3 Load Fit Validation

* Bounding box collision checks.
* Highlight invalid placements.
* “Auto-Snap” correction.

### 7.4 Sequence Animation

* Timeline view of load/unload.
* Step playback or scrub.

---

## 8. Error Handling

### 8.1 Missing Rolling Stock

* Status: `missing_position`
* Render as red wireframe near ramp.
* Tooltip: “Placement not found”.

### 8.2 Data Validation

| Check               | Action          |
| ------------------- | --------------- |
| Missing weight/dims | Flag issue      |
| Negative values     | Skip render     |
| Invalid coords      | Warn + mark red |

---

## 9. System Architecture

### 9.1 Frontend

* Framework: **React + Three.js / React Three Fiber**
* State: **Zustand / Jotai**
* UI: **shadcn/ui / Chakra UI**
* Animation: **Framer Motion**
* Physics (optional): **Rapier.js**
* Responsive: **Tailwind CSS**

### 9.2 Backend

* Node.js or Python for loader logic.
* Exposes `/api/loader` and `/api/cargo` endpoints.
* CSV upload → parsed → JSON → frontend render.

---

## 10. Performance

* Instanced meshes for pallets.
* Lazy load models.
* Merge geometry for performance.
* LOD + frustum culling.
* GPU-based heatmap rendering.

---

## 11. Developer Tools

* Toggle bounding boxes.
* Axis & grid helpers.
* Live inspector for coordinates.
* CSV re-upload reload.
* Ghost mode (compare last layout).

---

## 12. Workflow

1. Upload CSV manifest.
2. Backend loader computes positions.
3. Viewer loads JSON.
4. Cargo rendered in bay.
5. User interacts, analyzes, exports.

---

## 13. Extensions

* AR/VR visualization.
* Live sensor integration (RFID / load cells).
* AI optimizer for CoG balancing.
* Crew training simulation.

---

## 14. End-State Vision

A unified mission-planning and visualization interface:

* Every cargo item spatially traceable.
* CoG, fit, and sequence visible in real-time.
* Supports training, validation, and operational planning.

---

**Version:** 1.0
**Maintainer:** Systems Engineering / Visualization Team
**Date:** 2025-12-12
**File:** `3D_CARGO_LOADER_SPEC.md`

```
