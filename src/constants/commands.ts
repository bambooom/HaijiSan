export const SLASH_COMMANDS = {
  START: '/start',
  HELP: '/help',
  CANCEL: '/cancel',
  DIGEST_ON: '/digeston',
  DIGEST_OFF: '/digestoff',
  DIGEST_STATUS: '/digeststatus',
  WEIGHT: '/weight',
  POO: '/poo',
  PERIOD: '/period',
  SYMPTOM: '/symptom',
  SLEEP: '/sleep',
  WORKOUT: '/workout',
  STOCK: '/stock',
  SET_STOCK: '/setstock',
  CHECK: '/check',
  FOOD: '/food',
  REFERENCE: '/ref',
} as const;

export type StockMutationCommand =
  | typeof SLASH_COMMANDS.STOCK
  | typeof SLASH_COMMANDS.SET_STOCK;

export const START_HELP_COMMANDS = [
  SLASH_COMMANDS.START,
  SLASH_COMMANDS.HELP,
] as const;

export const DIGEST_COMMANDS = [
  SLASH_COMMANDS.DIGEST_ON,
  SLASH_COMMANDS.DIGEST_OFF,
  SLASH_COMMANDS.DIGEST_STATUS,
] as const;

export const STATUS_COMMANDS = [
  SLASH_COMMANDS.WEIGHT,
  SLASH_COMMANDS.POO,
  SLASH_COMMANDS.PERIOD,
  SLASH_COMMANDS.SYMPTOM,
] as const;

export const STOCK_COMMANDS = [
  SLASH_COMMANDS.STOCK,
  SLASH_COMMANDS.SET_STOCK,
  SLASH_COMMANDS.CHECK,
] as const;
