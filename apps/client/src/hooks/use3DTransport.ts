import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  VEHICLE_DIMENSIONS,
  VehicleCode,
  getVehicleScale,
  getVehicleColor,
  ftToM,
  FORMATION,
  FormationConfig,
  calculateFormationSpacing,
} from '../lib/vehicleDimensions';

export type ViewType = 'overview' | 'chase' | 'map';

export interface CameraConfig {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  near: number;
  far: number;
}

export interface TransportCameraResult {
  config: CameraConfig;
  updateCamera: (camera: THREE.PerspectiveCamera, controls?: any) => void;
  animateToView: (viewType: ViewType, duration?: number) => void;
}

export function useTransportCamera(viewType: ViewType): TransportCameraResult {
  const { camera } = useThree();
  const animationRef = useRef<number | null>(null);

  const config = useMemo((): CameraConfig => {
    switch (viewType) {
      case 'overview':
        return {
          position: new THREE.Vector3(50, 80, 100),
          target: new THREE.Vector3(0, 0, 0),
          fov: 60,
          near: 0.1,
          far: 5000,
        };
      case 'chase':
        return {
          position: new THREE.Vector3(0, 5, -15),
          target: new THREE.Vector3(0, 2, 10),
          fov: 75,
          near: 0.1,
          far: 2000,
        };
      case 'map':
        return {
          position: new THREE.Vector3(0, 200, 0),
          target: new THREE.Vector3(0, 0, 0),
          fov: 45,
          near: 1,
          far: 10000,
        };
      default:
        return {
          position: new THREE.Vector3(50, 80, 100),
          target: new THREE.Vector3(0, 0, 0),
          fov: 60,
          near: 0.1,
          far: 5000,
        };
    }
  }, [viewType]);

  const updateCamera = useCallback(
    (cam: THREE.PerspectiveCamera, controls?: any) => {
      cam.position.copy(config.position);
      cam.fov = config.fov;
      cam.near = config.near;
      cam.far = config.far;
      cam.updateProjectionMatrix();

      if (controls) {
        controls.target.copy(config.target);
        controls.update();
      } else {
        cam.lookAt(config.target);
      }
    },
    [config]
  );

  const animateToView = useCallback(
    (targetView: ViewType, duration = 1000) => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }

      const startPosition = camera.position.clone();
      const targetConfig = (() => {
        switch (targetView) {
          case 'overview':
            return { position: new THREE.Vector3(50, 80, 100), target: new THREE.Vector3(0, 0, 0) };
          case 'chase':
            return { position: new THREE.Vector3(0, 5, -15), target: new THREE.Vector3(0, 2, 10) };
          case 'map':
            return { position: new THREE.Vector3(0, 200, 0), target: new THREE.Vector3(0, 0, 0) };
          default:
            return { position: new THREE.Vector3(50, 80, 100), target: new THREE.Vector3(0, 0, 0) };
        }
      })();

      const startTime = performance.now();

      const animate = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        camera.position.lerpVectors(startPosition, targetConfig.position, eased);
        camera.lookAt(targetConfig.target);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };

      animationRef.current = requestAnimationFrame(animate);
    },
    [camera]
  );

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return { config, updateCamera, animateToView };
}

export interface VehicleType {
  id: string;
  code: VehicleCode;
  position?: THREE.Vector3;
}

export interface FormationPosition {
  id: string;
  code: VehicleCode;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}

export interface ConvoyFormationResult {
  positions: FormationPosition[];
  bounds: THREE.Box3;
  totalLength: number;
  recalculate: () => void;
}

export function useConvoyFormation(
  vehicles: VehicleType[],
  spacing?: FormationConfig
): ConvoyFormationResult {
  const positionsRef = useRef<FormationPosition[]>([]);

  const result = useMemo(() => {
    const columns = spacing?.columns ?? FORMATION.CONVOY_COLUMN_WIDTH;
    const terrainOffset = spacing?.terrainOffset ?? FORMATION.TERRAIN_OFFSET_M;

    const positions: FormationPosition[] = [];
    let currentZ = 0;
    let maxWidth = 0;
    let currentRowVehicles: { vehicle: VehicleType; width: number; height: number }[] = [];

    vehicles.forEach((vehicle, index) => {
      const dims = VEHICLE_DIMENSIONS[vehicle.code];
      if (!dims) return;

      const vehicleSpacing = calculateFormationSpacing(vehicle.code, spacing);
      if (!vehicleSpacing) return;

      const vehicleWidth = ftToM(dims.width);
      const vehicleLength = ftToM(dims.length);
      const vehicleHeight = ftToM(dims.height);

      currentRowVehicles.push({ vehicle, width: vehicleWidth, height: vehicleHeight });

      if (currentRowVehicles.length >= columns || index === vehicles.length - 1) {
        const rowWidth = currentRowVehicles.reduce(
          (sum, v) => sum + v.width + vehicleSpacing.lateral,
          -vehicleSpacing.lateral
        );
        maxWidth = Math.max(maxWidth, rowWidth);

        let currentX = -rowWidth / 2;
        currentRowVehicles.forEach((rv) => {
          positions.push({
            id: rv.vehicle.id,
            code: rv.vehicle.code,
            position: new THREE.Vector3(
              currentX + rv.width / 2,
              terrainOffset + rv.height / 2,
              currentZ
            ),
            rotation: new THREE.Euler(0, 0, 0),
          });
          currentX += rv.width + vehicleSpacing.lateral;
        });

        currentZ += vehicleLength + vehicleSpacing.longitudinal;
        currentRowVehicles = [];
      }
    });

    const bounds = new THREE.Box3();
    positions.forEach((p) => {
      const scale = getVehicleScale(p.code);
      if (scale) {
        bounds.expandByPoint(
          new THREE.Vector3(
            p.position.x - scale.x / 2,
            p.position.y - scale.y / 2,
            p.position.z - scale.z / 2
          )
        );
        bounds.expandByPoint(
          new THREE.Vector3(
            p.position.x + scale.x / 2,
            p.position.y + scale.y / 2,
            p.position.z + scale.z / 2
          )
        );
      }
    });

    positionsRef.current = positions;

    return {
      positions,
      bounds,
      totalLength: currentZ,
      recalculate: () => {},
    };
  }, [vehicles, spacing]);

  const recalculate = useCallback(() => {
    positionsRef.current = result.positions;
  }, [result.positions]);

  return { ...result, recalculate };
}

