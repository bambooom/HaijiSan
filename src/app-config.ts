type AppConfig = {
  SHEET_ID: string;
  BOT_TOKEN: string;
  MY_CHAT_ID: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL: string;
};

declare const __APP_CONFIG__: AppConfig;

export const SHEET_ID = __APP_CONFIG__.SHEET_ID;
export const BOT_TOKEN = __APP_CONFIG__.BOT_TOKEN;
export const MY_CHAT_ID = __APP_CONFIG__.MY_CHAT_ID;
export const GEMINI_API_KEY = __APP_CONFIG__.GEMINI_API_KEY;
export const GEMINI_MODEL = __APP_CONFIG__.GEMINI_MODEL;
