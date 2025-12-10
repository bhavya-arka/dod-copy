import { CargoItem, CARGO_BAY_DIMENSIONS, CargoType } from './cargoTypes';

// Enhanced interfaces for intelligent optimization
interface PlacementResult {
  position: [number, number, number];
  rotation: [number, number, number];
  fits: boolean;
  score: number; // Optimization score for this placement
}

interface PlacedItem {
  position: [number, number, number];
  dimensions: [number, number, number];
  weight: number;
  cargoType: CargoType;
  id: string;
}

// Free rectangle for 2D packing algorithm
interface FreeRect {
  x: number;
  z: number;
  width: number;
  length: number;
}

// Placed item in 2D space
interface Placed2D {
  x: number;
  z: number;
  width: number;
  length: number;
  rotation: [number, number, number];
  item: CargoItem;
}

interface OptimizationStep {
  stepId: number;
  description: string;
  cargoId: string;
  fromPosition: [number, number, number];
  toPosition: [number, number, number];
  rotation: [number, number, number];
  reasoning: string;
}

interface OptimizationResult {
  positions: Array<{
    position: [number, number, number];
    rotation: [number, number, number];
  }>;
  steps: OptimizationStep[];
  metrics: {
    volumeUtilization: number;
    weightDistribution: number;
    optimizationScore: number;
    freeSpace: number;
    balanceScore: number;
    centerOfGravityX: number;
    centerOfGravityZ: number;
  };
}

// Cargo weight specifications (in kg)
const CARGO_WEIGHTS = {
  [CargoType.PALLET]: 1500, // ~3300 lbs loaded 463L pallet
  [CargoType.HUMVEE]: 5900  // ~13000 lbs M1114 HMMWV
};

// Legacy function for backward compatibility
export function optimizeCargo(items: CargoItem[], allowRotation: boolean = true): Array<{
  position: [number, number, number];
  rotation: [number, number, number];
}> {
  const result = optimizeCargoIntelligent(items, allowRotation);
  return result.positions;
}

