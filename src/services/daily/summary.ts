import {
  buildTodayNutritionReply,
  getTodayNutritionSummary,
} from './nutrition';
import { buildDailyInsight } from './insight';
import {
  bodyLogTable,
  sleepLogTable,
  statusLogTable,
  workoutLogTable,
} from '../../tables';
import { formatDateLabel, escapeHtml } from '../../utils/value';

type DailySummarySection = {
  text: string;
};

function formatSectionAsHtml(section: string): string {
  const [heading, ...bodyLines] = section.split('\n');
  const body = bodyLines.map((line) => escapeHtml(line)).join('\n');

  return body
    ? `<b>${escapeHtml(heading)}</b>\n${body}`
    : `<b>${escapeHtml(heading)}</b>`;
}

function buildDailySummarySections(timestamp: Date): {
  sections: DailySummarySection[];
  aiInsight: string | null;
} {
  const nutritionSummary = getTodayNutritionSummary(timestamp);
  const bodySection = buildBodySection(timestamp);
  const sleepSection = buildSleepSection(timestamp);
  const workoutSection = buildWorkoutSection(timestamp);
  const statusSection = buildStatusSection(timestamp);

  const sections = [
    nutritionSummary
      ? { text: `🍽️ 饮食\n${buildTodayNutritionReply(nutritionSummary)}` }
      : null,
    bodySection.text ? { text: bodySection.text } : null,
    sleepSection.text ? { text: sleepSection.text } : null,
    workoutSection.text ? { text: workoutSection.text } : null,
    statusSection.text ? { text: statusSection.text } : null,
  ].filter((section): section is DailySummarySection => Boolean(section));

  const deterministicSummary = sections
    .map((section) => section.text)
    .join('\n\n');
  const aiInsight =
    sections.length > 0
      ? buildDailyInsight(timestamp, deterministicSummary)
      : null;

  return {
    sections,
    aiInsight,
  };
}

export function buildDailySummaryHtmlMessage(timestamp: Date): string {
  const { sections, aiInsight } = buildDailySummarySections(timestamp);

  if (sections.length === 0) {
    return '<b>📝 今日总结</b>\n今天还没有足够的数据可汇总。';
  }

  return [
    `<b>📋 今日总结 ${escapeHtml(formatDateLabel(timestamp))}</b>`,
    ...sections.map((section) => formatSectionAsHtml(section.text)),
    aiInsight ? formatSectionAsHtml(aiInsight) : null,
  ]
    .filter((section): section is string => Boolean(section))
    .join('\n\n');
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
    text: `⚖️ 身体\n体重 ${latestTodayEntry.weight_kg ?? '未知'} kg${weightDeltaText}；BMI ${latestTodayEntry.bmi ?? '未知'}；体脂 ${latestTodayEntry.body_fat_pct ?? '未知'}%。`,
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
    text: `😴 睡眠\n${latestTodayEntry.sleep_start_at} - ${latestTodayEntry.sleep_end_at}，约 ${latestTodayEntry.sleep_hours ?? '未知'} 小时，质量 ${latestTodayEntry.sleep_quality}。`,
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
    text: `🏋🏻 运动\n今天共 ${todayEntries.length} 次，合计 ${totalDuration} 分钟；项目 ${workoutNames}。`,
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
    text: `🩺 状态\n${fragments.join('；')}。`,
    context: {
      todayCount: todayEntries.length,
      entries: todayEntries,
    },
  };
}
