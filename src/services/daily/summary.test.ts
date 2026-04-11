import { beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, {
  __APP_CONFIG__: {
    SHEET_ID: 'test-sheet',
    BOT_TOKEN: 'test-bot-token',
    MY_CHAT_ID: 'test-chat-id',
    GEMINI_API_KEY: 'test-gemini-key',
    GEMINI_MODEL: 'test-gemini-model',
  },
});

const mocks = vi.hoisted(() => ({
  getTodayNutritionSummary: vi.fn(),
  buildTodayNutritionReply: vi.fn(),
  buildDailyInsight: vi.fn(),
  listBodyByDate: vi.fn(),
  listRecentBodies: vi.fn(),
  listSleepByDate: vi.fn(),
  listRecentSleep: vi.fn(),
  listWorkoutByDate: vi.fn(),
  listRecentWorkouts: vi.fn(),
  listStatusByDate: vi.fn(),
}));

vi.mock('./nutrition', () => ({
  getTodayNutritionSummary: mocks.getTodayNutritionSummary,
  buildTodayNutritionReply: mocks.buildTodayNutritionReply,
}));

vi.mock('./insight', () => ({
  buildDailyInsight: mocks.buildDailyInsight,
}));

vi.mock('../../tables', () => ({
  bodyLogTable: {
    listByDate: mocks.listBodyByDate,
    listRecent: mocks.listRecentBodies,
  },
  sleepLogTable: {
    listByDate: mocks.listSleepByDate,
    listRecent: mocks.listRecentSleep,
  },
  workoutLogTable: {
    listByDate: mocks.listWorkoutByDate,
    listRecent: mocks.listRecentWorkouts,
  },
  statusLogTable: {
    listByDate: mocks.listStatusByDate,
  },
}));

import { buildDailySummaryHtmlMessage } from './summary';

