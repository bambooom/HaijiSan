import { AI_INTENTS, AI_MESSAGES } from '../constants/ai';
import {
  bodyLogRepository,
  refCaloriesRepository,
  sleepLogRepository,
  statusLogRepository,
  stockRepository,
  workoutLogRepository,
} from '../repositories';
import { persistMealRecord } from '../services/meal-recording';
import { getTodayNutritionSummary } from '../services/nutrition-summary';
import type { AiIntent, AiPlan } from '../types';
import { resolveAiStockItems } from '../utils/ai-command';
import {
  TOOL_INTENT_MAP,
  TOOL_NAMES,
  clarifyValidationResult,
  invalidValidationResult,
  okValidationResult,
  type AdjustStockInput,
  type AnyToolContract,
  type LogBodyInput,
  type LogMealInput,
  type LogReferenceInput,
  type LookupReferenceInput,
  type LookupReferenceOutput,
  type LookupStockInput,
  type LogSleepInput,
  type LogStatusInput,
  type LogWorkoutInput,
  type SummarizeNutritionInput,
  type ToolExecutionContext,
  type ToolInputMap,
  type ToolName,
  type ToolValidationIssue,
  hasMeaningfulMealItems,
} from './schemas';

function missingFieldIssue(
  field: string,
  message: string,
): ToolValidationIssue {
  return { code: 'missing-field', field, message };
}

function invalidValueIssue(
  field: string,
  message: string,
): ToolValidationIssue {
  return { code: 'invalid-value', field, message };
}

