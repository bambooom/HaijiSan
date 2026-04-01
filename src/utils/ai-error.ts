const DEFAULT_AI_ERROR_REPLY =
  '我刚才没能顺利处理这条消息。你也可以先继续使用 /help 里的命令。';

type GeminiApiError = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

export function buildAiErrorReply(
  rawMessage: string,
  fallbackReply = DEFAULT_AI_ERROR_REPLY,
): string {
  const geminiError = parseGeminiApiError(rawMessage);

  if (!geminiError) {
    return fallbackReply;
  }

  const { code, message } = geminiError;

  if (code === 503) {
    return 'AI 服务现在请求有点拥挤，稍等几十秒再试一次就行。';
  }

  if (code === 429) {
    return 'AI 服务这会儿触发了请求限制，稍后再试一次。';
  }

  if (code >= 500) {
    return `AI 服务暂时不可用（${code}）。稍后再试一次。`;
  }

  if (code >= 400 && message) {
    return `AI 这次没有顺利处理成功（${code}）。${normalizeAiErrorMessage(message)}`;
  }

  return fallbackReply;
}

function parseGeminiApiError(
  rawMessage: string,
): { code: number; message: string; status: string } | null {
  const match = rawMessage.match(
    /^Gemini API request failed \((\d+)\):\s*([\s\S]+)$/,
  );

  if (!match) {
    return null;
  }

  const code = Number(match[1]);

  if (!Number.isFinite(code)) {
    return null;
  }

  try {
    const parsed = JSON.parse(match[2]) as GeminiApiError;
    const message = parsed.error?.message?.trim() ?? '';
    const status = parsed.error?.status?.trim() ?? '';

    return {
      code,
      message,
      status,
    };
  } catch {
    return {
      code,
      message: '',
      status: '',
    };
  }
}

function normalizeAiErrorMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}
