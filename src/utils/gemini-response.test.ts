import { describe, expect, it } from 'vitest';
import {
  extractGeminiResponseText,
  extractJsonObject,
  isRetryableStatusCode,
} from './gemini-response';

describe('gemini-response utils', () => {
  it('extracts plain text from Gemini responses', () => {
    expect(
      extractGeminiResponseText(
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'hello' }, { text: ' world' }],
              },
            },
          ],
        },
        'Gemini test',
      ),
    ).toBe('hello world');
  });

  it('extracts json payloads from fenced responses', () => {
    expect(extractJsonObject('```json\n{"ok":true}\n```', 'Gemini test')).toBe(
      '{"ok":true}',
    );
  });

  it('checks retryable status codes against a shared set', () => {
    expect(isRetryableStatusCode(429, new Set([429, 500]))).toBe(true);
    expect(isRetryableStatusCode(404, new Set([429, 500]))).toBe(false);
  });
});