describe('daily summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listBodyByDate.mockReturnValue([]);
    mocks.listRecentBodies.mockReturnValue([]);
    mocks.listSleepByDate.mockReturnValue([]);
    mocks.listRecentSleep.mockReturnValue([]);
    mocks.listWorkoutByDate.mockReturnValue([]);
    mocks.listRecentWorkouts.mockReturnValue([]);
    mocks.listStatusByDate.mockReturnValue([]);
    mocks.buildDailyInsight.mockReturnValue(null);
  });

  it('builds a deterministic digest from recorded data', () => {
    mocks.getTodayNutritionSummary.mockReturnValue({
      meals: [{ food_log_id: '1' }],
      proteinStatus: 'low',
      proteinTarget: 66,
      totalProtein: 56.7,
      vegetableStatus: 'enough',
      totalVegetableGrams: 380,
      carbsStatus: 'moderate',
      totalCarbs: 19.1,
      carbCalorieShare: 0.1,
    });
    mocks.buildTodayNutritionReply.mockReturnValue(
      '今天共记录 2 餐，热量约 840 kcal。',
    );
    mocks.listBodyByDate.mockReturnValue([
      {
        body_log_id: 'body_2',
        logged_at: '2026-04-02 08:00:00',
        occurred_at: '2026-04-02 07:58:00',
        weight_kg: 54.8,
        bmi: 20.2,
        body_fat_pct: 22.4,
        lean_body_mass_kg: 42.5,
        source: 'smart_scale',
        note: '',
      },
    ]);
    mocks.listRecentBodies.mockReturnValue([
      {
        body_log_id: 'body_2',
        logged_at: '2026-04-02 08:00:00',
        occurred_at: '2026-04-02 07:58:00',
        weight_kg: 54.8,
        bmi: 20.2,
        body_fat_pct: 22.4,
        lean_body_mass_kg: 42.5,
        source: 'smart_scale',
        note: '',
      },
      {
        body_log_id: 'body_1',
        logged_at: '2026-04-01 08:00:00',
        occurred_at: '2026-04-01 07:55:00',
        weight_kg: 55.2,
        bmi: 20.4,
        body_fat_pct: 22.8,
        lean_body_mass_kg: 42.6,
        source: 'smart_scale',
        note: '',
      },
    ]);
    mocks.listSleepByDate.mockReturnValue([
      {
        sleep_log_id: 'sleep_1',
        logged_at: '2026-04-02 07:20:00',
        sleep_start_at: '2026-04-01 23:30:00',
        sleep_end_at: '2026-04-02 07:10:00',
        sleep_hours: 7.7,
        sleep_quality: 'good',
        source: 'ios_health',
        note: '',
      },
    ]);
    mocks.listWorkoutByDate.mockReturnValue([
      {
        workout_id: 'workout_1',
        logged_at: '2026-04-02 19:00:00',
        occurred_at: '2026-04-02 18:30:00',
        workout_name: '跑步',
        workout_video_url: '',
        workout_level: 'medium',
        duration_min: 35,
        avg_hr: null,
        max_hr: null,
        min_hr: null,
        calories_kcal: null,
        note: '',
      },
    ]);
    mocks.listRecentWorkouts.mockReturnValue([
      {
        workout_id: 'workout_1',
        logged_at: '2026-04-02 19:00:00',
        occurred_at: '2026-04-02 18:30:00',
        workout_name: '跑步',
        workout_video_url: '',
        workout_level: 'medium',
        duration_min: 35,
        avg_hr: null,
        max_hr: null,
        min_hr: null,
        calories_kcal: null,
        note: '',
      },
    ]);
    mocks.listStatusByDate.mockReturnValue([
      {
        entry_id: 'status_1',
        logged_at: '2026-04-02 11:00:00',
        occurred_at: '2026-04-02 10:45:00',
        entry_type: 'bowel',
        value: '4',
        unit: '',
        note: '',
        cycle_day: null,
      },
    ]);
    const result = buildDailySummaryHtmlMessage(
      new Date('2026-04-02T23:30:00'),
    );

    expect(result).toContain('📋 今日总结 2026-04-02');
    expect(result).toContain('🍽️ 饮食');
    expect(result).toContain('今天共记录 2 餐，热量约 840 kcal。');
    expect(result).toContain('⚖️ 身体');
    expect(result).toContain(
      '体重 54.8 kg，较上次 -0.4 kg；BMI 20.2；体脂 22.4%。',
    );
    expect(result).toContain('😴 睡眠');
    expect(result).toContain(
      '2026-04-01 23:30:00 - 2026-04-02 07:10:00，约 7.7 小时，质量 good。',
    );
    expect(result).toContain('🏋🏻 运动');
    expect(result).toContain('今天共 1 次，合计 35 分钟；项目 跑步。');
    expect(result).toContain('🩺 状态');
    expect(result).toContain('排便已记录。');
  });

  it('builds an HTML-rendered digest for Telegram formatting', () => {
    mocks.getTodayNutritionSummary.mockReturnValue({
      meals: [{ food_log_id: '1' }],
      proteinStatus: 'low',
      proteinTarget: 66,
      totalProtein: 56.7,
      vegetableStatus: 'enough',
      totalVegetableGrams: 380,
      carbsStatus: 'moderate',
      totalCarbs: 19.1,
      carbCalorieShare: 0.1,
    });
    mocks.buildTodayNutritionReply.mockReturnValue(
      '今天共记录 2 餐，热量约 840 kcal。',
    );
    mocks.buildDailyInsight.mockReturnValue(
      '💡 灰二的观察\n近几天 <稳定>，今天运动量中等。',
    );

    const result = buildDailySummaryHtmlMessage(
      new Date('2026-04-02T23:30:00'),
    );

    expect(result).toContain('<b>📋 今日总结 2026-04-02</b>');
    expect(result).toContain(
      '<b>🍽️ 饮食</b><br>今天共记录 2 餐，热量约 840 kcal。',
    );
    expect(result).toContain(
      '<b>💡 灰二的观察</b><br>近几天 &lt;稳定&gt;，今天运动量中等。',
    );
  });

  it('appends AI insight when it is available', () => {
    mocks.getTodayNutritionSummary.mockReturnValue({
      meals: [{ food_log_id: '1' }],
      proteinStatus: 'low',
      proteinTarget: 66,
      totalProtein: 56.7,
      vegetableStatus: 'enough',
      totalVegetableGrams: 380,
      carbsStatus: 'moderate',
      totalCarbs: 19.1,
      carbCalorieShare: 0.1,
    });
    mocks.buildTodayNutritionReply.mockReturnValue(
      '今天共记录 2 餐，热量约 840 kcal。',
    );
    mocks.buildDailyInsight.mockReturnValue(
      '💡 灰二的观察\n近几天睡眠整体稳定，今天运动量中等。',
    );

    const result = buildDailySummaryHtmlMessage(
      new Date('2026-04-02T23:30:00'),
    );

    expect(result).toContain('💡 灰二的观察');
    expect(result).toContain('近几天睡眠整体稳定，今天运动量中等。');
  });

  it('returns the empty-data fallback when nothing is available', () => {
    mocks.getTodayNutritionSummary.mockReturnValue(null);

    const result = buildDailySummaryHtmlMessage(
      new Date('2026-04-02T23:30:00'),
    );

    expect(result).toBe('<b>📝 今日总结</b><br>今天还没有足够的数据可汇总。');
  });
});
