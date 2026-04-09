import { GEMINI_API_KEY, GEMINI_MODEL } from '../app-config';
import type {
  IngredientEstimateConfidence,
  IngredientEstimateInput,
  IngredientEstimateResult,
} from '../types/food';
import { spreadsheetService } from './spreadsheet';

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
};

type RawEstimateItem = {
  itemName?: unknown;
  estimatedCalories?: unknown;
  confidence?: unknown;
  note?: unknown;
};

type RawEstimateResponse = {
  items?: RawEstimateItem[];
};

const ESTIMATION_RETRYABLE_STATUS_CODES = new Set([429, 500, 503]);

const ESTIMATION_RETRY_DELAYS_MS = [150, 300] as const;

const ESTIMATION_MAX_ATTEMPTS = 3;

function getGeminiUrl(): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
}

function sleepBeforeRetry(delayMs: number): void {
  if (
    typeof Utilities !== 'undefined' &&
    typeof Utilities.sleep === 'function'
  ) {
    Utilities.sleep(delayMs);
  }
}

function isRetryableStatus(status: number): boolean {
  return ESTIMATION_RETRYABLE_STATUS_CODES.has(status);
}

function callGemini(payload: Record<string, unknown>): GeminiResponse {
  for (let attempt = 0; attempt < ESTIMATION_MAX_ATTEMPTS; attempt += 1) {
    const response = UrlFetchApp.fetch(getGeminiUrl(), {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      payload: JSON.stringify(payload),
    });
    const status = response.getResponseCode();
    const body = response.getContentText();

    if (status >= 200 && status < 300) {
      return JSON.parse(body) as GeminiResponse;
    }

    const shouldRetry =
      isRetryableStatus(status) && attempt < ESTIMATION_MAX_ATTEMPTS - 1;

    if (!shouldRetry) {
      throw new Error(`Gemini food estimation failed (${status}): ${body}`);
    }

    sleepBeforeRetry(ESTIMATION_RETRY_DELAYS_MS[attempt] ?? 0);
  }

  throw new Error('Gemini food estimation failed after retries.');
}

function extractResponseText(response: GeminiResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();

  if (text) {
    return text;
  }

  if (response.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini food estimation blocked request: ${response.promptFeedback.blockReason}`,
    );
  }

  const finishReason = response.candidates?.[0]?.finishReason;

  throw new Error(
    finishReason
      ? `Gemini food estimation returned no content. finishReason=${finishReason}`
      : 'Gemini food estimation returned no content.',
  );
}

function extractJsonObject(text: string): string {
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

  throw new Error('Gemini food estimation did not return a JSON object.');
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const normalized = Number(value.trim());

    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeConfidence(value: unknown): IngredientEstimateConfidence {
  const normalized = asTrimmedString(value);

  return normalized === 'high' || normalized === 'medium' || normalized === 'low'
    ? normalized
    : 'low';
}

function buildSystemInstruction(referenceTimestamp: Date): string {
  const currentTimestamp = spreadsheetService.getTimestamp(
    false,
    referenceTimestamp,
  );

  return [
    'You estimate calories for unresolved meal items in a personal nutrition log.',
    `Current local timestamp: ${currentTimestamp}. Use it only as temporal context and never fabricate dates inside the output.`,
    'Return one JSON object only. Do not wrap it in markdown.',
    'Output shape: {"items":[{"itemName":"...","estimatedCalories":123,"confidence":"low|medium|high","note":"..."}]}',
    'Preserve the same item ordering as the input list.',
    'Estimate calories for the described quantity and unit when possible.',
    'If the quantity is vague, use a practical serving estimate and explain the assumption briefly in note.',
    'If you are not confident, lower confidence instead of pretending precision.',
    'Do not return negative calories or unsupported confidence labels.',
  ].join('\n\n');
}

function buildPayload(
  items: IngredientEstimateInput[],
  referenceTimestamp: Date,
): Record<string, unknown> {
  return {
    systemInstruction: {
      parts: [{ text: buildSystemInstruction(referenceTimestamp) }],
    },
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: `Estimate calories for these unresolved food items: ${JSON.stringify(items)}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };
}

function normalizeEstimateItem(
  input: IngredientEstimateInput,
  raw: RawEstimateItem | undefined,
): IngredientEstimateResult {
  return {
    ...input,
    estimatedCalories: asNullableNumber(raw?.estimatedCalories),
    confidence: normalizeConfidence(raw?.confidence),
    note: asTrimmedString(raw?.note),
  };
}

export function estimateIngredientCalories(
  items: IngredientEstimateInput[],
  referenceTimestamp: Date,
): IngredientEstimateResult[] {
  if (items.length === 0) {
    return [];
  }

  const response = callGemini(buildPayload(items, referenceTimestamp));
  const text = extractResponseText(response);
  const parsed = JSON.parse(extractJsonObject(text)) as RawEstimateResponse;

  return items.map((item, index) =>
    normalizeEstimateItem(item, parsed.items?.[index]),
  );
}