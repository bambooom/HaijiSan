import {
  bodyLogRepository,
  foodLogRepository,
  refCaloriesRepository,
  sleepLogRepository,
  stockRepository,
  statusLogRepository,
  workoutLogRepository,
} from '../repositories';
import type {
  BodyLogEntry,
  FoodReference,
  FoodLogEntry,
  SleepLogEntry,
  StockListItem,
  StatusLogEntry,
  WorkoutLogEntry,
} from '../types';

export interface PlanningContext {
  recentMeals: Pick<
    FoodLogEntry,
    'logged_at' | 'meal_type' | 'meal_text' | 'estimated_calories'
  >[];
  recentWorkouts: Pick<
    WorkoutLogEntry,
    'logged_at' | 'workout_name' | 'duration_min'
  >[];
  recentBodyMetrics: Pick<
    BodyLogEntry,
    'logged_at' | 'weight_kg' | 'bmi' | 'body_fat_pct'
  >[];
  recentSleep: Pick<
    SleepLogEntry,
    'logged_at' | 'sleep_hours' | 'sleep_quality'
  >[];
  recentStatus: Pick<
    StatusLogEntry,
    'logged_at' | 'entry_type' | 'value' | 'cycle_day'
  >[];
  stockCandidates: StockListItem[];
  referenceCandidates: Pick<
    FoodReference,
    'id' | 'name' | 'brand' | 'calories'
  >[];
}

const CONTEXT_STOP_WORDS = new Set([
  '今天',
  '一下',
  '帮我',
  '记录',
  '更新',
  '还有',
  '多少',
  '我想',
  '可以',
  '能不能',
  '应该',
  '现在',
]);

function extractKeywords(text: string): string[] {
  const normalized = text.trim();
  const tokens = [
    ...(normalized.match(/[\u4e00-\u9fff]{2,8}/g) ?? []),
    ...(normalized.match(/[A-Za-z][A-Za-z0-9_-]{1,20}/g) ?? []),
  ];

  return [
    ...new Set(
      tokens
        .map((token) => token.trim())
        .filter((token) => token && !CONTEXT_STOP_WORDS.has(token)),
    ),
  ].slice(0, 6);
}

function includesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function shouldRetrieveMealContext(text: string): boolean {
  return includesAny(text, [
    /早餐|早饭|午餐|午饭|中饭|晚餐|晚饭|加餐|夜宵|宵夜|零食/,
    /吃了|喝了|热量|蛋白质|蔬菜|饮食|一餐/,
    /^\/food\b/i,
  ]);
}

function shouldRetrieveStockContext(text: string): boolean {
  return includesAny(text, [
    /库存|食材/,
    /^\/stock\b/i,
    /^\/setstock\b/i,
    /^\/check\b/i,
  ]);
}

function shouldRetrieveWorkoutContext(text: string): boolean {
  return includesAny(text, [/运动|跑步|跟练|workout/i, /^\/workout\b/i]);
}

function shouldRetrieveHealthContext(text: string): boolean {
  return includesAny(text, [
    /健康|状态|最近|这几天|恢复|疲劳|累|精神|建议|适合|需要注意/,
    /体重|体脂|bmi|睡眠|失眠|困|经期|姨妈|症状|腹痛|头痛|排便/,
    /减脂|增肌|控制饮食|吃够|吃多|碳水|蛋白|蔬菜/,
  ]);
}

function findStockCandidates(keywords: string[]): StockListItem[] {
  if (keywords.length === 0) {
    return [];
  }

  return stockRepository
    .listStock()
    .filter((item) => keywords.some((keyword) => item.name.includes(keyword)))
    .slice(0, 5);
}

function findReferenceCandidates(
  keywords: string[],
): Pick<FoodReference, 'id' | 'name' | 'brand' | 'calories'>[] {
  const merged = new Map<
    string,
    Pick<FoodReference, 'id' | 'name' | 'brand' | 'calories'>
  >();

  for (const keyword of keywords) {
    for (const match of refCaloriesRepository
      .searchByKeyword(keyword)
      .slice(0, 3)) {
      if (!merged.has(match.id)) {
        merged.set(match.id, {
          id: match.id,
          name: match.name,
          brand: match.brand,
          calories: match.calories,
        });
      }
    }
  }

  return [...merged.values()].slice(0, 6);
}

