import type {
  AiPlan,
  HealthScreenshotExtractionResult,
  IngredientEstimateInput,
  IngredientEstimateResult,
  MealReferenceFact,
  MealResolutionResult,
  MealStructureResult,
  NutritionLabelReferenceResult,
} from '../../types';
import { postJsonPartsRequest, postJsonRequest } from './client';
import {
  parseHealthScreenshot,
  parseIngredientEstimateResults,
  parseMealResolution,
  parseMealStructure,
  parseNutritionLabelReference,
  normalizePlan,
} from './parsers';
import {
  buildClarificationFollowupInstruction,
  buildDailyInsightInstruction,
  buildHealthScreenshotInstruction,
  buildIngredientEstimateInstruction,
  buildMealResolutionInstruction,
  buildMealStructureInstruction,
  buildNutritionLabelInstruction,
  buildSystemInstruction,
} from './prompts';
import type {
  HealthScreenshotEnvelope,
  IngredientEstimateEnvelope,
  MealResolutionEnvelope,
  MealStructureEnvelope,
  NutritionLabelEnvelope,
} from './types';

export class GeminiService {
  planMessage(message: string, timestamp: Date, contextText?: string): AiPlan {
    return normalizePlan(
      postJsonRequest(buildSystemInstruction(timestamp, contextText), message),
    );
  }

  planClarificationFollowup(
    originalMessage: string,
    clarificationReply: string,
    followupMessage: string,
    partialPlan: AiPlan,
    timestamp: Date,
  ): AiPlan {
    return normalizePlan(
      postJsonRequest(
        buildClarificationFollowupInstruction(timestamp),
        JSON.stringify({
          originalMessage,
          assistantClarification: clarificationReply,
          partialPlan,
          followupMessage,
        }),
      ),
    );
  }

  estimateIngredientCalories(
    items: IngredientEstimateInput[],
  ): IngredientEstimateResult[] {
    if (items.length === 0) {
      return [];
    }

    const raw = postJsonRequest(
      buildIngredientEstimateInstruction(),
      JSON.stringify({ items }),
    ) as IngredientEstimateEnvelope;
    return parseIngredientEstimateResults(items, raw);
  }

  extractMealStructure(
    message: string,
    timestamp: Date,
  ): MealStructureResult | null {
    const raw = postJsonRequest(
      buildMealStructureInstruction(timestamp),
      message,
    ) as MealStructureEnvelope;

    return parseMealStructure(raw);
  }

  resolveMealRecord(
    message: string,
    timestamp: Date,
    matchedReferences: MealReferenceFact[],
  ): MealResolutionResult | null {
    const raw = postJsonRequest(
      buildMealResolutionInstruction(timestamp),
      JSON.stringify({
        originalText: message,
        matchedReferences,
      }),
    ) as MealResolutionEnvelope;

    return parseMealResolution(raw);
  }

  extractNutritionLabelReference(input: {
    base64Data: string;
    mimeType: string;
    caption?: string;
  }): NutritionLabelReferenceResult {
    const raw = postJsonPartsRequest(
      buildNutritionLabelInstruction(input.caption),
      [
        {
          text: input.caption?.trim()
            ? `请结合这张图片和这段补充文字一起提取：${input.caption.trim()}`
            : '请提取这张商品包装图中的营养成分表。',
        },
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.base64Data,
          },
        },
      ],
    ) as NutritionLabelEnvelope;

    return parseNutritionLabelReference(raw);
  }

  extractHealthScreenshot(input: {
    base64Data: string;
    mimeType: string;
    caption?: string;
    timestamp: Date;
  }): HealthScreenshotExtractionResult {
    const raw = postJsonPartsRequest(
      buildHealthScreenshotInstruction(input.timestamp, input.caption),
      [
        {
          text: input.caption?.trim()
            ? `请结合这张图片和这段补充文字一起提取：${input.caption.trim()}`
            : '请识别这张健康类截图或照片，并按指定 JSON 返回。',
        },
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.base64Data,
          },
        },
      ],
    ) as HealthScreenshotEnvelope;

    return parseHealthScreenshot(raw);
  }

  generateDailyInsight(input: {
    timestamp: Date;
    deterministicSummary: string;
    context: Record<string, unknown>;
  }): string | null {
    const raw = postJsonRequest(
      buildDailyInsightInstruction(input.timestamp),
      JSON.stringify({
        deterministicSummary: input.deterministicSummary,
        context: input.context,
      }),
    );
    const insight = raw.insight;

    return typeof insight === 'string' && insight.trim() !== ''
      ? insight.trim()
      : null;
  }
}

export const geminiService = new GeminiService();
