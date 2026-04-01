import {
  AI_CLARIFICATION_CORRECTION_PATTERN,
  AI_CLARIFICATION_FOLLOWUP_MAX_LENGTH,
  AI_CLARIFICATION_NEW_TOPIC_PATTERN,
  AI_CLARIFICATION_VALUE_PATTERN,
} from '../../constants/ai';

export function buildClarificationSourceText(
  originalText: string,
  followupText: string,
): string {
  return `${originalText}\n补充说明：${followupText.trim()}`;
}

export function looksLikeClarificationFollowup(text: string): boolean {
  const trimmed = text.trim();

  if (!trimmed || trimmed.startsWith('/')) {
    return false;
  }

  if (AI_CLARIFICATION_CORRECTION_PATTERN.test(trimmed)) {
    return true;
  }

  if (AI_CLARIFICATION_NEW_TOPIC_PATTERN.test(trimmed)) {
    return false;
  }

  if (AI_CLARIFICATION_VALUE_PATTERN.test(trimmed)) {
    return true;
  }

  return (
    trimmed.length <= AI_CLARIFICATION_FOLLOWUP_MAX_LENGTH &&
    !/[。！？!?]/.test(trimmed)
  );
}