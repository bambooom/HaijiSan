import { GEMINI_API_KEY, GEMINI_MODEL } from '../app-config';
import type {
  AiIntent,
  AiPlan,
  AiResponseMode,
  IngredientEstimateConfidence,
  IngredientEstimateInput,
  IngredientEstimateResult,
  MealReferenceFact,
  MealResolutionResult,
  MealResolvedItem,
  MealStructureResult,
  MealType,
  SleepQuality,
  WorkoutLevel,
} from '../types';

interface GeminiTextPart {
  text?: string;
}

interface GeminiContent {
  parts?: GeminiTextPart[];
}

interface GeminiCandidate {
  content?: GeminiContent;
}

interface GeminiGenerateContentResponse {
  candidates?: GeminiCandidate[];
}

interface IngredientEstimateEnvelope {
  items?: Array<Record<string, unknown>>;
}

interface MealStructureEnvelope {
  mealType?: unknown;
  mealText?: unknown;
  shouldPersist?: unknown;
  items?: Array<Record<string, unknown>>;
  note?: unknown;
}

interface MealResolutionEnvelope {
  mealType?: unknown;
  mealText?: unknown;
  shouldPersist?: unknown;
  estimatedCalories?: unknown;
  items?: Array<Record<string, unknown>>;
  note?: unknown;
}

const AI_RESPONSE_MODES = new Set<AiResponseMode>([
  'reply',
  'command',
  'clarify',
]);
const AI_INTENTS = new Set<AiIntent>([
  'chat',
  'weight',
  'poo',
  'period',
  'symptom',
  'sleep',
  'workout',
  'food',
  'food_estimate',
  'stock_adjust',
  'stock_set',
  'stock_check',
]);
const SLEEP_QUALITIES = new Set<SleepQuality>(['good', 'normal', 'poor']);
const WORKOUT_LEVELS = new Set<WorkoutLevel>(['easy', 'medium', 'hard']);
const MEAL_TYPES = new Set<MealType>(['breakfast', 'lunch', 'dinner', 'snack']);
const ESTIMATE_CONFIDENCES = new Set<IngredientEstimateConfidence>([
  'low',
  'medium',
  'high',
]);

function formatDateForPrompt(timestamp: Date): string {
  return [
    timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0'),
  ].join('-');
}

function buildSystemInstruction(timestamp: Date): string {
  return [
    '你是一个 Telegram 个人记录助手的自然语言理解层。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    `今天日期是 ${formatDateForPrompt(timestamp)}。`,
    '你的任务是在聊天回复和结构化记录意图之间做判断。',
    '可用 mode 只有 reply、command、clarify。',
    '可用 intent 只有 chat、weight、poo、period、symptom、sleep、workout、food、food_estimate、stock_adjust、stock_set、stock_check。',
    '如果是普通问答、闲聊、建议、解释，使用 mode=reply, intent=chat。',
    '如果用户明显在问一餐、一道食物或若干食材的大致热量，优先使用 mode=command, intent=food_estimate。',
    '如果信息不足以安全落成记录，使用 mode=clarify，并在 reply 里只追问缺失信息。',
    '如果信息足够明确，使用 mode=command，并只填写该 intent 需要的字段。',
    '当 mode=reply 或 mode=clarify 时，回复气质应当冷静、克制、可靠，像一位沉着的长跑队主将。',
    '当 mode=reply 或 mode=clarify 时，语气要温和但有分寸，带一点督促感和陪跑感，不要浮夸，不要油腻，不要过度煽情。',
    '当 mode=reply 或 mode=clarify 时，措辞尽量简洁，自然使用简体中文，可以有一点点鼓励，但要像成熟的队长在说话。',
    '当 mode=reply 或 mode=clarify 时，避免网络热梗、感叹号堆砌、连续颜文字、过多比喻和空泛安慰。',
    '当 mode=reply 或 mode=clarify 时，尽量控制在 1 到 3 句短句内，说完重点就停。',
    '当 mode=command 时，不要为了人设增加修饰，不要影响意图判断和字段准确性。',
    'sleepQuality 只能是 good、normal、poor。',
    'workoutLevel 只能是 easy、medium、hard。',
    'mealType 只能是 breakfast、lunch、dinner、snack。',
    'food_estimate 至少应填写 mealText；如果用户已经说明餐次，也可以填写 mealType。',
    'stockQuantity 在 stock_adjust 中使用正负数字，在 stock_set 中使用非负数字。',
    '不要发明不存在的能力，不要要求直接操作数据库，不要输出额外字段。',
    '回复语言使用简体中文，尽量简洁。',
  ].join('\n');
}

