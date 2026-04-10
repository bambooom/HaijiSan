import type { FoodReferenceEntry, IngredientEstimateInput } from '../../types';

const STOCK_SIDE_EFFECT_UNITS = new Set([
  'serving',
  'piece',
  '个',
  '份',
  '个/份',
]);

export function normalizeUnit(value: string): string {
  return value.trim().toLowerCase();
}

export function roundNutritionValue(value: number): number {
  return Math.round(value * 10) / 10;
}

export function isServingUnit(value: string): boolean {
  return new Set(['serving', 'servings', '份', 'portion']).has(
    normalizeUnit(value),
  );
}

export function isPieceUnit(value: string): boolean {
  return new Set(['piece', 'pieces', '个']).has(normalizeUnit(value));
}

export function isWeightUnit(value: string): boolean {
  return new Set(['g', 'gram', 'grams', 'kg', 'kilogram', 'kilograms']).has(
    normalizeUnit(value),
  );
}

export function isVolumeUnit(value: string): boolean {
  return new Set([
    'ml',
    'milliliter',
    'milliliters',
    'l',
    'liter',
    'liters',
  ]).has(normalizeUnit(value));
}

export function scaleNullableNumber(
  value: number | null,
  scale: number,
): number | null {
  return value === null ? null : roundNutritionValue(value * scale);
}

export function convertMetricUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);

  if (from === to) {
    return quantity;
  }

  if (isWeightUnit(from) && isWeightUnit(to)) {
    if (from === 'g' && to === 'kg') {
      return quantity / 1000;
    }

    if (from === 'kg' && to === 'g') {
      return quantity * 1000;
    }
  }

  if (isVolumeUnit(from) && isVolumeUnit(to)) {
    if (from === 'ml' && to === 'l') {
      return quantity / 1000;
    }

    if (from === 'l' && to === 'ml') {
      return quantity * 1000;
    }
  }

  return null;
}

export function resolveReferenceScale(
  item: IngredientEstimateInput,
  reference: FoodReferenceEntry,
): number | null {
  if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
    return null;
  }

  const itemUnit = normalizeUnit(item.unit);
  const referenceUnit = normalizeUnit(reference.serving_unit);
  const referenceSize = reference.serving_size;

  if (!itemUnit) {
    return null;
  }

  if (isServingUnit(itemUnit)) {
    return item.quantity;
  }

  if (itemUnit === referenceUnit) {
    if (
      typeof referenceSize === 'number' &&
      Number.isFinite(referenceSize) &&
      referenceSize > 0
    ) {
      return item.quantity / referenceSize;
    }

    return item.quantity;
  }

  if (isPieceUnit(itemUnit) && isPieceUnit(referenceUnit)) {
    if (
      typeof referenceSize === 'number' &&
      Number.isFinite(referenceSize) &&
      referenceSize > 0
    ) {
      return item.quantity / referenceSize;
    }

    return item.quantity;
  }

  return null;
}

export function canAutoAdjustStock(
  itemUnit: string,
  quantity: number,
  stockUnit: string,
): boolean {
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isInteger(quantity)
  ) {
    return false;
  }

  const normalizedItemUnit = normalizeUnit(itemUnit);
  const normalizedStockUnit = normalizeUnit(stockUnit);

  if (normalizedItemUnit === normalizedStockUnit) {
    return true;
  }

  return (
    (normalizedItemUnit === 'serving' || normalizedItemUnit === 'piece') &&
    STOCK_SIDE_EFFECT_UNITS.has(normalizedStockUnit)
  );
}

export function resolveStockQuantity(
  itemQuantity: number,
  itemUnit: string,
  stockUnit: string,
): number | null {
  if (!Number.isFinite(itemQuantity) || itemQuantity <= 0) {
    return null;
  }

  const normalizedItemUnit = normalizeUnit(itemUnit);
  const normalizedStockUnit = normalizeUnit(stockUnit);

  if (normalizedItemUnit === normalizedStockUnit) {
    return itemQuantity;
  }

  const metricQuantity = convertMetricUnit(
    itemQuantity,
    normalizedItemUnit,
    normalizedStockUnit,
  );

  if (metricQuantity !== null) {
    return metricQuantity;
  }

  if (
    (isServingUnit(normalizedItemUnit) || isPieceUnit(normalizedItemUnit)) &&
    STOCK_SIDE_EFFECT_UNITS.has(normalizedStockUnit)
  ) {
    return itemQuantity;
  }

  if (isPieceUnit(normalizedItemUnit) && isPieceUnit(normalizedStockUnit)) {
    return itemQuantity;
  }

  return null;
}