// Enhanced intelligent cargo optimization with step-by-step tracking
export function optimizeCargoIntelligent(items: CargoItem[], allowRotation: boolean = true): OptimizationResult {
  const results: Array<{
    position: [number, number, number];
    rotation: [number, number, number];
  }> = [];
  
  const steps: OptimizationStep[] = [];
  const placedItems: PlacedItem[] = [];
  
  // Configuration
  const clearance = 0.01; // 1cm minimal clearance between items for flush placement
  
  // STEP 1: Separate items by type and sort by weight for strategic placement
  const humvees = sortItemsForCenterOfGravity(items.filter(item => item.type === CargoType.HUMVEE));
  const pallets = sortItemsForCenterOfGravity(items.filter(item => item.type === CargoType.PALLET));
  
  // STEP 2: Initialize free rectangles (full cargo bay floor)
  const freeRects: FreeRect[] = [{
    x: -CARGO_BAY_DIMENSIONS.width / 2,
    z: -CARGO_BAY_DIMENSIONS.length / 2,
    width: CARGO_BAY_DIMENSIONS.width,
    length: CARGO_BAY_DIMENSIONS.length
  }];
  
  let stepId = 1;
  
  // STEP 3: Place Humvees first using lane-based approach
  for (const humvee of humvees) {
    const initialPosition: [number, number, number] = [-15, 2, stepId * 2 - 5];
    const placement = placeHumveeLane(humvee, freeRects, clearance, allowRotation, placedItems);
    
    if (placement) {
      results.push({
        position: placement.position,
        rotation: placement.rotation
      });
      
      steps.push({
        stepId,
        description: `Placing HUMVEE #${stepId} in optimal lane position`,
        cargoId: humvee.id,
        fromPosition: initialPosition,
        toPosition: placement.position,
        rotation: placement.rotation,
        reasoning: "Placed in centerline lane for easy access and optimal weight distribution."
      });
      
      // Add to placed items and update free rectangles
      const dims = getRotatedDimensions(humvee.dimensions, placement.rotation);
      placedItems.push({
        position: placement.position,
        dimensions: [dims.width, dims.height, dims.length],
        weight: CARGO_WEIGHTS[humvee.type],
        cargoType: humvee.type,
        id: humvee.id
      });
      
      // Remove occupied area from free rectangles
      updateFreeRects(freeRects, placement.x, placement.z, placement.width, placement.length, clearance);
    } else {
      // Try alternative placement within cargo bay bounds
      const alternativePlacement = findAlternativePosition(humvee, clearance, allowRotation, placedItems);
      
      if (alternativePlacement) {
        results.push({
          position: alternativePlacement.position,
          rotation: alternativePlacement.rotation
        });
        
        steps.push({
          stepId,
          description: `HUMVEE #${stepId} placed in alternative position`,
          cargoId: humvee.id,
          fromPosition: initialPosition,
          toPosition: alternativePlacement.position,
          rotation: alternativePlacement.rotation,
          reasoning: "Placed in alternative position within cargo bay bounds."
        });
        
        // Add to placed items and update free rectangles
        const dims = getRotatedDimensions(humvee.dimensions, alternativePlacement.rotation);
        placedItems.push({
          position: alternativePlacement.position,
          dimensions: [dims.width, dims.height, dims.length],
          weight: CARGO_WEIGHTS[humvee.type],
          cargoType: humvee.type,
          id: humvee.id
        });
        
        // Remove occupied area from free rectangles  
        const x = alternativePlacement.position[0] - dims.width / 2;
        const z = alternativePlacement.position[2] - dims.length / 2;
        updateFreeRects(freeRects, x, z, dims.width, dims.length, clearance);
      } else {
        // Item cannot fit - skip it and log
        steps.push({
          stepId,
          description: `HUMVEE #${stepId} cannot be placed`,
          cargoId: humvee.id,
          fromPosition: initialPosition,
          toPosition: initialPosition, // Keep at initial position (off-screen)
          rotation: [0, 0, 0],
          reasoning: "Cannot fit within cargo bay constraints - item not loaded."
        });
      }
    }
    stepId++;
  }
  
  // STEP 4: Place pallets using MaxRects free-rectangle packing (already sorted by weight for CG optimization)
  for (const pallet of pallets) {
    const initialPosition: [number, number, number] = [-15, 2, stepId * 2 - 5];
    const placement = placePalletMaxRects(pallet, freeRects, clearance, allowRotation, placedItems);
    
    if (placement) {
      results.push({
        position: placement.position,
        rotation: placement.rotation
      });
      
      steps.push({
        stepId,
        description: `Efficiently packing PALLET #${stepId - humvees.length}`,
        cargoId: pallet.id,
        fromPosition: initialPosition,
        toPosition: placement.position,
        rotation: placement.rotation,
        reasoning: `Placed using MaxRects algorithm for optimal space utilization (${placement.efficiency.toFixed(1)}% area fit).`
      });
      
      // Add to placed items and update free rectangles
      const dims = getRotatedDimensions(pallet.dimensions, placement.rotation);
      placedItems.push({
        position: placement.position,
        dimensions: [dims.width, dims.height, dims.length],
        weight: CARGO_WEIGHTS[pallet.type],
        cargoType: pallet.type,
        id: pallet.id
      });
      
      // Remove occupied area from free rectangles
      updateFreeRects(freeRects, placement.x, placement.z, placement.width, placement.length, clearance);
    } else {
      // Try alternative placement within cargo bay bounds
      const alternativePlacement = findAlternativePosition(pallet, clearance, allowRotation, placedItems);
      
      if (alternativePlacement) {
        results.push({
          position: alternativePlacement.position,
          rotation: alternativePlacement.rotation
        });
        
        steps.push({
          stepId,
          description: `PALLET #${stepId - humvees.length} placed in alternative position`,
          cargoId: pallet.id,
          fromPosition: initialPosition,
          toPosition: alternativePlacement.position,
          rotation: alternativePlacement.rotation,
          reasoning: "Placed in alternative position within cargo bay bounds."
        });
        
        // Add to placed items and update free rectangles
        const dims = getRotatedDimensions(pallet.dimensions, alternativePlacement.rotation);
        placedItems.push({
          position: alternativePlacement.position,
          dimensions: [dims.width, dims.height, dims.length],
          weight: CARGO_WEIGHTS[pallet.type],
          cargoType: pallet.type,
          id: pallet.id
        });
        
        // Remove occupied area from free rectangles  
        const x = alternativePlacement.position[0] - dims.width / 2;
        const z = alternativePlacement.position[2] - dims.length / 2;
        updateFreeRects(freeRects, x, z, dims.width, dims.length, clearance);
      } else {
        // Item cannot fit - skip it and log
        steps.push({
          stepId,
          description: `PALLET #${stepId - humvees.length} cannot be placed`,
          cargoId: pallet.id,
          fromPosition: initialPosition,
          toPosition: initialPosition, // Keep at initial position (off-screen)
          rotation: [0, 0, 0],
          reasoning: "Cannot fit within cargo bay constraints - item not loaded."
        });
      }
    }
    stepId++;
  }

  // STEP 5: Calculate comprehensive metrics
  const metrics = calculateOptimizationMetrics(placedItems, items);

  return {
    positions: results,
    steps,
    metrics
  };
}

