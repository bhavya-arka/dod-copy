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
const DUST_PARTICLE_COUNT = 50;

function DustParticles({ isMoving, convoyPosition }: { isMoving: boolean; convoyPosition: number }) {
  const particlesRef = useRef<THREE.Points>(null);
  const particleData = useRef<DustParticle[]>([]);
  const geometryRef = useRef<THREE.BufferGeometry>(null);
  
  const { positions, sizes } = useMemo(() => ({
    positions: new Float32Array(DUST_PARTICLE_COUNT * 3),
    sizes: new Float32Array(DUST_PARTICLE_COUNT),
  }), []);

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
      
      if (particleData.current.length < DUST_PARTICLE_COUNT) {
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
          count={DUST_PARTICLE_COUNT}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-size"
          count={DUST_PARTICLE_COUNT}
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
        <meshStandardMaterial color="#4b5563" roughness={0.9} metalness={0.1} />
      </mesh>

      {showGrid && (
        <Grid
          position={[0, 0.01, convoyBounds.centerZ]}
          args={[100, Math.max(100, convoyBounds.maxZ - convoyBounds.minZ + 50)]}
          cellSize={2}
          cellThickness={0.5}
          cellColor="#6b7280"
          sectionSize={10}
          sectionThickness={1}
          sectionColor="#9ca3af"
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
      
      <fog attach="fog" args={['#f3f4f6', 80, 250]} />
    </>
  );
}

function StatusBadge({ status }: { status: ConvoyVisualizationProps['convoyStatus'] }) {
  const statusStyles = {
    draft: 'bg-gray-100 text-gray-700 border-gray-200',
    planned: 'bg-blue-50 text-blue-700 border-blue-200',
    underway: 'bg-green-50 text-green-700 border-green-200',
    completed: 'bg-purple-50 text-purple-700 border-purple-200',
  };

  const statusLabels = {
    draft: 'Draft',
    planned: 'Planned',
    underway: 'Underway',
    completed: 'Completed',
  };

  return (
    <div className={`px-3 py-1.5 rounded-md text-sm font-medium border shadow-sm ${statusStyles[status]}`}>
      {status === 'underway' && (
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
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
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    setContextLost(true);
    console.warn('[ConvoyVisualization] WebGL context lost');
  };

  const handleContextRestored = () => {
    setContextLost(false);
    console.log('[ConvoyVisualization] WebGL context restored');
  };

  const handleReloadCanvas = () => {
    setContextLost(false);
    setCanvasKey(prev => prev + 1);
  };

  if (vehicles.length === 0) {
    return (
      <div className="relative w-full flex items-center justify-center bg-gray-100 rounded-lg border border-gray-200" style={{ height }}>
        <div className="text-center text-gray-500">
          <p className="text-sm">No vehicles in convoy</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute top-3 left-3 z-10">
        <StatusBadge status={convoyStatus} />
      </div>
      
      <div className="absolute top-3 right-3 z-10">
        <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-gray-900 text-sm border border-gray-200 shadow-sm">
          <span className="text-gray-500">Vehicles:</span>{' '}
          <span className="font-medium">{vehicles.length}</span>
        </div>
      </div>

      {contextLost ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 rounded-lg border border-gray-200">
          <div className="text-center">
            <p className="text-gray-500 mb-3">3D view temporarily unavailable</p>
            <button
              onClick={handleReloadCanvas}
              className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors text-sm font-medium"
            >
              Reload View
            </button>
          </div>
        </div>
      ) : (
        <Canvas
          key={canvasKey}
          shadows
          dpr={[1, 1.5]}
          gl={{ 
            antialias: true,
            alpha: false,
            powerPreference: 'default',
            preserveDrawingBuffer: true,
            failIfMajorPerformanceCaveat: false,
          }}
          style={{ background: '#f3f4f6' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', handleContextLost);
            gl.domElement.addEventListener('webglcontextrestored', handleContextRestored);
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
      )}
    </div>
  );
});

ConvoyVisualization.displayName = 'ConvoyVisualization';

export default ConvoyVisualization;
export { ConvoyVisualization };
export type { ConvoyVisualizationProps };
