import { GEMINI_API_KEY, GEMINI_MODEL } from '../../app-config';
import { GeminiRequestOptions } from '../../types';

export function getGeminiUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
}

export function sleepBeforeRetry(delayMs: number): void {
  if (
    typeof Utilities !== 'undefined' &&
    typeof Utilities.sleep === 'function'
  ) {
    Utilities.sleep(delayMs);
  }
}

export function isRetryableStatus(
  status: number,
  retryableStatusCodes: ReadonlySet<number>,
): boolean {
  return retryableStatusCodes.has(status);
}

export function executeGeminiRequest<TResponse>(
  payload: Record<string, unknown>,
  options: GeminiRequestOptions,
): TResponse {
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    const response = UrlFetchApp.fetch(getGeminiUrl(), {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify(payload),
    });
    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status >= 200 && status < 300) {
      return JSON.parse(body) as TResponse;
    }

    const shouldRetry =
      isRetryableStatus(status, options.retryableStatusCodes) &&
      attempt < options.maxAttempts - 1;

    if (!shouldRetry) {
      throw new Error(`${options.failureLabel} failed (${status}): ${body}`);
    }

    sleepBeforeRetry(options.retryDelaysMs[attempt] ?? 0);
  }

  throw new Error(`${options.failureLabel} failed after retries.`);
}
