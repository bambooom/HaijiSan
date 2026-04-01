import { describe, expect, it } from 'vitest';

import { buildAiErrorReply } from './ai-error';

describe('buildAiErrorReply', () => {
  it('returns a clearer reply for Gemini 503 high-demand errors', () => {
    expect(
      buildAiErrorReply(`Gemini API request failed (503): {
  "error": {
    "code": 503,
    "message": "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
    "status": "UNAVAILABLE"
  }
}`),
    ).toBe('AI 服务现在请求有点拥挤，稍等几十秒再试一次就行。');
  });

  it('returns a clearer reply for Gemini 429 rate-limit errors', () => {
    expect(
      buildAiErrorReply(`Gemini API request failed (429): {
  "error": {
    "code": 429,
    "message": "Quota exceeded.",
    "status": "RESOURCE_EXHAUSTED"
  }
}`),
    ).toBe('AI 服务这会儿触发了请求限制，稍后再试一次。');
  });

  it('returns a generic service message for unknown 5xx errors', () => {
    expect(
      buildAiErrorReply(
        'Gemini API request failed (500): {"error":{"code":500}}',
      ),
    ).toBe('AI 服务暂时不可用（500）。稍后再试一次。');
  });

  it('preserves a custom fallback for non-Gemini errors', () => {
    expect(buildAiErrorReply('Unexpected failure', '请重发完整信息。')).toBe(
      '请重发完整信息。',
    );
  });

  it('falls back to the default reply for non-Gemini errors', () => {
    expect(buildAiErrorReply('Unexpected failure')).toBe(
      '我刚才没能顺利处理这条消息。你也可以先继续使用 /help 里的命令。',
    );
  });
});
