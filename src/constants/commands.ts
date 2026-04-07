export const SLASH_COMMANDS = {
  START: '/start',
  HELP: '/help',
  DIGEST_ON: '/digeston',
  DIGEST_OFF: '/digestoff',
  DIGEST_STATUS: '/digeststatus',
} as const;

export const START_HELP_COMMANDS = [
  SLASH_COMMANDS.START,
  SLASH_COMMANDS.HELP,
] as const;

export const DIGEST_COMMANDS = [
  SLASH_COMMANDS.DIGEST_ON,
  SLASH_COMMANDS.DIGEST_OFF,
  SLASH_COMMANDS.DIGEST_STATUS,
] as const;
