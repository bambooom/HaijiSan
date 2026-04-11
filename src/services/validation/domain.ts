import { SHEET_SCHEMAS } from '../../constants/sheet-schema';
import { validateRecordAgainstSchema } from '../../shared/record-mapper';
import type { NutritionRequest, ToolRecord } from '../../types';

function isNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value < 0;
}

function validateNonNegativeNutritionFields(record: ToolRecord): string[] {
  return ['calories_kcal', 'protein_g', 'fat_g', 'carbs_g']
    .filter((field) => isNegativeNumber(record[field]))
    .map((field) => `Field ${field} cannot be negative`);
}

export function validateFoodLogDomainRecord(record: ToolRecord): string[] {
  const errors: string[] = [];

  if (typeof record.meal_text !== 'string' || !record.meal_text.trim()) {
    errors.push('Field meal_text must be a non-empty string');
  }

  if (record.occurred_at !== undefined) {
    errors.push(
      ...validateRecordAgainstSchema(
        SHEET_SCHEMAS.FOOD_LOG,
        { occurred_at: record.occurred_at },
        { partial: true },
      ),
    );
  }

  errors.push(...validateNonNegativeNutritionFields(record));

  return errors;
}

function getNutritionRecord(request: NutritionRequest): ToolRecord {
  return request.tool === 'updateData' ? request.updates : request.record;
}

export function validateRefCaloriesDomainRecord(
  record: ToolRecord,
  options: { requireFoodName?: boolean } = {},
): string[] {
  const { requireFoodName = true } = options;
  const errors: string[] = [];

  if (
    requireFoodName
      ? typeof record.food_name !== 'string' || !record.food_name.trim()
      : typeof record.food_name === 'string' && !record.food_name.trim()
  ) {
    errors.push('Field food_name must be a non-empty string');
  }

  if (
    Object.prototype.hasOwnProperty.call(record, 'serving_size') &&
    typeof record.serving_size === 'number' &&
    Number.isFinite(record.serving_size) &&
    record.serving_size <= 0
  ) {
    errors.push('Field serving_size must be greater than 0');
  }

  errors.push(...validateNonNegativeNutritionFields(record));

  return errors;
}

export function validateNutritionRequest(request: NutritionRequest): string[] {
  return validateRefCaloriesDomainRecord(getNutritionRecord(request), {
    requireFoodName: request.tool === 'insertData',
  });
}

export function assertValidFoodLogDomainRecord(record: ToolRecord): void {
  const errors = validateFoodLogDomainRecord(record);

  if (errors.length > 0) {
    throw new Error(`FOOD_LOG domain validation failed: ${errors.join('; ')}`);
  }
}

export function assertValidNutritionRequest(request: NutritionRequest): void {
  const errors = validateNutritionRequest(request);

  if (errors.length > 0) {
    throw new Error(
      `REF_CALORIES domain validation failed: ${errors.join('; ')}`,
    );
  }
}
