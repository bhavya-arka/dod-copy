/**
 * PACAF Airlift Demo - Classification & Segmentation Engine
 * Spec Reference: Section 3
 * 
 * Separates items by phase (ADVON/MAIN) and cargo type for processing.
 */

import {
  MovementItem,
  ClassifiedItems,
  ParseResult
} from '../types';

// ============================================================================
// CLASSIFICATION ENGINE (Spec Section 3)
// ============================================================================

export function classifyItems(parseResult: ParseResult): ClassifiedItems {
  const items = parseResult.items;

  // Section 3.1: By Phase
  const advon_items = items.filter(item => item.advon_flag === true);
  const main_items = items.filter(item => item.advon_flag !== true);

  // Section 3.2: By Cargo Type
  const rolling_stock = items.filter(item => item.type === 'ROLLING_STOCK');
  const prebuilt_pallets = items.filter(item => item.type === 'PREBUILT_PALLET');
  const loose_items = items.filter(item => item.type === 'PALLETIZABLE');
  const pax_items = items.filter(item => item.type === 'PAX');

  return {
    advon_items,
    main_items,
    rolling_stock,
    prebuilt_pallets,
    loose_items,
    pax_items
  };
}

// ============================================================================
// PHASE SEGREGATION
// ============================================================================

export function getADVONItems(classifiedItems: ClassifiedItems): {
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
} {
  const advonIds = new Set(classifiedItems.advon_items.map(i => i.item_id));
  
  return {
    rolling_stock: classifiedItems.rolling_stock.filter(i => advonIds.has(i.item_id)),
    prebuilt_pallets: classifiedItems.prebuilt_pallets.filter(i => advonIds.has(i.item_id)),
    loose_items: classifiedItems.loose_items.filter(i => advonIds.has(i.item_id)),
    pax_items: classifiedItems.pax_items.filter(i => advonIds.has(i.item_id))
  };
}

export function getMainItems(classifiedItems: ClassifiedItems): {
  rolling_stock: MovementItem[];
  prebuilt_pallets: MovementItem[];
  loose_items: MovementItem[];
  pax_items: MovementItem[];
} {
  const mainIds = new Set(classifiedItems.main_items.map(i => i.item_id));
  
  return {
    rolling_stock: classifiedItems.rolling_stock.filter(i => mainIds.has(i.item_id)),
    prebuilt_pallets: classifiedItems.prebuilt_pallets.filter(i => mainIds.has(i.item_id)),
    loose_items: classifiedItems.loose_items.filter(i => mainIds.has(i.item_id)),
    pax_items: classifiedItems.pax_items.filter(i => mainIds.has(i.item_id))
  };
}

// ============================================================================
// SORTING UTILITIES
// ============================================================================

export function sortByFootprintDescending(items: MovementItem[]): MovementItem[] {
  return [...items].sort((a, b) => {
    const areaA = a.length_in * a.width_in;
    const areaB = b.length_in * b.width_in;
    if (areaB !== areaA) return areaB - areaA;
    return b.weight_each_lb - a.weight_each_lb;
  });
}

export function sortByWeightDescending(items: MovementItem[]): MovementItem[] {
  return [...items].sort((a, b) => b.weight_each_lb - a.weight_each_lb);
}

export function sortByLengthDescending(items: MovementItem[]): MovementItem[] {
  return [...items].sort((a, b) => {
    if (b.length_in !== a.length_in) return b.length_in - a.length_in;
    return b.weight_each_lb - a.weight_each_lb;
  });
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

export function generateClassificationSummary(classifiedItems: ClassifiedItems): {
  advon_weight: number;
  main_weight: number;
  total_weight: number;
  advon_pax: number;
  main_pax: number;
  total_pax: number;
  rolling_stock_weight: number;
  pallet_weight: number;
} {
  const advonWeight = classifiedItems.advon_items.reduce(
    (sum, i) => sum + i.weight_each_lb * i.quantity, 0
  );
  const mainWeight = classifiedItems.main_items.reduce(
    (sum, i) => sum + i.weight_each_lb * i.quantity, 0
  );

  const advonPax = classifiedItems.advon_items
    .filter(i => i.type === 'PAX')
    .reduce((sum, i) => sum + (i.pax_count || 1), 0);
  const mainPax = classifiedItems.main_items
    .filter(i => i.type === 'PAX')
    .reduce((sum, i) => sum + (i.pax_count || 1), 0);

  const rollingStockWeight = classifiedItems.rolling_stock.reduce(
    (sum, i) => sum + i.weight_each_lb * i.quantity, 0
  );
  const palletWeight = [...classifiedItems.prebuilt_pallets, ...classifiedItems.loose_items]
    .reduce((sum, i) => sum + i.weight_each_lb * i.quantity, 0);

  return {
    advon_weight: advonWeight,
    main_weight: mainWeight,
    total_weight: advonWeight + mainWeight,
    advon_pax: advonPax,
    main_pax: mainPax,
    total_pax: advonPax + mainPax,
    rolling_stock_weight: rollingStockWeight,
    pallet_weight: palletWeight
  };
}
