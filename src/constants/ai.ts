export const AI_INTENTS = {
  CHAT: 'chat',
  WEIGHT: 'weight',
  POO: 'poo',
  PERIOD: 'period',
  SYMPTOM: 'symptom',
  SLEEP: 'sleep',
  WORKOUT: 'workout',
  FOOD: 'food',
  FOOD_ESTIMATE: 'food_estimate',
  NUTRITION_SUMMARY: 'nutrition_summary',
  STOCK_ADJUST: 'stock_adjust',
  STOCK_SET: 'stock_set',
  STOCK_CHECK: 'stock_check',
} as const;

export type AiIntentValue = (typeof AI_INTENTS)[keyof typeof AI_INTENTS];

export const AI_INTENT_VALUES = Object.values(AI_INTENTS) as AiIntentValue[];

export const AI_CONFIRMATION_PATTERN =
  /^(确认|确认一下|确认吧|好|好的|ok|okay|yes)$/i;

export const AI_CANCELLATION_PATTERN =
  /^(取消|取消一下|取消吧|算了|不要了|no)$/i;

export const AI_NOTE_MAX_LENGTH = 500;

export const AI_CONFIRMATION_GUIDE = '回复“确认”写入，回复“取消”放弃。';

export const AI_CLARIFICATION_FOLLOWUP_MAX_LENGTH = 24;

export const AI_CLARIFICATION_CORRECTION_PATTERN =
  /^(不是|改成|改为|其实是|应该是|更正|补充|再加|还有|修正一下)/;

export const AI_CLARIFICATION_VALUE_PATTERN =
  /^(?:\d{1,2}:\d{2}(?:\s+\d{1,2}:\d{2})?(?:\s+\S+)?|\d+(?:\.\d+)?\s?(?:kg|g|ml|l|分钟|min|天|日|个|颗|枚|盒|杯|碗|袋|片|根|只|瓶|罐)?|第\s*\d+\s*[天日]|早餐|早饭|午餐|午饭|中饭|晚餐|晚饭|加餐|夜宵|宵夜|零食)$/i;

export const AI_CLARIFICATION_NEW_TOPIC_PATTERN =
  /^(今天|我想|想聊|聊聊|帮我|为什么|怎么|可以|能不能|要不要)/;

export const AI_MESSAGES = {
  NO_PENDING_ACTION: '现在没有待确认的操作，不需要取消。',
  NO_PENDING_CONFIRMATION: '现在没有待确认的操作，不需要再确认。',
  PENDING_ACTION_CANCELLED: '已取消刚才的待确认操作。',
  PENDING_ACTION_BLOCKED: '我这里还有一条待确认的操作。',
  PENDING_ACTION_CONFIRMING: '刚才那条确认正在处理中，我先不重复写入。',
  PENDING_ACTION_ALREADY_CONFIRMED:
    '刚才那条确认已经处理过了，我不再重复写入。',
  PENDING_ACTION_FAILED: '我收到了确认，但这次写入没有成功。你可以重新发一次。',
  MEAL_RECORD_WRITTEN: '已按刚才的预览写入。',
  MEAL_RECORD_SYNC_NONE: '这次没有同步到库存项。',
  INCOMPLETE_COMMAND:
    '我知道你想记录内容，但关键信息还不够。再补一句具体数值或时间就可以。',
  COMMAND_EXECUTION_FAILED:
    '我理解到了你的意图，但这次没有成功记录。你可以换一种更具体的说法，或者直接用 /help 里的命令。',
  CLARIFICATION_FOLLOWUP_FAILED:
    '刚才这次补充没有处理成功。你可以直接把完整信息重发一遍。',
} as const;
