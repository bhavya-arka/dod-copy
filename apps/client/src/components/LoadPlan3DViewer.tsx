/**
 * PACAF Airlift Demo - 3D Load Plan Visualization
 * 
 * Renders actual load plan data in interactive 3D,
 * showing pallets, rolling stock, and center of balance.
 */

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import {
  AircraftLoadPlan,
  AIRCRAFT_SPECS,
  PalletPlacement,
  VehiclePlacement,
  PALLET_463L,
  PAX_WEIGHT_LB
} from '../lib/pacafTypes';

interface LoadPlan3DViewerProps {
  loadPlan: AircraftLoadPlan;
}

function FwdAftIndicators({ loadPlan, scale }: { loadPlan: AircraftLoadPlan; scale: number }) {
  const spec = loadPlan.aircraft_spec;
  const length = spec.cargo_length * scale;
  const width = spec.cargo_width * scale;
  
  return (
    <group>
      <Text
        position={[0, 0.5, -0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.4}
        color="#16a34a"
        anchorX="center"
        anchorY="middle"
        font="/fonts/inter.json"
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
        font="/fonts/inter.json"
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

function LengthRuler({ loadPlan, scale }: { loadPlan: AircraftLoadPlan; scale: number }) {
  const spec = loadPlan.aircraft_spec;
  const lengthIn = spec.cargo_length;
  const width = spec.cargo_width * scale;
  
  const tickMarks = useMemo(() => {
    const marks: { position: number; label: string; isMajor: boolean }[] = [];
    for (let i = 0; i <= lengthIn; i += 50) {
      const isMajor = i % 100 === 0;
      marks.push({
        position: i * scale,
        label: isMajor ? `${i}"` : '',
        isMajor
      });
    }
    return marks;
  }, [lengthIn, scale]);
  
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
              font="/fonts/inter.json"
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
        font="/fonts/inter.json"
      >
        {`${lengthIn}" (${(lengthIn / 12).toFixed(1)} ft)`}
      </Text>
    </group>
  );
}

function CargoBay3D({ loadPlan }: { loadPlan: AircraftLoadPlan }) {
  const spec = loadPlan.aircraft_spec;
  
  const scale = 0.01;
  const length = spec.cargo_length * scale;
  const width = spec.cargo_width * scale;
  const height = spec.cargo_height * scale;

  return (
    <group position={[0, 0, 0]}>
      <mesh position={[0, -0.05, length / 2]}>
        <boxGeometry args={[width, 0.1, length]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>

      <mesh position={[0, height / 2, length / 2]}>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial
          color="#94a3b8"
          transparent
          opacity={0.08}
          wireframe={false}
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

function Pallet3D({ placement, scale }: { placement: PalletPlacement; scale: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  
  const palletLength = PALLET_463L.length * scale;
  const palletWidth = PALLET_463L.width * scale;
  const palletHeight = placement.pallet.height * scale;
  
  const color = placement.pallet.hazmat_flag ? '#dc2626' : '#2563eb';
  const emissiveColor = placement.pallet.hazmat_flag ? '#7f1d1d' : '#1e40af';
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = 
        palletHeight / 2 + 0.05 + Math.sin(state.clock.elapsedTime * 0.5) * 0.005;
    }
  });

  const lateralY = placement.lateral_placement?.y_center_in ?? 0;
  
  return (
    <group position={[lateralY * scale, 0, placement.position_coord * scale]}>
      <mesh ref={meshRef} position={[0, palletHeight / 2 + 0.05, 0]}>
        <boxGeometry args={[palletWidth, palletHeight, palletLength]} />
        <meshStandardMaterial
          color={color}
          emissive={emissiveColor}
          emissiveIntensity={0.1}
        />
      </mesh>
      
      <mesh position={[0, 0.02, 0]}>
        <boxGeometry args={[palletWidth, 0.04, palletLength]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      
      <Html
        position={[0, palletHeight + 0.2, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className="bg-slate-900/90 px-2 py-1 rounded text-xs whitespace-nowrap">
          <span className="text-white font-bold">{placement.pallet.id}</span>
          <span className="text-slate-400 ml-2">
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

function Vehicle3D({ vehicle, scale }: { vehicle: VehiclePlacement; scale: number }) {
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
  
  return (
    <group position={[lateralX, 0, positionZ]}>
      <mesh position={[0, vHeight / 2 + 0.05 + wheelRadius, 0]}>
        <boxGeometry args={[vWidth, vHeight, vLength]} />
        <meshStandardMaterial
          color="#365314"
          emissive="#1a2e05"
          emissiveIntensity={0.1}
        />
      </mesh>
      
      <mesh position={[-wheelSpacingX, wheelOffsetY, wheelSpacingZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[-wheelSpacingX, wheelOffsetY, -wheelSpacingZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[wheelSpacingX, wheelOffsetY, wheelSpacingZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      <mesh position={[wheelSpacingX, wheelOffsetY, -wheelSpacingZ]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
        <meshStandardMaterial color="#1f2937" />
      </mesh>
      
      <Html
        position={[0, vHeight + wheelRadius + 0.3, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className="bg-slate-900/90 px-2 py-1 rounded text-xs whitespace-nowrap">
          <span className="text-green-400 font-bold">{vehicle.item?.description || 'Vehicle'}</span>
          <span className="text-slate-400 ml-2">
            {vehicle.weight?.toLocaleString() || 0} lbs
          </span>
        </div>
      </Html>
    </group>
  );
}

function CenterOfBalance({ loadPlan, scale }: { loadPlan: AircraftLoadPlan; scale: number }) {
  const cobPosition = loadPlan.center_of_balance * scale;
  const color = loadPlan.cob_in_envelope ? '#22c55e' : '#ef4444';
  
  return (
    <group position={[0, 0, cobPosition]}>
      <mesh position={[0, 2, 0]}>
        <coneGeometry args={[0.15, 0.4, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 2, 8]} />
        <meshStandardMaterial color={color} />
      </mesh>
      
      <Html position={[0, 2.5, 0]} center>
        <div className={`px-2 py-1 rounded text-xs font-bold ${
          loadPlan.cob_in_envelope ? 'bg-green-600' : 'bg-red-600'
        } text-white`}>
          CoB: {loadPlan.cob_percent.toFixed(1)}%
        </div>
      </Html>
    </group>
  );
}

function Scene({ loadPlan }: { loadPlan: AircraftLoadPlan }) {
  const scale = 0.01;
  const spec = loadPlan.aircraft_spec;
  const centerZ = (spec.cargo_length * scale) / 2;
  const length = spec.cargo_length * scale;
  
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
      
      <CargoBay3D loadPlan={loadPlan} />
      
      <FwdAftIndicators loadPlan={loadPlan} scale={scale} />
      <LengthRuler loadPlan={loadPlan} scale={scale} />
      
      {loadPlan.pallets.map((placement, idx) => (
        <Pallet3D key={placement.pallet.id} placement={placement} scale={scale} />
      ))}
      
      {loadPlan.rolling_stock.map((vehicle, idx) => (
        <Vehicle3D key={String(vehicle.item_id)} vehicle={vehicle} scale={scale} />
      ))}
      
      <CenterOfBalance loadPlan={loadPlan} scale={scale} />
      
      <gridHelper
        args={[20, 40, '#94a3b8', '#cbd5e1']}
        position={[0, -0.01, centerZ]}
        rotation={[0, 0, 0]}
      />
      
      <OrbitControls
        target={[0, 1, centerZ]}
        enablePan={true}
        enableZoom={true}
        minDistance={2}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2}
      />
    </>
  );
}

export default function LoadPlan3DViewer({ loadPlan }: LoadPlan3DViewerProps) {
  return (
    <div className="bg-neutral-50 h-full flex flex-col overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-neutral-200 bg-white">
        <div>
          <h3 className="text-neutral-900 font-bold text-lg">{loadPlan.aircraft_id}</h3>
          <p className="text-neutral-500 text-sm">{loadPlan.aircraft_spec.name} - 3D View</p>
        </div>
        <div className="text-right">
          <p className="text-neutral-900 font-mono font-bold">
            {loadPlan.total_weight.toLocaleString()} lbs
          </p>
          <p className="text-neutral-500 text-sm">
            {loadPlan.payload_used_percent.toFixed(1)}% capacity
          </p>
        </div>
      </div>
      
      <div className="flex-1 min-h-0">
        <Canvas shadows>
          <Scene loadPlan={loadPlan} />
        </Canvas>
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
          </div>
          <div className="flex items-center gap-4 text-neutral-600">
            <span>PAX: <strong>{loadPlan.pax_count}/{loadPlan.seat_capacity || loadPlan.aircraft_spec.seat_capacity}</strong></span>
            <span>PAX Weight: <strong>{((loadPlan.pax_weight || loadPlan.pax_count * PAX_WEIGHT_LB) / 1000).toFixed(1)}k lbs</strong></span>
            <span>Seat Util: <strong className={`${(loadPlan.seat_utilization_percent || 0) > 80 ? 'text-amber-600' : ''}`}>{(loadPlan.seat_utilization_percent || 0).toFixed(1)}%</strong></span>
          </div>
          <span className="text-neutral-400 text-xs">Drag to rotate • Scroll to zoom</span>
        </div>
      </div>
    </div>
  );
}
