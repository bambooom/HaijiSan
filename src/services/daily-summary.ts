import {
  buildTodayNutritionReply,
  getTodayNutritionSummary,
} from './nutrition-summary';
import {
  bodyLogTable,
  sleepLogTable,
  statusLogTable,
  workoutLogTable,
} from '../tables';

function formatDateLabel(timestamp: Date): string {
  return [
    timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0'),
  ].join('-');
}

function buildBodySection(timestamp: Date): {
  text: string | null;
  context: Record<string, unknown>;
} {
  const todayEntries = bodyLogTable.listByDate(timestamp);
  const recentEntries = bodyLogTable.listRecent(7);
  const latestTodayEntry =
    todayEntries.length > 0 ? todayEntries[todayEntries.length - 1] : null;

  if (!latestTodayEntry) {
    return {
      text: null,
      context: {
        todayCount: 0,
        recentWeightsKg: recentEntries
          .map((entry) => entry.weight_kg)
          .filter((value): value is number => typeof value === 'number'),
      },
    };
  }

  const previousWeight = recentEntries.find(
    (entry) =>
      entry.body_log_id !== latestTodayEntry.body_log_id &&
      typeof entry.weight_kg === 'number',
  )?.weight_kg;
  const weightDeltaText =
    typeof latestTodayEntry.weight_kg === 'number' &&
    typeof previousWeight === 'number'
      ? `，较上次 ${latestTodayEntry.weight_kg >= previousWeight ? '+' : ''}${Number((latestTodayEntry.weight_kg - previousWeight).toFixed(1))} kg`
      : '';

  return {
    text: `身体：体重 ${latestTodayEntry.weight_kg ?? '未知'} kg${weightDeltaText}；BMI ${latestTodayEntry.bmi ?? '未知'}；体脂 ${latestTodayEntry.body_fat_pct ?? '未知'}%。`,
    context: {
      todayCount: todayEntries.length,
      latest: latestTodayEntry,
      previousWeightKg: previousWeight ?? null,
    },
  };
}

function buildSleepSection(timestamp: Date): {
  text: string | null;
  context: Record<string, unknown>;
} {
  const todayEntries = sleepLogTable.listByDate(timestamp);
  const recentEntries = sleepLogTable.listRecent(7);
  const latestTodayEntry =
    todayEntries.length > 0 ? todayEntries[todayEntries.length - 1] : null;

  if (!latestTodayEntry) {
    return {
      text: null,
      context: {
        todayCount: 0,
        recentSleepHours: recentEntries
          .map((entry) => entry.sleep_hours)
          .filter((value): value is number => typeof value === 'number'),
      },
    };
  }

  return {
    text: `睡眠：${latestTodayEntry.sleep_start_at} - ${latestTodayEntry.sleep_end_at}，约 ${latestTodayEntry.sleep_hours ?? '未知'} 小时，质量 ${latestTodayEntry.sleep_quality}。`,
    context: {
      todayCount: todayEntries.length,
      latest: latestTodayEntry,
    },
  };
}

function buildWorkoutSection(timestamp: Date): {
  text: string | null;
  context: Record<string, unknown>;
} {
  const todayEntries = workoutLogTable.listByDate(timestamp);
  const recentEntries = workoutLogTable.listRecent(7);

  if (todayEntries.length === 0) {
    return {
      text: null,
      context: {
        todayCount: 0,
        recentWorkoutNames: recentEntries.map((entry) => entry.workout_name),
      },
    };
  }

  const totalDuration = todayEntries.reduce(
    (sum, entry) => sum + (entry.duration_min ?? 0),
    0,
  );
  const workoutNames = todayEntries
    .map((entry) => entry.workout_name)
    .join('、');

  return {
    text: `运动：今天共 ${todayEntries.length} 次，合计 ${totalDuration} 分钟；项目 ${workoutNames}。`,
    context: {
      todayCount: todayEntries.length,
      totalDurationMin: totalDuration,
      workouts: todayEntries,
      recentWorkoutNames: recentEntries.map((entry) => entry.workout_name),
    },
  };
}

function buildStatusSection(timestamp: Date): {
  text: string | null;
  context: Record<string, unknown>;
} {
  const todayEntries = statusLogTable.listByDate(timestamp);

  if (todayEntries.length === 0) {
    return {
      text: null,
      context: {
        todayCount: 0,
      },
    };
  }

  const fragments = todayEntries.map((entry) => {
    if (entry.entry_type === 'bowel') {
      return '排便已记录';
    }

    if (entry.entry_type === 'menstruation') {
      return entry.cycle_day === null
        ? '经期已记录'
        : `经期第 ${entry.cycle_day} 天`;
    }

    if (entry.entry_type === 'symptom') {
      return `症状 ${entry.value}`;
    }

    return `用药 ${entry.value}`;
  });

  return {
    text: `状态：${fragments.join('；')}。`,
    context: {
      todayCount: todayEntries.length,
      entries: todayEntries,
    },
  };
}

export function buildDailySummaryMessage(timestamp: Date): string {
  const nutritionSummary = getTodayNutritionSummary(timestamp);
  const bodySection = buildBodySection(timestamp);
  const sleepSection = buildSleepSection(timestamp);
  const workoutSection = buildWorkoutSection(timestamp);
  const statusSection = buildStatusSection(timestamp);

  const sections = [
    nutritionSummary ? buildTodayNutritionReply(nutritionSummary) : null,
    bodySection.text,
    sleepSection.text,
    workoutSection.text,
    statusSection.text,
  ].filter((section): section is string => Boolean(section));

  if (sections.length === 0) {
    return '今天还没有足够的数据可汇总。';
  }

  const deterministicSummary = sections.join('\n\n');
  return [`📋 今日总结 ${formatDateLabel(timestamp)}`, deterministicSummary]
    .filter((section): section is string => Boolean(section))
    .join('\n\n');
}
