import { logSystemError, logSystemWarn } from "./appLog.client.js";

const groups = new Map();
const SUMMARY_INTERVAL_MS = 60_000;
const MAX_GROUPS = 100;

function flush(key) {
  const group = groups.get(key);
  if (!group) return;
  clearTimeout(group.timer);
  groups.delete(key);
  if (group.repeatCount) {
    void group.write(group.subsystem, `${group.event}-repeated`, {
      ...group.data, repeatCount: group.repeatCount, firstSeen: group.firstSeen, lastSeen: group.lastSeen
    });
  }
}

// Logs the first failure immediately, then one timed summary even if the burst stops.
export function logRepeatedFailure(level, subsystem, event, error, data = null, groupKey = "") {
  const key = `${subsystem}:${event}:${groupKey || String(error?.message || error)}`;
  const existing = groups.get(key);
  if (existing) {
    existing.repeatCount += 1;
    existing.lastSeen = new Date().toISOString();
    return;
  }
  if (groups.size >= MAX_GROUPS) flush(groups.keys().next().value);
  const timestamp = new Date().toISOString();
  const write = level === "WARN"
    ? (system, name, metadata) => logSystemWarn(system, name, metadata)
    : (system, name, metadata) => logSystemError(system, name, error, metadata);
  const group = { subsystem, event, data, write, firstSeen: timestamp, lastSeen: timestamp, repeatCount: 0 };
  groups.set(key, group);
  group.timer = setTimeout(() => flush(key), SUMMARY_INTERVAL_MS);
  void write(subsystem, event, { ...data, ...(level === "WARN" ? { error: String(error?.message || error) } : {}) });
}

// Flushes pending counts on page exit; persistence remains best-effort during shutdown.
export function flushRepeatedLogs() {
  for (const key of groups.keys()) flush(key);
}