function buildIngredientEstimateInstruction(): string {
  return [
    '你是一个食物热量估算助手。',
    '输入会给你一个 items 数组，每一项都包含 itemName、quantity、unit。',
    '请基于常见食材知识给出粗略热量估算，允许不精确，但不要离谱。',
    '如果是常见食材，例如鸡蛋、菠菜、米饭、牛奶、苹果、香蕉等，应尽量给出估算。',
    'unit 可能是 g、ml，也可能是 个、颗、枚、盒、杯、碗、袋、片、根、只、瓶、罐 这类口语单位，你要按常见单个或单份大小做估算。',
    '如果确实无法判断，再返回 estimatedCalories=null。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    '返回格式必须是 {"items":[...]}，items 长度和顺序必须与输入一致。',
    '每个元素必须包含 estimatedCalories、confidence、note。',
    'confidence 只能是 low、medium、high。',
    'note 用简体中文简短说明依据，例如“按常见大号鸡蛋估算”或“按常见绿叶菜 100g 估算”。',
  ].join('\n');
}

function buildMealStructureInstruction(timestamp: Date): string {
  return [
    '你是一个中文饮食记录结构化抽取助手。',
    `今天日期是 ${formatDateForPrompt(timestamp)}。`,
    '输入是一整句自然语言，可能包含时间、餐次、动作、口语化描述。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    '返回格式必须是 {"mealType":"...","mealText":"...","shouldPersist":true|false,"items":[...],"note":"..."}。',
    'mealType 只能是 breakfast、lunch、dinner、snack。',
    'shouldPersist 表示这句话是否在描述用户实际吃了或喝了的一餐，应写入 Food_Log。',
    '如果用户是在问热量、比较、假设、计划或建议，而不是在描述实际进食，shouldPersist 应为 false。',
    'items 中每一项都必须包含 itemName、quantity、unit。',
    'quantity 必须是数字；如果原文是“一个”“两个”“半个”“一杯”“一盒”这类口语数量，也要换成数字。',
    'unit 可以使用 g、kg、ml、l、个、颗、枚、份、碗、袋、盒、杯、片、根、条、只、瓶、罐。',
    'mealText 应保留核心饮食内容，不要包含“我今天吃了”这类前缀。',
    '如果只能抽出部分项目，也照样返回能确定的 items，不要空想不存在的食材。',
    'note 用简体中文简短说明抽取中的不确定性；如果没有，可返回空字符串。',
  ].join('\n');
}

function buildMealResolutionInstruction(timestamp: Date): string {
  return [
    '你是一个中文餐食记录与热量估算助手。',
    `今天日期是 ${formatDateForPrompt(timestamp)}。`,
    '输入会给你一整句自然语言 originalText，以及一个 matchedReferences 数组。',
    'matchedReferences 表示应用层已经从本地 Ref_Calories 表中匹配到的食材热量事实，这些事实优先级最高，你必须优先使用，不要改写。',
    '对于 matchedReferences 中未覆盖的常见食材，你可以基于常识进行粗略估算。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    '返回格式必须是 {"mealType":"...","mealText":"...","shouldPersist":true|false,"estimatedCalories":123,"items":[...],"note":"..."}。',
    'mealType 只能是 breakfast、lunch、dinner、snack。',
    'shouldPersist 表示这句话是否在描述用户实际吃了或喝了的一餐，应写入 Food_Log。',
    '如果用户是在问热量、比较、计划、建议或假设，不是在描述实际进食，shouldPersist 应为 false。',
    'items 中每一项都必须包含 itemName、quantity、unit、estimatedCalories、source、note。',
    'source 只能是 reference 或 ai。凡是能够命中 matchedReferences 的项，source 必须为 reference。',
    'estimatedCalories 是该食材项目自己的热量，不是总热量。',
    'quantity 必须是数字；像“一个”“两个”“半个”“一杯”也要换成数字。',
    'unit 可以使用 g、kg、ml、l、个、颗、枚、份、碗、袋、盒、杯、片、根、条、只、瓶、罐。',
    'mealText 应保留核心饮食内容，不要包含“我今天吃了”这类前缀。',
    'estimatedCalories 应尽量等于 items 各项热量之和；如果无法严格一致，也应尽量接近。',
    'note 用简体中文简短说明整体不确定性；如果没有，可返回空字符串。',
  ].join('\n');
}

function stripCodeFence(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function parseJsonObject(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(stripCodeFence(text));

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Gemini response is not a JSON object');
  }

  return parsed as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== ''
    ? value.trim()
    : undefined;
}

function asNullableNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return undefined;
}

function asMode(value: unknown): AiResponseMode {
  if (
    typeof value === 'string' &&
    AI_RESPONSE_MODES.has(value as AiResponseMode)
  ) {
    return value as AiResponseMode;
  }

  return 'clarify';
}

function asIntent(value: unknown): AiIntent {
  if (typeof value === 'string' && AI_INTENTS.has(value as AiIntent)) {
    return value as AiIntent;
  }

  return 'chat';
}

function asSleepQuality(value: unknown): SleepQuality | undefined {
  if (typeof value === 'string' && SLEEP_QUALITIES.has(value as SleepQuality)) {
    return value as SleepQuality;
  }

  return undefined;
}

function asWorkoutLevel(value: unknown): WorkoutLevel | undefined {
  if (typeof value === 'string' && WORKOUT_LEVELS.has(value as WorkoutLevel)) {
    return value as WorkoutLevel;
  }

  return undefined;
}

function asMealType(value: unknown): MealType | undefined {
  if (typeof value === 'string' && MEAL_TYPES.has(value as MealType)) {
    return value as MealType;
  }

  return undefined;
}

