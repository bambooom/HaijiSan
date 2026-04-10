import type {
  IngredientEstimateConfidence,
  IngredientEstimateInput,
  IngredientEstimateResult,
  GeminiResponse,
} from '../../types';
import {
  extractGeminiResponseText as extractSharedGeminiResponseText,
  extractJsonObject as extractSharedJsonObject,
} from '../../utils/gemini-response';
import { asNullableNumber, asTrimmedString } from '../../utils/value';
import { executeGeminiRequest } from '../gemini/transport';
import { spreadsheetService } from '../spreadsheet';

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

export function estimateIngredientCalories(
  items: IngredientEstimateInput[],
  referenceTimestamp: Date,
): IngredientEstimateResult[] {
  if (items.length === 0) {
    return [];
  }

  const response = executeGeminiRequest<GeminiResponse>(
    buildPayload(items, referenceTimestamp),
    {
      retryableStatusCodes: ESTIMATION_RETRYABLE_STATUS_CODES,
      retryDelaysMs: ESTIMATION_RETRY_DELAYS_MS,
      maxAttempts: ESTIMATION_MAX_ATTEMPTS,
      failureLabel: 'Gemini food estimation',
    },
  );
  const text = extractSharedGeminiResponseText(
    response,
    'Gemini food estimation',
  );
  const parsed = JSON.parse(
    extractSharedJsonObject(text, 'Gemini food estimation'),
  ) as RawEstimateResponse;

  return items.map((item, index) =>
    normalizeEstimateItem(item, parsed.items?.[index]),
  );
}

function normalizeConfidence(value: unknown): IngredientEstimateConfidence {
  const normalized = asTrimmedString(value);

  return normalized === 'high' ||
    normalized === 'medium' ||
    normalized === 'low'
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
