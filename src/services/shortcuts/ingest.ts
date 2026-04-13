import { bodyLogTable, sleepLogTable } from '../../tables';
import { executeInsertData } from '../../tools';
import type {
  BodyLogEntry,
  CommandHandlingResult,
  InsertDataRequest,
  ShortcutBodyCandidate,
  ShortcutIngestionCounts,
  ShortcutMetricKey,
  ShortcutRequestPayload,
  ShortcutSleepCandidate,
  SleepLogEntry,
  SleepQuality,
} from '../../types';
import { SHORTCUT_SOURCE } from '../../types';
import {
  asObjectRecord,
  parseNumericText,
  parseOptionalNumericText,
} from '../../utils/value';
import { normalizeTimestampText, parseDateStamp } from '../../utils/timestamp';

const BODY_METRIC_FIELD_MAP: Record<
  ShortcutMetricKey,
  keyof Pick<
    ShortcutBodyCandidate,
    'weight_kg' | 'bmi' | 'body_fat_pct' | 'lean_body_mass_kg'
  >
> = {
  weight: 'weight_kg',
  bmi: 'bmi',
  bfp: 'body_fat_pct',
  lbm: 'lean_body_mass_kg',
};

function toSleepQuality(rating: number): SleepQuality {
  if (rating >= 85) {
    return 'good';
  }

  if (rating <= 70) {
    return 'poor';
  }

  return 'normal';
}

function ensureMetricArray(
  value: unknown,
  key: ShortcutMetricKey,
): Array<Record<string, unknown>> {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`payload.${key} must be an array`);
  }

  return value.map((sample, index) =>
    asObjectRecord(sample, `payload.${key}[${index}]`),
  );
}

function buildBodyCandidates(
  payload: ShortcutRequestPayload,
): ShortcutBodyCandidate[] {
  const aggregated = new Map<string, ShortcutBodyCandidate>();

  (Object.keys(BODY_METRIC_FIELD_MAP) as ShortcutMetricKey[]).forEach((key) => {
    ensureMetricArray(payload[key], key).forEach((entry, index) => {
      const occurredAt = normalizeTimestampText(
        entry.date,
        `payload.${key}[${index}].date`,
      );
      const metricValue = parseNumericText(
        entry.value,
        `payload.${key}[${index}].value`,
      );
      const existing = aggregated.get(occurredAt) ?? {
        occurred_at: occurredAt,
        weight_kg: null,
        bmi: null,
        body_fat_pct: null,
        lean_body_mass_kg: null,
        source: SHORTCUT_SOURCE,
        note: '',
      };

      existing[BODY_METRIC_FIELD_MAP[key]] = metricValue;
      aggregated.set(occurredAt, existing);
    });
  });

  return [...aggregated.values()].sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at),
  );
}

function buildSleepCandidate(
  payload: ShortcutRequestPayload,
): ShortcutSleepCandidate | null {
  if (payload.sleep === undefined) {
    return null;
  }

  const sleep = asObjectRecord(payload.sleep, 'payload.sleep');
  const sleepStartAt = normalizeTimestampText(
    sleep.start,
    'payload.sleep.start',
  );
  const sleepEndAt = normalizeTimestampText(sleep.end, 'payload.sleep.end');
  const sleepStart = new Date(sleepStartAt.replace(' ', 'T'));
  const sleepEnd = new Date(sleepEndAt.replace(' ', 'T'));

  if (sleepEnd.getTime() <= sleepStart.getTime()) {
    throw new Error('payload.sleep.end must be later than payload.sleep.start');
  }

  const sleepHours = parseOptionalNumericText(
    sleep.hours,
    'payload.sleep.hours',
  );
  const rating = parseNumericText(sleep.rating, 'payload.sleep.rating');

  return {
    sleep_start_at: sleepStartAt,
    sleep_end_at: sleepEndAt,
    sleep_hours: sleepHours,
    sleep_quality: toSleepQuality(rating),
    source: SHORTCUT_SOURCE,
    note: '',
  };
}

