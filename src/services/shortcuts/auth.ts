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
): boolean {
  const configuredSecret = expectedSecret.trim();

  if (!configuredSecret) {
    return false;
  }

  return getRequestHeader(event, 'X-HAIJI-SECRET') === configuredSecret;
}
