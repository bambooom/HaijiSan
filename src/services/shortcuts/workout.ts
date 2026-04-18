import type {
  ShortcutRequestPayload,
  ShortcutWorkoutCandidate,
  WorkoutLevel,
} from '../../types';
import {
  asNullableNumber,
  asObjectRecord,
  asOptionalObjectRecord,
  readTrimmedString,
} from '../../utils/value';
import { normalizeTimestampText } from '../../utils/timestamp';

function parseQuantityValue(value: unknown, label: string): number | null {
  if (value === undefined) {
    return null;
  }

  const record = asObjectRecord(value, label);
  const parsed = asNullableNumber(record.value);

  if (parsed !== null) {
    return parsed;
  }

  if (
    record.value === undefined ||
    record.value === null ||
    record.value === ''
  ) {
    return null;
  }

  throw new Error(`${label}.value must be a finite number`);
}

function readOptionalString(value: unknown, label: string): string | null {
  return readTrimmedString(value, label, { required: false });
}

function toWorkoutLevel(averageIntensityPct: number | null): WorkoutLevel {
  if (averageIntensityPct === null) {
    return 'medium';
  }

  if (averageIntensityPct < 50) {
    return 'easy';
  }

  if (averageIntensityPct >= 70) {
    return 'hard';
  }

  return 'medium';
}

function buildWorkoutNote(payload: ShortcutRequestPayload): string {
  const noteParts: string[] = [];
  const workout = asObjectRecord(payload.workout, 'payload.workout');
  const activity = asOptionalObjectRecord(
    workout.activity,
    'payload.workout.activity',
  );
  const weather = asOptionalObjectRecord(
    workout.weather,
    'payload.workout.weather',
  );
  const device = asOptionalObjectRecord(
    workout.device,
    'payload.workout.device',
  );
  const zones = asOptionalObjectRecord(workout.zones, 'payload.workout.zones');

  const append = (key: string, value: string | number | null) => {
    if (value === null || value === '') {
      return;
    }

    noteParts.push(`${key}=${value}`);
  };

  append('uuid', readOptionalString(workout.uuid, 'payload.workout.uuid'));
  append(
    'end_at',
    readOptionalString(workout.endDate, 'payload.workout.endDate'),
  );
  append(
    'source',
    readOptionalString(workout.source, 'payload.workout.source'),
  );
  append(
    'activity_name',
    readOptionalString(activity?.name, 'payload.workout.activity.name'),
  );
  append(
    'activity_type',
    readOptionalString(activity?.type, 'payload.workout.activity.type'),
  );
  append(
    'distance_km',
    parseQuantityValue(workout.distance, 'payload.workout.distance'),
  );
  append('pace', readOptionalString(workout.pace, 'payload.workout.pace'));
  append(
    'avg_intensity_pct',
    parseQuantityValue(
      workout.averageIntensity,
      'payload.workout.averageIntensity',
    ),
  );
  append(
    'min_intensity_pct',
    parseQuantityValue(workout.minIntensity, 'payload.workout.minIntensity'),
  );
  append(
    'max_intensity_pct',
    parseQuantityValue(workout.maxIntensity, 'payload.workout.maxIntensity'),
  );
  append(
    'average_mets',
    parseQuantityValue(workout.averageMETs, 'payload.workout.averageMETs'),
  );
  append(
    'weather_temp',
    readOptionalString(
      weather?.temperature,
      'payload.workout.weather.temperature',
    ),
  );
  append(
    'weather_humidity',
    readOptionalString(weather?.humidity, 'payload.workout.weather.humidity'),
  );

  const deviceText = [
    readOptionalString(device?.name, 'payload.workout.device.name'),
    readOptionalString(
      device?.hardwareVersion,
      'payload.workout.device.hardwareVersion',
    ),
    readOptionalString(
      device?.softwareVersion,
      'payload.workout.device.softwareVersion',
    ),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ');
  append('device', deviceText || null);

  ['zone1', 'zone2', 'zone3', 'zone4', 'zone5'].forEach((zoneKey) => {
    const zone = asOptionalObjectRecord(
      zones?.[zoneKey],
      `payload.workout.zones.${zoneKey}`,
    );
    const timeSec = parseQuantityValue(
      zone?.time,
      `payload.workout.zones.${zoneKey}.time`,
    );
    append(`${zoneKey}_sec`, timeSec);
  });

  append(
    'share_text',
    readOptionalString(
      payload.shareText ??
        payload.share_text ??
        workout.shareText ??
        workout.share_text,
      'payload.shareText',
    ),
  );

  return noteParts.join('; ');
}

export function buildWorkoutCandidate(
  payload: ShortcutRequestPayload,
): ShortcutWorkoutCandidate | null {
  if (payload.workout === undefined) {
    return null;
  }

  const workout = asObjectRecord(payload.workout, 'payload.workout');
  const activity = asOptionalObjectRecord(
    workout.activity,
    'payload.workout.activity',
  );
  const averageIntensityPct = parseQuantityValue(
    workout.averageIntensity,
    'payload.workout.averageIntensity',
  );
  const durationSec = parseQuantityValue(
    workout.duration,
    'payload.workout.duration',
  );
  const workoutName =
    readOptionalString(workout.name, 'payload.workout.name') ??
    readOptionalString(activity?.name, 'payload.workout.activity.name') ??
    'Workout';

  return {
    occurred_at: normalizeTimestampText(
      workout.startDate,
      'payload.workout.startDate',
    ),
    workout_name: workoutName,
    workout_video_url:
      readOptionalString(
        payload.videoUrl ??
          payload.video_url ??
          workout.videoUrl ??
          workout.video_url,
        'payload.videoUrl',
      ) ?? '',
    workout_level: toWorkoutLevel(averageIntensityPct),
    duration_min:
      durationSec === null ? null : Number((durationSec / 60).toFixed(1)),
    avg_hr: parseQuantityValue(
      workout.averageHeartRate,
      'payload.workout.averageHeartRate',
    ),
    max_hr: parseQuantityValue(
      workout.maxHeartRate,
      'payload.workout.maxHeartRate',
    ),
    min_hr: parseQuantityValue(
      workout.minHeartRate,
      'payload.workout.minHeartRate',
    ),
    calories_kcal: parseQuantityValue(
      workout.activeCalories,
      'payload.workout.activeCalories',
    ),
    note: buildWorkoutNote(payload),
  };
}