function asEstimateConfidence(value: unknown): IngredientEstimateConfidence {
  if (
    typeof value === 'string' &&
    ESTIMATE_CONFIDENCES.has(value as IngredientEstimateConfidence)
  ) {
    return value as IngredientEstimateConfidence;
  }

  return 'medium';
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function asResolvedItemSource(value: unknown): 'reference' | 'ai' {
  return value === 'reference' ? 'reference' : 'ai';
}

function extractResponseText(response: GeminiGenerateContentResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();

  if (!text) {
    throw new Error('Gemini response did not contain text');
  }

  return text;
}

function normalizePlan(raw: Record<string, unknown>): AiPlan {
  const mode = asMode(raw.mode);
  const intent = asIntent(raw.intent);
  const reply =
    asString(raw.reply) ??
    (mode === 'clarify'
      ? '我还差一点关键信息。你再补充一下，我就能继续处理。'
      : '我先记下你的意思了。');

  return {
    mode,
    intent,
    reply,
    weightKg: asNullableNumber(raw.weightKg),
    cycleDay: asNullableNumber(raw.cycleDay),
    symptom: asString(raw.symptom),
    periodNote: asString(raw.periodNote),
    sleepStart: asString(raw.sleepStart),
    sleepEnd: asString(raw.sleepEnd),
    sleepQuality: asSleepQuality(raw.sleepQuality),
    workoutName: asString(raw.workoutName),
    durationMin: asNullableNumber(raw.durationMin),
    workoutLevel: asWorkoutLevel(raw.workoutLevel),
    mealType: asMealType(raw.mealType),
    mealText: asString(raw.mealText),
    stockItemName: asString(raw.stockItemName),
    stockQuantity: asNullableNumber(raw.stockQuantity),
    stockUnit: asString(raw.stockUnit),
    purchaseChannel: asString(raw.purchaseChannel),
    note: asString(raw.note),
  };
}

function postJsonRequest(
  systemInstruction: string,
  userText: string,
): Record<string, unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        parts: [{ text: userText }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  };
  const response = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`Gemini API request failed (${statusCode}): ${body}`);
  }

  const parsedResponse = JSON.parse(body) as GeminiGenerateContentResponse;
  const responseText = extractResponseText(parsedResponse);

  return parseJsonObject(responseText);
}

export class GeminiService {
  planMessage(message: string, timestamp: Date): AiPlan {
    return normalizePlan(
      postJsonRequest(buildSystemInstruction(timestamp), message),
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
    const rawItems = Array.isArray(raw.items) ? raw.items : [];

    return items.map((item, index) => {
      const rawItem = rawItems[index] ?? {};

      return {
        itemName: item.itemName,
        quantity: item.quantity,
        unit: item.unit,
        estimatedCalories: asNullableNumber(rawItem.estimatedCalories) ?? null,
        confidence: asEstimateConfidence(rawItem.confidence),
        note: asString(rawItem.note) ?? '',
      };
    });
  }

  extractMealStructure(
    message: string,
    timestamp: Date,
  ): MealStructureResult | null {
    const raw = postJsonRequest(
      buildMealStructureInstruction(timestamp),
      message,
    ) as MealStructureEnvelope;
    const mealType = asMealType(raw.mealType);
    const mealText = asString(raw.mealText);
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .map((item) => ({
        itemName: asString(item.itemName),
        quantity: asNullableNumber(item.quantity),
        unit: asString(item.unit),
      }))
      .filter(
        (
          item,
        ): item is {
          itemName: string;
          quantity: number;
          unit: string;
        } => {
          return (
            Boolean(item.itemName) &&
            typeof item.quantity === 'number' &&
            item.quantity > 0 &&
            Boolean(item.unit)
          );
        },
      );

    if (!mealType || !mealText) {
      return null;
    }

    return {
      mealType,
      mealText,
      shouldPersist: asBoolean(raw.shouldPersist),
      items,
      note: asString(raw.note) ?? '',
    };
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
    const mealType = asMealType(raw.mealType);
    const mealText = asString(raw.mealText);
    const estimatedCalories = asNullableNumber(raw.estimatedCalories) ?? null;
    const rawItems = Array.isArray(raw.items) ? raw.items : [];
    const items = rawItems
      .map((item) => ({
        itemName: asString(item.itemName),
        quantity: asNullableNumber(item.quantity),
        unit: asString(item.unit),
        estimatedCalories: asNullableNumber(item.estimatedCalories) ?? null,
        source: asResolvedItemSource(item.source),
        note: asString(item.note) ?? '',
      }))
      .filter((item): item is MealResolvedItem => {
        return (
          Boolean(item.itemName) &&
          typeof item.quantity === 'number' &&
          item.quantity > 0 &&
          Boolean(item.unit)
        );
      });

    if (!mealType || !mealText || items.length === 0) {
      return null;
    }

    return {
      mealType,
      mealText,
      shouldPersist: asBoolean(raw.shouldPersist),
      estimatedCalories,
      items,
      note: asString(raw.note) ?? '',
    };
  }
}

export const geminiService = new GeminiService();