// Alternative placement function for items that can't fit in primary algorithms
function findAlternativePosition(
  item: CargoItem,
  clearance: number,
  allowRotation: boolean,
  placedItems: PlacedItem[]
): { position: [number, number, number]; rotation: [number, number, number] } | null {
  const orientations = allowRotation ? [
    [0, 0, 0],           // Original orientation
    [0, Math.PI / 2, 0], // 90° rotation around Y-axis
  ] : [[0, 0, 0]];

  // Grid search parameters
  const stepSize = 0.5; // Search every 50cm
  const maxX = CARGO_BAY_DIMENSIONS.width / 2;
  const maxZ = CARGO_BAY_DIMENSIONS.length / 2;

  for (const rotation of orientations) {
    const dims = getRotatedDimensions(item.dimensions, rotation);
    
    // Grid search from back to front, left to right
    for (let z = -maxZ + dims.length / 2; z <= maxZ - dims.length / 2; z += stepSize) {
      for (let x = -maxX + dims.width / 2; x <= maxX - dims.width / 2; x += stepSize) {
        const y = dims.height / 2;
        const testPosition: [number, number, number] = [x, y, z];
        const testDimensions: [number, number, number] = [dims.width, dims.height, dims.length];
        
        // Check if position is within cargo bay bounds with clearance
        const withinBounds = 
          Math.abs(x) + dims.width / 2 <= CARGO_BAY_DIMENSIONS.width / 2 - clearance &&
          Math.abs(z) + dims.length / 2 <= CARGO_BAY_DIMENSIONS.length / 2 - clearance &&
          y + dims.height / 2 <= CARGO_BAY_DIMENSIONS.height - clearance;
        
        // Check for collision with existing items
        if (withinBounds && !hasCollision(testPosition, testDimensions, placedItems)) {
          return {
            position: testPosition,
            rotation: rotation as [number, number, number]
          };
        }
      }
    }
  }
  
  return null; // No valid position found
}

// Lane-based placement for Humvees with center of gravity optimization
function placeHumveeLane(
  humvee: CargoItem, 
  freeRects: FreeRect[], 
  clearance: number, 
  allowRotation: boolean,
  placedItems: PlacedItem[] = []
): { position: [number, number, number]; rotation: [number, number, number]; x: number; z: number; width: number; length: number } | null {
  const orientations = allowRotation ? [
    [0, 0, 0],           // Original orientation
    [0, Math.PI / 2, 0], // 90° rotation around Y-axis
  ] : [[0, 0, 0]];

  const humveeWeight = CARGO_WEIGHTS[humvee.type];
  let bestCandidate: any = null;
  let bestScore = -1;

  // Sort rectangles by preference: back half first, then by area (larger first)
  const sortedRects = [...freeRects]
    .filter(rect => rect.z < 0) // Back half of cargo bay only
    .sort((a, b) => {
      // Prefer rectangles further back (more negative z)
      const zPreference = a.z - b.z;
      if (Math.abs(zPreference) > 0.5) return zPreference;
      // Then prefer larger areas
      return (b.width * b.length) - (a.width * a.length);
    });

  // Evaluate multiple position candidates for optimal center of gravity
  for (const rotation of orientations) {
    const dims = getRotatedDimensions(humvee.dimensions, rotation);
    
    for (const rect of sortedRects) {
      // Check if rectangle is large enough
      if (rect.width >= dims.width + clearance * 2 &&
          rect.length >= dims.length + clearance * 2) {
        
        // Test multiple positions within this rectangle
        const stepSize = Math.min(1.0, rect.width / 4); // Test up to 4 positions per axis
        
        for (let testX = rect.x + dims.width / 2 + clearance; 
             testX <= rect.x + rect.width - dims.width / 2 - clearance; 
             testX += stepSize) {
          
          for (let testZ = rect.z + dims.length / 2 + clearance; 
               testZ <= rect.z + rect.length - dims.length / 2 - clearance; 
               testZ += stepSize) {
            
            const testY = dims.height / 2;
            const testPosition: [number, number, number] = [testX, testY, testZ];
            const testDimensions: [number, number, number] = [dims.width, dims.height, dims.length];
            
            // Check if position is within cargo bay bounds
            const withinBay = 
              Math.abs(testX) + dims.width / 2 <= CARGO_BAY_DIMENSIONS.width / 2 &&
              Math.abs(testZ) + dims.length / 2 <= CARGO_BAY_DIMENSIONS.length / 2;
            
            // Check for collisions
            if (withinBay && !hasCollision(testPosition, testDimensions, placedItems)) {
              // Calculate combined score: center of gravity + accessibility + centerline preference
              const cgScore = calculateCenterOfGravityScore(testPosition, humveeWeight, placedItems);
              
              // Accessibility score: prefer positions towards the back (negative z)
              const accessibilityScore = Math.max(0, 100 - (testZ + CARGO_BAY_DIMENSIONS.length / 2) * 2);
              
              // Centerline preference: prefer positions closer to x=0
              const centerlineScore = Math.max(0, 100 - Math.abs(testX) * 10);
              
              // Combined score with weights: 50% CG, 30% accessibility, 20% centerline
              const combinedScore = cgScore * 0.5 + accessibilityScore * 0.3 + centerlineScore * 0.2;
              
              if (combinedScore > bestScore) {
                bestScore = combinedScore;
                bestCandidate = {
                  position: testPosition,
                  rotation: rotation as [number, number, number],
                  x: testX - dims.width / 2,
                  z: testZ - dims.length / 2,
                  width: dims.width,
                  length: dims.length
                };
              }
            }
          }
        }
      }
    }
  }
  
  return bestCandidate;
}

