/**
 * Cargo Loading Animation System
 * 
 * Animates cargo items loading into the aircraft in sequence order.
 * Items start outside the aircraft (behind the ramp) and smoothly
 * animate to their final positions with easing effects.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { AircraftLoadPlan, PALLET_463L } from '../lib/pacafTypes';
import type { LoadingSequenceItem } from '../lib/cargoLoadingSequence';

const PALLET_DIMS = {
  length: 108,
  width: 88,
  height: 2.25,
};

export interface CargoLoadingAnimationProps {
  loadPlan: AircraftLoadPlan;
  sequence: LoadingSequenceItem[];
  isPlaying: boolean;
  speed: number;
  currentTime: number;
  highlightedItemId: string | null;
}

interface AnimatedCargoProps {
  item: LoadingSequenceItem;
  cargoLength: number;
  scale: number;
  isPlaying: boolean;
  speed: number;
  currentTime: number;
  isHighlighted: boolean;
  staggerOffset: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

function liftCurve(progress: number): number {
  return Math.sin(progress * Math.PI) * 0.3;
}

function AnimatedCargo({
  item,
  cargoLength,
  scale,
  isPlaying,
  speed,
  currentTime,
  isHighlighted,
  staggerOffset,
}: AnimatedCargoProps) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  
  const startZ = (cargoLength * scale) + 2 + (staggerOffset * 0.5);
  const animationDuration = 1.5;
  
  const targetPosition = useMemo(() => new THREE.Vector3(
    item.targetPosition.x,
    item.targetPosition.y,
    item.targetPosition.z
  ), [item.targetPosition]);
  
  const startPosition = useMemo(() => new THREE.Vector3(
    item.targetPosition.x,
    item.targetPosition.y + 0.1,
    startZ
  ), [item.targetPosition.x, item.targetPosition.y, startZ]);
  
  const dimensions = useMemo(() => ({
    length: item.dimensions.length * scale,
    width: item.dimensions.width * scale,
    height: item.dimensions.height * scale,
  }), [item.dimensions, scale]);
  
  const isPallet = item.type === 'pallet';
  const baseColor = isPallet 
    ? (item.hazmat ? '#dc2626' : '#2563eb')
    : (item.hazmat ? '#dc2626' : '#365314');
  
  useFrame((state) => {
    if (!groupRef.current) return;
    
    const timeIntoAnimation = currentTime - item.animationDelay;
    
    if (timeIntoAnimation < 0) {
      groupRef.current.position.copy(startPosition);
      groupRef.current.visible = isPlaying;
      return;
    }
    
    groupRef.current.visible = true;
    
    const adjustedDuration = animationDuration / speed;
    const rawProgress = Math.min(timeIntoAnimation / adjustedDuration, 1);
    const easedProgress = easeOutQuart(rawProgress);
    
    const currentPos = new THREE.Vector3().lerpVectors(
      startPosition,
      targetPosition,
      easedProgress
    );
    
    if (rawProgress < 1) {
      currentPos.y += liftCurve(rawProgress);
    }
    
    groupRef.current.position.copy(currentPos);
    
    if (glowRef.current) {
      const glowPulse = isHighlighted 
        ? 0.3 + Math.sin(state.clock.elapsedTime * 4) * 0.1
        : 0;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = glowPulse;
    }
    
    if (meshRef.current && rawProgress < 1) {
      const settleBounce = Math.sin(rawProgress * Math.PI * 2) * 0.01 * (1 - rawProgress);
      meshRef.current.position.y = dimensions.height / 2 + settleBounce;
    }
  });
  
  const emissiveColor = isHighlighted 
    ? '#ffffff' 
    : (item.hazmat ? '#7f1d1d' : (isPallet ? '#1e40af' : '#1a2e05'));
  const emissiveIntensity = isHighlighted ? 0.6 : 0.1;
  
  return (
    <group ref={groupRef} visible={false}>
      {isPallet ? (
        <PalletMesh
          ref={meshRef}
          dimensions={dimensions}
          baseColor={baseColor}
          emissiveColor={emissiveColor}
          emissiveIntensity={emissiveIntensity}
        />
      ) : (
        <VehicleMesh
          ref={meshRef}
          dimensions={dimensions}
          baseColor={baseColor}
          emissiveColor={emissiveColor}
          emissiveIntensity={emissiveIntensity}
        />
      )}
      
      {isHighlighted && (
        <mesh ref={glowRef} position={[0, dimensions.height / 2, 0]}>
          <boxGeometry args={[
            dimensions.width + 0.08,
            dimensions.height + 0.08,
            dimensions.length + 0.08
          ]} />
          <meshBasicMaterial 
            color="#60a5fa" 
            transparent 
            opacity={0.3}
            side={THREE.BackSide}
          />
        </mesh>
      )}
      
      <SequenceLabel
        sequenceNumber={item.sequenceNumber}
        height={dimensions.height}
        name={item.name}
        weight={item.weight}
        hazmat={item.hazmat}
        isHighlighted={isHighlighted}
      />
    </group>
  );
}

interface MeshProps {
  dimensions: { length: number; width: number; height: number };
  baseColor: string;
  emissiveColor: string;
  emissiveIntensity: number;
}

const PalletMesh = React.forwardRef<THREE.Mesh, MeshProps>(
  ({ dimensions, baseColor, emissiveColor, emissiveIntensity }, ref) => {
    return (
      <group>
        <mesh ref={ref} position={[0, dimensions.height / 2, 0]}>
          <boxGeometry args={[dimensions.width, dimensions.height, dimensions.length]} />
          <meshStandardMaterial
            color={baseColor}
            emissive={emissiveColor}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
        <mesh position={[0, 0.02, 0]}>
          <boxGeometry args={[dimensions.width, 0.04, dimensions.length]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      </group>
    );
  }
);

const VehicleMesh = React.forwardRef<THREE.Mesh, MeshProps>(
  ({ dimensions, baseColor, emissiveColor, emissiveIntensity }, ref) => {
    const wheelRadius = Math.min(dimensions.height * 0.25, 0.15);
    const wheelWidth = Math.min(dimensions.width * 0.08, 0.1);
    const wheelSpacingZ = dimensions.length * 0.35;
    const wheelSpacingX = dimensions.width * 0.4;
    
    return (
      <group>
        <mesh ref={ref} position={[0, dimensions.height / 2 + wheelRadius, 0]}>
          <boxGeometry args={[dimensions.width, dimensions.height, dimensions.length]} />
          <meshStandardMaterial
            color={baseColor}
            emissive={emissiveColor}
            emissiveIntensity={emissiveIntensity}
          />
        </mesh>
        {[
          [-wheelSpacingX, wheelSpacingZ],
          [-wheelSpacingX, -wheelSpacingZ],
          [wheelSpacingX, wheelSpacingZ],
          [wheelSpacingX, -wheelSpacingZ]
        ].map(([x, z], i) => (
          <mesh 
            key={i} 
            position={[x, wheelRadius, z]} 
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
        ))}
      </group>
    );
  }
);

interface SequenceLabelProps {
  sequenceNumber: number;
  height: number;
  name: string;
  weight: number;
  hazmat: boolean;
  isHighlighted: boolean;
}

function SequenceLabel({ 
  sequenceNumber, 
  height, 
  name, 
  weight, 
  hazmat,
  isHighlighted 
}: SequenceLabelProps) {
  return (
    <Html
      position={[0, height + 0.25, 0]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div className={`flex flex-col items-center gap-1 ${isHighlighted ? 'scale-110' : ''}`}>
        <div className={`
          w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
          ${isHighlighted ? 'bg-yellow-400 text-black' : 'bg-blue-600 text-white'}
          shadow-lg
        `}>
          {sequenceNumber}
        </div>
        {isHighlighted && (
          <div className="bg-slate-900/95 px-2 py-1 rounded text-xs whitespace-nowrap">
            <span className="text-white font-medium">{name}</span>
            <span className="text-slate-400 ml-2">
              {weight.toLocaleString()} lbs
            </span>
            {hazmat && <span className="text-yellow-400 ml-1">⚠️</span>}
          </div>
        )}
      </div>
    </Html>
  );
}

function StagingArea({ 
  cargoLength, 
  width, 
  scale,
  itemCount 
}: { 
  cargoLength: number; 
  width: number; 
  scale: number;
  itemCount: number;
}) {
  const stagingZ = (cargoLength * scale) + 1.5;
  const stagingWidth = width * scale;
  const stagingLength = 2 + (itemCount * 0.3);
  
  return (
    <group position={[0, 0.01, stagingZ + stagingLength / 2]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[stagingWidth, stagingLength]} />
        <meshStandardMaterial 
          color="#fbbf24" 
          transparent 
          opacity={0.15}
        />
      </mesh>
      <lineSegments rotation={[-Math.PI / 2, 0, 0]}>
        <edgesGeometry args={[new THREE.PlaneGeometry(stagingWidth, stagingLength)]} />
        <lineBasicMaterial color="#fbbf24" opacity={0.6} transparent />
      </lineSegments>
      <Text
        position={[0, 0.1, stagingLength / 2 + 0.3]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color="#fbbf24"
        anchorX="center"
        anchorY="middle"
      >
        STAGING AREA
      </Text>
    </group>
  );
}

function LoadingPath({ 
  cargoLength, 
  scale 
}: { 
  cargoLength: number; 
  scale: number;
}) {
  const pathLength = (cargoLength * scale) + 3;
  
  const arrowGeometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(-0.1, -0.2);
    shape.lineTo(0, -0.15);
    shape.lineTo(0.1, -0.2);
    shape.lineTo(0, 0);
    return new THREE.ShapeGeometry(shape);
  }, []);
  
  return (
    <group>
      <mesh position={[0, 0.015, pathLength / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.1, pathLength]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.3} />
      </mesh>
      {Array.from({ length: Math.floor(pathLength / 0.8) }).map((_, i) => (
        <mesh 
          key={i}
          position={[0, 0.02, i * 0.8]}
          rotation={[-Math.PI / 2, 0, 0]}
          geometry={arrowGeometry}
        >
          <meshBasicMaterial color="#22c55e" transparent opacity={0.4} />
        </mesh>
      ))}
    </group>
  );
}

export function CargoLoadingAnimation({
  loadPlan,
  sequence,
  isPlaying,
  speed,
  currentTime,
  highlightedItemId,
}: CargoLoadingAnimationProps) {
  // Use same scale as LoadPlan3DViewer for consistent sizing (0.01 converts inches to scene units)
  const scale = 0.01;
  const spec = loadPlan.aircraft_spec;
  
  const sortedSequence = useMemo(() => 
    [...sequence].sort((a, b) => a.sequenceNumber - b.sequenceNumber),
    [sequence]
  );
  
  return (
    <group>
      {isPlaying && (
        <>
          <StagingArea 
            cargoLength={spec.cargo_length}
            width={spec.cargo_width}
            scale={scale}
            itemCount={sequence.length}
          />
          <LoadingPath 
            cargoLength={spec.cargo_length}
            scale={scale}
          />
        </>
      )}
      
      {sortedSequence.map((item, index) => (
        <AnimatedCargo
          key={item.id}
          item={item}
          cargoLength={spec.cargo_length}
          scale={scale}
          isPlaying={isPlaying}
          speed={speed}
          currentTime={currentTime}
          isHighlighted={highlightedItemId === item.id}
          staggerOffset={index}
        />
      ))}
    </group>
  );
}

export default CargoLoadingAnimation;
