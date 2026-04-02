const DAILY_DIGEST_HANDLER = 'sendDailyDigest';

type DailyDigestTriggerStatus = {
  enabled: boolean;
  triggerCount: number;
};

function listDailyDigestTriggers(): GoogleAppsScript.Script.Trigger[] {
  return ScriptApp.getProjectTriggers().filter(
    (trigger) => trigger.getHandlerFunction() === DAILY_DIGEST_HANDLER,
  );
}

export function getDailyDigestTriggerStatus(): DailyDigestTriggerStatus {
  const triggerCount = listDailyDigestTriggers().length;

  return {
    enabled: triggerCount > 0,
    triggerCount,
  };
}

export function installDailyDigestTrigger(): DailyDigestTriggerStatus {
  listDailyDigestTriggers().forEach((trigger) =>
    ScriptApp.deleteTrigger(trigger),
  );

  ScriptApp.newTrigger(DAILY_DIGEST_HANDLER)
    .timeBased()
    .atHour(23)
    .nearMinute(30)
    .everyDays(1)
    .create();

  return getDailyDigestTriggerStatus();
}

export function disableDailyDigestTrigger(): DailyDigestTriggerStatus {
  listDailyDigestTriggers().forEach((trigger) =>
    ScriptApp.deleteTrigger(trigger),
  );

  return getDailyDigestTriggerStatus();
}