// Width-first pallet placement with center of gravity optimization
function placePalletMaxRects(
  pallet: CargoItem,
  freeRects: FreeRect[],
  clearance: number,
  allowRotation: boolean,
  placedItems: PlacedItem[] = []
): { position: [number, number, number]; rotation: [number, number, number]; x: number; z: number; width: number; length: number; efficiency: number } | null {
  const orientations = allowRotation ? [
    [0, 0, 0],           // Original orientation
    [0, Math.PI / 2, 0], // 90° rotation around Y-axis
  ] : [[0, 0, 0]];

  const palletWeight = CARGO_WEIGHTS[pallet.type];

  // Collect ALL fitting candidates with center of gravity aware scoring
  const candidates: Array<{ 
    rect: FreeRect; 
    rotation: [number, number, number]; 
    dims: { width: number; height: number; length: number };
    efficiency: number;
    score: number;
    x: number;
    z: number;
    cgScore: number;
  }> = [];

  // Find all fitting candidates
  for (const rect of freeRects) {
    for (const rotation of orientations) {
      const dims = getRotatedDimensions(pallet.dimensions, rotation);
      
      // Check if pallet fits in this free rectangle with clearance
      if (rect.width >= dims.width + clearance * 2 &&
          rect.length >= dims.length + clearance * 2) {
        
        // Test multiple positions within this rectangle for optimal center of gravity
        const stepSize = Math.min(0.5, Math.max(rect.width / 6, 0.2)); // Finer grid for pallets
        
        for (let testX = rect.x + dims.width / 2 + clearance; 
             testX <= rect.x + rect.width - dims.width / 2 - clearance; 
             testX += stepSize) {
          
          for (let testZ = rect.z + dims.length / 2 + clearance; 
               testZ <= rect.z + rect.length - dims.length / 2 - clearance; 
               testZ += stepSize) {
            
            const testPosition: [number, number, number] = [testX, dims.height / 2, testZ];
            
            // Calculate center of gravity impact
            const cgScore = calculateCenterOfGravityScore(testPosition, palletWeight, placedItems);
            
            // Efficiency score based on space utilization
            const efficiency = ((dims.width + clearance * 2) * (dims.length + clearance * 2)) / (rect.width * rect.length) * 100;
            
            // Packing efficiency: prefer positions that enable side-by-side placement
            const leftPreference = Math.max(0, 100 - (testX + CARGO_BAY_DIMENSIONS.width / 2) * 2); // Prefer left side
            const backPreference = Math.max(0, 100 - (testZ + CARGO_BAY_DIMENSIONS.length / 2) * 1); // Prefer back
            
            // Combined score with weights: 40% CG, 30% packing efficiency, 20% left preference, 10% back preference
            const combinedScore = cgScore * 0.4 + efficiency * 0.3 + leftPreference * 0.2 + backPreference * 0.1;
            
            candidates.push({ 
              rect, 
              rotation: rotation as [number, number, number], 
              dims, 
              efficiency, 
              score: combinedScore,
              x: testX,
              z: testZ,
              cgScore
            });
          }
        }
      }
    }
  }

  // Sort candidates by combined score (highest score = best overall placement)
  candidates.sort((a, b) => b.score - a.score);

  // Try each candidate until one succeeds (no collision)
  for (const candidate of candidates) {
    const y = candidate.dims.height / 2;

    // Test for collision
    const testPosition: [number, number, number] = [candidate.x, y, candidate.z];
    const testDimensions: [number, number, number] = [candidate.dims.width, candidate.dims.height, candidate.dims.length];
    
    if (!hasCollision(testPosition, testDimensions, placedItems)) {
      // Success! Return this placement
      return {
        position: [candidate.x, y, candidate.z],
        rotation: candidate.rotation,
        x: candidate.x - candidate.dims.width / 2,
        z: candidate.z - candidate.dims.length / 2,
        width: candidate.dims.width,
        length: candidate.dims.length,
        efficiency: candidate.efficiency
      };
    }
    // If collision detected, continue to next candidate
  }

  // All candidates failed - return null
  return null;
}

