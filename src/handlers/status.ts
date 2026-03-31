import { SLASH_COMMANDS } from '../constants/commands';
import { bodyLogRepository, statusLogRepository } from '../repositories';

function handleWeightCommand(text: string, timestamp: Date): string {
  const weight = text.match(/\d+(\.\d+)?/);

  if (!weight) {
    return '请输入正确的体重数字，例如：/weight 55';
  }

  bodyLogRepository.logWeight(timestamp, weight[0]);
  return `✅ 体重 ${weight[0]}kg 已记录。稳住节奏，清晨的空气正适合奔跑。`;
}

function handlePooCommand(timestamp: Date): string {
  statusLogRepository.logBowel(timestamp);
  return '✅ 代谢记录完毕。身体越轻盈，心情也会越透彻。';
}

function handlePeriodCommand(text: string, timestamp: Date): string {
  const rawContent = text.slice(SLASH_COMMANDS.PERIOD.length).trim();

  if (!rawContent) {
    statusLogRepository.logMenstruation(timestamp);
    return '✅ 经期状态已记录。';
  }

  const parts = rawContent.split(/\s+/);
  const cycleDay = /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
  const note = cycleDay === null ? rawContent : parts.slice(1).join(' ').trim();

  statusLogRepository.logMenstruation(timestamp, cycleDay, note);

  if (cycleDay !== null) {
    return `✅ 经期状态已记录，周期第 ${cycleDay} 天。`;
  }

  return '✅ 经期状态已记录。';
}

function handleSymptomCommand(text: string, timestamp: Date): string {
  const rawContent = text.slice(SLASH_COMMANDS.SYMPTOM.length).trim();

  if (!rawContent) {
    return '请输入症状内容，例如：/symptom 头痛';
  }

  const dayMatch = rawContent.match(/(?:^|\s)day\s*(\d+)$/i);
  const cycleDay = dayMatch ? Number(dayMatch[1]) : null;
  const symptom = dayMatch
    ? rawContent.replace(/(?:^|\s)day\s*\d+$/i, '').trim()
    : rawContent;

  if (!symptom) {
    return '请输入症状内容，例如：/symptom 头痛';
  }

  statusLogRepository.logSymptom(timestamp, symptom, '', cycleDay);

  if (cycleDay !== null) {
    return `✅ 症状 ${symptom} 已记录，周期第 ${cycleDay} 天。`;
  }

  return `✅ 症状 ${symptom} 已记录。`;
}

export function handleStatusCommand(
  text: string,
  timestamp: Date,
): string | null {
  if (text.startsWith(SLASH_COMMANDS.WEIGHT)) {
    return handleWeightCommand(text, timestamp);
  }

  if (text.startsWith(SLASH_COMMANDS.POO)) {
    return handlePooCommand(timestamp);
  }

  if (text.startsWith(SLASH_COMMANDS.PERIOD)) {
    return handlePeriodCommand(text, timestamp);
  }

  if (text.startsWith(SLASH_COMMANDS.SYMPTOM)) {
    return handleSymptomCommand(text, timestamp);
  }

  return null;
}
