export type GeminiFunctionCall = {
  id?: string;
  name?: string;
  args?: Record<string, unknown>;
};

export type GeminiInlinePart = {
  inline_data: {
    mime_type: string;
    data: string;
  };
};

export type GeminiTextPart = {
  text: string;
};

export type GeminiPart = {
  text?: string;
  functionCall?: GeminiFunctionCall;
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
  [key: string]: unknown;
};

export type GeminiContent = {
  role?: string;
  parts?: GeminiPart[];
  [key: string]: unknown;
};

export type GeminiResponse = {
  candidates?: Array<{
    content?: GeminiContent;
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

export type GeminiRequestOptions = {
  retryableStatusCodes: ReadonlySet<number>;
  retryDelaysMs: readonly number[];
  maxAttempts: number;
  failureLabel: string;
};
