/**
 * PACAF Airlift Demo - Classification & Segmentation Engine
 * Spec Reference: Section 3
 * 
 * Separates items by phase (ADVON/MAIN) and cargo type for processing.
 * Updated to support new CargoType system (PALLETIZED, ROLLING_STOCK, LOOSE_CARGO, PAX_RECORD)
 */

import {
  MovementItem,
  ClassifiedItems,
  ParseResult,
  ParsedCargoItem,
  ParsedCargoResult,
  ClassifiedCargoItems,
  parsedItemToMovementItem
} from './pacafTypes';

// ============================================================================
// CLASSIFICATION ENGINE (Spec Section 3) - NEW VERSION
// ============================================================================

/**
 * Classify parsed cargo items into the new CargoType categories
 */
export function classifyParsedItems(parseResult: ParsedCargoResult): ClassifiedCargoItems {
  const items = parseResult.items;

  // Classify by cargo type
  const palletized = items.filter(item => item.cargo_type === 'PALLETIZED');
  const rolling_stock = items.filter(item => item.cargo_type === 'ROLLING_STOCK');
  const loose_cargo = items.filter(item => item.cargo_type === 'LOOSE_CARGO');
  const pax_records = items.filter(item => item.cargo_type === 'PAX_RECORD');

  // Phase separation
  const advon_items = items.filter(item => item.advon_flag === true);
  const main_items = items.filter(item => item.advon_flag !== true);

  return {
    palletized,
    rolling_stock,
    loose_cargo,
    pax_records,
    advon_items,
    main_items
  };
}

/**
 * Get items by phase from classified cargo
 */
export function getADVONParsedItems(classified: ClassifiedCargoItems): {
  palletized: ParsedCargoItem[];
  rolling_stock: ParsedCargoItem[];
  loose_cargo: ParsedCargoItem[];
  pax_records: ParsedCargoItem[];
} {
  const advonIds = new Set(classified.advon_items.map(i => i.base_id));
  
  return {
    palletized: classified.palletized.filter(i => advonIds.has(i.base_id)),
    rolling_stock: classified.rolling_stock.filter(i => advonIds.has(i.base_id)),
    loose_cargo: classified.loose_cargo.filter(i => advonIds.has(i.base_id)),
    pax_records: classified.pax_records.filter(i => advonIds.has(i.base_id))
  };
}

export function getMainParsedItems(classified: ClassifiedCargoItems): {
  palletized: ParsedCargoItem[];
  rolling_stock: ParsedCargoItem[];
  loose_cargo: ParsedCargoItem[];
  pax_records: ParsedCargoItem[];
} {
  const mainIds = new Set(classified.main_items.map(i => i.base_id));
  
  return {
    palletized: classified.palletized.filter(i => mainIds.has(i.base_id)),
    rolling_stock: classified.rolling_stock.filter(i => mainIds.has(i.base_id)),
    loose_cargo: classified.loose_cargo.filter(i => mainIds.has(i.base_id)),
    pax_records: classified.pax_records.filter(i => mainIds.has(i.base_id))
  };
}

// ============================================================================
// SORTING UTILITIES FOR PARSED ITEMS
// ============================================================================

export function sortParsedByFootprintDescending(items: ParsedCargoItem[]): ParsedCargoItem[] {
  return [...items].sort((a, b) => {
    const areaA = a.length_in * a.width_in;
    const areaB = b.length_in * b.width_in;
    if (areaB !== areaA) return areaB - areaA;
    return b.weight_lb - a.weight_lb;
  });
}

export function sortParsedByWeightDescending(items: ParsedCargoItem[]): ParsedCargoItem[] {
  return [...items].sort((a, b) => b.weight_lb - a.weight_lb);
}

// ============================================================================
// SUMMARY GENERATION FOR PARSED ITEMS
// ============================================================================

export function generateParsedClassificationSummary(classified: ClassifiedCargoItems): {
  advon_weight: number;
  main_weight: number;
  total_weight: number;
  advon_pax: number;
  main_pax: number;
  total_pax: number;
  palletized_weight: number;
  rolling_stock_weight: number;
  loose_cargo_weight: number;
} {
  const advonWeight = classified.advon_items.reduce((sum, i) => sum + i.weight_lb, 0);
  const mainWeight = classified.main_items.reduce((sum, i) => sum + i.weight_lb, 0);

  const advonPax = classified.advon_items
    .filter(i => i.cargo_type === 'PAX_RECORD')
    .reduce((sum, i) => sum + (i.pax_count || 1), 0);
  const mainPax = classified.main_items
    .filter(i => i.cargo_type === 'PAX_RECORD')
    .reduce((sum, i) => sum + (i.pax_count || 1), 0);

  const palletizedWeight = classified.palletized.reduce((sum, i) => sum + i.weight_lb, 0);
  const rollingStockWeight = classified.rolling_stock.reduce((sum, i) => sum + i.weight_lb, 0);
  const looseCargoWeight = classified.loose_cargo.reduce((sum, i) => sum + i.weight_lb, 0);

  return {
    advon_weight: advonWeight,
    main_weight: mainWeight,
    total_weight: advonWeight + mainWeight,
    advon_pax: advonPax,
    main_pax: mainPax,
    total_pax: advonPax + mainPax,
    palletized_weight: palletizedWeight,
    rolling_stock_weight: rollingStockWeight,
    loose_cargo_weight: looseCargoWeight
  };
}

// ============================================================================
// LEGACY CLASSIFICATION ENGINE (Backward Compatible)
// ============================================================================

export function classifyItems(parseResult: ParseResult): ClassifiedItems {
  // Defensive check: ensure parseResult and items exist
  const items = parseResult?.items && Array.isArray(parseResult.items) ? parseResult.items : [];

  // Section 3.1: By Phase
  const advon_items = items.filter(item => item.advon_flag === true);
  const main_items = items.filter(item => item.advon_flag !== true);

  // Section 3.2: By Cargo Type
  const rolling_stock = items.filter(item => item.type === 'ROLLING_STOCK');
  const prebuilt_pallets = items.filter(item => item.type === 'PREBUILT_PALLET');
  const loose_items = items.filter(item => item.type === 'PALLETIZABLE');
  const pax_items = items.filter(item => item.type === 'PAX');

  // Debug logging
  console.log('[ClassificationEngine] Classified items:', {
    totalItems: items.length,
    rollingStock: rolling_stock.length,
    prebuiltPallets: prebuilt_pallets.length,
    looseItems: loose_items.length,
    paxItems: pax_items.length,
    rollingStockDescriptions: rolling_stock.map(i => i.description)
  });

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
// PHASE SEGREGATION (LEGACY)
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
// SORTING UTILITIES (LEGACY)
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
// SUMMARY GENERATION (LEGACY)
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

// ============================================================================
// CONVERSION UTILITY: ClassifiedCargoItems to ClassifiedItems
// ============================================================================

export function convertToLegacyClassifiedItems(
  classified: ClassifiedCargoItems
): ClassifiedItems {
  return {
    advon_items: classified.advon_items.map(parsedItemToMovementItem),
    main_items: classified.main_items.map(parsedItemToMovementItem),
    rolling_stock: classified.rolling_stock.map(parsedItemToMovementItem),
    prebuilt_pallets: classified.palletized.map(parsedItemToMovementItem),
    loose_items: classified.loose_cargo.map(parsedItemToMovementItem),
    pax_items: classified.pax_records.map(parsedItemToMovementItem)
  };
}
