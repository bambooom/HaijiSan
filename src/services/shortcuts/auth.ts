import type { ShortcutRequestPayload } from '../../types';
import { readTrimmedString } from '../../utils/value';

export function getRequestHeader(
  event: GoogleAppsScript.Events.DoPost,
  headerName: string,
): string | null {
  const headerBag = (
    event as GoogleAppsScript.Events.DoPost & {
      headers?: Record<string, unknown>;
    }
  ).headers;

  if (!headerBag) {
    return null;
  }

  const targetName = headerName.toLowerCase();

  for (const [key, value] of Object.entries(headerBag)) {
    if (key.toLowerCase() !== targetName) {
      continue;
    }

    return readTrimmedString(value, `header ${headerName}`, {
      required: false,
    });
  }

  return null;
}

export function hasValidShortcutSecret(
  event: GoogleAppsScript.Events.DoPost,
  expectedSecret: string,
  payload?: ShortcutRequestPayload,
): boolean {
  const configuredSecret = expectedSecret.trim();

  if (!configuredSecret) {
    return false;
  }

  const parameterSecret = readTrimmedString(
    event.parameter?.x_haiji_secret,
    'parameter x_haiji_secret',
    {
      required: false,
    },
  );
  const bodySecret =
    readTrimmedString(payload?.x_haiji_secret, 'payload.x_haiji_secret', {
      required: false,
    }) ??
    readTrimmedString(payload?.secret, 'payload.secret', {
      required: false,
    });

  return [
    getRequestHeader(event, 'X-HAIJI-SECRET'),
    parameterSecret,
    bodySecret,
  ].includes(configuredSecret);
}