// Debug: Verify no overlapping free rectangles (can be disabled for performance)
function assertNoOverlappingRects(freeRects: FreeRect[], debugContext: string = '') {
  if (process.env.NODE_ENV === 'production') return; // Skip in production
  
  for (let i = 0; i < freeRects.length; i++) {
    for (let j = i + 1; j < freeRects.length; j++) {
      const rect1 = freeRects[i];
      const rect2 = freeRects[j];
      
      if (rectanglesOverlap(rect1, rect2)) {
        console.error(`CRITICAL: Overlapping free rectangles detected ${debugContext}:`);
        console.error('Rectangle 1:', rect1);
        console.error('Rectangle 2:', rect2);
        throw new Error(`Free rectangle overlap detected: Algorithm integrity compromised ${debugContext}`);
      }
    }
  }
}

// Update free rectangles after placing an item (MaxRects algorithm)
function updateFreeRects(freeRects: FreeRect[], x: number, z: number, width: number, length: number, clearance: number) {
  const placedRect = {
    x: x - clearance,
    z: z - clearance,
    width: width + clearance * 2,
    length: length + clearance * 2
  };

  const newRects: FreeRect[] = [];

  for (const rect of freeRects) {
    // Check if this free rectangle overlaps with the placed item
    if (rectanglesOverlap(rect, placedRect)) {
      // Split the overlapping rectangle using MaxRects algorithm
      const splits = splitRectangleMaxRects(rect, placedRect);
      newRects.push(...splits);
    } else {
      // No overlap, keep the rectangle
      newRects.push(rect);
    }
  }

  // Replace the free rectangles with the new split rectangles
  freeRects.length = 0;
  freeRects.push(...newRects);

  // Apply MaxRects pruning - remove rectangles contained within others
  pruneContainedRectangles(freeRects);

  // Merge adjacent rectangles to reduce fragmentation
  mergeAdjacentRectangles(freeRects);

  // Remove very small rectangles (too small to be useful)
  const minSize = 0.5; // 50cm minimum
  for (let i = freeRects.length - 1; i >= 0; i--) {
    if (freeRects[i].width < minSize || freeRects[i].length < minSize) {
      freeRects.splice(i, 1);
    }
  }

  // Debug assertion: Verify no overlapping rectangles after update
  assertNoOverlappingRects(freeRects, `after placing item at (${x.toFixed(2)}, ${z.toFixed(2)}) with dimensions ${width.toFixed(2)}x${length.toFixed(2)}`);
}

// Check if two rectangles overlap
function rectanglesOverlap(
  rect1: { x: number; z: number; width: number; length: number },
  rect2: { x: number; z: number; width: number; length: number }
): boolean {
  return !(
    rect1.x >= rect2.x + rect2.width ||
    rect1.x + rect1.width <= rect2.x ||
    rect1.z >= rect2.z + rect2.length ||
    rect1.z + rect1.length <= rect2.z
  );
}

