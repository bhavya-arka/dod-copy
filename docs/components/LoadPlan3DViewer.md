# LoadPlan3DViewer

## Description

An interactive 3D visualization component for aircraft load plans using React Three Fiber. Features keyboard-controlled camera navigation, multiple view modes (normal, wireframe, heatmap, center of gravity), cargo selection with info panels, weight distribution heatmaps, and a 2D mini-map overlay.

## Props Interface

```typescript
interface LoadPlan3DViewerProps {
  loadPlan: AircraftLoadPlan;  // The aircraft load plan to visualize
}
```

## State Management

### Hooks Used
- `useState` - Viewer state and fullscreen mode
- `useCallback` - Memoized event handlers
- `useMemo` - Computed values for weight grids and tick marks
- `useRef` - Three.js mesh and controls references
- `useEffect` - Keyboard subscription setup
- `useFrame` - Animation loop for camera movement and cargo animation
- `useThree` - Access to Three.js camera
- `useKeyboardControls` - DREI keyboard state management

### State Variables
```typescript
interface ViewerState {
  selectedCargo: CargoItem | null;  // Currently selected cargo item
  viewMode: ViewMode;               // 'normal' | 'wireframe' | 'heatmap' | 'cog'
  showHeatmap: boolean;             // Heatmap overlay visibility
  showMinimap: boolean;             // Mini-map visibility
  showMeasure: boolean;             // Measurement mode toggle
}
```

## Frameworks/Libraries Used

| Library | Purpose |
|---------|---------|
| React | Core framework |
| @react-three/fiber | React renderer for Three.js (Canvas, useFrame, useThree) |
| @react-three/drei | Three.js helpers (OrbitControls, Text, Html, PerspectiveCamera, KeyboardControls, useKeyboardControls) |
| three | 3D graphics library (THREE.Color, THREE.BoxGeometry, THREE.Mesh) |
| framer-motion | Entry/exit animations for fullscreen mode |
| lucide-react | Icons (Maximize2, X, Minimize2) |

## Dependencies

### Components
- `Button` - UI button component
- `Tooltip`, `TooltipContent`, `TooltipProvider`, `TooltipTrigger` - Tooltip system

### Types
- `AircraftLoadPlan`, `PalletPlacement`, `VehiclePlacement`, `PALLET_463L`, `PAX_WEIGHT_LB` from `pacafTypes`

## Keyboard Controls

| Key | Action |
|-----|--------|
| W | Move camera forward (negative Z) |
| S | Move camera backward (positive Z) |
| A | Move camera left (negative X) |
| D | Move camera right (positive X) |
| R | Reset camera position and clear selection |
| M | Toggle measurement mode |
| H | Toggle heatmap view |

### Controls Enum
```typescript
enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  reset = 'reset',
  measure = 'measure',
  heatmap = 'heatmap',
}
```

## Sub-Components

### CameraController
Handles keyboard input for camera movement and view toggles.

### InfoPanel
Displays detailed cargo information when an item is selected.

### ViewerSidebar
Left-side control panel for view modes and toggles.

### MiniMap
Top-down 2D overview of cargo positions.

### HeatmapFloor
Weight distribution visualization overlay.

### CargoBay3D
3D representation of the aircraft cargo bay.

### Pallet3D
Individual 3D pallet with selection state and animation.

### Vehicle3D
Individual 3D vehicle/rolling stock with wheels.

### CenterOfBalance
Visual indicator for center of balance position.

### FwdAftIndicators
Forward/Aft labels for orientation.

### LengthRuler
Measurement ruler along cargo bay length.

### MissingPositionItem
Visual indicator for cargo without valid positions.

### Scene
Main 3D scene composition with lighting and all cargo elements.

## Key Functions

| Function | Purpose |
|----------|---------|
| `handleSelectCargo(cargo)` | Updates selected cargo state |
| `handleViewModeChange(mode)` | Changes view mode (normal/wireframe/heatmap/cog) |
| `handleMinimapToggle()` | Toggles mini-map visibility |
| `handleMeasureToggle()` | Toggles measurement mode |
| `handleHeatmapToggle()` | Toggles heatmap overlay |
| `handleReset()` | Resets camera and clears selection |

## View Modes

| Mode | Description |
|------|-------------|
| `normal` | Standard colored view with solid materials |
| `wireframe` | Wireframe rendering for structural view |
| `heatmap` | Weight distribution heat map overlay |
| `cog` | Center of Gravity analysis with enhanced CoB indicator |

## Usage Example

```tsx
import LoadPlan3DViewer from './components/LoadPlan3DViewer';

function LoadPlanPage() {
  const loadPlan: AircraftLoadPlan = {
    aircraft_id: 'C17-001',
    aircraft_type: 'C-17',
    aircraft_spec: AIRCRAFT_SPECS['C-17'],
    pallets: [...],
    rolling_stock: [...],
    center_of_balance: 450,
    cob_in_envelope: true,
    cob_percent: 42.5,
    total_weight: 125000,
    payload_used_percent: 78.5,
    pax_count: 50,
    // ... other properties
  };

  return (
    <div className="h-screen">
      <LoadPlan3DViewer loadPlan={loadPlan} />
    </div>
  );
}
```

## Features

1. **Interactive 3D View** - Orbit controls with pan and zoom
2. **Keyboard Navigation** - WASD movement, R reset, M measure, H heatmap
3. **Cargo Selection** - Click to select and view cargo details
4. **Multiple View Modes** - Normal, wireframe, heatmap, CoG analysis
5. **Weight Heatmap** - Color-coded weight distribution visualization
6. **Mini-Map** - 2D top-down overview for orientation
7. **Fullscreen Mode** - Expand to full viewport
8. **Measurement Mode** - Enhanced ruler granularity
9. **Missing Position Handling** - Visual indication for unpositioned cargo

## Architecture Notes

The component uses a layered architecture:
1. **Main Component** (`LoadPlan3DViewer`) - State management and UI wrapper
2. **Scene Component** - Three.js scene setup with lighting and camera
3. **3D Objects** - Individual mesh components for cargo items
4. **Overlay Components** - HTML overlays for labels and UI panels