export interface SharedMaterials {
  truck: THREE.MeshStandardMaterial;
  tanker: THREE.MeshStandardMaterial;
  het: THREE.MeshStandardMaterial;
  aircraft: THREE.MeshStandardMaterial;
  ship: THREE.MeshStandardMaterial;
  wheel: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  getMaterial: (vehicleCode: string) => THREE.MeshStandardMaterial;
  dispose: () => void;
}

export function useSharedMaterials(): SharedMaterials {
  const materialsRef = useRef<SharedMaterials | null>(null);

  if (!materialsRef.current) {
    const truck = new THREE.MeshStandardMaterial({
      color: '#556B2F',
      roughness: 0.7,
      metalness: 0.2,
    });

    const tanker = new THREE.MeshStandardMaterial({
      color: '#708090',
      roughness: 0.5,
      metalness: 0.4,
    });

    const het = new THREE.MeshStandardMaterial({
      color: '#2F4F4F',
      roughness: 0.6,
      metalness: 0.3,
    });

    const aircraft = new THREE.MeshStandardMaterial({
      color: '#A9A9A9',
      roughness: 0.4,
      metalness: 0.6,
    });

    const ship = new THREE.MeshStandardMaterial({
      color: '#4682B4',
      roughness: 0.5,
      metalness: 0.5,
    });

    const wheel = new THREE.MeshStandardMaterial({
      color: '#1f2937',
      roughness: 0.8,
      metalness: 0.1,
    });

    const glass = new THREE.MeshStandardMaterial({
      color: '#87CEEB',
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.6,
    });

    const getMaterial = (vehicleCode: string): THREE.MeshStandardMaterial => {
      const code = vehicleCode.toUpperCase();
      if (code === 'HEMTT_TANKER') return tanker;
      if (code === 'HET') return het;
      if (code === 'C17' || code === 'C130') return aircraft;
      if (code === 'LMSR' || code === 'TAO' || code === 'TAKR') return ship;
      return truck;
    };

    const dispose = () => {
      truck.dispose();
      tanker.dispose();
      het.dispose();
      aircraft.dispose();
      ship.dispose();
      wheel.dispose();
      glass.dispose();
    };

    materialsRef.current = {
      truck,
      tanker,
      het,
      aircraft,
      ship,
      wheel,
      glass,
      getMaterial,
      dispose,
    };
  }

  useEffect(() => {
    return () => {
      materialsRef.current?.dispose();
    };
  }, []);

  return materialsRef.current;
}

export function useVehicleAnimation(
  groupRef: React.RefObject<THREE.Group>,
  targetPosition: THREE.Vector3,
  speed = 5
) {
  const currentPosition = useRef(new THREE.Vector3());
  const isMoving = useRef(false);

  useFrame((_, delta) => {
    if (!groupRef.current || !isMoving.current) return;

    const distance = currentPosition.current.distanceTo(targetPosition);
    if (distance < 0.01) {
      groupRef.current.position.copy(targetPosition);
      isMoving.current = false;
      return;
    }

    const moveDistance = speed * delta;
    const direction = targetPosition.clone().sub(currentPosition.current).normalize();
    currentPosition.current.add(direction.multiplyScalar(Math.min(moveDistance, distance)));
    groupRef.current.position.copy(currentPosition.current);
  });

  const moveTo = useCallback((position: THREE.Vector3) => {
    if (groupRef.current) {
      currentPosition.current.copy(groupRef.current.position);
    }
    isMoving.current = true;
  }, [groupRef]);

  return { moveTo, isMoving: isMoving.current };
}
