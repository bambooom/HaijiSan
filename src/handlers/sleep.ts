import { sleepLogRepository } from '../repositories';
import type { SleepQuality } from '../types';

type ParsedTime = {
  hour: number;
  minute: number;
  raw: string;
};

type ParsedSleepCommand = {
  sleepStartAt: Date;
  sleepEndAt: Date;
  sleepHours: number;
  sleepQuality: SleepQuality;
  note: string;
  startLabel: string;
  endLabel: string;
};

const SLEEP_QUALITY_ALIASES: Record<string, SleepQuality> = {
  good: 'good',
  great: 'good',
  well: 'good',
  hao: 'good',
  '好': 'good',
  '不错': 'good',
  normal: 'normal',
  ok: 'normal',
  medium: 'normal',
  ordinary: 'normal',
  '一般': 'normal',
  '还行': 'normal',
  poor: 'poor',
  bad: 'poor',
  '差': 'poor',
  '很差': 'poor',
};

const SLEEP_QUALITY_LABELS: Record<SleepQuality, string> = {
  good: '好',
  normal: '一般',
  poor: '差',
};

function parseTimeToken(token: string): ParsedTime | null {
  const match = token.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return null;
  }

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    raw: `${match[1].padStart(2, '0')}:${match[2]}`,
  };
}

function buildDate(
  baseDate: Date,
  hour: number,
  minute: number,
  dayOffset = 0,
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

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

function parseSleepCommand(
  text: string,
  timestamp: Date,
): ParsedSleepCommand | null {
  const rawContent = text.slice('/sleep'.length).trim();

  if (!rawContent) {
    return null;
  }

  const parts = rawContent.split(/\s+/);

  if (parts.length < 2) {
    return null;
  }

  const startTime = parseTimeToken(parts[0]);
  const endTime = parseTimeToken(parts[1]);

  if (!startTime || !endTime) {
    return null;
  }

  if (startTime.hour === endTime.hour && startTime.minute === endTime.minute) {
    return null;
  }

  let sleepQuality: SleepQuality = 'normal';
  let noteStartIndex = 2;
  const qualityToken = parts[2]?.toLowerCase();

  if (qualityToken && qualityToken in SLEEP_QUALITY_ALIASES) {
    sleepQuality = SLEEP_QUALITY_ALIASES[qualityToken];
    noteStartIndex = 3;
  }

  const note = parts.slice(noteStartIndex).join(' ').trim();
  const isOvernight =
    startTime.hour > endTime.hour ||
    (startTime.hour === endTime.hour && startTime.minute > endTime.minute);
  const sleepStartAt = buildDate(
    timestamp,
    startTime.hour,
    startTime.minute,
    isOvernight ? -1 : 0,
  );
  const sleepEndAt = buildDate(timestamp, endTime.hour, endTime.minute);
  const sleepHours = Number(
    (
      (sleepEndAt.getTime() - sleepStartAt.getTime()) /
      (1000 * 60 * 60)
    ).toFixed(1),
  );

  if (sleepHours <= 0 || sleepHours > 24) {
    return null;
  }

  return {
    sleepStartAt,
    sleepEndAt,
    sleepHours,
    sleepQuality,
    note,
    startLabel: startTime.raw,
    endLabel: endTime.raw,
  };
}

export function handleSleepCommand(
  text: string,
  timestamp: Date,
): string | null {
  if (!text.startsWith('/sleep')) {
    return null;
  }

  const parsed = parseSleepCommand(text, timestamp);

  if (!parsed) {
    return '格式错误。请使用：/sleep 23:30 07:30 好 或 /sleep 00:45 08:15';
  }

  sleepLogRepository.logSleep(
    timestamp,
    parsed.sleepStartAt,
    parsed.sleepEndAt,
    parsed.sleepHours,
    parsed.sleepQuality,
    parsed.note,
  );

  return `✅ 睡眠已记录，${parsed.startLabel} - ${parsed.endLabel}，共 ${formatHours(parsed.sleepHours)} 小时，质量${SLEEP_QUALITY_LABELS[parsed.sleepQuality]}。`;
}