// Calculate center of gravity impact score for a potential placement
function calculateCenterOfGravityScore(
  candidatePosition: [number, number, number],
  candidateWeight: number,
  placedItems: PlacedItem[]
): number {
  // Calculate current total weight and moments
  let totalWeight = candidateWeight;
  let weightMomentX = candidateWeight * candidatePosition[0];
  let weightMomentZ = candidateWeight * candidatePosition[2];

  // Add existing items
  for (const item of placedItems) {
    totalWeight += item.weight;
    weightMomentX += item.weight * item.position[0];
    weightMomentZ += item.weight * item.position[2];
  }

  // Calculate projected center of gravity
  const projectedCGX = totalWeight > 0 ? weightMomentX / totalWeight : 0;
  const projectedCGZ = totalWeight > 0 ? weightMomentZ / totalWeight : 0;

  // Calculate distance from center of cargo bay (0, 0)
  const lateralDeviation = Math.abs(projectedCGX) / (CARGO_BAY_DIMENSIONS.width / 2);
  const longitudinalDeviation = Math.abs(projectedCGZ) / (CARGO_BAY_DIMENSIONS.length / 2);
  
  // Score where 100 = perfect center, 0 = maximum deviation
  const balanceScore = Math.max(0, 100 - (lateralDeviation + longitudinalDeviation) * 50);
  
  return balanceScore;
}

// Sort items by weight and strategic placement priority for better center of gravity
function sortItemsForCenterOfGravity<T extends CargoItem>(items: T[]): T[] {
  return items.sort((a, b) => {
    const weightA = CARGO_WEIGHTS[a.type];
    const weightB = CARGO_WEIGHTS[b.type];
    
    // Heavy items first for strategic placement
    return weightB - weightA;
  });
}

// Split rectangle using proper MaxRects algorithm - produces truly non-overlapping splits
function splitRectangleMaxRects(
  rect: FreeRect,
  placed: { x: number; z: number; width: number; length: number }
): FreeRect[] {
  const splits: FreeRect[] = [];

  // Proper MaxRects splitting: create at most 2 rectangles per axis to avoid overlaps
  
  // Horizontal splits (left and right of placed item)
  if (placed.x > rect.x) {
    // Left rectangle - full height, left of placed item
    splits.push({
      x: rect.x,
      z: rect.z,
      width: placed.x - rect.x,
      length: rect.length
    });
  }

  if (placed.x + placed.width < rect.x + rect.width) {
    // Right rectangle - full height, right of placed item
    splits.push({
      x: placed.x + placed.width,
      z: rect.z,
      width: rect.x + rect.width - (placed.x + placed.width),
      length: rect.length
    });
  }

  // Vertical splits (above and below placed item)
  // These only span the middle area to avoid overlapping with horizontal splits
  const middleX = Math.max(rect.x, placed.x);
  const middleWidth = Math.min(rect.x + rect.width, placed.x + placed.width) - middleX;
  
  if (middleWidth > 0) {
    if (placed.z > rect.z) {
      // Bottom rectangle - spans only the middle section horizontally
      splits.push({
        x: middleX,
        z: rect.z,
        width: middleWidth,
        length: placed.z - rect.z
      });
    }

    if (placed.z + placed.length < rect.z + rect.length) {
      // Top rectangle - spans only the middle section horizontally
      splits.push({
        x: middleX,
        z: placed.z + placed.length,
        width: middleWidth,
        length: rect.z + rect.length - (placed.z + placed.length)
      });
    }
  }

  // Filter out invalid rectangles (zero or negative dimensions)
  return splits.filter(split => split.width > 0.01 && split.length > 0.01);
}

// Prune rectangles that are completely contained within other rectangles
function pruneContainedRectangles(freeRects: FreeRect[]) {
  for (let i = freeRects.length - 1; i >= 0; i--) {
    for (let j = 0; j < freeRects.length; j++) {
      if (i !== j && isRectangleContained(freeRects[i], freeRects[j])) {
        freeRects.splice(i, 1);
        break;
      }
    }
  }
}

// Check if rect1 is completely contained within rect2
function isRectangleContained(
  rect1: FreeRect,
  rect2: FreeRect
): boolean {
  return (
    rect1.x >= rect2.x &&
    rect1.z >= rect2.z &&
    rect1.x + rect1.width <= rect2.x + rect2.width &&
    rect1.z + rect1.length <= rect2.z + rect2.length
  );
}

