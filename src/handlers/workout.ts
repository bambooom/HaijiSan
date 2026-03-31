import { SLASH_COMMANDS } from '../constants/commands';
import { workoutLogRepository } from '../repositories';
import type { ParsedWorkoutCommand, WorkoutLevel } from '../types';

const WORKOUT_LEVEL_ALIASES: Record<string, WorkoutLevel> = {
  easy: 'easy',
  light: 'easy',
  '轻松': 'easy',
  '低强度': 'easy',
  medium: 'medium',
  normal: 'medium',
  moderate: 'medium',
  '中等': 'medium',
  '中强度': 'medium',
  hard: 'hard',
  intense: 'hard',
  high: 'hard',
  '高强度': 'hard',
  '困难': 'hard',
};

const WORKOUT_LEVEL_LABELS: Record<WorkoutLevel, string> = {
  easy: '轻松',
  medium: '中等',
  hard: '高强度',
};

export function handleWorkoutCommand(
  text: string,
  timestamp: Date,
): string | null {
  if (!text.startsWith(SLASH_COMMANDS.WORKOUT)) {
    return null;
  }

  const parsed = parseWorkoutCommand(text);

  if (!parsed) {
    return '格式错误。请使用：/workout 跑步 35 中等 或 /workout 帕梅拉燃脂 20 高强度';
  }

  workoutLogRepository.logWorkout(
    timestamp,
    parsed.workoutName,
    parsed.durationMin,
    parsed.workoutLevel,
    parsed.note,
    parsed.workoutVideoUrl,
  );

  return `✅ 运动 ${parsed.workoutName} 已记录，时长 ${parsed.durationMin} 分钟，强度${WORKOUT_LEVEL_LABELS[parsed.workoutLevel]}。`;
}

function parseWorkoutCommand(text: string): ParsedWorkoutCommand | null {
  const rawContent = text.slice(SLASH_COMMANDS.WORKOUT.length).trim();

  if (!rawContent) {
    return null;
  }

  const parts = rawContent.split(/\s+/);
  const durationIndex = parts.findIndex(
    (part) => parseDurationToken(part) !== null,
  );

  if (durationIndex <= 0) {
    return null;
  }

  const durationMin = parseDurationToken(parts[durationIndex]);

  if (durationMin === null) {
    return null;
  }

  const workoutName = parts.slice(0, durationIndex).join(' ').trim();

  if (!workoutName) {
    return null;
  }

  let workoutLevel: WorkoutLevel = 'medium';
  const trailingParts = parts.slice(durationIndex + 1);

  if (trailingParts[0]) {
    const maybeLevel = WORKOUT_LEVEL_ALIASES[trailingParts[0].toLowerCase()];

    if (maybeLevel) {
      workoutLevel = maybeLevel;
      trailingParts.shift();
    }
  }

  const urlIndex = trailingParts.findIndex((part) =>
    /^https?:\/\//i.test(part),
  );
  const workoutVideoUrl = urlIndex >= 0 ? trailingParts[urlIndex] : '';
  const note = trailingParts
    .filter((part, index) => index !== urlIndex)
    .join(' ')
    .trim();

  return {
    workoutName,
    durationMin,
    workoutLevel,
    note,
    workoutVideoUrl,
  };
}

function parseDurationToken(token: string): number | null {
  const match = token.match(
    /^(\d+(?:\.\d+)?)(?:m|min|mins|minute|minutes|分钟)?$/i,
  );

  if (!match) {
    return null;
  }

  const durationMin = Number(match[1]);

  if (Number.isNaN(durationMin) || durationMin <= 0) {
    return null;
  }

  return durationMin;
}
