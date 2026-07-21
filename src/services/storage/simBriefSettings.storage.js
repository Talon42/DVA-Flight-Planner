import {
  normalizeSimBriefSettingsSnapshot,
  writeSimBriefSettings
} from "./storage.js";

let nextRevision = 0;
let latestQueuedRevision = 0;
let activeWrite = null;
let pendingWrite = null;
let suspended = false;
let flushWaiters = [];

function settleFlushWaiters() {
  if (activeWrite || pendingWrite) return;
  const waiters = flushWaiters;
  flushWaiters = [];
  for (const resolve of waiters) resolve();
}

async function drainWriteQueue() {
  if (activeWrite || !pendingWrite) {
    settleFlushWaiters();
    return;
  }

  activeWrite = pendingWrite;
  pendingWrite = null;
  const write = activeWrite;

  try {
    await writeSimBriefSettings(write.snapshot);
    for (const waiter of write.waiters) {
      waiter.resolve({
        revision: waiter.revision,
        persistedRevision: write.revision,
        authoritative: waiter.revision === write.revision && write.revision === latestQueuedRevision
      });
    }
  } catch (error) {
    for (const waiter of write.waiters) {
      const isAuthoritativeFailure =
        waiter.revision === write.revision && write.revision === latestQueuedRevision;
      if (isAuthoritativeFailure) waiter.reject(error);
      else waiter.resolve({
        revision: waiter.revision,
        persistedRevision: null,
        authoritative: false,
        failed: true
      });
    }
  } finally {
    activeWrite = null;
    if (pendingWrite) void drainWriteQueue();
    else settleFlushWaiters();
  }
}

// Queues a complete snapshot; pending snapshots coalesce while accepted writes remain ordered.
export function saveSimBriefSettings(settings) {
  if (suspended) {
    return Promise.resolve({ skipped: true, reason: "suspended", authoritative: false });
  }

  const revision = ++nextRevision;
  latestQueuedRevision = revision;
  const snapshot = normalizeSimBriefSettingsSnapshot(settings);

  return new Promise((resolve, reject) => {
    if (pendingWrite) {
      pendingWrite.revision = revision;
      pendingWrite.snapshot = snapshot;
      pendingWrite.waiters.push({ revision, resolve, reject });
    } else {
      pendingWrite = { revision, snapshot, waiters: [{ revision, resolve, reject }] };
    }
    void drainWriteQueue();
  });
}

// Stops accepting persistence requests before destructive profile cleanup.
export function suspendSimBriefSettingsWrites() {
  suspended = true;
}

export function resumeSimBriefSettingsWrites() {
  suspended = false;
}

export function flushSimBriefSettingsWrites() {
  if (!activeWrite && !pendingWrite) return Promise.resolve();
  return new Promise((resolve) => flushWaiters.push(resolve));
}
