import { writeUiStateJson } from "../tauri/storage.client.js";

const UI_STATE_STORAGE_KEY = "flight-planner.ui-state";

let nextRevision = 0;
let latestQueuedRevision = 0;
let latestAuthoritativeRevision = 0;
let activeWrite = null;
let pendingWrite = null;
let flushWaiters = [];

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function settleFlushWaiters() {
  if (activeWrite || pendingWrite) {
    return;
  }

  const waiters = flushWaiters;
  flushWaiters = [];
  for (const resolve of waiters) {
    resolve();
  }
}

async function writeSnapshot(serialized) {
  if (isTauriRuntime()) {
    await writeUiStateJson(serialized);
    return;
  }

  window.localStorage.setItem(UI_STATE_STORAGE_KEY, serialized);
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
    await writeSnapshot(write.serialized);
    if (write.revision === latestQueuedRevision) {
      latestAuthoritativeRevision = write.revision;
    }
    for (const waiter of write.waiters) {
      waiter.resolve({
        revision: write.revision,
        authoritative: write.revision === latestAuthoritativeRevision
      });
    }
  } catch (error) {
    for (const waiter of write.waiters) {
      waiter.reject(error);
    }
  } finally {
    activeWrite = null;
    if (pendingWrite) {
      void drainWriteQueue();
    } else {
      settleFlushWaiters();
    }
  }
}

function queueUiStateWrite(uiState) {
  const serialized = JSON.stringify(uiState || {});
  const revision = ++nextRevision;
  latestQueuedRevision = revision;

  return new Promise((resolve, reject) => {
    if (pendingWrite) {
      // Pending callers follow the newest complete snapshot because their older snapshots are superseded.
      pendingWrite.revision = revision;
      pendingWrite.serialized = serialized;
      pendingWrite.waiters.push({ resolve, reject });
    } else {
      pendingWrite = {
        revision,
        serialized,
        waiters: [{ resolve, reject }]
      };
    }

    void drainWriteQueue();
  });
}

// Queues a complete UI-state snapshot and coalesces pending writes to the newest revision.
export function saveUiState(uiState) {
  return queueUiStateWrite(uiState);
}

// Uses the same ordered writer for state changes that should bypass React's debounce.
export function saveUiStateImmediate(uiState) {
  return queueUiStateWrite(uiState);
}

// Resolves after all active and pending UI-state writes have settled.
export function flushUiStateWrites() {
  if (!activeWrite && !pendingWrite) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    flushWaiters.push(resolve);
  });
}
