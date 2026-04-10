import type { GeminiResponse } from '../types';

export function extractGeminiResponseText(
  response: GeminiResponse,
  contextLabel: string,
): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  if (text) {
    return text;
  }

  if (response.promptFeedback?.blockReason) {
    throw new Error(
      `${contextLabel} blocked request: ${response.promptFeedback.blockReason}`,
    );
  }

  const finishReason = response.candidates?.[0]?.finishReason;

  throw new Error(
    finishReason
      ? `${contextLabel} returned no content. finishReason=${finishReason}`
      : `${contextLabel} returned no content.`,
  );
}

export function extractJsonObject(text: string, contextLabel: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error(`${contextLabel} did not return a JSON object.`);
}

export function isRetryableStatusCode(
  status: number,
  retryableStatusCodes: ReadonlySet<number>,
): boolean {
  return retryableStatusCodes.has(status);
}