function normalizeLookupStockQuery(sourceText: string): string | undefined {
  const normalized = sourceText
    .replace(/[？?，,。.!！]/g, ' ')
    .replace(
      /(帮我|帮忙|我想|我想看|我想查|请|麻烦|看下|看一下|查下|查一下|看看|查询)/g,
      ' ',
    )
    .replace(/(现在|目前|还有|还剩|剩多少|多少|哪些|有什么|库存|一下)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || undefined;
}

function parseClockTime(
  value: string,
): { hour: number; minute: number } | null {
  const match = value.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

function buildClockDate(
  baseDate: Date,
  hour: number,
  minute: number,
  dayOffset: number = 0,
): Date {
  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + dayOffset,
    hour,
    minute,
    0,
    0,
  );
}

function normalizeStatusValue(input: LogStatusInput): string | number {
  if (input.entryType === 'bowel') {
    return input.value ?? '4';
  }

  if (input.entryType === 'menstruation') {
    return input.value ?? 'start';
  }

  return input.value ?? input.note ?? '';
}

const TOOL_REGISTRY: Record<ToolName, AnyToolContract> = {
  [TOOL_NAMES.LOG_MEAL]: {
    name: TOOL_NAMES.LOG_MEAL,
    description:
      'Record a meal event with optional parsed items and calorie estimate.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOG_MEAL],
    confirmationPolicy: 'conditional',
    requiredFields: ['mealText'],
    optionalFields: [
      'mealType',
      'estimatedCalories',
      'parseStatus',
      'items',
      'note',
    ],
    sideEffects: ['write-food-log', 'write-food-items'],
    validate(input: LogMealInput) {
      if (!input.mealText.trim()) {
        return clarifyValidationResult([
          missingFieldIssue('mealText', '需要更明确的饮食内容才能继续记录。'),
        ]);
      }

      if (
        input.estimatedCalories === null ||
        input.estimatedCalories === undefined
      ) {
        if (!hasMeaningfulMealItems(input.items)) {
          return clarifyValidationResult([
            {
              code: 'clarification-required',
              message: AI_MESSAGES.INCOMPLETE_COMMAND,
            },
          ]);
        }
      }

      return okValidationResult();
    },
    execute(input, context) {
      if (!input.mealType) {
        throw new Error('mealType is required to persist a meal record');
      }

      const items = (input.items ?? []).map((item) => ({
        parent_food_log_id: '',
        item_name: item.itemName,
        quantity: item.quantity ?? null,
        unit: item.unit ?? '',
        estimated_calories: item.estimatedCalories ?? null,
        linked_food_ref_id: item.linkedFoodRefId ?? '',
        linked_stock_item_id: item.linkedStockItemId ?? '',
        ai_confidence: item.aiConfidence ?? null,
        note: item.note ?? '',
      }));

      const persisted = persistMealRecord({
        timestamp: context.timestamp,
        mealType: input.mealType,
        mealText: input.mealText,
        estimatedCalories: input.estimatedCalories ?? null,
        parseStatus: input.parseStatus ?? 'pending',
        note: input.note ?? '',
        items,
      });

      return {
        foodLogId: persisted.foodLogId,
        persisted: true,
        estimatedCalories: input.estimatedCalories ?? null,
        parseStatus: input.parseStatus ?? 'pending',
        itemCount: items.length,
        stockSyncPlanned: persisted.stockSync.updatedCount > 0,
      };
    },
  },
  [TOOL_NAMES.LOG_BODY]: {
    name: TOOL_NAMES.LOG_BODY,
    description: 'Record body metrics such as weight, BMI, or body fat.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOG_BODY],
    confirmationPolicy: 'never',
    requiredFields: ['weightKg'],
    optionalFields: ['bmi', 'bodyFatPct', 'leanBodyMassKg', 'source', 'note'],
    sideEffects: ['write-body-log'],
    validate(input: LogBodyInput) {
      const hasAnyMetric = [
        input.weightKg,
        input.bmi,
        input.bodyFatPct,
        input.leanBodyMassKg,
      ].some((value) => typeof value === 'number' && Number.isFinite(value));

      if (!hasAnyMetric) {
        return clarifyValidationResult([
          missingFieldIssue('weightKg', '至少需要一个身体数据指标，比如体重。'),
        ]);
      }

      const issues: ToolValidationIssue[] = [];

      if (
        input.weightKg !== null &&
        input.weightKg !== undefined &&
        (!Number.isFinite(input.weightKg) || input.weightKg <= 0)
      ) {
        issues.push(invalidValueIssue('weightKg', '体重必须是大于 0 的数字。'));
      }

      if (
        input.bmi !== null &&
        input.bmi !== undefined &&
        (!Number.isFinite(input.bmi) || input.bmi <= 0)
      ) {
        issues.push(invalidValueIssue('bmi', 'BMI 必须是大于 0 的数字。'));
      }

      if (
        input.bodyFatPct !== null &&
        input.bodyFatPct !== undefined &&
        (!Number.isFinite(input.bodyFatPct) ||
          input.bodyFatPct < 0 ||
          input.bodyFatPct > 100)
      ) {
        issues.push(
          invalidValueIssue('bodyFatPct', '体脂率必须是 0 到 100 之间的数字。'),
        );
      }

      if (
        input.leanBodyMassKg !== null &&
        input.leanBodyMassKg !== undefined &&
        (!Number.isFinite(input.leanBodyMassKg) || input.leanBodyMassKg <= 0)
      ) {
        issues.push(
          invalidValueIssue('leanBodyMassKg', '去脂体重必须是大于 0 的数字。'),
        );
      }

      return issues.length > 0
        ? invalidValidationResult(issues)
        : okValidationResult();
    },
    execute(input, context) {
      const entry = bodyLogRepository.logMetrics(context.timestamp, {
        weightKg: input.weightKg,
        bmi: input.bmi,
        bodyFatPct: input.bodyFatPct,
        leanBodyMassKg: input.leanBodyMassKg,
        source: input.source,
        note: input.note,
      });

      return {
        persisted: true,
        weightKg: entry.weight_kg,
        bmi: entry.bmi,
        bodyFatPct: entry.body_fat_pct,
        leanBodyMassKg: entry.lean_body_mass_kg,
      };
    },
  },
  [TOOL_NAMES.ADJUST_STOCK]: {
    name: TOOL_NAMES.ADJUST_STOCK,
    description: 'Adjust or set stock quantities for one or more items.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.ADJUST_STOCK],
    confirmationPolicy: 'conditional',
    requiredFields: ['operation', 'items'],
    optionalFields: [],
    sideEffects: ['write-stock'],
    validate(input: AdjustStockInput) {
      if (input.items.length === 0) {
        return clarifyValidationResult([
          missingFieldIssue('items', '库存项目为空，没法继续处理。'),
        ]);
      }

      const issues = input.items.flatMap((item, index) => {
        const itemIssues: ToolValidationIssue[] = [];

        if (!item.name.trim()) {
          itemIssues.push(
            missingFieldIssue(`items.${index}.name`, '库存项目名称不能为空。'),
          );
        }

        if (!Number.isFinite(item.quantity)) {
          itemIssues.push(
            invalidValueIssue(
              `items.${index}.quantity`,
              '库存数量必须是有效数字。',
            ),
          );
        }

        if (input.operation === 'set' && item.quantity < 0) {
          itemIssues.push(
            invalidValueIssue(
              `items.${index}.quantity`,
              'set 模式下库存数量不能是负数。',
            ),
          );
        }

        return itemIssues;
      });

      return issues.length > 0
        ? invalidValidationResult(issues)
        : okValidationResult();
    },
    execute(input, context) {
      const updatedNames: string[] = [];

      for (const item of input.items) {
        const result =
          input.operation === 'set'
            ? stockRepository.setStock(
                context.timestamp,
                item.name,
                item.quantity,
                item.unit,
                item.purchaseChannel,
              )
            : stockRepository.adjustStock(
                context.timestamp,
                item.name,
                item.quantity,
                item.unit,
                item.purchaseChannel,
              );

        if (!result.ok) {
          throw new Error(
            `stock ${input.operation} failed for ${item.name}: ${result.reason}`,
          );
        }

        updatedNames.push(result.entry.item_name);
      }

      return {
        operation: input.operation,
        updatedCount: updatedNames.length,
        itemNames: updatedNames,
      };
    },
  },
  [TOOL_NAMES.LOOKUP_STOCK]: {
    name: TOOL_NAMES.LOOKUP_STOCK,
    description: 'Lookup current stock items by keyword or list all stock.',
    category: 'read',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOOKUP_STOCK],
    confirmationPolicy: 'never',
    requiredFields: [],
    optionalFields: ['query'],
    sideEffects: ['read-stock'],
    validate(_input: LookupStockInput) {
      return okValidationResult();
    },
    execute(input) {
      const normalizedQuery = input.query?.trim().toLowerCase() ?? '';
      const items = stockRepository
        .listStock()
        .filter((item) => {
          if (!normalizedQuery) {
            return true;
          }

          return item.name.toLowerCase().includes(normalizedQuery);
        })
        .map((item) => ({
          itemName: item.name,
          amount: item.amount,
        }));

      return {
        resultCount: items.length,
        items,
      };
    },
  },
  [TOOL_NAMES.SUMMARIZE_NUTRITION]: {
    name: TOOL_NAMES.SUMMARIZE_NUTRITION,
    description: 'Summarize nutrition from existing food records.',
    category: 'read',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.SUMMARIZE_NUTRITION],
    confirmationPolicy: 'never',
    requiredFields: [],
    optionalFields: ['scope', 'date'],
    sideEffects: [
      'read-food-log',
      'read-food-items',
      'read-ref-calories',
      'read-body-log',
    ],
    validate(input: SummarizeNutritionInput) {
      if (input.scope && input.scope !== 'today') {
        return invalidValidationResult([
          invalidValueIssue('scope', '当前只支持 today 范围的营养汇总。'),
        ]);
      }

      return okValidationResult();
    },
    execute(_input, context) {
      const summary = getTodayNutritionSummary(context.timestamp);

      if (!summary) {
        return {
          mealsCount: 0,
          totalCalories: null,
          totalProtein: null,
          proteinTarget: null,
          totalVegetableGrams: null,
          unresolvedItems: [],
        };
      }

      return {
        mealsCount: summary.meals.length,
        totalCalories: summary.totalCalories,
        totalProtein: summary.totalProtein,
        proteinTarget: summary.proteinTarget,
        totalVegetableGrams: summary.totalVegetableGrams,
        unresolvedItems: [
          ...summary.proteinUnresolvedItems,
          ...summary.vegetableUnresolvedItems,
        ],
      };
    },
  },
  [TOOL_NAMES.LOG_SLEEP]: {
    name: TOOL_NAMES.LOG_SLEEP,
    description: 'Record one sleep event.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOG_SLEEP],
    confirmationPolicy: 'never',
    requiredFields: ['sleepStart', 'sleepEnd'],
    optionalFields: ['sleepQuality', 'note'],
    sideEffects: ['write-sleep-log'],
    validate(input: LogSleepInput) {
      const issues: ToolValidationIssue[] = [];

      if (!input.sleepStart.trim()) {
        issues.push(missingFieldIssue('sleepStart', '缺少睡眠开始时间。'));
      }

      if (!input.sleepEnd.trim()) {
        issues.push(missingFieldIssue('sleepEnd', '缺少睡眠结束时间。'));
      }

      return issues.length > 0
        ? clarifyValidationResult(issues)
        : okValidationResult();
    },
    execute(input, context) {
      const start = parseClockTime(input.sleepStart);
      const end = parseClockTime(input.sleepEnd);

      if (!start || !end) {
        throw new Error('sleep time must be HH:MM');
      }

      const isOvernight =
        start.hour > end.hour ||
        (start.hour === end.hour && start.minute > end.minute);
      const sleepStartAt = buildClockDate(
        context.timestamp,
        start.hour,
        start.minute,
        isOvernight ? -1 : 0,
      );
      const sleepEndAt = buildClockDate(
        context.timestamp,
        end.hour,
        end.minute,
      );
      const sleepHours = Number(
        (
          (sleepEndAt.getTime() - sleepStartAt.getTime()) /
          (1000 * 60 * 60)
        ).toFixed(1),
      );

      if (sleepHours <= 0 || sleepHours > 24) {
        throw new Error('sleep duration is out of range');
      }

      sleepLogRepository.logSleep(
        context.timestamp,
        sleepStartAt,
        sleepEndAt,
        sleepHours,
        input.sleepQuality ?? 'normal',
        input.note ?? '',
      );

      return {
        persisted: true,
        sleepHours,
        sleepQuality: input.sleepQuality ?? 'normal',
      };
    },
  },
  [TOOL_NAMES.LOG_WORKOUT]: {
    name: TOOL_NAMES.LOG_WORKOUT,
    description: 'Record one workout event.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOG_WORKOUT],
    confirmationPolicy: 'never',
    requiredFields: ['workoutName', 'durationMin'],
    optionalFields: ['workoutLevel', 'workoutVideoUrl', 'note'],
    sideEffects: ['write-workout-log'],
    validate(input: LogWorkoutInput) {
      const issues: ToolValidationIssue[] = [];

      if (!input.workoutName.trim()) {
        issues.push(missingFieldIssue('workoutName', '缺少运动名称。'));
      }

      if (input.durationMin === null || input.durationMin === undefined) {
        issues.push(missingFieldIssue('durationMin', '缺少运动时长。'));
      } else if (
        !Number.isFinite(input.durationMin) ||
        input.durationMin <= 0
      ) {
        issues.push(
          invalidValueIssue('durationMin', '运动时长必须是大于 0 的数字。'),
        );
      }

      return issues.length > 0
        ? clarifyValidationResult(issues)
        : okValidationResult();
    },
    execute(input, context) {
      const durationMin = input.durationMin ?? null;

      if (durationMin === null) {
        throw new Error('durationMin is required');
      }

      workoutLogRepository.logWorkout(
        context.timestamp,
        input.workoutName,
        durationMin,
        input.workoutLevel ?? 'medium',
        input.note ?? '',
        input.workoutVideoUrl ?? '',
      );

      return {
        persisted: true,
        workoutName: input.workoutName,
        durationMin,
      };
    },
  },
  [TOOL_NAMES.LOG_STATUS]: {
    name: TOOL_NAMES.LOG_STATUS,
    description: 'Record a status-type event such as poo, period, or symptom.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOG_STATUS],
    confirmationPolicy: 'never',
    requiredFields: ['entryType'],
    optionalFields: ['value', 'unit', 'cycleDay', 'note'],
    sideEffects: ['write-status-log'],
    validate(input: LogStatusInput) {
      if (!input.entryType) {
        return clarifyValidationResult([
          missingFieldIssue('entryType', '缺少状态记录类型。'),
        ]);
      }

      if (
        (input.entryType === 'symptom' || input.entryType === 'medication') &&
        input.value === undefined &&
        !input.note?.trim()
      ) {
        return clarifyValidationResult([
          missingFieldIssue('value', '这类状态记录至少要有症状或药物内容。'),
        ]);
      }

      return okValidationResult();
    },
    execute(input, context) {
      statusLogRepository.logEntry(context.timestamp, {
        entryType: input.entryType,
        value: normalizeStatusValue(input),
        unit: input.unit,
        note: input.note,
        cycleDay: input.cycleDay,
      });

      return {
        persisted: true,
        entryType: input.entryType,
      };
    },
  },
  [TOOL_NAMES.LOG_REFERENCE]: {
    name: TOOL_NAMES.LOG_REFERENCE,
    description: 'Write one nutrition reference entry into Ref_Calories.',
    category: 'write',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOG_REFERENCE],
    confirmationPolicy: 'never',
    requiredFields: ['foodName', 'caloriesKcal'],
    optionalFields: [
      'brand',
      'servingSize',
      'servingUnit',
      'proteinG',
      'fatG',
      'carbsG',
      'source',
      'note',
    ],
    sideEffects: ['write-ref-calories'],
    validate(input: LogReferenceInput) {
      const issues: ToolValidationIssue[] = [];

      if (!input.foodName.trim()) {
        issues.push(missingFieldIssue('foodName', '缺少参考条目的食物名称。'));
      }

      if (
        input.caloriesKcal === null ||
        input.caloriesKcal === undefined ||
        !Number.isFinite(input.caloriesKcal) ||
        input.caloriesKcal < 0
      ) {
        issues.push(
          invalidValueIssue('caloriesKcal', '热量必须是大于等于 0 的数字。'),
        );
      }

      if (
        input.servingSize !== null &&
        input.servingSize !== undefined &&
        (!Number.isFinite(input.servingSize) || input.servingSize <= 0)
      ) {
        issues.push(
          invalidValueIssue('servingSize', '份量必须是大于 0 的数字。'),
        );
      }

      return issues.length > 0
        ? clarifyValidationResult(issues)
        : okValidationResult();
    },
    execute(input, context) {
      const entry = refCaloriesRepository.logReference(context.timestamp, {
        foodName: input.foodName,
        brand: input.brand,
        servingSize: input.servingSize,
        servingUnit: input.servingUnit,
        caloriesKcal: input.caloriesKcal,
        proteinG: input.proteinG,
        fatG: input.fatG,
        carbsG: input.carbsG,
        source: input.source,
        note: input.note,
      });

      return {
        persisted: true,
        foodName: entry.food_name,
        brand: entry.brand,
        caloriesKcal: entry.calories_kcal,
      };
    },
  },
  [TOOL_NAMES.LOOKUP_REFERENCE]: {
    name: TOOL_NAMES.LOOKUP_REFERENCE,
    description: 'Lookup nutrition references by keyword.',
    category: 'read',
    supportedIntents: TOOL_INTENT_MAP[TOOL_NAMES.LOOKUP_REFERENCE],
    confirmationPolicy: 'never',
    requiredFields: [],
    optionalFields: ['query'],
    sideEffects: ['read-ref-calories'],
    validate(_input: LookupReferenceInput) {
      return okValidationResult();
    },
    execute(input): LookupReferenceOutput {
      const items = input.query?.trim()
        ? refCaloriesRepository.searchByKeyword(input.query)
        : refCaloriesRepository.listAll();

      return {
        resultCount: items.length,
        references: items.map((item) => ({
          foodRefId: item.id,
          foodName: item.name,
          brand: item.brand || undefined,
        })),
      };
    },
  },
};

