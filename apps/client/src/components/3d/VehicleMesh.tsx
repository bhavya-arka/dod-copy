import React, { useMemo, useRef, useEffect, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import {
  VEHICLE_DIMENSIONS,
  VehicleCode,
  getVehicleScale,
  getVehicleColor,
  getVehicleCategory,
  ftToM,
  FORMATION,
} from '../../lib/vehicleDimensions';
import { useSharedMaterials } from '../../hooks/use3DTransport';

export interface VehicleMeshProps {
  vehicleCode: VehicleCode | string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scaleFactor?: number;
  selected?: boolean;
  highlighted?: boolean;
  showLabel?: boolean;
  label?: string;
  onClick?: () => void;
  onPointerOver?: () => void;
  onPointerOut?: () => void;
}

interface CabGeometryProps {
  width: number;
  height: number;
  length: number;
  material: THREE.Material;
  glassMaterial: THREE.Material;
}

function Cab({ width, height, length, material, glassMaterial }: CabGeometryProps) {
  const cabHeight = height * 0.6;
  const cabLength = length * 0.3;
  const cabWidth = width * 0.9;

  return (
    <group position={[0, height * 0.3, -length / 2 + cabLength / 2]}>
      <mesh>
        <boxGeometry args={[cabWidth, cabHeight, cabLength]} />
        <primitive object={material} attach="material" />
      </mesh>
      <mesh position={[0, cabHeight * 0.2, cabLength * 0.3]}>
        <boxGeometry args={[cabWidth * 0.85, cabHeight * 0.4, cabLength * 0.1]} />
        <primitive object={glassMaterial} attach="material" />
      </mesh>
    </group>
  );
}

interface CargoAreaProps {
  width: number;
  height: number;
  length: number;
  material: THREE.Material;
  isTanker?: boolean;
}

function CargoArea({ width, height, length, material, isTanker }: CargoAreaProps) {
  const cargoLength = length * 0.65;
  const cargoHeight = height * 0.5;

  if (isTanker) {
    return (
      <mesh position={[0, height * 0.25, length / 2 - cargoLength / 2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[cargoHeight * 0.8, cargoHeight * 0.8, width * 0.85, 16]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  }

  return (
    <mesh position={[0, height * 0.25, length / 2 - cargoLength / 2]}>
      <boxGeometry args={[width * 0.95, cargoHeight, cargoLength]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

interface WheelSetProps {
  width: number;
  length: number;
  wheelRadius: number;
  wheelWidth: number;
  material: THREE.Material;
  axleCount: number;
}

function WheelSet({ width, length, wheelRadius, wheelWidth, material, axleCount }: WheelSetProps) {
  const axlePositions = useMemo(() => {
    const positions: number[] = [];
    const spacing = length / (axleCount + 1);
    for (let i = 1; i <= axleCount; i++) {
      positions.push(-length / 2 + spacing * i);
    }
    return positions;
  }, [length, axleCount]);

  return (
    <group>
      {axlePositions.map((zPos, axleIndex) => (
        <group key={axleIndex}>
          <mesh position={[-width / 2 - wheelWidth / 2, wheelRadius, zPos]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
            <primitive object={material} attach="material" />
          </mesh>
          <mesh position={[width / 2 + wheelWidth / 2, wheelRadius, zPos]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[wheelRadius, wheelRadius, wheelWidth, 16]} />
            <primitive object={material} attach="material" />
          </mesh>
        </group>
      ))}
    </group>
  );
}

const VehicleMeshComponent: React.FC<VehicleMeshProps> = ({
  vehicleCode,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scaleFactor = 1,
  selected = false,
  highlighted = false,
  showLabel = false,
  label,
  onClick,
  onPointerOver,
  onPointerOut,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const materials = useSharedMaterials();

  const code = vehicleCode.toUpperCase() as VehicleCode;
  const dims = VEHICLE_DIMENSIONS[code];

  const scale = useMemo(() => {
    if (!dims) return null;
    return {
      x: ftToM(dims.width) * scaleFactor,
      y: ftToM(dims.height) * scaleFactor,
      z: ftToM(dims.length) * scaleFactor,
    };
  }, [dims, scaleFactor]);

  const vehicleMaterial = useMemo(() => materials.getMaterial(code), [materials, code]);
  const category = getVehicleCategory(code);
  const isTanker = code === 'HEMTT_TANKER';

  const axleCount = useMemo(() => {
    if (code === 'HMMWV') return 2;
    if (code === 'HET') return 5;
    if (['HEMTT_CARGO', 'HEMTT_TANKER', 'MTVR', 'PLS'].includes(code)) return 4;
    return 3;
  }, [code]);

  const wheelRadius = useMemo(() => {
    if (!scale) return 0;
    return Math.min(scale.y * 0.15, 0.4);
  }, [scale]);

  const wheelWidth = useMemo(() => {
    if (!scale) return 0;
    return scale.x * 0.08;
  }, [scale]);

  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (glowRef.current && (selected || highlighted)) {
      const pulse = 0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
      (glowRef.current.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  });

  if (!dims || !scale) {
    return null;
  }

  const posY = FORMATION.TERRAIN_OFFSET_M + wheelRadius;

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1] + posY, position[2]]}
      rotation={[rotation[0], rotation[1], rotation[2]]}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      {category === 'LAND' && (
        <>
          <mesh position={[0, scale.y / 2 - wheelRadius, 0]}>
            <boxGeometry args={[scale.x * 0.95, scale.y * 0.4, scale.z * 0.95]} />
            <primitive object={vehicleMaterial} attach="material" />
          </mesh>

          <Cab
            width={scale.x}
            height={scale.y}
            length={scale.z}
            material={vehicleMaterial}
            glassMaterial={materials.glass}
          />

          <CargoArea
            width={scale.x}
            height={scale.y}
            length={scale.z}
            material={vehicleMaterial}
            isTanker={isTanker}
          />

          <WheelSet
            width={scale.x}
            length={scale.z}
            wheelRadius={wheelRadius}
            wheelWidth={wheelWidth}
            material={materials.wheel}
            axleCount={axleCount}
          />
        </>
      )}

      {category === 'AIR' && (
        <group>
          <mesh position={[0, scale.y / 2, 0]}>
            <boxGeometry args={[scale.x * 0.15, scale.y * 0.3, scale.z]} />
            <primitive object={vehicleMaterial} attach="material" />
          </mesh>
          <mesh position={[0, scale.y * 0.4, -scale.z * 0.35]}>
            <boxGeometry args={[scale.x, scale.y * 0.1, scale.z * 0.3]} />
            <primitive object={vehicleMaterial} attach="material" />
          </mesh>
          <mesh position={[0, scale.y * 0.6, scale.z * 0.4]}>
            <boxGeometry args={[scale.x * 0.25, scale.y * 0.3, scale.z * 0.1]} />
            <primitive object={vehicleMaterial} attach="material" />
          </mesh>
        </group>
      )}

      {category === 'SEA' && (
        <group>
          <mesh position={[0, scale.y / 2, 0]}>
            <boxGeometry args={[scale.x, scale.y, scale.z]} />
            <primitive object={vehicleMaterial} attach="material" />
          </mesh>
          <mesh position={[0, scale.y * 0.7, -scale.z * 0.35]}>
            <boxGeometry args={[scale.x * 0.3, scale.y * 0.4, scale.z * 0.15]} />
            <primitive object={vehicleMaterial} attach="material" />
          </mesh>
        </group>
      )}

      {(selected || highlighted) && (
        <mesh ref={glowRef} position={[0, scale.y / 2, 0]}>
          <boxGeometry args={[scale.x + 0.1, scale.y + 0.1, scale.z + 0.1]} />
          <meshBasicMaterial
            color={selected ? '#fbbf24' : '#60a5fa'}
            transparent
            opacity={0.3}
            side={THREE.BackSide}
          />
        </mesh>
      )}

      {showLabel && (
        <Html position={[0, scale.y + 0.5, 0]} center style={{ pointerEvents: 'none' }}>
          <div className="bg-card/95 px-2 py-1 rounded text-xs whitespace-nowrap border border-border shadow-sm">
            <span className="text-foreground font-medium">{label || dims.name}</span>
          </div>
        </Html>
      )}

      <mesh visible={false}>
        <boxGeometry args={[scale.x, scale.y, scale.z]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
};

VehicleMeshComponent.displayName = 'VehicleMesh';

export const VehicleMesh = memo(VehicleMeshComponent);

export interface InstancedVehiclesProps {
  vehicleCode: VehicleCode | string;
  positions: [number, number, number][];
  scaleFactor?: number;
}

export const InstancedVehicles: React.FC<InstancedVehiclesProps> = memo(({
  vehicleCode,
  positions,
  scaleFactor = 1,
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materials = useSharedMaterials();

  const code = vehicleCode.toUpperCase() as VehicleCode;
  const dims = VEHICLE_DIMENSIONS[code];

  const scale = useMemo(() => {
    if (!dims) return null;
    return {
      x: ftToM(dims.width) * scaleFactor,
      y: ftToM(dims.height) * scaleFactor,
      z: ftToM(dims.length) * scaleFactor,
    };
  }, [dims, scaleFactor]);

  const vehicleMaterial = useMemo(() => materials.getMaterial(code), [materials, code]);

  useEffect(() => {
    if (!meshRef.current || !scale) return;

    const tempMatrix = new THREE.Matrix4();
    const wheelRadius = Math.min(scale.y * 0.15, 0.4);
    const posY = FORMATION.TERRAIN_OFFSET_M + wheelRadius + scale.y / 2;

    positions.forEach((pos, index) => {
      tempMatrix.setPosition(pos[0], pos[1] + posY, pos[2]);
      meshRef.current!.setMatrixAt(index, tempMatrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, scale]);

  if (!dims || !scale) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, positions.length]}
      frustumCulled
    >
      <boxGeometry args={[scale.x, scale.y, scale.z]} />
      <primitive object={vehicleMaterial} attach="material" />
    </instancedMesh>
  );
});

InstancedVehicles.displayName = 'InstancedVehicles';

export default VehicleMesh;
