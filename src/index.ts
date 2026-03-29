import { MY_CHAT_ID, SHEET_LAYOUTS } from './config';
import { handleCommand } from './commands';
import { allLogsRepository } from './repositories';
import { spreadsheetService } from './services/spreadsheet';
import { sendText } from './services/telegram';

interface TelegramUpdate {
  message?: {
    chat: {
      id: number | string;
    };
    text?: string;
  };
}

function parseUpdate(e: GoogleAppsScript.Events.DoPost): TelegramUpdate | null {
  const contents = e.postData?.contents;

  if (!contents) {
    return null;
  }

  return JSON.parse(contents) as TelegramUpdate;
}

function validateSheetHeaders(): string {
  const reports = Object.values(SHEET_LAYOUTS).map((layout) => {
    try {
      const actualHeaders = spreadsheetService.getHeaderRow(layout.name);
      const expectedHeaders = [...layout.headers];
      const isMatch =
        actualHeaders.length === expectedHeaders.length &&
        actualHeaders.every(
          (header, index) => header === expectedHeaders[index],
        );

      if (isMatch) {
        return `OK ${layout.name}`;
      }

      return [
        `MISMATCH ${layout.name}`,
        `Expected: ${expectedHeaders.join(' | ')}`,
        `Actual: ${actualHeaders.join(' | ')}`,
      ].join('\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `ERROR ${layout.name}: ${message}`;
    }
  });

  const failures = reports.filter(
    (report) => report.startsWith('MISMATCH') || report.startsWith('ERROR'),
  );

  if (failures.length > 0) {
    throw new Error(failures.join('\n\n'));
  }

  return reports.join('\n');
}

function doPost(e: GoogleAppsScript.Events.DoPost): void {
  try {
    const update = parseUpdate(e);

    if (!update?.message) {
      return;
    }

    const chatId = String(update.message.chat.id);
    const text = update.message.text ?? '';
    const timestamp = new Date();

    if (chatId !== MY_CHAT_ID) {
      sendText(chatId, '抱歉，由于职责所在，我目前只能专注管理某一位队员。');
      return;
    }

    const reply = handleCommand(text, timestamp);

    sendText(chatId, reply);
    allLogsRepository.appendMessageLog(timestamp, text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendText(MY_CHAT_ID, `🚨 逻辑故障：\n${message}`);
  }
}

Object.assign(globalThis, { doPost, validateSheetHeaders });

export { doPost, validateSheetHeaders };
