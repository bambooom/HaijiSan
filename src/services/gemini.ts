import { GEMINI_API_KEY, GEMINI_MODEL } from '../app-config';
import { AI_INTENT_VALUES } from '../constants/ai';
import { buildPlanningFewShotExamples } from './gemini-few-shot';
import type {
  AiIntent,
  AiPlan,
  AiResponseMode,
  AiStockItem,
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

interface GeminiInlineDataPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

type GeminiRequestPart = GeminiTextPart | GeminiInlineDataPart;

interface GeminiContent {
  parts?: GeminiRequestPart[];
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

interface NutritionLabelEnvelope {
  foodName?: unknown;
  brand?: unknown;
  servingSize?: unknown;
  servingUnit?: unknown;
  caloriesKcal?: unknown;
  proteinG?: unknown;
  fatG?: unknown;
  carbsG?: unknown;
  confidence?: unknown;
  note?: unknown;
}

interface HealthScreenshotEnvelope extends NutritionLabelEnvelope {
  kind?: unknown;
  appSource?: unknown;
  weightKg?: unknown;
  bmi?: unknown;
  bodyFatPct?: unknown;
  leanBodyMassKg?: unknown;
  sleepStart?: unknown;
  sleepEnd?: unknown;
  sleepHours?: unknown;
  sleepQuality?: unknown;
  workoutName?: unknown;
  durationMin?: unknown;
  workoutLevel?: unknown;
  workoutCaloriesKcal?: unknown;
}

interface StockItemEnvelope {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  purchaseChannel?: unknown;
}

const AI_RESPONSE_MODES = new Set<AiResponseMode>([
  'reply',
  'command',
  'clarify',
]);
const AI_INTENTS = new Set<AiIntent>(AI_INTENT_VALUES);
const SLEEP_QUALITIES = new Set<SleepQuality>(['good', 'normal', 'poor']);
const WORKOUT_LEVELS = new Set<WorkoutLevel>(['easy', 'medium', 'hard']);
const MEAL_TYPES = new Set<MealType>(['breakfast', 'lunch', 'dinner', 'snack']);
const ESTIMATE_CONFIDENCES = new Set<IngredientEstimateConfidence>([
  'low',
  'medium',
  'high',
]);
const HEALTH_SCREENSHOT_KINDS = new Set([
  'nutrition_label',
  'body_metrics',
  'sleep_summary',
  'workout_summary',
  'unsupported',
] as const);

type HealthScreenshotKind =
  | 'nutrition_label'
  | 'body_metrics'
  | 'sleep_summary'
  | 'workout_summary'
  | 'unsupported';

function formatDateForPrompt(timestamp: Date): string {
  return [
    timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0'),
  ].join('-');
}

function roundConfidence(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function buildSystemInstruction(timestamp: Date, contextText?: string): string {
  const lines = [
    '你是一个 Telegram 个人记录助手的自然语言理解层。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    `今天日期是 ${formatDateForPrompt(timestamp)}。`,
    '你的任务是在聊天回复和结构化记录意图之间做判断。',
    '可用 mode 只有 reply、command、clarify。',
    '可用 intent 只有 chat、weight、poo、period、symptom、sleep、workout、food、food_estimate、nutrition_summary、stock_adjust、stock_set、stock_check。',
    'weight intent 用于身体指标记录，至少可填写 weightKg；如果用户明确给出，也可以同时填写 bmi、bodyFatPct、leanBodyMassKg。',
    '如果是普通问答、闲聊、建议、解释，使用 mode=reply, intent=chat。',
    '如果用户在问今天已经吃了多少热量、蛋白质够不够、蔬菜够不够、今天饮食总结这类需要读取当天记录的问题，优先使用 mode=command, intent=nutrition_summary。',
    '如果用户明显在问一餐、一道食物或若干食材的大致热量，优先使用 mode=command, intent=food_estimate。',
    '如果信息不足以安全落成记录，使用 mode=clarify，并在 reply 里只追问缺失信息。',
    '如果信息足够明确，使用 mode=command，并只填写该 intent 需要的字段。',
    '当 mode=reply 或 mode=clarify 时，回复应当冷静、简洁、直接。',
    '当 mode=reply 或 mode=clarify 时，不要使用过强的人设口吻，不要浮夸，不要油腻，不要过度煽情。',
    '当 mode=reply 或 mode=clarify 时，措辞自然使用简体中文，必要时可以简短提醒，但不要刻意鼓励或说教。',
    '当 mode=reply 或 mode=clarify 时，避免网络热梗、感叹号堆砌、连续颜文字、过多比喻和空泛安慰。',
    '当 mode=reply 或 mode=clarify 时，尽量控制在 1 到 3 句短句内，说完重点就停。',
    '当 mode=command 时，不要为了人设增加修饰，不要影响意图判断和字段准确性。',
    'sleepQuality 只能是 good、normal、poor。',
    'workoutLevel 只能是 easy、medium、hard。',
    'mealType 只能是 breakfast、lunch、dinner、snack。',
    'food_estimate 至少应填写 mealText；如果用户已经说明餐次，也可以填写 mealType。',
    'stock_check 用于查询库存；如果用户明确提到某个食材，也可以填写 stockQuery。',
    'stockQuantity 在 stock_adjust 中使用正负数字，在 stock_set 中使用非负数字。',
    '如果是库存变更且一句话里包含多项物品，优先填写 stockItems 数组；每项包含 name、quantity、unit、purchaseChannel。',
    'stockItems 在 stock_adjust 中使用正负数字，在 stock_set 中使用非负数字。',
    '如果只有单项库存，也可以继续填写 stockItemName、stockQuantity、stockUnit、purchaseChannel。',
    '不要发明不存在的能力，不要要求直接操作数据库，不要输出额外字段。',
    '回复语言使用简体中文，尽量简洁。',
    buildPlanningFewShotExamples(),
  ];

  if (contextText?.trim()) {
    lines.push(
      '以下是这条消息可参考的结构化上下文，只能作为辅助判断，不能覆盖用户当前明确表达：',
    );
    lines.push(contextText.trim());
  }

  return lines.join('\n');
}

function buildClarificationFollowupInstruction(timestamp: Date): string {
  return [
    buildSystemInstruction(timestamp),
    '你正在处理同一轮记录对话中的补充说明。',
    '输入会包含 originalMessage、assistantClarification、partialPlan、followupMessage。',
    '你要把 followupMessage 视为对 originalMessage 的补充或修正，并重新输出最终 JSON。',
    '如果 followupMessage 修正了原信息，以修正后的值为准。',
    '如果合并后信息仍不足以安全记录，可以继续返回 mode=clarify。',
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

function buildNutritionLabelInstruction(caption?: string): string {
  const lines = [
    '你是一个食品包装营养成分表 OCR 与结构化提取助手。',
    '输入包含一张商品包装图片，可能含有营养成分表、品牌名、商品名和规格。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    '返回格式必须是 {"foodName":"...","brand":"...","servingSize":100,"servingUnit":"g","caloriesKcal":123,"proteinG":1.2,"fatG":3.4,"carbsG":5.6,"confidence":0.8,"note":"..."}。',
    'caloriesKcal、proteinG、fatG、carbsG 都必须是最终可写入表格的数值，无法确认时返回 null。',
    '如果图片里热量使用 kJ，必须换算成 kcal，换算公式是 kJ / 4.184。',
    '优先返回每 100g 或每 100ml 的营养值；如果图里只有每份数据，再返回每份。',
    'servingUnit 只能返回 g、ml、份、个、包、瓶、罐 这类简单单位。',
    'foodName 应尽量是商品名或食物名，不要只写“营养成分表”。',
    'brand 可以为空字符串。',
    'confidence 取 0 到 1 之间的小数。',
    'note 用简体中文简短说明你采用了哪组口径，例如“按每100g换算”或“包装仅提供每份数据”。',
    '如果看不清楚或无法确认商品名与热量，foodName 或 caloriesKcal 至少有一个应为 null。',
  ];

  if (caption?.trim()) {
    lines.push(`补充文字提示：${caption.trim()}`);
  }

  return lines.join('\n');
}

function buildHealthScreenshotInstruction(
  timestamp: Date,
  caption?: string,
): string {
  const lines = [
    '你是一个健康类截图 OCR 与结构化提取助手。',
    `今天日期是 ${formatDateForPrompt(timestamp)}。`,
    '输入是一张截图或照片，可能来自体重秤、Apple Health、AutoSleep、运动应用，也可能是商品包装营养成分表。',
    '你只能输出一个 JSON 对象，不要输出 Markdown，不要输出代码块。',
    'kind 只能是 nutrition_label、body_metrics、sleep_summary、workout_summary、unsupported。',
    'appSource 尽量返回 smart_scale、ios_health、autosleep、workout_app、unknown 之一。',
    '返回格式必须是 {"kind":"...","appSource":"...","confidence":0.8,"foodName":null,"brand":"","servingSize":null,"servingUnit":"","caloriesKcal":null,"proteinG":null,"fatG":null,"carbsG":null,"weightKg":null,"bmi":null,"bodyFatPct":null,"leanBodyMassKg":null,"sleepStart":null,"sleepEnd":null,"sleepHours":null,"sleepQuality":null,"workoutName":null,"durationMin":null,"workoutLevel":null,"workoutCaloriesKcal":null,"note":"..."}。',
    'nutrition_label 用于商品包装营养成分表，尽量提取 foodName、brand、servingSize、servingUnit、caloriesKcal、proteinG、fatG、carbsG。',
    'body_metrics 用于体重和身体成分截图，尽量提取 weightKg、bmi、bodyFatPct、leanBodyMassKg。',
    'sleep_summary 用于睡眠截图，尽量提取 sleepStart、sleepEnd、sleepHours、sleepQuality。',
    'sleepStart 和 sleepEnd 优先返回 YYYY-MM-DD HH:mm；如果图里没有日期只有时间，也可以返回 HH:mm。',
    'sleepQuality 只能是 good、normal、poor 或 null。',
    'workout_summary 用于运动截图，尽量提取 workoutName、durationMin、workoutLevel、workoutCaloriesKcal。',
    'workoutLevel 只能是 easy、medium、hard 或 null。',
    '如果图片里热量使用 kJ，必须换算成 kcal，换算公式是 kJ / 4.184。',
    '如果无法可靠识别，就把 kind 设为 unsupported，并把 confidence 调低。',
    'note 用简体中文简短说明你的判断依据或不确定点。',
  ];

  if (caption?.trim()) {
    lines.push(`补充文字提示：${caption.trim()}`);
  }

  return lines.join('\n');
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

function asAiStockItem(value: unknown): AiStockItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const raw = value as StockItemEnvelope;
  const name = asString(raw.name);
  const quantity = asNullableNumber(raw.quantity);

  if (!name || typeof quantity !== 'number') {
    return null;
  }

  return {
    name,
    quantity,
    unit: asString(raw.unit),
    purchaseChannel: asString(raw.purchaseChannel),
  };
}

function asAiStockItems(value: unknown): AiStockItem[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const items = value
    .map((item) => asAiStockItem(item))
    .filter((item): item is AiStockItem => item !== null);

  return items.length > 0 ? items : undefined;
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

function asHealthScreenshotKind(value: unknown): HealthScreenshotKind {
  return typeof value === 'string' &&
    HEALTH_SCREENSHOT_KINDS.has(value as HealthScreenshotKind)
    ? (value as HealthScreenshotKind)
    : 'unsupported';
}

function extractResponseText(response: GeminiGenerateContentResponse): string {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => ('text' in part ? (part.text ?? '') : ''))
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
      : '我知道你的意思了。');

  const plan: AiPlan = {
    mode,
    intent,
    reply,
    weightKg: asNullableNumber(raw.weightKg),
    bmi: asNullableNumber(raw.bmi),
    bodyFatPct: asNullableNumber(raw.bodyFatPct),
    leanBodyMassKg: asNullableNumber(raw.leanBodyMassKg),
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
    stockQuery: asString(raw.stockQuery),
    stockItemName: asString(raw.stockItemName),
    stockQuantity: asNullableNumber(raw.stockQuantity),
    stockUnit: asString(raw.stockUnit),
    stockItems: asAiStockItems(raw.stockItems),
    purchaseChannel: asString(raw.purchaseChannel),
    note: asString(raw.note),
  };

  plan.confidence = computePlanConfidence(plan);

  return plan;
}

function computePlanConfidence(plan: AiPlan): number {
  if (plan.mode === 'reply') {
    return roundConfidence(plan.intent === 'chat' ? 0.92 : 0.72);
  }

  if (plan.mode === 'clarify') {
    return roundConfidence(plan.reply.trim() ? 0.8 : 0.55);
  }

  switch (plan.intent) {
    case 'weight':
      return roundConfidence(
        [plan.weightKg, plan.bmi, plan.bodyFatPct, plan.leanBodyMassKg].some(
          (value) => typeof value === 'number',
        )
          ? 0.95
          : 0.35,
      );
    case 'poo':
      return 0.95;
    case 'period':
      return roundConfidence(
        typeof plan.cycleDay === 'number' || Boolean(plan.periodNote)
          ? 0.8
          : 0.65,
      );
    case 'symptom':
      return roundConfidence(plan.symptom ? 0.82 : 0.4);
    case 'sleep':
      return roundConfidence(plan.sleepStart && plan.sleepEnd ? 0.9 : 0.35);
    case 'workout':
      return roundConfidence(
        plan.workoutName && typeof plan.durationMin === 'number' ? 0.88 : 0.38,
      );
    case 'food':
    case 'food_estimate':
      return roundConfidence(
        plan.mealText ? (plan.mealType ? 0.85 : 0.72) : 0.32,
      );
    case 'nutrition_summary':
      return 0.95;
    case 'stock_adjust':
    case 'stock_set': {
      const hasBatchItems =
        Array.isArray(plan.stockItems) && plan.stockItems.length > 0;
      const hasSingleItem = Boolean(
        plan.stockItemName && typeof plan.stockQuantity === 'number',
      );

      return roundConfidence(hasBatchItems || hasSingleItem ? 0.9 : 0.3);
    }
    case 'stock_check':
      return 0.95;
    case 'chat':
      return 0.9;
  }
}

function postJsonRequest(
  systemInstruction: string,
  userText: string,
): Record<string, unknown> {
  return postJsonPartsRequest(systemInstruction, [{ text: userText }]);
}

function postJsonPartsRequest(
  systemInstruction: string,
  parts: GeminiRequestPart[],
): Record<string, unknown> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;
  const payload = {
    systemInstruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [
      {
        parts,
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

  extractNutritionLabelReference(input: {
    base64Data: string;
    mimeType: string;
    caption?: string;
  }): {
    foodName: string | null;
    brand: string;
    servingSize: number | null;
    servingUnit: string;
    caloriesKcal: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbsG: number | null;
    confidence: number | null;
    note: string;
  } {
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

    return {
      foodName: asString(raw.foodName) ?? null,
      brand: asString(raw.brand) ?? '',
      servingSize: asNullableNumber(raw.servingSize) ?? null,
      servingUnit: asString(raw.servingUnit) ?? '',
      caloriesKcal: asNullableNumber(raw.caloriesKcal) ?? null,
      proteinG: asNullableNumber(raw.proteinG) ?? null,
      fatG: asNullableNumber(raw.fatG) ?? null,
      carbsG: asNullableNumber(raw.carbsG) ?? null,
      confidence: asNullableNumber(raw.confidence) ?? null,
      note: asString(raw.note) ?? '',
    };
  }

  extractHealthScreenshot(input: {
    base64Data: string;
    mimeType: string;
    caption?: string;
    timestamp: Date;
  }): {
    kind: HealthScreenshotKind;
    appSource: string;
    confidence: number | null;
    foodName: string | null;
    brand: string;
    servingSize: number | null;
    servingUnit: string;
    caloriesKcal: number | null;
    proteinG: number | null;
    fatG: number | null;
    carbsG: number | null;
    weightKg: number | null;
    bmi: number | null;
    bodyFatPct: number | null;
    leanBodyMassKg: number | null;
    sleepStart: string | null;
    sleepEnd: string | null;
    sleepHours: number | null;
    sleepQuality: SleepQuality | null;
    workoutName: string | null;
    durationMin: number | null;
    workoutLevel: WorkoutLevel | null;
    workoutCaloriesKcal: number | null;
    note: string;
  } {
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

    return {
      kind: asHealthScreenshotKind(raw.kind),
      appSource: asString(raw.appSource) ?? 'unknown',
      confidence: asNullableNumber(raw.confidence) ?? null,
      foodName: asString(raw.foodName) ?? null,
      brand: asString(raw.brand) ?? '',
      servingSize: asNullableNumber(raw.servingSize) ?? null,
      servingUnit: asString(raw.servingUnit) ?? '',
      caloriesKcal: asNullableNumber(raw.caloriesKcal) ?? null,
      proteinG: asNullableNumber(raw.proteinG) ?? null,
      fatG: asNullableNumber(raw.fatG) ?? null,
      carbsG: asNullableNumber(raw.carbsG) ?? null,
      weightKg: asNullableNumber(raw.weightKg) ?? null,
      bmi: asNullableNumber(raw.bmi) ?? null,
      bodyFatPct: asNullableNumber(raw.bodyFatPct) ?? null,
      leanBodyMassKg: asNullableNumber(raw.leanBodyMassKg) ?? null,
      sleepStart: asString(raw.sleepStart) ?? null,
      sleepEnd: asString(raw.sleepEnd) ?? null,
      sleepHours: asNullableNumber(raw.sleepHours) ?? null,
      sleepQuality: asSleepQuality(raw.sleepQuality) ?? null,
      workoutName: asString(raw.workoutName) ?? null,
      durationMin: asNullableNumber(raw.durationMin) ?? null,
      workoutLevel: asWorkoutLevel(raw.workoutLevel) ?? null,
      workoutCaloriesKcal: asNullableNumber(raw.workoutCaloriesKcal) ?? null,
      note: asString(raw.note) ?? '',
    };
  }
}

export const geminiService = new GeminiService();
