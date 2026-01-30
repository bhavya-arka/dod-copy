import React, { useMemo, useRef, useEffect, memo, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';

interface SeaVisualizationProps {
  vessels: Array<{
    id: number;
    vesselCode: string;
    status?: string;
  }>;
  voyageStatus: 'draft' | 'planned' | 'loading' | 'underway' | 'completed';
  onVesselClick?: (vesselId: number) => void;
  showGrid?: boolean;
  autoRotate?: boolean;
  height?: number;
}

interface VesselPosition {
  id: number;
  vesselCode: string;
  x: number;
  y: number;
  z: number;
}

const VESSEL_SPACING = 80;
const SHIP_SPEED = 1.5;

const CONTAINER_COLORS = [
  '#DC2626',
  '#059669',
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#65A30D',
];

function OceanWaves({ isMoving }: { isMoving: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const geometryRef = useRef<THREE.PlaneGeometry>(null);
  
  const { originalPositions } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(500, 500, 64, 64);
    const positions = geo.attributes.position.array.slice();
    return { geometry: geo, originalPositions: positions };
  }, []);

  useFrame((state) => {
    if (!meshRef.current || !geometryRef.current) return;
    
    const positions = geometryRef.current.attributes.position.array as Float32Array;
    const time = state.clock.elapsedTime;
    
    for (let i = 0; i < positions.length; i += 3) {
      const x = originalPositions[i];
      const y = originalPositions[i + 1];
      
      const waveAmplitude = isMoving ? 1.2 : 0.6;
      const waveFrequency = isMoving ? 0.08 : 0.05;
      const waveSpeed = isMoving ? 1.5 : 0.8;
      
      positions[i + 2] = 
        Math.sin(x * waveFrequency + time * waveSpeed) * waveAmplitude +
        Math.sin(y * waveFrequency * 0.7 + time * waveSpeed * 0.6) * waveAmplitude * 0.5 +
        Math.sin((x + y) * waveFrequency * 0.5 + time * waveSpeed * 0.8) * waveAmplitude * 0.3;
    }
    
    geometryRef.current.attributes.position.needsUpdate = true;
    geometryRef.current.computeVertexNormals();
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2, 0]}>
      <planeGeometry ref={geometryRef} args={[500, 500, 64, 64]} />
      <meshStandardMaterial
        color="#0077B6"
        roughness={0.3}
        metalness={0.6}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function ContainerStack({ 
  position, 
  rows = 3, 
  cols = 4, 
  layers = 2,
  scale = 1 
}: { 
  position: [number, number, number]; 
  rows?: number;
  cols?: number;
  layers?: number;
  scale?: number;
}) {
  const containers = useMemo(() => {
    const result: Array<{ position: [number, number, number]; color: string }> = [];
    const containerWidth = 2.5 * scale;
    const containerHeight = 2.6 * scale;
    const containerLength = 6 * scale;
    const gap = 0.1 * scale;
    
    for (let layer = 0; layer < layers; layer++) {
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = (col - (cols - 1) / 2) * (containerWidth + gap);
          const y = layer * (containerHeight + gap);
          const z = (row - (rows - 1) / 2) * (containerLength + gap);
          
          result.push({
            position: [x, y, z],
            color: CONTAINER_COLORS[(layer * rows * cols + row * cols + col) % CONTAINER_COLORS.length],
          });
        }
      }
    }
    return result;
  }, [rows, cols, layers, scale]);

  return (
    <group position={position}>
      {containers.map((container, index) => (
        <mesh key={index} position={container.position}>
          <boxGeometry args={[2.4 * scale, 2.5 * scale, 5.8 * scale]} />
          <meshStandardMaterial color={container.color} roughness={0.6} metalness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function CargoShip({ 
  position, 
  rotation = [0, 0, 0],
  vesselCode,
  isMoving,
  onClick,
}: { 
  position: [number, number, number];
  rotation?: [number, number, number];
  vesselCode: string;
  isMoving: boolean;
  onClick?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bobPhaseRef = useRef(Math.random() * Math.PI * 2);
  
  const shipConfig = useMemo(() => {
    const code = vesselCode.toUpperCase();
    switch (code) {
      case 'LMSR':
        return { length: 60, width: 12, height: 8, containerRows: 4, containerCols: 6, containerLayers: 3 };
      case 'TAKR':
        return { length: 55, width: 11, height: 7.5, containerRows: 3, containerCols: 5, containerLayers: 3 };
      case 'TAO':
        return { length: 40, width: 10, height: 6, containerRows: 2, containerCols: 3, containerLayers: 2 };
      default:
        return { length: 50, width: 11, height: 7, containerRows: 3, containerCols: 4, containerLayers: 2 };
    }
  }, [vesselCode]);

  useFrame((state) => {
    if (!groupRef.current) return;
    
    const time = state.clock.elapsedTime;
    const bobAmplitude = isMoving ? 0.8 : 0.4;
    const bobSpeed = isMoving ? 1.2 : 0.6;
    const rollAmplitude = isMoving ? 0.03 : 0.015;
    const pitchAmplitude = isMoving ? 0.02 : 0.01;
    
    groupRef.current.position.y = position[1] + Math.sin(time * bobSpeed + bobPhaseRef.current) * bobAmplitude;
    groupRef.current.rotation.z = Math.sin(time * bobSpeed * 0.7 + bobPhaseRef.current) * rollAmplitude;
    groupRef.current.rotation.x = Math.sin(time * bobSpeed * 0.5 + bobPhaseRef.current) * pitchAmplitude;
  });

  const { length, width, height, containerRows, containerCols, containerLayers } = shipConfig;

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[rotation[0], rotation[1], rotation[2]]}
      onClick={onClick}
    >
      <mesh position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, length]} />
        <meshStandardMaterial color="#2C3E50" roughness={0.7} metalness={0.3} />
      </mesh>

      <mesh position={[0, 0, length * 0.4]}>
        <coneGeometry args={[width / 2, length * 0.2, 4]} />
        <meshStandardMaterial color="#34495E" roughness={0.7} metalness={0.3} />
      </mesh>

      <mesh position={[0, height + 3, -length * 0.35]}>
        <boxGeometry args={[width * 0.5, 6, length * 0.15]} />
        <meshStandardMaterial color="#ECF0F1" roughness={0.5} metalness={0.4} />
      </mesh>
      
      <mesh position={[0, height + 6.5, -length * 0.35]}>
        <boxGeometry args={[width * 0.4, 1.5, length * 0.1]} />
        <meshStandardMaterial color="#3498DB" roughness={0.3} metalness={0.6} />
      </mesh>

      <mesh position={[0, height + 9, -length * 0.38]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.3, 0.4, 3, 8]} />
        <meshStandardMaterial color="#7F8C8D" roughness={0.5} metalness={0.7} />
      </mesh>

      <mesh position={[width * 0.15, height + 9, -length * 0.32]} rotation={[0, 0, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
        <meshStandardMaterial color="#E74C3C" roughness={0.4} metalness={0.5} />
      </mesh>

      <ContainerStack
        position={[0, height + 0.5, length * 0.05]}
        rows={containerRows}
        cols={containerCols}
        layers={containerLayers}
        scale={0.8}
      />

      <mesh position={[0, 0, 0]} visible={false}>
        <boxGeometry args={[width + 2, height + 10, length + 5]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
}

function WakeEffect({ isMoving, shipPosition }: { isMoving: boolean; shipPosition: [number, number, number] }) {
  const particlesRef = useRef<THREE.Points>(null);
  
  const { positions, velocities, lifetimes } = useMemo(() => {
    const count = 100;
    return {
      positions: new Float32Array(count * 3),
      velocities: new Float32Array(count * 3),
      lifetimes: new Float32Array(count),
    };
  }, []);

  useFrame((state, delta) => {
    if (!particlesRef.current || !isMoving) return;
    
    const posArray = particlesRef.current.geometry.attributes.position.array as Float32Array;
    
    for (let i = 0; i < lifetimes.length; i++) {
      lifetimes[i] -= delta;
      
      if (lifetimes[i] <= 0) {
        posArray[i * 3] = shipPosition[0] + (Math.random() - 0.5) * 8;
        posArray[i * 3 + 1] = -1.5;
        posArray[i * 3 + 2] = shipPosition[2] - 35 + Math.random() * 5;
        
        velocities[i * 3] = (Math.random() - 0.5) * 2;
        velocities[i * 3 + 1] = Math.random() * 0.5;
        velocities[i * 3 + 2] = -SHIP_SPEED * 2 - Math.random() * 3;
        
        lifetimes[i] = 2 + Math.random() * 2;
      } else {
        posArray[i * 3] += velocities[i * 3] * delta;
        posArray[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        posArray[i * 3 + 2] += velocities[i * 3 + 2] * delta;
        
        velocities[i * 3 + 1] -= delta * 0.5;
      }
    }
    
    particlesRef.current.geometry.attributes.position.needsUpdate = true;
  });

  if (!isMoving) return null;

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={100}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.8}
        color="#FFFFFF"
        transparent
        opacity={0.6}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  );
}

function SeaScene({
  vessels,
  voyageStatus,
  onVesselClick,
  showGrid = false,
  autoRotate = false,
}: Omit<SeaVisualizationProps, 'height'>) {
  const groupRef = useRef<THREE.Group>(null);
  const [voyageOffset, setVoyageOffset] = useState(0);
  
  const isMoving = voyageStatus === 'underway';

  const vesselPositions = useMemo((): VesselPosition[] => {
    return vessels.map((vessel, index) => ({
      id: vessel.id,
      vesselCode: vessel.vesselCode,
      x: (index - (vessels.length - 1) / 2) * VESSEL_SPACING,
      y: 0,
      z: 0,
    }));
  }, [vessels]);

  const sceneBounds = useMemo(() => {
    if (vesselPositions.length === 0) return { minX: -50, maxX: 50, centerX: 0 };
    
    const xValues = vesselPositions.map(v => v.x);
    const minX = Math.min(...xValues) - 40;
    const maxX = Math.max(...xValues) + 40;
    
    return {
      minX,
      maxX,
      centerX: (minX + maxX) / 2,
    };
  }, [vesselPositions]);

  const lightIntensity = useMemo(() => {
    switch (voyageStatus) {
      case 'draft':
        return { ambient: 0.4, directional: 0.6 };
      case 'planned':
        return { ambient: 0.5, directional: 0.8 };
      case 'loading':
        return { ambient: 0.6, directional: 1.0 };
      case 'underway':
        return { ambient: 0.8, directional: 1.5 };
      case 'completed':
        return { ambient: 0.5, directional: 0.9 };
      default:
        return { ambient: 0.5, directional: 1.0 };
    }
  }, [voyageStatus]);

  useFrame((_, delta) => {
    if (isMoving && groupRef.current) {
      setVoyageOffset(prev => prev + SHIP_SPEED * delta);
    }
  });

  useEffect(() => {
    if (voyageStatus !== 'underway') {
      setVoyageOffset(0);
    }
  }, [voyageStatus]);

  const cameraPosition: [number, number, number] = useMemo(() => {
    const distance = Math.max(80, sceneBounds.maxX - sceneBounds.minX + 40);
    return [distance * 0.6, distance * 0.4, distance * 0.8];
  }, [sceneBounds]);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={cameraPosition}
        fov={50}
        near={0.1}
        far={2000}
      />
      
      <OrbitControls
        enablePan
        enableZoom
        enableRotate
        autoRotate={autoRotate}
        autoRotateSpeed={0.3}
        target={[sceneBounds.centerX, 5, 0]}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={30}
        maxDistance={400}
      />

      <ambientLight intensity={lightIntensity.ambient} color="#B0C4DE" />
      <directionalLight
        position={[50, 80, 30]}
        intensity={lightIntensity.directional}
        castShadow
        shadow-mapSize={[2048, 2048]}
        color="#FFFAF0"
      />
      <directionalLight
        position={[-30, 40, -20]}
        intensity={lightIntensity.directional * 0.3}
        color="#87CEEB"
      />

      <OceanWaves isMoving={isMoving} />

      {showGrid && (
        <Grid
          position={[0, -1.9, 0]}
          args={[500, 500]}
          cellSize={10}
          cellThickness={0.5}
          cellColor="#1E3A5F"
          sectionSize={50}
          sectionThickness={1}
          sectionColor="#2E5A7F"
          fadeDistance={300}
          fadeStrength={1}
          followCamera={false}
        />
      )}

      <group ref={groupRef} position={[0, 0, voyageOffset]}>
        {vesselPositions.map((vp) => (
          <CargoShip
            key={vp.id}
            vesselCode={vp.vesselCode}
            position={[vp.x, vp.y, vp.z]}
            rotation={[0, Math.PI / 2, 0]}
            isMoving={isMoving}
            onClick={() => onVesselClick?.(vp.id)}
          />
        ))}
        
        {isMoving && vesselPositions.map((vp) => (
          <WakeEffect
            key={`wake-${vp.id}`}
            isMoving={isMoving}
            shipPosition={[vp.x, vp.y, vp.z]}
          />
        ))}
      </group>

      <Environment preset="sunset" />
      
      <fog attach="fog" args={['#87CEEB', 100, 500]} />
    </>
  );
}

function StatusBadge({ status }: { status: SeaVisualizationProps['voyageStatus'] }) {
  const statusColors = {
    draft: 'bg-gray-200 text-gray-700',
    planned: 'bg-blue-100 text-blue-700',
    loading: 'bg-amber-100 text-amber-700',
    underway: 'bg-green-100 text-green-700',
    completed: 'bg-purple-100 text-purple-700',
  };

  const statusLabels = {
    draft: 'Draft',
    planned: 'Planned',
    loading: 'Loading',
    underway: 'Underway',
    completed: 'Completed',
  };

  return (
    <div className={`px-3 py-1.5 rounded-md text-sm font-medium ${statusColors[status]}`}>
      {status === 'underway' && (
        <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
      )}
      {statusLabels[status]}
    </div>
  );
}

const SeaVisualization: React.FC<SeaVisualizationProps> = memo(({
  vessels,
  voyageStatus,
  onVesselClick,
  showGrid = false,
  autoRotate = false,
  height = 400,
}) => {
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  const handleContextLost = (e: Event) => {
    e.preventDefault();
    setContextLost(true);
    console.warn('[SeaVisualization] WebGL context lost');
  };

  const handleContextRestored = () => {
    setContextLost(false);
    console.log('[SeaVisualization] WebGL context restored');
  };

  const handleReloadCanvas = () => {
    setContextLost(false);
    setCanvasKey(prev => prev + 1);
  };

  if (vessels.length === 0) {
    return (
      <div className="relative w-full flex items-center justify-center bg-gray-50 rounded-lg" style={{ height }}>
        <div className="text-center text-gray-500">
          <p className="text-sm">No vessels in voyage</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <div className="absolute top-3 left-3 z-10">
        <StatusBadge status={voyageStatus} />
      </div>
      
      <div className="absolute top-3 right-3 z-10">
        <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md text-gray-900 text-sm border border-gray-200">
          <span className="text-gray-500">Vessels:</span>{' '}
          <span className="font-medium">{vessels.length}</span>
        </div>
      </div>

      {contextLost ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 rounded-lg">
          <div className="text-center">
            <p className="text-gray-500 mb-3">3D view temporarily unavailable</p>
            <button
              onClick={handleReloadCanvas}
              className="px-4 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 transition-colors text-sm font-medium"
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
          style={{ background: 'linear-gradient(to bottom, #87CEEB, #4A90A4)' }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener('webglcontextlost', handleContextLost);
            gl.domElement.addEventListener('webglcontextrestored', handleContextRestored);
          }}
        >
          <SeaScene
            vessels={vessels}
            voyageStatus={voyageStatus}
            onVesselClick={onVesselClick}
            showGrid={showGrid}
            autoRotate={autoRotate}
          />
        </Canvas>
      )}
    </div>
  );
});

SeaVisualization.displayName = 'SeaVisualization';

export default SeaVisualization;
export { SeaVisualization };
export type { SeaVisualizationProps };