function listExistingBodyEntries(
  candidates: ShortcutBodyCandidate[],
): BodyLogEntry[] {
  const existingEntries: BodyLogEntry[] = [];
  const dateStamps = [
    ...new Set(
      candidates.map((candidate) => candidate.occurred_at.slice(0, 10)),
    ),
  ];

  dateStamps.forEach((dateStamp) => {
    existingEntries.push(...bodyLogTable.listByDate(parseDateStamp(dateStamp)));
  });

  return existingEntries;
}

function listExistingSleepEntries(
  candidate: ShortcutSleepCandidate | null,
): SleepLogEntry[] {
  if (!candidate) {
    return [];
  }

  return sleepLogTable.listByDate(
    parseDateStamp(candidate.sleep_end_at.slice(0, 10)),
  );
}

function createBodyInsertRequest(
  record: ShortcutBodyCandidate,
): InsertDataRequest {
  return {
    tool: 'insertData',
    sheet: 'BODY_LOG',
    record,
  };
}

function createSleepInsertRequest(
  record: ShortcutSleepCandidate,
): InsertDataRequest {
  return {
    tool: 'insertData',
    sheet: 'SLEEP_LOG',
    record,
  };
}

export function ingestShortcutPayload(
  payload: ShortcutRequestPayload,
  timestamp: Date = new Date(),
): CommandHandlingResult {
  const bodyCandidates = buildBodyCandidates(payload);
  const sleepCandidate = buildSleepCandidate(payload);

  if (bodyCandidates.length === 0 && !sleepCandidate) {
    throw new Error('iOS shortcut payload does not contain body or sleep data');
  }

  const existingBodyEntries = listExistingBodyEntries(bodyCandidates);
  const existingSleepEntries = listExistingSleepEntries(sleepCandidate);
  const counts: ShortcutIngestionCounts = {
    bodyInserted: 0,
    bodySkipped: 0,
    sleepInserted: 0,
    sleepSkipped: 0,
  };

  bodyCandidates.forEach((candidate) => {
    const duplicate = existingBodyEntries.some(
      (entry) =>
        entry.source === candidate.source &&
        entry.occurred_at === candidate.occurred_at,
    );

    if (duplicate) {
      counts.bodySkipped += 1;
      return;
    }

    executeInsertData(createBodyInsertRequest(candidate), timestamp);
    counts.bodyInserted += 1;
  });

  if (sleepCandidate) {
    const duplicate = existingSleepEntries.some(
      (entry) =>
        entry.source === sleepCandidate.source &&
        entry.sleep_start_at === sleepCandidate.sleep_start_at &&
        entry.sleep_end_at === sleepCandidate.sleep_end_at,
    );

    if (duplicate) {
      counts.sleepSkipped += 1;
    } else {
      executeInsertData(createSleepInsertRequest(sleepCandidate), timestamp);
      counts.sleepInserted += 1;
    }
  }

  const insertedCount = counts.bodyInserted + counts.sleepInserted;
  const skippedCount = counts.bodySkipped + counts.sleepSkipped;

  return {
    reply: `iOS Shortcuts 数据已处理：新增 ${insertedCount} 条，跳过 ${skippedCount} 条。`,
    handlingMode: 'rule',
    status: 'success',
    note: [
      'source=ios_shortcut',
      `body_inserted=${counts.bodyInserted}`,
      `body_skipped=${counts.bodySkipped}`,
      `sleep_inserted=${counts.sleepInserted}`,
      `sleep_skipped=${counts.sleepSkipped}`,
    ].join('; '),
    traceId: '',
    intent: 'ios-shortcut-ingest',
    tool: 'insertData',
    confirmationState: 'none',
    resultCode:
      insertedCount > 0 ? 'ios-shortcut-ingested' : 'ios-shortcut-noop',
  };
}
