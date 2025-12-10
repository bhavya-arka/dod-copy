/**
 * PACAF Airlift Demo - Palletization Engine
 * Spec Reference: Section 6
 * 
 * Handles prebuilt pallet validation and dynamic pallet construction for loose items
 * using 2D bin-packing algorithms.
 */

import {
  MovementItem,
  Pallet463L,
  PALLET_463L
} from '../types';

// ============================================================================
// PALLET CREATION
// ============================================================================

let palletCounter = 0;

function generatePalletId(): string {
  palletCounter++;
  return `P-${String(palletCounter).padStart(3, '0')}`;
}

export function resetPalletCounter(): void {
  palletCounter = 0;
}

// ============================================================================
// SECTION 6.1: PREBUILT PALLET VALIDATION
// ============================================================================

export function validatePrebuiltPallet(item: MovementItem): {
  valid: boolean;
  pallet: Pallet463L | null;
  errors: string[];
} {
  const errors: string[] = [];

  // Check height constraints
  if (item.height_in > PALLET_463L.max_height) {
    errors.push(`Height ${item.height_in}" exceeds maximum ${PALLET_463L.max_height}"`);
  }

  // Check weight constraints based on height
  const maxWeight = item.height_in > PALLET_463L.recommended_height
    ? PALLET_463L.max_payload_100in
    : PALLET_463L.max_payload_96in;

  if (item.weight_each_lb > maxWeight) {
    errors.push(`Weight ${item.weight_each_lb} lbs exceeds limit of ${maxWeight} lbs for height ${item.height_in}"`);
  }

  if (errors.length > 0) {
    return { valid: false, pallet: null, errors };
  }

  const pallet: Pallet463L = {
    id: item.pallet_id || generatePalletId(),
    items: [item],
    gross_weight: item.weight_each_lb + PALLET_463L.tare_with_nets,
    net_weight: item.weight_each_lb,
    height: item.height_in,
    hazmat_flag: item.hazmat_flag,
    is_prebuilt: true,
    footprint: {
      length: PALLET_463L.length,
      width: PALLET_463L.width
    }
  };

  return { valid: true, pallet, errors: [] };
}

// ============================================================================
// SECTION 6.2: DYNAMIC PALLET CONSTRUCTION (BIN PACKING)
// ============================================================================

interface PackedItem {
  item: MovementItem;
  x: number;
  y: number;
  rotated: boolean;
}

interface PackingResult {
  packed: PackedItem[];
  remaining: MovementItem[];
}

function canFitInPallet(
  item: MovementItem,
  currentItems: PackedItem[],
  currentWeight: number,
  rotated: boolean = false
): { fits: boolean; x: number; y: number } {
  const itemLength = rotated ? item.width_in : item.length_in;
  const itemWidth = rotated ? item.length_in : item.width_in;

  // Check if item fits within usable area
  if (itemLength > PALLET_463L.usable_length || itemWidth > PALLET_463L.usable_width) {
    return { fits: false, x: 0, y: 0 };
  }

  // Check height constraint
  if (item.height_in > PALLET_463L.max_height) {
    return { fits: false, x: 0, y: 0 };
  }

  // Check weight constraint
  const maxWeight = item.height_in > PALLET_463L.recommended_height
    ? PALLET_463L.max_payload_100in
    : PALLET_463L.max_payload_96in;

  if (currentWeight + item.weight_each_lb > maxWeight) {
    return { fits: false, x: 0, y: 0 };
  }

  // Multi-pass 2D bin packing: coarse pass first, then fine-grained fallback
  // Coarse pass (6" step) for fast initial placement
  // Fine pass (2" step) to fill remaining gaps
  const passes = [6, 2];
  
  for (const gridStep of passes) {
    for (let y = 0; y <= PALLET_463L.usable_width - itemWidth; y += gridStep) {
      for (let x = 0; x <= PALLET_463L.usable_length - itemLength; x += gridStep) {
        let collision = false;
        
        for (const placed of currentItems) {
          const placedLength = placed.rotated ? placed.item.width_in : placed.item.length_in;
          const placedWidth = placed.rotated ? placed.item.length_in : placed.item.width_in;
          
          // Check for overlap
          if (!(x + itemLength <= placed.x ||
                x >= placed.x + placedLength ||
                y + itemWidth <= placed.y ||
                y >= placed.y + placedWidth)) {
            collision = true;
            break;
          }
        }
        
        if (!collision) {
          return { fits: true, x, y };
        }
      }
    }
  }

  return { fits: false, x: 0, y: 0 };
}