export function retrievePlanningContext(
  text: string,
  timestamp: Date,
): PlanningContext {
  const keywords = extractKeywords(text);
  const includeMeal = shouldRetrieveMealContext(text);
  const includeStock = shouldRetrieveStockContext(text);
  const includeWorkout = shouldRetrieveWorkoutContext(text);
  const includeHealth = shouldRetrieveHealthContext(text);

  return {
    recentMeals: includeMeal
      ? foodLogRepository.listRecent(timestamp, 3).map((meal) => ({
          logged_at: meal.logged_at,
          meal_type: meal.meal_type,
          meal_text: meal.meal_text,
          estimated_calories: meal.estimated_calories,
        }))
      : [],
    recentWorkouts: includeWorkout
      ? workoutLogRepository.listRecent(5).map((workout) => ({
          logged_at: workout.logged_at,
          workout_name: workout.workout_name,
          duration_min: workout.duration_min,
        }))
      : [],
    recentBodyMetrics: includeHealth
      ? bodyLogRepository.listRecent(3).map((entry) => ({
          logged_at: entry.logged_at,
          weight_kg: entry.weight_kg,
          bmi: entry.bmi,
          body_fat_pct: entry.body_fat_pct,
        }))
      : [],
    recentSleep: includeHealth
      ? sleepLogRepository.listRecent(3).map((entry) => ({
          logged_at: entry.logged_at,
          sleep_hours: entry.sleep_hours,
          sleep_quality: entry.sleep_quality,
        }))
      : [],
    recentStatus: includeHealth
      ? statusLogRepository.listRecent(5).map((entry) => ({
          logged_at: entry.logged_at,
          entry_type: entry.entry_type,
          value: entry.value,
          cycle_day: entry.cycle_day,
        }))
      : [],
    stockCandidates:
      includeMeal || includeStock ? findStockCandidates(keywords) : [],
    referenceCandidates: includeMeal ? findReferenceCandidates(keywords) : [],
  };
}

export function formatPlanningContext(context: PlanningContext): string {
  const sections: string[] = [];

  if (context.recentMeals.length > 0) {
    sections.push(
      [
        'Recent meals:',
        ...context.recentMeals.map(
          (meal) =>
            `- ${meal.logged_at}: ${meal.meal_type} ${meal.meal_text}${meal.estimated_calories === null ? '' : `, ${meal.estimated_calories} kcal`}`,
        ),
      ].join('\n'),
    );
  }

  if (context.recentWorkouts.length > 0) {
    sections.push(
      [
        'Recent workouts:',
        ...context.recentWorkouts.map(
          (workout) =>
            `- ${workout.logged_at}: ${workout.workout_name}${workout.duration_min === null ? '' : `, ${workout.duration_min} min`}`,
        ),
      ].join('\n'),
    );
  }

  if (context.recentBodyMetrics.length > 0) {
    sections.push(
      [
        'Recent body metrics:',
        ...context.recentBodyMetrics.map(
          (entry) =>
            `- ${entry.logged_at}: weight=${entry.weight_kg ?? 'unknown'} kg, BMI=${entry.bmi ?? 'unknown'}, bodyFat=${entry.body_fat_pct ?? 'unknown'}%`,
        ),
      ].join('\n'),
    );
  }

  if (context.recentSleep.length > 0) {
    sections.push(
      [
        'Recent sleep:',
        ...context.recentSleep.map(
          (entry) =>
            `- ${entry.logged_at}: ${entry.sleep_hours ?? 'unknown'} h, quality=${entry.sleep_quality}`,
        ),
      ].join('\n'),
    );
  }

  if (context.recentStatus.length > 0) {
    sections.push(
      [
        'Recent status events:',
        ...context.recentStatus.map(
          (entry) =>
            `- ${entry.logged_at}: ${entry.entry_type}=${String(entry.value)}${entry.cycle_day === null ? '' : `, cycleDay=${entry.cycle_day}`}`,
        ),
      ].join('\n'),
    );
  }

  if (context.stockCandidates.length > 0) {
    sections.push(
      [
        'Matching stock items:',
        ...context.stockCandidates.map(
          (item) => `- ${item.name}: ${item.amount}`,
        ),
      ].join('\n'),
    );
  }

  if (context.referenceCandidates.length > 0) {
    sections.push(
      [
        'Matching nutrition references:',
        ...context.referenceCandidates.map(
          (item) =>
            `- ${item.name}${item.brand ? ` (${item.brand})` : ''}, ${item.calories} kcal`,
        ),
      ].join('\n'),
    );
  }

  return sections.join('\n\n');
}
