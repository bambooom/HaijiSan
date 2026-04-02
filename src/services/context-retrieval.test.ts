import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories', () => ({
  bodyLogRepository: {
    listRecent: vi.fn(),
  },
  foodLogRepository: {
    listRecent: vi.fn(),
  },
  refCaloriesRepository: {
    searchByKeyword: vi.fn(),
  },
  sleepLogRepository: {
    listRecent: vi.fn(),
  },
  statusLogRepository: {
    listRecent: vi.fn(),
  },
  stockRepository: {
    listStock: vi.fn(),
  },
  workoutLogRepository: {
    listRecent: vi.fn(),
  },
}));

import {
  bodyLogRepository,
  foodLogRepository,
  refCaloriesRepository,
  sleepLogRepository,
  statusLogRepository,
  stockRepository,
  workoutLogRepository,
} from '../repositories';
import {
  formatPlanningContext,
  retrievePlanningContext,
} from './context-retrieval';

describe('context retrieval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bodyLogRepository.listRecent).mockReturnValue([]);
    vi.mocked(foodLogRepository.listRecent).mockReturnValue([]);
    vi.mocked(refCaloriesRepository.searchByKeyword).mockReturnValue([]);
    vi.mocked(sleepLogRepository.listRecent).mockReturnValue([]);
    vi.mocked(statusLogRepository.listRecent).mockReturnValue([]);
    vi.mocked(stockRepository.listStock).mockReturnValue([]);
    vi.mocked(workoutLogRepository.listRecent).mockReturnValue([]);
  });

  it('attaches recent health context for lightweight health questions', () => {
    vi.mocked(bodyLogRepository.listRecent).mockReturnValue([
      {
        body_log_id: 'body_1',
        logged_at: '2026-04-02 08:00:00',
        weight_kg: 54.8,
        bmi: 20.2,
        body_fat_pct: 22.4,
        lean_body_mass_kg: 42.5,
        source: 'smart_scale',
        note: '',
      },
    ]);
    vi.mocked(sleepLogRepository.listRecent).mockReturnValue([
      {
        sleep_log_id: 'sleep_1',
        logged_at: '2026-04-02 07:10:00',
        sleep_start_at: '2026-04-01 23:30:00',
        sleep_end_at: '2026-04-02 07:10:00',
        sleep_hours: 7.7,
        sleep_quality: 'good',
        source: 'ios_health',
        note: '',
      },
    ]);
    vi.mocked(statusLogRepository.listRecent).mockReturnValue([
      {
        entry_id: 'status_1',
        logged_at: '2026-04-02 10:00:00',
        entry_type: 'symptom',
        value: '腹胀',
        unit: '',
        note: '',
        cycle_day: 2,
      },
    ]);
    vi.mocked(workoutLogRepository.listRecent).mockReturnValue([
      {
        workout_id: 'workout_1',
        logged_at: '2026-04-01 19:00:00',
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

    const context = retrievePlanningContext(
      '我最近状态怎么样，今天适合继续运动吗？',
      new Date('2026-04-02T12:00:00'),
    );

    expect(context.recentBodyMetrics).toHaveLength(1);
    expect(context.recentSleep).toHaveLength(1);
    expect(context.recentStatus).toHaveLength(1);
    expect(context.recentWorkouts).toHaveLength(1);

    const formatted = formatPlanningContext(context);
    expect(formatted).toContain('Recent body metrics:');
    expect(formatted).toContain('weight=54.8 kg');
    expect(formatted).toContain('Recent sleep:');
    expect(formatted).toContain('7.7 h, quality=good');
    expect(formatted).toContain('Recent status events:');
    expect(formatted).toContain('symptom=腹胀, cycleDay=2');
  });

  it('does not attach health context for unrelated casual chat', () => {
    const context = retrievePlanningContext(
      '你在吗，随便聊两句。',
      new Date('2026-04-02T12:00:00'),
    );

    expect(context.recentBodyMetrics).toEqual([]);
    expect(context.recentSleep).toEqual([]);
    expect(context.recentStatus).toEqual([]);
    expect(context.recentMeals).toEqual([]);
    expect(formatPlanningContext(context)).toBe('');
  });
});
