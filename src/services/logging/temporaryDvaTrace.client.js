import { logSystemEvent } from "./appLog.client.js";

// TEMP-DVA-TRACE: remove this module and its call sites after the sync investigation.
// Queue writes without awaiting them inside measured operations; logging must never fail sync.
export function createTemporaryDvaTrace(syncRunId) {
  const now = () => performance.now();
  const startedAt = now();
  let pending = Promise.resolve();
  const record = (stage, event, durationMs = 0) => {
    const data = {
      syncRunId, stage, durationMs: Math.round(durationMs),
      elapsedMs: Math.round(now() - startedAt)
    };
    pending = pending.then(() => logSystemEvent("TEMP-DVA-TRACE", event, data)).catch(() => {});
  };
  record("full-sync", "started");
  return {
    async time(stage, operation) {
      const stageStartedAt = now();
      record(stage, "started");
      try {
        const result = await operation();
        record(stage, "finished", now() - stageStartedAt);
        return result;
      } catch (error) {
        record(stage, "failed", now() - stageStartedAt);
        throw error;
      }
    },
    async finish(outcome) {
      record("full-sync", outcome, now() - startedAt);
      await pending;
    }
  };
}
