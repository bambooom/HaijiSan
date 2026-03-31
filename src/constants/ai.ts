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

export const AI_MESSAGES = {
  NO_PENDING_ACTION: '现在没有待确认的操作，不需要取消。',
  PENDING_ACTION_CANCELLED:
    '好，这一步先不写。我已经把刚才的待确认操作取消了。',
  PENDING_ACTION_FAILED:
    '我收到了确认，但这次实际写入没有成功。刚才那步已经停住了，你可以重新发一次。',
  INCOMPLETE_COMMAND:
    '我理解到你想记录内容，但关键信息还不够。你再补一句具体数值或时间。',
  COMMAND_EXECUTION_FAILED:
    '我理解到了你的意图，但这次还没能安全落成记录。你可以换一种更具体的说法，或者直接用 /help 里的命令。',
} as const;
