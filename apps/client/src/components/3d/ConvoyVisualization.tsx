import React, { useMemo, useRef, useEffect, memo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { VEHICLE_DIMENSIONS, FORMATION, ftToM, getVehicleColor } from '../../lib/vehicleDimensions';
import { VehicleMesh } from './VehicleMesh';

interface ConvoyVisualizationProps {
  vehicles: Array<{
    id: number;
    vehicleCode: string;
    position?: number;
    lane?: number;
  }>;
  convoyStatus: 'draft' | 'planned' | 'underway' | 'completed';
  onVehicleClick?: (vehicleId: number) => void;
  showGrid?: boolean;
  autoRotate?: boolean;
  height?: number;
}

interface VehiclePosition {
  id: number;
  vehicleCode: string;
  x: number;
  y: number;
  z: number;
}

interface DustParticle {
  id: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

const LANE_OFFSETS = [-4, 0, 4];
const CONVOY_SPEED = 2;

function DustParticles({ isMoving, convoyPosition }: { isMoving: boolean; convoyPosition: number }) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleData = useRef<DustParticle[]>([]);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  
  const particleCount = 100;
  
  const positions = useMemo(() => {
    return new Float32Array(particleCount * 3);
  }, []);
  
  const sizes = useMemo(() => {
    return new Float32Array(particleCount);
  }, []);

  useFrame((_, delta) => {
    if (!geometryRef.current || !isMoving) return;
    
    if (Math.random() < 0.3) {
      const newParticle: DustParticle = {
        id: Math.random(),
        position: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          0.1,
          convoyPosition + 5 + Math.random() * 3
        ),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          Math.random() * 0.3,
          Math.random() * 0.5
        ),
        life: 0,
        maxLife: 1 + Math.random() * 2,
      };
      
      if (particleData.current.length < particleCount) {
        particleData.current.push(newParticle);
      } else {
        const deadIndex = particleData.current.findIndex(p => p.life >= p.maxLife);
        if (deadIndex !== -1) {
          particleData.current[deadIndex] = newParticle;
        }
      }
    }
    
    particleData.current.forEach((particle, i) => {
      particle.life += delta;
      particle.position.add(particle.velocity.clone().multiplyScalar(delta));
      particle.velocity.y -= 0.1 * delta;
      
      positions[i * 3] = particle.position.x;
      positions[i * 3 + 1] = Math.max(0, particle.position.y);
      positions[i * 3 + 2] = particle.position.z;
      
      const lifeRatio = 1 - (particle.life / particle.maxLife);
      sizes[i] = lifeRatio * 0.3;
    });
    
    geometryRef.current.attributes.position.needsUpdate = true;
    geometryRef.current.attributes.size.needsUpdate = true;
  });

  if (!isMoving) return null;

  return (
    <points ref={particlesRef}>
      <bufferGeometry ref={geometryRef}>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={particleCount}
          array={sizes}
          itemSize={1}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.2}
        color="#8B7355"
        transparent
        opacity={0.4}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function ConvoyScene({
  vehicles,
  convoyStatus,
  onVehicleClick,
  showGrid = true,
  autoRotate = false,
}: Omit<ConvoyVisualizationProps, 'height'>) {
  const convoyRef = useRef<THREE.Group>(null);
  const [convoyOffset, setConvoyOffset] = useState(0);
  
  const isMoving = convoyStatus === 'underway';

  const vehiclePositions = useMemo((): VehiclePosition[] => {
    const sorted = [...vehicles].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    
    return sorted.map((vehicle, index) => {
      const dims = VEHICLE_DIMENSIONS[vehicle.vehicleCode.toUpperCase() as keyof typeof VEHICLE_DIMENSIONS];
      const vehicleLength = dims ? ftToM(dims.length) : 5;
      
      const positionIndex = vehicle.position ?? index;
      const lane = vehicle.lane ?? 1;
      
      const z = positionIndex * (vehicleLength * FORMATION.LONGITUDINAL_GAP_MULTIPLIER + FORMATION.MIN_SPACING_M);
      const x = LANE_OFFSETS[Math.min(lane, 2)];
      
      return {
        id: vehicle.id,
        vehicleCode: vehicle.vehicleCode,
        x,
        y: FORMATION.TERRAIN_OFFSET_M,
        z,
      };
    });
  }, [vehicles]);

  const convoyBounds = useMemo(() => {
    if (vehiclePositions.length === 0) return { minZ: 0, maxZ: 10, centerZ: 5 };
    
    const zValues = vehiclePositions.map(v => v.z);
    const minZ = Math.min(...zValues);
    const maxZ = Math.max(...zValues);
    
    return {
      minZ,
      maxZ,
      centerZ: (minZ + maxZ) / 2,
    };
  }, [vehiclePositions]);

  const lightIntensity = useMemo(() => {
    switch (convoyStatus) {
      case 'draft':
        return { ambient: 0.3, directional: 0.5 };
      case 'planned':
        return { ambient: 0.5, directional: 1.0 };
      case 'underway':
        return { ambient: 0.7, directional: 1.5 };
      case 'completed':
        return { ambient: 0.5, directional: 1.0 };
      default:
        return { ambient: 0.5, directional: 1.0 };
    }
  }, [convoyStatus]);

  useFrame((_, delta) => {
    if (isMoving && convoyRef.current) {
      setConvoyOffset(prev => prev - CONVOY_SPEED * delta);
    }
  });

  useEffect(() => {
    if (convoyStatus !== 'underway') {
      setConvoyOffset(0);
    }
  }, [convoyStatus]);

  const cameraPosition: [number, number, number] = useMemo(() => {
    const distance = Math.max(30, convoyBounds.maxZ - convoyBounds.minZ + 20);
    return [distance * 0.7, distance * 0.5, -distance * 0.3];
  }, [convoyBounds]);

  const shouldUseInstancing = vehicles.length > 5;

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={cameraPosition}
        fov={50}
        near={0.1}
        far={1000}
      />
      
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate={autoRotate}
        autoRotateSpeed={0.5}
        target={[0, 2, convoyBounds.centerZ]}
        maxPolarAngle={Math.PI / 2 - 0.1}
        minDistance={10}
        maxDistance={200}
      />

      <ambientLight intensity={lightIntensity.ambient} />
      <directionalLight
        position={[20, 30, -10]}
        intensity={lightIntensity.directional}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight
        position={[-10, 20, 20]}
        intensity={lightIntensity.directional * 0.3}
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, convoyBounds.centerZ]}
        receiveShadow
      >
        <planeGeometry args={[100, Math.max(100, convoyBounds.maxZ - convoyBounds.minZ + 50)]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.9} metalness={0.1} />
      </mesh>

      {showGrid && (
        <Grid
          position={[0, 0.01, convoyBounds.centerZ]}
          args={[100, Math.max(100, convoyBounds.maxZ - convoyBounds.minZ + 50)]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#333333"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#444444"
          fadeDistance={150}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      <group ref={convoyRef} position={[0, 0, convoyOffset]}>
        {vehiclePositions.map((vp) => (
          <VehicleMesh
            key={vp.id}
            vehicleCode={vp.vehicleCode}
            position={[vp.x, vp.y, vp.z]}
            rotation={[0, Math.PI, 0]}
            onClick={() => onVehicleClick?.(vp.id)}
            showLabel={false}
          />
        ))}
      </group>

      <DustParticles isMoving={isMoving} convoyPosition={convoyOffset + convoyBounds.maxZ} />

      <Environment preset="city" />
      
      <fog attach="fog" args={['#1a1a1a', 50, 200]} />
    </>
  );
}

function StatusBadge({ status }: { status: ConvoyVisualizationProps['convoyStatus'] }) {
  const statusColors = {
    draft: 'bg-gray-600',
    planned: 'bg-blue-600',
    underway: 'bg-green-600',
    completed: 'bg-purple-600',
  };

  const statusLabels = {
    draft: 'Draft',
    planned: 'Planned',
    underway: 'Underway',
    completed: 'Completed',
  };

  return (
    <div className={`px-3 py-1.5 rounded-md text-white text-sm font-medium ${statusColors[status]}`}>
      {status === 'underway' && (
        <span className="inline-block w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
      )}
      {statusLabels[status]}
    </div>
  );
}

const ConvoyVisualization: React.FC<ConvoyVisualizationProps> = memo(({
  vehicles,
  convoyStatus,
  onVehicleClick,
  showGrid = true,
  autoRotate = false,
  height = 400,
}) => {
  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute top-3 left-3 z-10">
        <StatusBadge status={convoyStatus} />
      </div>
      
      <div className="absolute top-3 right-3 z-10">
        <div className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-md text-white text-sm">
          <span className="text-gray-400">Vehicles:</span>{' '}
          <span className="font-medium">{vehicles.length}</span>
        </div>
      </div>

      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ 
          antialias: true,
          alpha: false,
          powerPreference: 'default',
          preserveDrawingBuffer: true,
          failIfMajorPerformanceCaveat: false,
        }}
        style={{ background: '#0a0a0a' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            console.warn('[ConvoyVisualization] WebGL context lost, will attempt recovery');
          });
          gl.domElement.addEventListener('webglcontextrestored', () => {
            console.log('[ConvoyVisualization] WebGL context restored');
          });
        }}
      >
        <ConvoyScene
          vehicles={vehicles}
          convoyStatus={convoyStatus}
          onVehicleClick={onVehicleClick}
          showGrid={showGrid}
          autoRotate={autoRotate}
        />
      </Canvas>
    </div>
  );
});

ConvoyVisualization.displayName = 'ConvoyVisualization';

export default ConvoyVisualization;
export { ConvoyVisualization };
export type { ConvoyVisualizationProps };