function packItemsIntoPallet(
  items: MovementItem[],
  maxHeight: number = PALLET_463L.recommended_height
): PackingResult {
  const packed: PackedItem[] = [];
  const remaining: MovementItem[] = [];
  let currentWeight = 0;

  // First Fit Decreasing (FFD) heuristic:
  // Sort by volume (largest first), then by weight, then by longest dimension
  // This ensures heavy/large items are placed first, leaving smaller gaps for small items
  const sortedItems = [...items].sort((a, b) => {
    // Volume comparison (cubic inches)
    const volA = a.length_in * a.width_in * a.height_in;
    const volB = b.length_in * b.width_in * b.height_in;
    if (Math.abs(volB - volA) > 100) return volB - volA;
    
    // Weight comparison
    if (Math.abs(b.weight_each_lb - a.weight_each_lb) > 50) {
      return b.weight_each_lb - a.weight_each_lb;
    }
    
    // Longest dimension comparison (prefer square items)
    const maxDimA = Math.max(a.length_in, a.width_in);
    const maxDimB = Math.max(b.length_in, b.width_in);
    return maxDimB - maxDimA;
  });

  for (const item of sortedItems) {
    // Skip items that exceed height limit
    if (item.height_in > maxHeight) {
      remaining.push(item);
      continue;
    }

    // Try normal orientation first
    let fitResult = canFitInPallet(item, packed, currentWeight, false);
    
    // Try rotated orientation if normal doesn't fit
    if (!fitResult.fits) {
      fitResult = canFitInPallet(item, packed, currentWeight, true);
      if (fitResult.fits) {
        packed.push({ item, x: fitResult.x, y: fitResult.y, rotated: true });
        currentWeight += item.weight_each_lb;
        continue;
      }
    } else {
      packed.push({ item, x: fitResult.x, y: fitResult.y, rotated: false });
      currentWeight += item.weight_each_lb;
      continue;
    }

    // Item doesn't fit in this pallet
    remaining.push(item);
  }

  return { packed, remaining };
}

// ============================================================================
// MAIN PALLETIZATION FUNCTION
// ============================================================================

export function palletizeLooseItems(items: MovementItem[]): Pallet463L[] {
  const pallets: Pallet463L[] = [];
  let remainingItems = [...items];

  while (remainingItems.length > 0) {
    const packResult = packItemsIntoPallet(remainingItems);

    if (packResult.packed.length === 0) {
      // No more items can be packed - remaining items are too large
      console.warn('Some items cannot be palletized:', remainingItems.map(i => i.item_id));
      break;
    }

    // Create pallet from packed items
    const packedItems = packResult.packed.map(p => p.item);
    const totalWeight = packedItems.reduce((sum, i) => sum + i.weight_each_lb, 0);
    const maxItemHeight = Math.max(...packedItems.map(i => i.height_in));
    const hasHazmat = packedItems.some(i => i.hazmat_flag);

    const pallet: Pallet463L = {
      id: generatePalletId(),
      items: packedItems,
      gross_weight: totalWeight + PALLET_463L.tare_with_nets,
      net_weight: totalWeight,
      height: maxItemHeight,
      hazmat_flag: hasHazmat,
      is_prebuilt: false,
      footprint: {
        length: PALLET_463L.length,
        width: PALLET_463L.width
      }
    };

    pallets.push(pallet);
    remainingItems = packResult.remaining;
  }

  return pallets;
}

// ============================================================================
// COMBINED PALLET PROCESSING
// ============================================================================

export interface PalletizationResult {
  pallets: Pallet463L[];
  unpalletizable_items: MovementItem[];
  total_pallets: number;
  total_weight: number;
  warnings: string[];
}

export function processPalletization(
  prebuiltPallets: MovementItem[],
  looseItems: MovementItem[]
): PalletizationResult {
  resetPalletCounter();
  
  const pallets: Pallet463L[] = [];
  const warnings: string[] = [];
  const unpalletizable: MovementItem[] = [];

  // Process prebuilt pallets (Spec Section 6.1)
  for (const item of prebuiltPallets) {
    const result = validatePrebuiltPallet(item);
    if (result.valid && result.pallet) {
      pallets.push(result.pallet);
    } else {
      warnings.push(`Prebuilt pallet ${item.item_id}: ${result.errors.join(', ')}`);
      unpalletizable.push(item);
    }
  }

  // Process loose items (Spec Section 6.2)
  const generatedPallets = palletizeLooseItems(looseItems);
  pallets.push(...generatedPallets);

  // Check for items that couldn't be palletized
  const palletizedItemIds = new Set(
    pallets.flatMap(p => p.items.map(i => i.item_id))
  );
  
  for (const item of looseItems) {
    if (!palletizedItemIds.has(item.item_id)) {
      unpalletizable.push(item);
      warnings.push(`Item ${item.item_id} could not be palletized - dimensions exceed limits`);
    }
  }

  const totalWeight = pallets.reduce((sum, p) => sum + p.gross_weight, 0);

  return {
    pallets,
    unpalletizable_items: unpalletizable,
    total_pallets: pallets.length,
    total_weight: totalWeight,
    warnings
  };
}
