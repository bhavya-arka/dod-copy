/**
 * PACAF Airlift Demo - 3D Load Plan Visualization
 * 
 * Enhanced 3D viewer with:
 * - Keyboard controls (WASD movement, R reset, M measure, H heatmap)
 * - Cargo selection with info panel
 * - View modes (normal, wireframe, heatmap, cog)
 * - Weight distribution heatmap
 * - 2D mini-map
 * - Missing position handling
 */

import React, { useRef, useMemo, useState, useCallback, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Html, PerspectiveCamera, KeyboardControls, useKeyboardControls } from '@react-three/drei';
import * as THREE from 'three';
import {
  AircraftLoadPlan,
  PalletPlacement,
  VehiclePlacement,
  PALLET_463L,
  PAX_WEIGHT_LB,
  SeatZone
} from '../lib/pacafTypes';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Maximize2, X, Minimize2, Play, Pause, SkipBack, SkipForward, RotateCcw, Box } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateLoadingSequence, calculateUnloadingSequence, LoadingSequenceItem, estimateTotalLoadingTime } from '../lib/cargoLoadingSequence';
import CargoLoadingAnimation, { AnimationMode } from './CargoLoadingAnimation';
import { ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

interface LoadPlan3DViewerProps {
  loadPlan: AircraftLoadPlan;
}

type ViewMode = 'normal' | 'wireframe' | 'heatmap' | 'cog';

type CargoItem = {
  type: 'pallet' | 'vehicle';
  id: string;
  name: string;
  tcn?: string;
  weight: number;
  dimensions: { length: number; width: number; height: number };
  position: { x: number; y: number; z: number };
  hazmat?: boolean;
};

interface MeasureState {
  firstPoint: THREE.Vector3 | null;
  secondPoint: THREE.Vector3 | null;
  hoverPoint: THREE.Vector3 | null;
  snapType: 'vertex' | 'edge' | 'surface' | null;
}

interface ViewerState {
  selectedCargo: CargoItem | null;
  viewMode: ViewMode;
  showHeatmap: boolean;
  showMinimap: boolean;
  showMeasure: boolean;
  measureState: MeasureState;
}

enum Controls {
  forward = 'forward',
  back = 'back',
  left = 'left',
  right = 'right',
  reset = 'reset',
  measure = 'measure',
  heatmap = 'heatmap',
  escape = 'escape',
  animation = 'animation',
}

const keyMap = [
  { name: Controls.forward, keys: ['KeyW'] },
  { name: Controls.back, keys: ['KeyS'] },
  { name: Controls.left, keys: ['KeyA'] },
  { name: Controls.right, keys: ['KeyD'] },
  { name: Controls.reset, keys: ['KeyR'] },
  { name: Controls.measure, keys: ['KeyM'] },
  { name: Controls.heatmap, keys: ['KeyH'] },
  { name: Controls.escape, keys: ['Escape'] },
  { name: Controls.animation, keys: ['KeyL'] },
];

function CameraController({ 
  centerZ, 
  length,
  onReset,
  onMeasureToggle,
  onHeatmapToggle,
  onMeasureReset,
  onAnimationToggle,
  showMeasure
}: { 
  centerZ: number; 
  length: number;
  onReset: () => void;
  onMeasureToggle: () => void;
  onHeatmapToggle: () => void;
  onMeasureReset: () => void;
  onAnimationToggle: () => void;
  showMeasure: boolean;
}) {
  const { camera } = useThree();
  const [subscribe, getState] = useKeyboardControls<Controls>();
  const controlsRef = useRef<any>(null);
  
  useEffect(() => {
    return subscribe(
      (state) => state.reset,
      (pressed) => {
        if (pressed) {
          camera.position.set(5, 4, length + 2);
          if (controlsRef.current) {
            controlsRef.current.target.set(0, 1, centerZ);
          }
          onReset();
        }
      }
    );
  }, [subscribe, camera, centerZ, length, onReset]);

  useEffect(() => {
    return subscribe(
      (state) => state.measure,
      (pressed) => {
        if (pressed) onMeasureToggle();
      }
    );
  }, [subscribe, onMeasureToggle]);

  useEffect(() => {
    return subscribe(
      (state) => state.heatmap,
      (pressed) => {
        if (pressed) onHeatmapToggle();
      }
    );
  }, [subscribe, onHeatmapToggle]);

  useEffect(() => {
    return subscribe(
      (state) => state.escape,
      (pressed) => {
        if (pressed && showMeasure) {
          onMeasureReset();
        }
      }
    );
  }, [subscribe, onMeasureReset, showMeasure]);

  useEffect(() => {
    return subscribe(
      (state) => state.animation,
      (pressed) => {
        if (pressed) onAnimationToggle();
      }
    );
  }, [subscribe, onAnimationToggle]);

  useFrame((_, delta) => {
    const state = getState();
    const moveSpeed = 5 * delta;
    
    if (state.forward) {
      camera.position.z -= moveSpeed;
      if (controlsRef.current) controlsRef.current.target.z -= moveSpeed;
    }
    if (state.back) {
      camera.position.z += moveSpeed;
      if (controlsRef.current) controlsRef.current.target.z += moveSpeed;
    }
    if (state.left) {
      camera.position.x -= moveSpeed;
      if (controlsRef.current) controlsRef.current.target.x -= moveSpeed;
    }
    if (state.right) {
      camera.position.x += moveSpeed;
      if (controlsRef.current) controlsRef.current.target.x += moveSpeed;
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      target={[0, 1, centerZ]}
      enablePan={true}
      enableZoom={true}
      minDistance={2}
      maxDistance={20}
      maxPolarAngle={Math.PI / 2}
    />
  );
}

function InfoPanel({ cargo, onClose }: { cargo: CargoItem; onClose: () => void }) {
  return (
    <div className="absolute right-4 top-20 w-72 bg-slate-900/95 rounded-lg shadow-xl border border-slate-700 z-10">
      <div className="flex items-center justify-between p-3 border-b border-slate-700">
        <h4 className="text-white font-semibold">Cargo Details</h4>
        <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div>
          <label className="text-slate-400 text-xs uppercase">Name</label>
          <p className="text-white font-medium">{cargo.name}</p>
        </div>
        {cargo.tcn && (
          <div>
            <label className="text-slate-400 text-xs uppercase">TCN</label>
            <p className="text-blue-400 font-mono">{cargo.tcn}</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-400 text-xs uppercase">Type</label>
            <p className="text-white capitalize">{cargo.type}</p>
          </div>
          <div>
            <label className="text-slate-400 text-xs uppercase">Weight</label>
            <p className="text-white">{cargo.weight.toLocaleString()} lbs</p>
          </div>
        </div>
        <div>
          <label className="text-slate-400 text-xs uppercase">Dimensions (L×W×H)</label>
          <p className="text-white font-mono">
            {cargo.dimensions.length}" × {cargo.dimensions.width}" × {cargo.dimensions.height}"
          </p>
        </div>
        <div>
          <label className="text-slate-400 text-xs uppercase">Position (X, Y, Z)</label>
          <p className="text-white font-mono">
            ({cargo.position.x.toFixed(1)}, {cargo.position.y.toFixed(1)}, {cargo.position.z.toFixed(1)})
          </p>
        </div>
        {cargo.hazmat && (
          <div className="flex items-center gap-2 text-yellow-400 bg-yellow-400/10 p-2 rounded">
            <span>⚠️</span>
            <span className="text-sm font-medium">HAZMAT Cargo</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ViewerSidebar({ 
  viewMode, 
  showMinimap,
  showMeasure,
  animationMode,
  onViewModeChange, 
  onMinimapToggle,
  onMeasureToggle,
  onAnimationToggle
}: { 
  viewMode: ViewMode;
  showMinimap: boolean;
  showMeasure: boolean;
  animationMode: boolean;
  onViewModeChange: (mode: ViewMode) => void;
  onMinimapToggle: () => void;
  onMeasureToggle: () => void;
  onAnimationToggle: () => void;
}) {
  return (
    <div className="absolute left-4 top-20 flex flex-col gap-2 z-10">
      <TooltipProvider>
        <div className="bg-slate-900/90 rounded-lg p-2 flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'normal' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('normal')}
                className="w-full justify-start text-white"
              >
                🎨 Normal
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Standard view</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'wireframe' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('wireframe')}
                className="w-full justify-start text-white"
              >
                📐 Wireframe
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Show wireframe structure</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'heatmap' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('heatmap')}
                className="w-full justify-start text-white"
              >
                🌡️ Heatmap (H)
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Weight distribution heatmap</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === 'cog' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => onViewModeChange('cog')}
                className="w-full justify-start text-white"
              >
                ⚖️ CoG Mode
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Center of Gravity analysis</TooltipContent>
          </Tooltip>
        </div>
        
        <div className="bg-slate-900/90 rounded-lg p-2 flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showMinimap ? 'default' : 'ghost'}
                size="sm"
                onClick={onMinimapToggle}
                className="w-full justify-start text-white"
              >
                🗺️ Mini-Map
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle top-down mini-map</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={showMeasure ? 'default' : 'ghost'}
                size="sm"
                onClick={onMeasureToggle}
                className="w-full justify-start text-white"
              >
                📏 Measure (M)
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle measurement mode</TooltipContent>
          </Tooltip>
          
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={animationMode ? 'default' : 'ghost'}
                size="sm"
                onClick={onAnimationToggle}
                className="w-full justify-start text-white"
              >
                <Box className="w-4 h-4 mr-1" /> Simulate (L)
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Simulate cargo loading sequence</TooltipContent>
          </Tooltip>
        </div>
        
        <div className="bg-slate-800/80 rounded-lg p-2 text-xs text-slate-400">
          <p className="font-medium text-slate-300 mb-1">Controls</p>
          <p>WASD - Move camera</p>
          <p>R - Reset view</p>
          <p>L - Load simulation</p>
          <p>Click - Select cargo</p>
        </div>
      </TooltipProvider>
    </div>
  );
}

function MiniMap({ 
  loadPlan, 
  scale 
}: { 
  loadPlan: AircraftLoadPlan; 
  scale: number;
}) {
  const spec = loadPlan.aircraft_spec;
  const mapScale = 0.15;
  const width = spec.cargo_width * scale * mapScale;
  const length = spec.cargo_length * scale * mapScale;
  
  return (
    <div 
      className="absolute bottom-20 right-4 bg-slate-900/95 rounded-lg border border-slate-600 overflow-hidden z-10"
      style={{ width: Math.max(120, width * 100), height: Math.max(80, length * 100) }}
    >
      <div className="text-xs text-slate-400 px-2 py-1 border-b border-slate-700">Top View</div>
      <svg 
        viewBox={`0 0 ${spec.cargo_width} ${spec.cargo_length}`} 
        className="w-full h-full p-1"
        style={{ transform: 'rotate(180deg) scaleX(-1)' }}
      >
        <rect 
          x={0} 
          y={0} 
          width={spec.cargo_width} 
          height={spec.cargo_length} 
          fill="#1e293b" 
          stroke="#475569" 
          strokeWidth={2}
        />
        
        {loadPlan.pallets.map((p, i) => {
          const x = (spec.cargo_width / 2) + (p.lateral_placement?.y_center_in ?? 0) - PALLET_463L.width / 2;
          const y = p.position_coord - PALLET_463L.length / 2;
          return (
            <rect
              key={`pallet-${i}`}
              x={x}
              y={y}
              width={PALLET_463L.width}
              height={PALLET_463L.length}
              fill={p.pallet.hazmat_flag ? '#dc2626' : '#2563eb'}
              stroke="#fff"
              strokeWidth={1}
              opacity={0.8}
            />
          );
        })}
        
        {loadPlan.rolling_stock.map((v, i) => {
          const x = (spec.cargo_width / 2) + (v.lateral_placement?.y_center_in ?? 0) - v.width / 2;
          const y = (v.position?.z ?? 0) - v.length / 2;
          return (
            <rect
              key={`vehicle-${i}`}
              x={x}
              y={y}
              width={v.width}
              height={v.length}
              fill="#22c55e"
              stroke="#fff"
              strokeWidth={1}
              opacity={0.8}
            />
          );
        })}
        
        {(() => {
          // FIX: Show ACTUAL CG position in cargo bay, not clamped to envelope
          const cobPercent = loadPlan.cob_percent;
          
          // Calculate actual CG station (inches from aircraft datum)
          const cgStation = spec.lemac_station + (cobPercent / 100) * spec.mac_length;
          
          // Convert station to position in cargo bay (from forward edge)
          const positionInBay = cgStation - spec.cargo_bay_fs_start;
          
          // Normalize to visual length, clamped to visible range
          const normalized = Math.max(0, Math.min(1, positionInBay / spec.cargo_length));
          
          const cobY = normalized * spec.cargo_length;
          return (
            <circle
              cx={spec.cargo_width / 2}
              cy={cobY}
              r={8}
              fill={loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444'}
              stroke="#fff"
              strokeWidth={2}
            />
          );
        })()}
        
        <text
          x={10}
          y={20}
          fill="#94a3b8"
          fontSize={12}
        >
          FWD
        </text>
        <text
          x={10}
          y={spec.cargo_length - 10}
          fill="#94a3b8"
          fontSize={12}
        >
          AFT
        </text>
      </svg>
    </div>
  );
}

function HeatmapFloor({ 
  loadPlan, 
  scale 
}: { 
  loadPlan: AircraftLoadPlan; 
  scale: number;
}) {
  const spec = loadPlan.aircraft_spec;
  const gridSize = 100;
  const numCellsZ = Math.ceil(spec.cargo_length / gridSize);
  const numCellsX = 3;
  
  const weightGrid = useMemo(() => {
    const grid: number[][] = [];
    for (let z = 0; z < numCellsZ; z++) {
      grid[z] = [];
      for (let x = 0; x < numCellsX; x++) {
        grid[z][x] = 0;
      }
    }
    
    loadPlan.pallets.forEach(p => {
      const zIndex = Math.floor(p.position_coord / gridSize);
      const lateralPos = p.lateral_placement?.y_center_in ?? 0;
      const xIndex = lateralPos < -30 ? 0 : lateralPos > 30 ? 2 : 1;
      if (zIndex >= 0 && zIndex < numCellsZ) {
        grid[zIndex][xIndex] += p.pallet.gross_weight;
      }
    });
    
    loadPlan.rolling_stock.forEach(v => {
      const zIndex = Math.floor((v.position?.z ?? 0) / gridSize);
      const lateralPos = v.lateral_placement?.y_center_in ?? 0;
      const xIndex = lateralPos < -30 ? 0 : lateralPos > 30 ? 2 : 1;
      if (zIndex >= 0 && zIndex < numCellsZ) {
        grid[zIndex][xIndex] += v.weight || 0;
      }
    });
    
    return grid;
  }, [loadPlan, numCellsZ]);
  
  const maxWeight = useMemo(() => {
    let max = 0;
    weightGrid.forEach(row => row.forEach(w => { if (w > max) max = w; }));
    return max || 1;
  }, [weightGrid]);
  
  const getColor = (weight: number) => {
    const ratio = weight / maxWeight;
    if (ratio < 0.33) return new THREE.Color(0x22c55e);
    if (ratio < 0.66) return new THREE.Color(0xeab308);
    return new THREE.Color(0xef4444);
  };
  
  const cellWidth = (spec.cargo_width * scale) / numCellsX;
  const cellLength = gridSize * scale;
  
  return (
    <group position={[0, 0.03, 0]}>
      {weightGrid.map((row, zIndex) => 
        row.map((weight, xIndex) => {
          if (weight === 0) return null;
          const x = (xIndex - 1) * cellWidth;
          const z = (zIndex + 0.5) * cellLength;
          const color = getColor(weight);
          return (
            <group key={`${zIndex}-${xIndex}`} position={[x, 0, z]}>
              <mesh rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[cellWidth * 0.9, cellLength * 0.9]} />
                <meshBasicMaterial color={color} transparent opacity={0.4} />
              </mesh>
              <Html position={[0, 0.5, 0]} center style={{ pointerEvents: 'none' }}>
                <div className="bg-slate-900/80 px-1.5 py-0.5 rounded text-xs text-white whitespace-nowrap">
                  {Math.round(weight).toLocaleString()} lbs
                </div>
              </Html>
            </group>
          );
        })
      )}
    </group>
  );
}

function MissingPositionItem({ 
  item, 
  index, 
  scale, 
  rampZ 
}: { 
  item: VehiclePlacement; 
  index: number; 
  scale: number;
  rampZ: number;
}) {
  const vLength = (item.length || 100) * scale;
  const vWidth = (item.width || 80) * scale;
  const vHeight = (item.height || 60) * scale;
  const offsetX = (index % 3 - 1) * vWidth * 1.2;
  const offsetZ = Math.floor(index / 3) * vLength * 1.2;
  
  return (
    <group position={[offsetX, 0, rampZ + 1 + offsetZ]}>
      <lineSegments position={[0, vHeight / 2, 0]}>
        <edgesGeometry args={[new THREE.BoxGeometry(vWidth, vHeight, vLength)]} />
        <lineBasicMaterial color="#ef4444" linewidth={2} />
      </lineSegments>
      
      <Html position={[0, vHeight + 0.3, 0]} center>
        <div className="bg-red-600/90 px-2 py-1 rounded text-xs text-white whitespace-nowrap">
          <span className="font-bold">⚠️ {item.item?.description || 'Unknown'}</span>
          <div className="text-red-200 text-[10px]">Placement not found</div>
        </div>
      </Html>
    </group>
  );
}

function FwdAftIndicators({ loadPlan, scale }: { loadPlan: AircraftLoadPlan; scale: number }) {
  const spec = loadPlan.aircraft_spec;
  const length = spec.cargo_length * scale;
  
  return (
    <group>
      <Text
        position={[0, 0.5, -0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color="#16a34a"
        anchorX="center"
        anchorY="middle"

      >
        FWD
      </Text>
      <mesh position={[0, 0.02, -0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 0.5]} />
        <meshBasicMaterial color="#16a34a" opacity={0.2} transparent />
      </mesh>
      <mesh position={[0, 0.01, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.15, 0.3, 3]} />
        <meshStandardMaterial color="#16a34a" />
      </mesh>
      
      <Text
        position={[0, 0.5, length + 0.3]}
        rotation={[-Math.PI / 2, 0, Math.PI]}
        fontSize={0.4}
        color="#dc2626"
        anchorX="center"
        anchorY="middle"

      >
        AFT
      </Text>
      <mesh position={[0, 0.02, length + 0.15]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[1.2, 0.5]} />
        <meshBasicMaterial color="#dc2626" opacity={0.2} transparent />
      </mesh>
    </group>
  );
}

function LengthRuler({ loadPlan, scale, showMeasure }: { loadPlan: AircraftLoadPlan; scale: number; showMeasure: boolean }) {
  const spec = loadPlan.aircraft_spec;
  const lengthIn = spec.cargo_length;
  const width = spec.cargo_width * scale;
  
  const tickMarks = useMemo(() => {
    const marks: { position: number; label: string; isMajor: boolean }[] = [];
    const step = showMeasure ? 25 : 50;
    for (let i = 0; i <= lengthIn; i += step) {
      const isMajor = i % 100 === 0;
      marks.push({
        position: i * scale,
        label: isMajor ? `${i}"` : '',
        isMajor
      });
    }
    return marks;
  }, [lengthIn, scale, showMeasure]);
  
  const rulerX = -width / 2 - 0.15;
  
  return (
    <group position={[rulerX, 0.02, 0]}>
      <mesh position={[0, 0, (lengthIn * scale) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.08, lengthIn * scale]} />
        <meshBasicMaterial color="#1e40af" opacity={0.6} transparent />
      </mesh>
      
      {tickMarks.map((mark, idx) => (
        <group key={idx} position={[0, 0, mark.position]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[mark.isMajor ? 0.15 : 0.08, 0.02]} />
            <meshBasicMaterial color={mark.isMajor ? '#1e40af' : '#60a5fa'} />
          </mesh>
          
          {mark.isMajor && mark.label && (
            <Text
              position={[-0.2, 0.1, 0]}
              rotation={[0, 0, 0]}
              fontSize={0.12}
              color="#1e40af"
              anchorX="right"
              anchorY="middle"
      
            >
              {mark.label}
            </Text>
          )}
        </group>
      ))}
      
      <Text
        position={[-0.3, 0.3, (lengthIn * scale) / 2]}
        rotation={[0, Math.PI / 2, 0]}
        fontSize={0.15}
        color="#1e40af"
        anchorX="center"
        anchorY="middle"

      >
        {`${lengthIn}" (${(lengthIn / 12).toFixed(1)} ft)`}
      </Text>
    </group>
  );
}

function CargoBay3D({ loadPlan, viewMode }: { loadPlan: AircraftLoadPlan; viewMode: ViewMode }) {
  const spec = loadPlan.aircraft_spec;
  const scale = 0.01;
  const length = spec.cargo_length * scale;
  const width = spec.cargo_width * scale;
  const height = spec.cargo_height * scale;

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, -0.05, length / 2]}>
        <boxGeometry args={[width, 0.1, length]} />
        <meshStandardMaterial color="#64748b" wireframe={viewMode === 'wireframe'} />
      </mesh>

      <mesh position={[0, height / 2, length / 2]}>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial
          color="#94a3b8"
          transparent
          opacity={viewMode === 'wireframe' ? 0.3 : 0.08}
          wireframe={viewMode === 'wireframe'}
        />
      </mesh>

      <lineSegments position={[0, height / 2, length / 2]}>
        <edgesGeometry args={[new THREE.BoxGeometry(width, height, length)]} />
        <lineBasicMaterial color="#3b82f6" opacity={0.6} transparent />
      </lineSegments>

      {loadPlan.pallets.map((placement, idx) => {
        const posZ = placement.position_coord * scale;
        const lateralY = (placement.lateral_placement?.y_center_in ?? 0) * scale;
        
        return (
          <mesh key={idx} position={[lateralY, 0.01, posZ]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[PALLET_463L.width * scale, PALLET_463L.length * scale]} />
            <meshStandardMaterial
              color={placement.is_ramp ? '#f59e0b' : '#3b82f6'}
              opacity={0.15}
              transparent
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Pallet3D({ 
  placement, 
  scale, 
  viewMode,
  isSelected,
  onSelect 
}: { 
  placement: PalletPlacement; 
  scale: number;
  viewMode: ViewMode;
  isSelected: boolean;
  onSelect: (cargo: CargoItem) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const palletLength = PALLET_463L.length * scale;
  const palletWidth = PALLET_463L.width * scale;
  const palletHeight = placement.pallet.height * scale;
  
  const baseColor = placement.pallet.hazmat_flag ? '#dc2626' : '#2563eb';
  const emissiveColor = isSelected 
    ? '#ffffff' 
    : placement.pallet.hazmat_flag ? '#7f1d1d' : '#1e40af';
  const emissiveIntensity = isSelected ? 0.5 : 0.1;
  
  useFrame((state) => {
    if (meshRef.current) {
      const baseY = palletHeight / 2 + 0.05;
      const bounce = isSelected ? Math.sin(state.clock.elapsedTime * 2) * 0.02 : Math.sin(state.clock.elapsedTime * 0.5) * 0.005;
      meshRef.current.position.y = baseY + bounce;
    }
  });

  const lateralY = placement.lateral_placement?.y_center_in ?? 0;
  
  const handleClick = useCallback(() => {
    onSelect({
      type: 'pallet',
      id: placement.pallet.id,
      name: placement.pallet.id,
      tcn: placement.pallet.items?.[0]?.lead_tcn || undefined,
      weight: placement.pallet.gross_weight,
      dimensions: {
        length: PALLET_463L.length,
        width: PALLET_463L.width,
        height: placement.pallet.height
      },
      position: {
        x: lateralY,
        y: 0,
        z: placement.position_coord
      },
      hazmat: placement.pallet.hazmat_flag
    });
  }, [placement, lateralY, onSelect]);
  
  return (
    <group position={[lateralY * scale, 0, placement.position_coord * scale]}>
      <mesh 
        ref={meshRef} 
        position={[0, palletHeight / 2 + 0.05, 0]}
        onPointerDown={handleClick}
      >
        <boxGeometry args={[palletWidth, palletHeight, palletLength]} />
        <meshStandardMaterial
          color={baseColor}
          emissive={emissiveColor}
          emissiveIntensity={emissiveIntensity}
          wireframe={viewMode === 'wireframe'}
        />
      </mesh>
      
      {isSelected && (
        <mesh position={[0, palletHeight / 2 + 0.05, 0]}>
          <boxGeometry args={[palletWidth + 0.02, palletHeight + 0.02, palletLength + 0.02]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
        </mesh>
      )}
      
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[palletWidth, 0.04, palletLength]} />
        <meshStandardMaterial color="#64748b" wireframe={viewMode === 'wireframe'} />
      </mesh>
      
      <Html
        position={[0, palletHeight + 0.2, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className={`px-2 py-1 rounded text-xs whitespace-nowrap ${isSelected ? 'bg-blue-600' : 'bg-slate-900/90'}`}>
          <span className="text-white font-bold">{placement.pallet.id}</span>
          <span className="text-slate-300 ml-2">
            {Math.round(placement.pallet.gross_weight).toLocaleString()} lbs
          </span>
          {placement.pallet.hazmat_flag && (
            <span className="text-yellow-400 ml-1">⚠️</span>
          )}
        </div>
      </Html>
    </group>
  );
}

function Vehicle3D({ 
  vehicle, 
  scale,
  viewMode,
  isSelected,
  onSelect 
}: { 
  vehicle: VehiclePlacement; 
  scale: number;
  viewMode: ViewMode;
  isSelected: boolean;
  onSelect: (cargo: CargoItem) => void;
}) {
  const vLength = vehicle.length * scale;
  const vWidth = vehicle.width * scale;
  const vHeight = vehicle.height * scale;
  
  const lateralX = (vehicle.lateral_placement?.y_center_in ?? vehicle.position?.x ?? 0) * scale;
  const positionZ = (vehicle.position?.z ?? 0) * scale;
  
  const wheelRadius = Math.min(vHeight * 0.25, 0.15);
  const wheelWidth = Math.min(vWidth * 0.08, 0.1);
  const wheelOffsetY = wheelRadius;
  const wheelSpacingZ = vLength * 0.35;
  const wheelSpacingX = vWidth * 0.4;
  
  const emissiveIntensity = isSelected ? 0.5 : 0.1;
  
  const handleClick = useCallback(() => {
    onSelect({
      type: 'vehicle',
      id: String(vehicle.item_id),
      name: vehicle.item?.description || 'Vehicle',
      tcn: vehicle.item?.lead_tcn,
      weight: vehicle.weight || 0,
      dimensions: {
        length: vehicle.length,
        width: vehicle.width,
        height: vehicle.height
      },
      position: {
        x: vehicle.lateral_placement?.y_center_in ?? vehicle.position?.x ?? 0,
        y: 0,
        z: vehicle.position?.z ?? 0
      }
    });
  }, [vehicle, onSelect]);
  
  return (
    <group position={[lateralX, 0, positionZ]}>
      <mesh 
        position={[0, vHeight / 2 + 0.05 + wheelRadius, 0]}
        onPointerDown={handleClick}
      >
        <boxGeometry args={[vWidth, vHeight, vLength]} />
        <meshStandardMaterial
          color={isSelected ? '#22c55e' : '#365314'}
          emissive={isSelected ? '#ffffff' : '#1a2e05'}
          emissiveIntensity={emissiveIntensity}
          wireframe={viewMode === 'wireframe'}
        />
      </mesh>
      
      {isSelected && (
        <mesh position={[0, vHeight / 2 + 0.05 + wheelRadius, 0]}>
          <boxGeometry args={[vWidth + 0.02, vHeight + 0.02, vLength + 0.02]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.2} />
        </mesh>
      )}
      
      {[[-wheelSpacingX, wheelSpacingZ], [-wheelSpacingX, -wheelSpacingZ], 
        [wheelSpacingX, wheelSpacingZ], [wheelSpacingX, -wheelSpacingZ]].map(([x, z], i) => (
        <mesh key={i} position={[x, wheelOffsetY, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
          <meshStandardMaterial color="#1f2937" wireframe={viewMode === 'wireframe'} />
        </mesh>
      ))}
      
      <Html
        position={[0, vHeight + wheelRadius + 0.3, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className={`px-2 py-1 rounded text-xs whitespace-nowrap ${isSelected ? 'bg-green-600' : 'bg-slate-900/90'}`}>
          <span className="text-green-300 font-bold">{vehicle.item?.description || 'Vehicle'}</span>
          <span className="text-slate-300 ml-2">
            {vehicle.weight?.toLocaleString() || 0} lbs
          </span>
        </div>
      </Html>
    </group>
  );
}

function SeatZone3D({ 
  seatZone, 
  scale,
  occupiedCount,
  startSeatIndex
}: { 
  seatZone: SeatZone; 
  scale: number;
  occupiedCount: number;
  startSeatIndex: number;
}) {
  const SEAT_WIDTH_IN = 18;
  const SEAT_DEPTH_IN = 20;
  const SEAT_HEIGHT_IN = 30;
  const SEAT_SPACING_IN = 20;
  
  const seatWidth = SEAT_WIDTH_IN * scale;
  const seatDepth = SEAT_DEPTH_IN * scale;
  const seatHeight = SEAT_HEIGHT_IN * scale;
  
  const seats = useMemo(() => {
    const result: { x: number; z: number; isOccupied: boolean; seatIndex: number }[] = [];
    
    const zoneLength = seatZone.xEndIn - seatZone.xStartIn;
    const numSeatsLongitudinal = Math.max(1, Math.floor(zoneLength / SEAT_SPACING_IN));
    
    const isCenterZone = seatZone.side === 'center';
    const numRows = isCenterZone ? 2 : 1;
    const rowSpacing = isCenterZone ? SEAT_DEPTH_IN * scale * 1.2 : 0;
    
    let globalSeatIndex = startSeatIndex;
    
    for (let row = 0; row < numRows; row++) {
      for (let i = 0; i < numSeatsLongitudinal; i++) {
        const zPosition = seatZone.xStartIn + (i + 0.5) * SEAT_SPACING_IN;
        
        let xOffset = seatZone.yOffsetIn * scale;
        if (isCenterZone) {
          xOffset += (row === 0 ? -rowSpacing / 2 : rowSpacing / 2);
        }
        
        const isOccupied = globalSeatIndex < occupiedCount;
        
        result.push({
          x: xOffset,
          z: zPosition * scale,
          isOccupied,
          seatIndex: globalSeatIndex
        });
        
        globalSeatIndex++;
      }
    }
    
    return result;
  }, [seatZone, scale, occupiedCount, startSeatIndex]);
  
  const unoccupiedColor = '#9ca3af';
  const occupiedColor = '#3b82f6';
  
  return (
    <group>
      {seats.map((seat, idx) => (
        <group key={`seat-${seatZone.id}-${idx}`} position={[seat.x, 0, seat.z]}>
          <mesh position={[0, seatHeight / 2 + 0.02, 0]}>
            <boxGeometry args={[seatWidth, seatHeight, seatDepth]} />
            <meshStandardMaterial 
              color={seat.isOccupied ? occupiedColor : unoccupiedColor}
              emissive={seat.isOccupied ? '#1e40af' : '#4b5563'}
              emissiveIntensity={seat.isOccupied ? 0.2 : 0.05}
            />
          </mesh>
          
          <mesh position={[0, seatHeight * 0.8 + 0.02, -seatDepth * 0.4]}>
            <boxGeometry args={[seatWidth, seatHeight * 0.6, seatDepth * 0.15]} />
            <meshStandardMaterial 
              color={seat.isOccupied ? occupiedColor : unoccupiedColor}
              emissive={seat.isOccupied ? '#1e40af' : '#4b5563'}
              emissiveIntensity={seat.isOccupied ? 0.2 : 0.05}
            />
          </mesh>
        </group>
      ))}
      
      {seats.length > 0 && (
        <Html
          position={[seatZone.yOffsetIn * scale, seatHeight + 0.15, ((seatZone.xStartIn + seatZone.xEndIn) / 2) * scale]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div className="px-1.5 py-0.5 rounded text-[10px] bg-slate-700/80 text-slate-200 whitespace-nowrap">
            {seatZone.name}
          </div>
        </Html>
      )}
    </group>
  );
}

function getVerticesFromGeometry(
  geometry: THREE.BufferGeometry,
  object: THREE.Object3D
): THREE.Vector3[] {
  const vertices: THREE.Vector3[] = [];
  const positionAttribute = geometry.getAttribute('position');
  
  if (!positionAttribute) return vertices;
  
  const worldMatrix = object.matrixWorld;
  
  for (let i = 0; i < positionAttribute.count; i++) {
    const vertex = new THREE.Vector3(
      positionAttribute.getX(i),
      positionAttribute.getY(i),
      positionAttribute.getZ(i)
    );
    vertex.applyMatrix4(worldMatrix);
    vertices.push(vertex);
  }
  
  return vertices;
}

interface FaceIndices {
  a: number;
  b: number;
  c: number;
}

function getEdgeMidpointsFromGeometry(
  geometry: THREE.BufferGeometry,
  object: THREE.Object3D,
  face: FaceIndices | null | undefined
): THREE.Vector3[] {
  const midpoints: THREE.Vector3[] = [];
  
  if (!face) return midpoints;
  
  const positionAttribute = geometry.getAttribute('position');
  if (!positionAttribute) return midpoints;
  
  const worldMatrix = object.matrixWorld;
  
  const indices = [face.a, face.b, face.c];
  if (indices.some(idx => idx < 0 || idx >= positionAttribute.count)) {
    return midpoints;
  }
  
  const faceVertices = indices.map(idx => {
    const v = new THREE.Vector3(
      positionAttribute.getX(idx),
      positionAttribute.getY(idx),
      positionAttribute.getZ(idx)
    );
    v.applyMatrix4(worldMatrix);
    return v;
  });
  
  for (let i = 0; i < 3; i++) {
    const start = faceVertices[i];
    const end = faceVertices[(i + 1) % 3];
    const midpoint = new THREE.Vector3().lerpVectors(start, end, 0.5);
    midpoints.push(midpoint);
  }
  
  return midpoints;
}

function findNearestPoint(
  target: THREE.Vector3,
  candidates: THREE.Vector3[],
  threshold: number
): { point: THREE.Vector3; distance: number } | null {
  let nearest: { point: THREE.Vector3; distance: number } | null = null;
  
  for (const candidate of candidates) {
    const dist = target.distanceTo(candidate);
    if (dist <= threshold && (!nearest || dist < nearest.distance)) {
      nearest = { point: candidate.clone(), distance: dist };
    }
  }
  
  return nearest;
}

function findSnapPoint(
  hitPoint: THREE.Vector3,
  hitObject: THREE.Object3D,
  face: FaceIndices | null | undefined,
  snapThreshold: number = 0.15
): { point: THREE.Vector3; snapType: 'vertex' | 'edge' | 'surface' } {
  const mesh = hitObject as THREE.Mesh;
  if (!mesh.geometry) {
    return { point: hitPoint.clone(), snapType: 'surface' };
  }
  
  const geometry = mesh.geometry as THREE.BufferGeometry;
  
  const vertices = getVerticesFromGeometry(geometry, hitObject);
  const nearestVertex = findNearestPoint(hitPoint, vertices, snapThreshold);
  if (nearestVertex) {
    return { point: nearestVertex.point, snapType: 'vertex' };
  }
  
  const edgeMidpoints = getEdgeMidpointsFromGeometry(geometry, hitObject, face);
  const nearestEdge = findNearestPoint(hitPoint, edgeMidpoints, snapThreshold * 0.8);
  if (nearestEdge) {
    return { point: nearestEdge.point, snapType: 'edge' };
  }
  
  return { point: hitPoint.clone(), snapType: 'surface' };
}

function SnapMarker({ 
  position, 
  snapType 
}: { 
  position: THREE.Vector3; 
  snapType: 'vertex' | 'edge' | 'surface';
}) {
  const color = snapType === 'vertex' ? '#ff0000' : snapType === 'edge' ? '#ff8800' : '#ffff00';
  const size = snapType === 'vertex' ? 0.08 : snapType === 'edge' ? 0.06 : 0.05;
  
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[size, 16, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {snapType === 'vertex' && (
        <>
          <mesh rotation={[0, 0, 0]}>
            <boxGeometry args={[0.02, 0.2, 0.02]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <boxGeometry args={[0.02, 0.2, 0.02]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.02, 0.2, 0.02]} />
            <meshBasicMaterial color="#ffffff" />
          </mesh>
        </>
      )}
    </group>
  );
}

function MeasurementLine({ 
  point1, 
  point2,
  scale
}: { 
  point1: THREE.Vector3; 
  point2: THREE.Vector3;
  scale: number;
}) {
  const distance = point1.distanceTo(point2);
  const distanceInches = distance / scale;
  const midpoint = useMemo(() => new THREE.Vector3().lerpVectors(point1, point2, 0.5), [point1, point2]);
  
  const lineGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const points = [point1, point2];
    geometry.setFromPoints(points);
    return geometry;
  }, [point1, point2]);
  
  const deltaX = Math.abs((point2.x - point1.x) / scale);
  const deltaY = Math.abs((point2.y - point1.y) / scale);
  const deltaZ = Math.abs((point2.z - point1.z) / scale);
  
  const lineRef = useRef<THREE.Line>(null);
  
  useEffect(() => {
    if (lineRef.current) {
      lineRef.current.computeLineDistances();
    }
  }, [lineGeometry]);
  
  return (
    <group>
      <primitive object={new THREE.Line(
        lineGeometry,
        new THREE.LineDashedMaterial({ color: '#ffff00', dashSize: 0.05, gapSize: 0.03 })
      )} ref={lineRef} />
      
      <SnapMarker position={point1} snapType="vertex" />
      <SnapMarker position={point2} snapType="vertex" />
      
      <Html position={midpoint} center style={{ pointerEvents: 'none' }}>
        <div className="bg-black/90 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-mono">
          <div className="text-yellow-400 font-bold text-center mb-1">
            {distanceInches.toFixed(1)}"
          </div>
          <div className="text-xs text-slate-300 space-y-0.5">
            <div>ΔX: {deltaX.toFixed(1)}"</div>
            <div>ΔY: {deltaY.toFixed(1)}"</div>
            <div>ΔZ: {deltaZ.toFixed(1)}"</div>
          </div>
        </div>
      </Html>
    </group>
  );
}

function MeasureTool({
  measureState,
  onMeasureClick,
  onHoverPoint,
  scale
}: {
  measureState: MeasureState;
  onMeasureClick: (point: THREE.Vector3, snapType: 'vertex' | 'edge' | 'surface') => void;
  onHoverPoint: (point: THREE.Vector3 | null, snapType: 'vertex' | 'edge' | 'surface' | null) => void;
  scale: number;
}) {
  const { camera, scene, gl } = useThree();
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  
  const handlePointerMove = useCallback((event: PointerEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    
    const meshes = scene.children.filter(child => 
      child instanceof THREE.Mesh || child instanceof THREE.Group
    );
    
    const intersects = raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      const face = hit.face ?? undefined;
      const { point, snapType } = findSnapPoint(hit.point, hit.object, face, 0.15);
      onHoverPoint(point, snapType);
    } else {
      onHoverPoint(null, null);
    }
  }, [camera, scene, gl, raycaster, onHoverPoint]);
  
  const handleClick = useCallback((event: MouseEvent) => {
    const rect = gl.domElement.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
    
    const meshes = scene.children.filter(child => 
      child instanceof THREE.Mesh || child instanceof THREE.Group
    );
    
    const intersects = raycaster.intersectObjects(meshes, true);
    
    if (intersects.length > 0) {
      const hit = intersects[0];
      const face = hit.face ?? undefined;
      const { point, snapType } = findSnapPoint(hit.point, hit.object, face, 0.15);
      onMeasureClick(point, snapType);
    }
  }, [camera, scene, gl, raycaster, onMeasureClick]);
  
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('click', handleClick);
    canvas.style.cursor = 'crosshair';
    
    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('click', handleClick);
      canvas.style.cursor = 'auto';
    };
  }, [gl, handlePointerMove, handleClick]);
  
  return (
    <group>
      {measureState.hoverPoint && !measureState.secondPoint && (
        <SnapMarker 
          position={measureState.hoverPoint} 
          snapType={measureState.snapType || 'surface'} 
        />
      )}
      
      {measureState.firstPoint && !measureState.secondPoint && (
        <SnapMarker position={measureState.firstPoint} snapType="vertex" />
      )}
      
      {measureState.firstPoint && measureState.hoverPoint && !measureState.secondPoint && (
        <group>
          <line>
            <bufferGeometry>
              <bufferAttribute
                attach="attributes-position"
                count={2}
                array={new Float32Array([
                  measureState.firstPoint.x, measureState.firstPoint.y, measureState.firstPoint.z,
                  measureState.hoverPoint.x, measureState.hoverPoint.y, measureState.hoverPoint.z
                ])}
                itemSize={3}
              />
            </bufferGeometry>
            <lineBasicMaterial color="#ffff00" opacity={0.5} transparent />
          </line>
        </group>
      )}
      
      {measureState.firstPoint && measureState.secondPoint && (
        <MeasurementLine 
          point1={measureState.firstPoint} 
          point2={measureState.secondPoint}
          scale={scale}
        />
      )}
    </group>
  );
}

function MeasureHUD({ 
  measureState, 
  scale,
  onReset 
}: { 
  measureState: MeasureState;
  scale: number;
  onReset: () => void;
}) {
  if (!measureState.firstPoint && !measureState.secondPoint) {
    return (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 px-4 py-2 rounded-lg text-white text-sm z-10">
        <span className="text-yellow-400">📏 Measure Mode:</span> Click on surfaces to measure distances
      </div>
    );
  }
  
  if (measureState.firstPoint && !measureState.secondPoint) {
    return (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 px-4 py-2 rounded-lg text-white text-sm z-10">
        <span className="text-green-400">✓ First point set.</span> Click to set second point. <span className="text-slate-400">(ESC to cancel)</span>
      </div>
    );
  }
  
  if (measureState.firstPoint && measureState.secondPoint) {
    const distance = measureState.firstPoint.distanceTo(measureState.secondPoint);
    const distanceInches = distance / scale;
    const deltaX = Math.abs((measureState.secondPoint.x - measureState.firstPoint.x) / scale);
    const deltaY = Math.abs((measureState.secondPoint.y - measureState.firstPoint.y) / scale);
    const deltaZ = Math.abs((measureState.secondPoint.z - measureState.firstPoint.z) / scale);
    
    return (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-slate-900/95 px-4 py-3 rounded-lg text-white z-10 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className="text-yellow-400 font-bold text-xl">{distanceInches.toFixed(1)}"</div>
            <div className="text-slate-400 text-xs">({(distanceInches / 12).toFixed(2)} ft)</div>
          </div>
          <div className="border-l border-slate-600 pl-4 text-xs text-slate-300 font-mono">
            <div>ΔX: {deltaX.toFixed(1)}"</div>
            <div>ΔY: {deltaY.toFixed(1)}"</div>
            <div>ΔZ: {deltaZ.toFixed(1)}"</div>
          </div>
          <button 
            onClick={onReset}
            className="ml-2 px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
          >
            Reset
          </button>
        </div>
        <div className="text-slate-400 text-xs mt-2 text-center">Click again or press ESC to start new measurement</div>
      </div>
    );
  }
  
  return null;
}

function AnimationControlPanel({
  isPlaying,
  animationTime,
  totalDuration,
  animationSpeed,
  animationModeType,
  onPlayPause,
  onRewind,
  onSkipForward,
  onSkipBackward,
  onSpeedChange,
  onClose,
  onTimeChange,
  onModeToggle
}: {
  isPlaying: boolean;
  animationTime: number;
  totalDuration: number;
  animationSpeed: number;
  animationModeType: AnimationMode;
  onPlayPause: () => void;
  onRewind: () => void;
  onSkipForward: () => void;
  onSkipBackward: () => void;
  onSpeedChange: (speed: number) => void;
  onClose: () => void;
  onTimeChange: (time: number) => void;
  onModeToggle: () => void;
}) {
  const progressPercent = totalDuration > 0 ? (animationTime / totalDuration) * 100 : 0;
  const isLoading = animationModeType === 'loading';
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="absolute bottom-24 left-1/2 -translate-x-1/2 bg-slate-900/95 rounded-lg px-6 py-4 shadow-xl border border-slate-700 z-20">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <button
            onClick={onRewind}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            title="Rewind to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          
          <button
            onClick={onSkipBackward}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            title="Skip back 5 seconds"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          
          <button
            onClick={onPlayPause}
            className={`p-3 rounded-lg ${isPlaying ? 'bg-amber-600 hover:bg-amber-500' : 'bg-green-600 hover:bg-green-500'} text-white transition-colors`}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          
          <button
            onClick={onSkipForward}
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white transition-colors"
            title="Skip forward 5 seconds"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex flex-col gap-1 min-w-[200px]">
          <div className="flex justify-between text-xs text-slate-400">
            <span>{formatTime(animationTime)}</span>
            <span>{formatTime(totalDuration)}</span>
          </div>
          <div className="relative h-2 bg-slate-700 rounded-full overflow-hidden">
            <div 
              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
            <input
              type="range"
              min={0}
              max={totalDuration}
              step={0.1}
              value={animationTime}
              onChange={(e) => onTimeChange(parseFloat(e.target.value))}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-slate-400 text-xs">Speed:</span>
          <select
            value={animationSpeed}
            onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
            className="bg-slate-700 text-white text-sm px-2 py-1 rounded border-none outline-none"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2 border-l border-slate-600 pl-4">
          <button
            onClick={onModeToggle}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
              isLoading 
                ? 'bg-green-600 hover:bg-green-500' 
                : 'bg-orange-600 hover:bg-orange-500'
            } text-white`}
            title={isLoading ? 'Switch to Unload Mode' : 'Switch to Load Mode'}
          >
            {isLoading ? (
              <>
                <ArrowDownToLine className="w-4 h-4" />
                <span className="text-xs font-medium">LOAD</span>
              </>
            ) : (
              <>
                <ArrowUpFromLine className="w-4 h-4" />
                <span className="text-xs font-medium">UNLOAD</span>
              </>
            )}
          </button>
        </div>
        
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-red-600/80 hover:bg-red-500 text-white transition-colors"
          title="Exit animation mode"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      <div className="mt-2 text-center text-xs text-slate-400">
        Cargo {isLoading ? 'Loading' : 'Unloading'} Simulation • {Math.round(progressPercent)}% complete
      </div>
    </div>
  );
}

function CenterOfBalance({ loadPlan, scale, viewMode }: { loadPlan: AircraftLoadPlan; scale: number; viewMode: ViewMode }) {
  // FIX: Show ACTUAL CG position in cargo bay, not clamped to envelope
  // The CoB percentage is relative to the MAC (Mean Aerodynamic Chord)
  // We need to convert this to a physical position in the cargo bay
  
  const spec = loadPlan.aircraft_spec;
  const cobPercent = loadPlan.cob_percent;
  
  // Calculate actual CG station (inches from aircraft datum)
  // CG station = LEMAC + (cob_percent/100) * MAC_length
  const cgStation = spec.lemac_station + (cobPercent / 100) * spec.mac_length;
  
  // Convert station to position in cargo bay (from forward edge)
  const positionInBay = cgStation - spec.cargo_bay_fs_start;
  
  // Normalize to visual length, clamped to visible range
  const normalized = Math.max(0, Math.min(1, positionInBay / spec.cargo_length));
  
  // Position marker along the cargo bay length (in 3D coordinates)
  const cobPosition = normalized * spec.cargo_length * scale;
  const color = loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444';
  const isCogMode = viewMode === 'cog';
  
  return (
    <group position={[0, 0, cobPosition]}>
      <mesh position={[0, 2, 0]}>
        <coneGeometry args={[isCogMode ? 0.25 : 0.15, isCogMode ? 0.6 : 0.4, 4]} />
        <meshStandardMaterial 
          color={color} 
          emissive={color} 
          emissiveIntensity={isCogMode ? 0.6 : 0.3} 
        />
      </mesh>
      
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[isCogMode ? 0.04 : 0.02, isCogMode ? 0.04 : 0.02, 2, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      {isCogMode && (
        <>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.3, 0.5, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} />
          </mesh>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.6, 0.8, 32]} />
            <meshBasicMaterial color={color} transparent opacity={0.2} />
          </mesh>
        </>
      )}
      
      <Html position={[0, 2.5, 0]} center>
        <div className={`px-2 py-1 rounded text-xs font-bold ${
          loadPlan.cob_in_envelope ? 'bg-green-600' : 'bg-red-600'
        } text-white ${isCogMode ? 'ring-2 ring-white' : ''}`}>
          CoB: {loadPlan.cob_percent.toFixed(1)}%
          {isCogMode && <span className="ml-1">({loadPlan.center_of_balance.toFixed(0)}")</span>}
        </div>
      </Html>
    </group>
  );
}

function Scene({ 
  loadPlan,
  viewerState,
  onSelectCargo,
  onReset,
  onMeasureToggle,
  onHeatmapToggle,
  onMeasureClick,
  onMeasureHover,
  onMeasureReset,
  animationMode,
  animationModeType,
  isPlaying,
  animationTime,
  animationSpeed,
  loadingSequence,
  highlightedItemId,
  onAnimationToggle
}: { 
  loadPlan: AircraftLoadPlan;
  viewerState: ViewerState;
  onSelectCargo: (cargo: CargoItem | null) => void;
  onReset: () => void;
  onMeasureToggle: () => void;
  onHeatmapToggle: () => void;
  onMeasureClick: (point: THREE.Vector3, snapType: 'vertex' | 'edge' | 'surface') => void;
  onMeasureHover: (point: THREE.Vector3 | null, snapType: 'vertex' | 'edge' | 'surface' | null) => void;
  animationModeType: AnimationMode;
  onMeasureReset: () => void;
  animationMode: boolean;
  isPlaying: boolean;
  animationTime: number;
  animationSpeed: number;
  loadingSequence: LoadingSequenceItem[];
  highlightedItemId: string | null;
  onAnimationToggle: () => void;
}) {
  const scale = 0.01;
  const spec = loadPlan.aircraft_spec;
  const centerZ = (spec.cargo_length * scale) / 2;
  const length = spec.cargo_length * scale;
  
  const missingPositionItems = useMemo(() => {
    return loadPlan.rolling_stock.filter(v => 
      v.position === undefined || v.position === null || 
      (v.position.x === undefined && v.position.z === undefined)
    );
  }, [loadPlan.rolling_stock]);
  
  const validRollingStock = useMemo(() => {
    return loadPlan.rolling_stock.filter(v => 
      v.position !== undefined && v.position !== null &&
      (v.position.x !== undefined || v.position.z !== undefined)
    );
  }, [loadPlan.rolling_stock]);
  
  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[5, 4, length + 2]}
        fov={50}
      />
      
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 15, 10]} intensity={1.2} castShadow />
      <directionalLight position={[-10, 10, -10]} intensity={0.6} />
      <directionalLight position={[0, 10, 0]} intensity={0.5} />
      <pointLight position={[0, 5, centerZ]} intensity={1.0} />
      <pointLight position={[0, 3, centerZ - 3]} intensity={0.5} />
      <pointLight position={[0, 3, centerZ + 3]} intensity={0.5} />
      
      <color attach="background" args={['#f5f5f5']} />
      <fog attach="fog" args={['#f5f5f5', 15, 40]} />
      
      <CargoBay3D loadPlan={loadPlan} viewMode={viewerState.viewMode} />
      
      <FwdAftIndicators loadPlan={loadPlan} scale={scale} />
      <LengthRuler loadPlan={loadPlan} scale={scale} showMeasure={viewerState.showMeasure} />
      
      {(viewerState.viewMode === 'heatmap' || viewerState.showHeatmap) && (
        <HeatmapFloor loadPlan={loadPlan} scale={scale} />
      )}
      
      {animationMode ? (
        <CargoLoadingAnimation
          loadPlan={loadPlan}
          sequence={loadingSequence}
          isPlaying={isPlaying}
          speed={animationSpeed}
          currentTime={animationTime}
          highlightedItemId={highlightedItemId}
          mode={animationModeType}
        />
      ) : (
        <>
          {loadPlan.pallets.map((placement) => (
            <Pallet3D 
              key={placement.pallet.id} 
              placement={placement} 
              scale={scale}
              viewMode={viewerState.viewMode}
              isSelected={viewerState.selectedCargo?.id === placement.pallet.id}
              onSelect={onSelectCargo}
            />
          ))}
          
          {validRollingStock.map((vehicle) => (
            <Vehicle3D 
              key={String(vehicle.item_id)} 
              vehicle={vehicle} 
              scale={scale}
              viewMode={viewerState.viewMode}
              isSelected={viewerState.selectedCargo?.id === String(vehicle.item_id)}
              onSelect={onSelectCargo}
            />
          ))}
        </>
      )}
      
      {spec.seat_zones?.map((seatZone, zoneIndex) => {
        let startIndex = 0;
        for (let i = 0; i < zoneIndex; i++) {
          const prevZone = spec.seat_zones[i];
          const prevZoneLength = prevZone.xEndIn - prevZone.xStartIn;
          const prevSeatsPerRow = Math.max(1, Math.floor(prevZoneLength / 20));
          const prevRows = prevZone.side === 'center' ? 2 : 1;
          startIndex += prevSeatsPerRow * prevRows;
        }
        return (
          <SeatZone3D
            key={seatZone.id}
            seatZone={seatZone}
            scale={scale}
            occupiedCount={loadPlan.pax_count || 0}
            startSeatIndex={startIndex}
          />
        );
      })}
      
      {missingPositionItems.map((vehicle, idx) => (
        <MissingPositionItem
          key={`missing-${vehicle.item_id}`}
          item={vehicle}
          index={idx}
          scale={scale}
          rampZ={length}
        />
      ))}
      
      <CenterOfBalance loadPlan={loadPlan} scale={scale} viewMode={viewerState.viewMode} />
      
      <gridHelper
        args={[20, 40, '#94a3b8', '#cbd5e1']}
        position={[0, -0.01, centerZ]}
        rotation={[0, 0, 0]}
      />
      
      {viewerState.showMeasure && (
        <MeasureTool
          measureState={viewerState.measureState}
          onMeasureClick={onMeasureClick}
          onHoverPoint={onMeasureHover}
          scale={scale}
        />
      )}
      
      <CameraController 
        centerZ={centerZ} 
        length={length}
        onReset={onReset}
        onMeasureToggle={onMeasureToggle}
        onHeatmapToggle={onHeatmapToggle}
        onMeasureReset={onMeasureReset}
        onAnimationToggle={onAnimationToggle}
        showMeasure={viewerState.showMeasure}
      />
    </>
  );
}

const initialMeasureState: MeasureState = {
  firstPoint: null,
  secondPoint: null,
  hoverPoint: null,
  snapType: null
};

export default function LoadPlan3DViewer({ loadPlan }: LoadPlan3DViewerProps) {
  const [viewerState, setViewerState] = useState<ViewerState>({
    selectedCargo: null,
    viewMode: 'normal',
    showHeatmap: false,
    showMinimap: true,
    showMeasure: false,
    measureState: initialMeasureState
  });
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [animationMode, setAnimationMode] = useState(false);
  const [animationModeType, setAnimationModeType] = useState<AnimationMode>('loading');
  const [isPlaying, setIsPlaying] = useState(false);
  const [animationTime, setAnimationTime] = useState(0);
  const [animationSpeed, setAnimationSpeed] = useState(1);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  
  const loadingSequence = useMemo(() => calculateLoadingSequence(loadPlan), [loadPlan]);
  const unloadingSequence = useMemo(() => calculateUnloadingSequence(loadingSequence), [loadingSequence]);
  const activeSequence = animationModeType === 'loading' ? loadingSequence : unloadingSequence;
  const totalDuration = useMemo(() => estimateTotalLoadingTime(activeSequence), [activeSequence]);
  
  useEffect(() => {
    if (!isPlaying || !animationMode) return;
    
    let animationFrameId: number;
    let lastTime = performance.now();
    
    const animate = (currentTime: number) => {
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      
      setAnimationTime(prev => {
        const newTime = prev + deltaTime * animationSpeed;
        if (newTime >= totalDuration) {
          setIsPlaying(false);
          return totalDuration;
        }
        return newTime;
      });
      
      animationFrameId = requestAnimationFrame(animate);
    };
    
    animationFrameId = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [isPlaying, animationMode, animationSpeed, totalDuration]);
  
  const scale = 0.01;
  
  const handleSelectCargo = useCallback((cargo: CargoItem | null) => {
    setViewerState(prev => ({ ...prev, selectedCargo: cargo }));
  }, []);
  
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewerState(prev => ({ 
      ...prev, 
      viewMode: mode,
      showHeatmap: mode === 'heatmap'
    }));
  }, []);
  
  const handleMinimapToggle = useCallback(() => {
    setViewerState(prev => ({ ...prev, showMinimap: !prev.showMinimap }));
  }, []);
  
  const handleMeasureToggle = useCallback(() => {
    setViewerState(prev => ({ 
      ...prev, 
      showMeasure: !prev.showMeasure,
      measureState: !prev.showMeasure ? initialMeasureState : prev.measureState
    }));
  }, []);
  
  const handleHeatmapToggle = useCallback(() => {
    setViewerState(prev => ({ 
      ...prev, 
      showHeatmap: !prev.showHeatmap,
      viewMode: !prev.showHeatmap ? 'heatmap' : 'normal'
    }));
  }, []);
  
  const handleReset = useCallback(() => {
    setViewerState(prev => ({ ...prev, selectedCargo: null }));
  }, []);
  
  const handleMeasureClick = useCallback((point: THREE.Vector3, snapType: 'vertex' | 'edge' | 'surface') => {
    setViewerState(prev => {
      const ms = prev.measureState;
      
      if (!ms.firstPoint) {
        return {
          ...prev,
          measureState: {
            ...ms,
            firstPoint: point.clone(),
            secondPoint: null,
            snapType
          }
        };
      }
      
      if (!ms.secondPoint) {
        return {
          ...prev,
          measureState: {
            ...ms,
            secondPoint: point.clone(),
            snapType
          }
        };
      }
      
      return {
        ...prev,
        measureState: {
          firstPoint: point.clone(),
          secondPoint: null,
          hoverPoint: null,
          snapType
        }
      };
    });
  }, []);
  
  const handleMeasureHover = useCallback((point: THREE.Vector3 | null, snapType: 'vertex' | 'edge' | 'surface' | null) => {
    setViewerState(prev => ({
      ...prev,
      measureState: {
        ...prev.measureState,
        hoverPoint: point ? point.clone() : null,
        snapType: snapType
      }
    }));
  }, []);
  
  const handleMeasureReset = useCallback(() => {
    setViewerState(prev => ({
      ...prev,
      measureState: initialMeasureState
    }));
  }, []);
  
  const handleAnimationToggle = useCallback(() => {
    setAnimationMode(prev => {
      if (!prev) {
        setAnimationTime(0);
        setIsPlaying(true);
      } else {
        setIsPlaying(false);
      }
      return !prev;
    });
  }, []);
  
  const handlePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);
  
  const handleRewind = useCallback(() => {
    setAnimationTime(0);
  }, []);
  
  const handleSkipForward = useCallback(() => {
    setAnimationTime(prev => Math.min(prev + 5, totalDuration));
  }, [totalDuration]);
  
  const handleSkipBackward = useCallback(() => {
    setAnimationTime(prev => Math.max(prev - 5, 0));
  }, []);
  
  const handleSpeedChange = useCallback((speed: number) => {
    setAnimationSpeed(speed);
  }, []);
  
  const handleAnimationClose = useCallback(() => {
    setAnimationMode(false);
    setIsPlaying(false);
    setAnimationTime(0);
    setAnimationModeType('loading');
  }, []);
  
  const handleAnimationModeTypeToggle = useCallback(() => {
    setAnimationModeType(prev => prev === 'loading' ? 'unloading' : 'loading');
    setAnimationTime(0);
    setIsPlaying(false);
  }, []);
  
  const handleTimeChange = useCallback((time: number) => {
    setAnimationTime(time);
  }, []);
  
  const viewerContent = (
    <>
      <div className="flex justify-between items-center p-4 border-b border-neutral-200 bg-white z-20">
        <div>
          <h3 className="text-neutral-900 font-bold text-lg">{loadPlan.aircraft_id}</h3>
          <p className="text-neutral-500 text-sm">{loadPlan.aircraft_spec.name} - 3D View</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-neutral-900 font-mono font-bold">
              {loadPlan.total_weight.toLocaleString()} lbs
            </p>
            <p className="text-neutral-500 text-sm">
              {loadPlan.payload_used_percent.toFixed(1)}% capacity
            </p>
          </div>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen view"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-5 h-5 text-neutral-600" />
            ) : (
              <Maximize2 className="w-5 h-5 text-neutral-600" />
            )}
          </button>
        </div>
      </div>
      
      <div className="flex-1 min-h-0 relative">
        <KeyboardControls map={keyMap}>
          <Canvas shadows>
            <Scene 
              loadPlan={loadPlan} 
              viewerState={viewerState}
              onSelectCargo={handleSelectCargo}
              onReset={handleReset}
              onMeasureToggle={handleMeasureToggle}
              onHeatmapToggle={handleHeatmapToggle}
              onMeasureClick={handleMeasureClick}
              onMeasureHover={handleMeasureHover}
              onMeasureReset={handleMeasureReset}
              animationMode={animationMode}
              isPlaying={isPlaying}
              animationTime={animationTime}
              animationSpeed={animationSpeed}
              loadingSequence={activeSequence}
              highlightedItemId={highlightedItemId}
              onAnimationToggle={handleAnimationToggle}
              animationModeType={animationModeType}
            />
          </Canvas>
        </KeyboardControls>
        
        <ViewerSidebar
          viewMode={viewerState.viewMode}
          showMinimap={viewerState.showMinimap}
          showMeasure={viewerState.showMeasure}
          animationMode={animationMode}
          onViewModeChange={handleViewModeChange}
          onMinimapToggle={handleMinimapToggle}
          onMeasureToggle={handleMeasureToggle}
          onAnimationToggle={handleAnimationToggle}
        />
        
        {viewerState.selectedCargo && (
          <InfoPanel 
            cargo={viewerState.selectedCargo} 
            onClose={() => handleSelectCargo(null)} 
          />
        )}
        
        {viewerState.showMinimap && (
          <MiniMap loadPlan={loadPlan} scale={scale} />
        )}
        
        {viewerState.showMeasure && (
          <MeasureHUD 
            measureState={viewerState.measureState} 
            scale={scale}
            onReset={handleMeasureReset}
          />
        )}
        
        {animationMode && (
          <AnimationControlPanel
            isPlaying={isPlaying}
            animationTime={animationTime}
            totalDuration={totalDuration}
            animationSpeed={animationSpeed}
            animationModeType={animationModeType}
            onPlayPause={handlePlayPause}
            onRewind={handleRewind}
            onSkipForward={handleSkipForward}
            onSkipBackward={handleSkipBackward}
            onSpeedChange={handleSpeedChange}
            onClose={handleAnimationClose}
            onTimeChange={handleTimeChange}
            onModeToggle={handleAnimationModeTypeToggle}
          />
        )}
      </div>
      
      <div className="p-3 border-t border-neutral-200 bg-white/80">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-500"></span>
              <span className="text-neutral-600">FWD</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-red-500"></span>
              <span className="text-neutral-600">AFT</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-blue-600"></span>
              <span className="text-neutral-600">Pallets</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded bg-green-700"></span>
              <span className="text-neutral-600">Vehicles</span>
            </span>
          </div>
          <div className="flex items-center gap-4 text-neutral-600">
            <span>PAX: <strong>{loadPlan.pax_count}/{loadPlan.seat_capacity || loadPlan.aircraft_spec.seat_capacity}</strong></span>
            <span>PAX Weight: <strong>{((loadPlan.pax_weight || loadPlan.pax_count * PAX_WEIGHT_LB) / 1000).toFixed(1)}k lbs</strong></span>
            <span>Seat Util: <strong className={`${(loadPlan.seat_utilization_percent || 0) > 80 ? 'text-amber-600' : ''}`}>{(loadPlan.seat_utilization_percent || 0).toFixed(1)}%</strong></span>
          </div>
          <span className="text-neutral-400 text-xs">WASD to move • R reset • M measure • L simulate • ESC cancel</span>
        </div>
      </div>
    </>
  );

  return (
    <AnimatePresence>
      {isFullscreen ? (
        <motion.div
          key="fullscreen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-neutral-50 flex flex-col overflow-hidden"
        >
          <button
            onClick={() => setIsFullscreen(false)}
            className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white shadow-lg hover:bg-neutral-100 transition-colors"
            title="Close fullscreen"
          >
            <X className="w-6 h-6 text-neutral-600" />
          </button>
          {viewerContent}
        </motion.div>
      ) : (
        <div className="bg-neutral-50 h-full flex flex-col overflow-hidden relative">
          {viewerContent}
        </div>
      )}
    </AnimatePresence>
  );
}