// Merge adjacent rectangles to reduce fragmentation
function mergeAdjacentRectangles(freeRects: FreeRect[]) {
  let merged = true;
  while (merged) {
    merged = false;
    
    for (let i = 0; i < freeRects.length && !merged; i++) {
      for (let j = i + 1; j < freeRects.length && !merged; j++) {
        const rect1 = freeRects[i];
        const rect2 = freeRects[j];
        
        // Try to merge horizontally
        if (rect1.z === rect2.z && rect1.length === rect2.length) {
          if (rect1.x + rect1.width === rect2.x) {
            // rect1 is to the left of rect2
            freeRects[i] = {
              x: rect1.x,
              z: rect1.z,
              width: rect1.width + rect2.width,
              length: rect1.length
            };
            freeRects.splice(j, 1);
            merged = true;
          } else if (rect2.x + rect2.width === rect1.x) {
            // rect2 is to the left of rect1
            freeRects[i] = {
              x: rect2.x,
              z: rect1.z,
              width: rect1.width + rect2.width,
              length: rect1.length
            };
            freeRects.splice(j, 1);
            merged = true;
          }
        }
        
        // Try to merge vertically
        if (rect1.x === rect2.x && rect1.width === rect2.width) {
          if (rect1.z + rect1.length === rect2.z) {
            // rect1 is below rect2
            freeRects[i] = {
              x: rect1.x,
              z: rect1.z,
              width: rect1.width,
              length: rect1.length + rect2.length
            };
            freeRects.splice(j, 1);
            merged = true;
          } else if (rect2.z + rect2.length === rect1.z) {
            // rect2 is below rect1
            freeRects[i] = {
              x: rect1.x,
              z: rect2.z,
              width: rect1.width,
              length: rect1.length + rect2.length
            };
            freeRects.splice(j, 1);
            merged = true;
          }
        }
      }
    }
  }
}

function getRotatedDimensions(
  dimensions: { width: number; height: number; length: number }, 
  rotation: [number, number, number] | number[]
): { width: number; height: number; length: number } {
  // Simple rotation logic - if rotated 90° around Y, swap width and length
  if (Math.abs(rotation[1]) > Math.PI / 4) {
    return {
      width: dimensions.length,
      height: dimensions.height,
      length: dimensions.width
    };
  }
  return dimensions;
}

function calculatePlacementScore(
  position: [number, number, number],
  dimensions: [number, number, number],
  placedItems: PlacedItem[]
): number {
  const [x, y, z] = position;
  const [w, h, l] = dimensions;
  
  let score = 100; // Start with perfect score
  
  // Prefer positions towards the back of the cargo bay (negative Z)
  const backPreference = (CARGO_BAY_DIMENSIONS.length / 2 - z) / CARGO_BAY_DIMENSIONS.length;
  score += backPreference * 20;
  
  // Prefer positions closer to center laterally for balance
  const lateralBalance = 1 - Math.abs(x) / (CARGO_BAY_DIMENSIONS.width / 2);
  score += lateralBalance * 15;
  
  // Prefer positions that are lower (on the floor)
  const floorPreference = 1 - (y - h/2) / CARGO_BAY_DIMENSIONS.height;
  score += floorPreference * 10;
  
  // Penalty for being too close to edges
  const edgeMargin = 0.3; // 30cm margin
  if (Math.abs(x) + w/2 > CARGO_BAY_DIMENSIONS.width/2 - edgeMargin) score -= 10;
  if (Math.abs(z) + l/2 > CARGO_BAY_DIMENSIONS.length/2 - edgeMargin) score -= 10;
  
  // Bonus for being adjacent to other items (efficient packing)
  let adjacencyBonus = 0;
  for (const placed of placedItems) {
    const [px, py, pz] = placed.position;
    const [pw, ph, pl] = placed.dimensions;
    
    const distanceX = Math.abs(x - px) - (w + pw) / 2;
    const distanceZ = Math.abs(z - pz) - (l + pl) / 2;
    
    // If items are adjacent (within 10cm)
    if (distanceX <= 0.1 && distanceZ > -0.1) adjacencyBonus += 5;
    if (distanceZ <= 0.1 && distanceX > -0.1) adjacencyBonus += 5;
  }
  score += Math.min(adjacencyBonus, 20); // Cap adjacency bonus
  
  return Math.max(0, score);
}

