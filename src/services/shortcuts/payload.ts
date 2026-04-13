import type { ShortcutRequestPayload } from '../../types';
import { asObjectRecord } from '../../utils/value';

export function parseShortcutPayload(
  contents: string | undefined,
): ShortcutRequestPayload | null {
  if (!contents) {
    return null;
  }

  const parsed = JSON.parse(contents) as unknown;
  const payload = asObjectRecord(parsed, 'payload');

  return payload.source === 'ios_shortcut'
    ? (payload as ShortcutRequestPayload)
    : null;
}

export function buildShortcutRawLogText(
  payload: ShortcutRequestPayload,
): string {
  const bodyCounts = [
    `weight=${payload.weight?.length ?? 0}`,
    `bmi=${payload.bmi?.length ?? 0}`,
    `bfp=${payload.bfp?.length ?? 0}`,
    `lbm=${payload.lbm?.length ?? 0}`,
  ].join('; ');

  return `[ios_shortcut] ${bodyCounts}; sleep=${payload.sleep ? 1 : 0}`;
}