export function getToolRegistry(): Record<ToolName, AnyToolContract> {
  return TOOL_REGISTRY;
}

export function getToolContract(name: ToolName): AnyToolContract {
  return TOOL_REGISTRY[name];
}

export function resolveToolNameForIntent(intent: AiIntent): ToolName | null {
  switch (intent) {
    case AI_INTENTS.FOOD:
    case AI_INTENTS.FOOD_ESTIMATE:
      return TOOL_NAMES.LOG_MEAL;
    case AI_INTENTS.WEIGHT:
      return TOOL_NAMES.LOG_BODY;
    case AI_INTENTS.STOCK_ADJUST:
    case AI_INTENTS.STOCK_SET:
      return TOOL_NAMES.ADJUST_STOCK;
    case AI_INTENTS.STOCK_CHECK:
      return TOOL_NAMES.LOOKUP_STOCK;
    case AI_INTENTS.NUTRITION_SUMMARY:
      return TOOL_NAMES.SUMMARIZE_NUTRITION;
    case AI_INTENTS.SLEEP:
      return TOOL_NAMES.LOG_SLEEP;
    case AI_INTENTS.WORKOUT:
      return TOOL_NAMES.LOG_WORKOUT;
    case AI_INTENTS.POO:
    case AI_INTENTS.PERIOD:
    case AI_INTENTS.SYMPTOM:
      return TOOL_NAMES.LOG_STATUS;
    default:
      return null;
  }
}