function hasCollision(
  position: [number, number, number],
  dimensions: [number, number, number],
  placedItems: PlacedItem[]
): boolean {
  const [x, y, z] = position;
  const [w, h, l] = dimensions;

  for (const placed of placedItems) {
    const [px, py, pz] = placed.position;
    const [pw, ph, pl] = placed.dimensions;

    // Check for overlap in all three dimensions
    const overlapX = Math.abs(x - px) < (w + pw) / 2;
    const overlapY = Math.abs(y - py) < (h + ph) / 2;
    const overlapZ = Math.abs(z - pz) < (l + pl) / 2;

    if (overlapX && overlapY && overlapZ) {
      return true; // Collision detected
    }
  }

  return false; // No collision
}

function calculateOptimizationMetrics(
  placedItems: PlacedItem[],
  allItems: CargoItem[]
): {
  volumeUtilization: number;
  weightDistribution: number;
  optimizationScore: number;
  freeSpace: number;
  balanceScore: number;
  centerOfGravityX: number;
  centerOfGravityZ: number;
} {
  const totalBayVolume = CARGO_BAY_DIMENSIONS.width * CARGO_BAY_DIMENSIONS.height * CARGO_BAY_DIMENSIONS.length;
  
  // Calculate volume utilization
  let usedVolume = 0;
  let totalWeight = 0;
  let weightMomentX = 0; // For lateral balance
  let weightMomentZ = 0; // For longitudinal balance
  
  for (const item of placedItems) {
    const [w, h, l] = item.dimensions;
    const [x, y, z] = item.position;
    
    usedVolume += w * h * l;
    totalWeight += item.weight;
    weightMomentX += item.weight * x;
    weightMomentZ += item.weight * z;
  }
  
  const volumeUtilization = (usedVolume / totalBayVolume) * 100;
  const freeSpace = totalBayVolume - usedVolume;
  
  // Calculate weight distribution balance (center of gravity)
  const centerOfGravityX = totalWeight > 0 ? weightMomentX / totalWeight : 0;
  const centerOfGravityZ = totalWeight > 0 ? weightMomentZ / totalWeight : 0;
  
  // Balance score - how close CG is to center of bay (perfect = 100)
  const lateralDeviation = Math.abs(centerOfGravityX) / (CARGO_BAY_DIMENSIONS.width / 2);
  const longitudinalDeviation = Math.abs(centerOfGravityZ) / (CARGO_BAY_DIMENSIONS.length / 2);
  const balanceScore = Math.max(0, 100 - (lateralDeviation + longitudinalDeviation) * 50);
  
  // Weight distribution score (0-100, higher is better balanced)
  const weightDistribution = balanceScore;
  
  // Overall optimization score combining multiple factors
  let optimizationScore = 0;
  
  // Volume efficiency (40% weight)
  optimizationScore += volumeUtilization * 0.4;
  
  // Balance quality (30% weight)
  optimizationScore += balanceScore * 0.3;
  
  // Placement efficiency (20% weight) - penalty for items outside bay
  const itemsInBay = placedItems.filter(item => {
    const [x, y, z] = item.position;
    const [w, h, l] = item.dimensions;
    return Math.abs(x) + w/2 <= CARGO_BAY_DIMENSIONS.width/2 + 0.1 &&
           y + h/2 <= CARGO_BAY_DIMENSIONS.height + 0.1 &&
           Math.abs(z) + l/2 <= CARGO_BAY_DIMENSIONS.length/2 + 0.1;
  });
  const placementEfficiency = (itemsInBay.length / allItems.length) * 100;
  optimizationScore += placementEfficiency * 0.2;
  
  // Mission readiness (10% weight) - Humvees accessible first
  let missionReadiness = 100;
  for (let i = 0; i < placedItems.length; i++) {
    if (placedItems[i].cargoType === CargoType.HUMVEE) {
      // Humvees should be towards the back (negative Z) for easy access
      const [x, y, z] = placedItems[i].position;
      if (z > 0) missionReadiness -= 10; // Penalty for Humvees in front
    }
  }
  optimizationScore += Math.max(0, missionReadiness) * 0.1;
  
  // Cap the optimization score at 100
  optimizationScore = Math.min(100, optimizationScore);
  
  return {
    volumeUtilization: Math.round(volumeUtilization * 10) / 10,
    weightDistribution: Math.round(weightDistribution * 10) / 10,
    optimizationScore: Math.round(optimizationScore * 10) / 10,
    freeSpace: Math.round(freeSpace * 10) / 10,
    balanceScore: Math.round(balanceScore * 10) / 10,
    centerOfGravityX: Math.round(centerOfGravityX * 100) / 100,
    centerOfGravityZ: Math.round(centerOfGravityZ * 100) / 100
  };
}