export function buildToolInputFromAiPlan(
  toolName: ToolName,
  plan: AiPlan,
  sourceText: string,
): ToolInputMap[ToolName] | null {
  switch (toolName) {
    case TOOL_NAMES.LOG_MEAL:
      return {
        sourceText,
        mealText: plan.mealText ?? sourceText,
        mealType: plan.mealType,
        estimatedCalories: null,
        parseStatus: 'pending',
        note: plan.note,
      } as ToolInputMap[ToolName];
    case TOOL_NAMES.LOG_BODY:
      return {
        weightKg: plan.weightKg,
        bmi: plan.bmi,
        bodyFatPct: plan.bodyFatPct,
        leanBodyMassKg: plan.leanBodyMassKg,
        source: 'manual',
        note: plan.note,
      } as ToolInputMap[ToolName];
    case TOOL_NAMES.ADJUST_STOCK: {
      const items = resolveAiStockItems(plan);

      if (items.length === 0) {
        return null;
      }

      return {
        operation: plan.intent === AI_INTENTS.STOCK_SET ? 'set' : 'adjust',
        items,
      } as ToolInputMap[ToolName];
    }
    case TOOL_NAMES.LOOKUP_STOCK:
      return {
        query: plan.stockQuery ?? normalizeLookupStockQuery(sourceText),
      } as ToolInputMap[ToolName];
    case TOOL_NAMES.SUMMARIZE_NUTRITION:
      return { scope: 'today' } as ToolInputMap[ToolName];
    case TOOL_NAMES.LOG_SLEEP:
      return {
        sleepStart: plan.sleepStart ?? '',
        sleepEnd: plan.sleepEnd ?? '',
        sleepQuality: plan.sleepQuality,
        note: plan.note,
      } as ToolInputMap[ToolName];
    case TOOL_NAMES.LOG_WORKOUT:
      return {
        workoutName: plan.workoutName ?? '',
        durationMin: plan.durationMin,
        workoutLevel: plan.workoutLevel,
        note: plan.note,
      } as ToolInputMap[ToolName];
    case TOOL_NAMES.LOG_STATUS:
      return {
        entryType:
          plan.intent === AI_INTENTS.POO
            ? 'bowel'
            : plan.intent === AI_INTENTS.PERIOD
              ? 'menstruation'
              : 'symptom',
        value: null,
        cycleDay: plan.cycleDay,
        note: plan.periodNote ?? plan.symptom ?? plan.note,
      } as ToolInputMap[ToolName];
    case TOOL_NAMES.LOG_REFERENCE:
      return null;
    case TOOL_NAMES.LOOKUP_REFERENCE:
      return { query: sourceText } as ToolInputMap[ToolName];
  }
}

export function validateAiPlanAgainstTool(
  plan: AiPlan,
  sourceText: string,
  context: ToolExecutionContext,
): {
  toolName: ToolName | null;
  input: ToolInputMap[keyof ToolInputMap] | null;
  validation: ReturnType<AnyToolContract['validate']> | null;
} {
  const toolName = resolveToolNameForIntent(plan.intent);

  if (!toolName) {
    return {
      toolName: null,
      input: null,
      validation: null,
    };
  }

  const input = buildToolInputFromAiPlan(toolName, plan, sourceText);

  if (!input) {
    return {
      toolName,
      input: null,
      validation: clarifyValidationResult([
        {
          code: 'clarification-required',
          message: AI_MESSAGES.INCOMPLETE_COMMAND,
        },
      ]),
    };
  }

  return {
    toolName,
    input,
    validation: getToolContract(toolName).validate(input as never, context),
  };
}
