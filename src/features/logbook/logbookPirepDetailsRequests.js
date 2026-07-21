import { fetchDeltaVirtualPirepDetails } from "../../services/tauri/deltaVirtual.client.js";

export const PIREP_DETAILS_MAX_ENTRIES = 200;
export const PIREP_DETAILS_TTL_MS = 30 * 60 * 1000;
export const PIREP_DETAILS_MAX_ACTIVE_REQUESTS = 4;
export const PIREP_DETAILS_FAILURE_COOLDOWN_MS = 30 * 1000;

function normalizeId(value) {
  return String(value || "").trim();
}

function copyValue(value) {
  return value && typeof value === "object" ? { ...value } : value;
}

// Owns the bounded, in-memory request policy used by selected and visible PIREP details.
export function createLogbookPirepDetailsRequestManager({
  fetchDetails = fetchDeltaVirtualPirepDetails,
  now = () => Date.now(),
  maxEntries = PIREP_DETAILS_MAX_ENTRIES,
  ttlMs = PIREP_DETAILS_TTL_MS,
  maxActiveRequests = PIREP_DETAILS_MAX_ACTIVE_REQUESTS,
  failureCooldownMs = PIREP_DETAILS_FAILURE_COOLDOWN_MS
} = {}) {
  const cache = new Map();
  const failures = new Map();
  const requests = new Map();
  const idGenerations = new Map();
  const highPriorityQueue = [];
  const lowPriorityQueue = [];
  let activeCount = 0;
  let generation = 0;
  let invalidationVersion = 0;
  const invalidationListeners = new Set();

  function createInvalidatedError() {
    const error = new Error("PIREP request was invalidated.");
    error.kind = "invalidated";
    return error;
  }

  function notifyInvalidation() {
    invalidationVersion += 1;
    for (const listener of invalidationListeners) listener();
  }

  function resolveTask(task, value) {
    if (task.settled) return;
    task.settled = true;
    task.resolve(value);
  }

  function rejectTask(task, error) {
    if (task.settled) return;
    task.settled = true;
    task.reject(error);
  }

  function get(pirepId) {
    const id = normalizeId(pirepId);
    const entry = cache.get(id);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      cache.delete(id);
      return null;
    }

    // Reinsert cache hits so Map iteration remains the LRU eviction order.
    cache.delete(id);
    cache.set(id, entry);
    return copyValue(entry.value);
  }

  function store(id, value, requestGeneration, requestIdGeneration) {
    if (requestGeneration !== generation || requestIdGeneration !== (idGenerations.get(id) || 0)) return;
    cache.delete(id);
    cache.set(id, { value: copyValue(value), expiresAt: now() + ttlMs });
    while (cache.size > maxEntries) {
      cache.delete(cache.keys().next().value);
    }
  }

  function pump() {
    while (activeCount < maxActiveRequests && (highPriorityQueue.length || lowPriorityQueue.length)) {
      const task = highPriorityQueue.shift() || lowPriorityQueue.shift();
      if (!task || task.cancelled) continue;
      task.started = true;
      activeCount += 1;

      Promise.resolve()
        .then(() => fetchDetails(task.id))
        .then((value) => {
          if (task.cancelled) return;
          failures.delete(task.id);
          store(task.id, value, task.generation, task.idGeneration);
          resolveTask(task, copyValue(value));
        })
        .catch((error) => {
          if (task.cancelled) return;
          if (task.generation === generation && task.idGeneration === (idGenerations.get(task.id) || 0)) {
            failures.set(task.id, now() + failureCooldownMs);
          }
          rejectTask(task, error);
        })
        .finally(() => {
          activeCount -= 1;
          if (requests.get(task.id) === task) requests.delete(task.id);
          pump();
        });
    }
  }

  function enqueue(pirepId, priority) {
    const id = normalizeId(pirepId);
    if (!id) return Promise.reject(new Error("A PIREP ID is required."));

    const cached = get(id);
    if (cached) return Promise.resolve(cached);

    const retryAt = failures.get(id) || 0;
    if (retryAt > now()) {
      const error = new Error("PIREP details are temporarily unavailable.");
      error.kind = "cooldown";
      return Promise.reject(error);
    }
    if (retryAt) failures.delete(id);

    const existing = requests.get(id);
    if (existing) {
      if (priority === "high" && !existing.started && existing.priority === "low") {
        const queueIndex = lowPriorityQueue.indexOf(existing);
        if (queueIndex >= 0) lowPriorityQueue.splice(queueIndex, 1);
        existing.priority = "high";
        highPriorityQueue.push(existing);
      }
      return existing.promise;
    }

    let resolveTask;
    let rejectTask;
    const promise = new Promise((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    const task = {
      id,
      priority,
      generation,
      idGeneration: idGenerations.get(id) || 0,
      promise,
      resolve: resolveTask,
      reject: rejectTask,
      started: false,
      cancelled: false,
      settled: false
    };
    requests.set(id, task);
    (priority === "high" ? highPriorityQueue : lowPriorityQueue).push(task);
    pump();
    return promise;
  }

  function invalidate(pirepId) {
    const id = normalizeId(pirepId);
    if (!id) return;
    cache.delete(id);
    failures.delete(id);
    idGenerations.set(id, (idGenerations.get(id) || 0) + 1);
    notifyInvalidation();
    const task = requests.get(id);
    if (!task) return;
    requests.delete(id);
    task.cancelled = true;
    if (!task.started) {
      const queue = task.priority === "high" ? highPriorityQueue : lowPriorityQueue;
      const queueIndex = queue.indexOf(task);
      if (queueIndex >= 0) queue.splice(queueIndex, 1);
    }
    // Active network work cannot always be aborted, but callers are rejected immediately.
    rejectTask(task, createInvalidatedError());
  }

  function clear() {
    generation += 1;
    cache.clear();
    failures.clear();
    idGenerations.clear();
    notifyInvalidation();
    for (const task of requests.values()) {
      task.cancelled = true;
      rejectTask(task, createInvalidatedError());
    }
    highPriorityQueue.length = 0;
    lowPriorityQueue.length = 0;
    requests.clear();
  }

  return {
    get,
    request: (pirepId) => enqueue(pirepId, "high"),
    prefetch: (pirepId) => enqueue(pirepId, "low"),
    invalidate,
    clear,
    subscribeInvalidation: (listener) => {
      invalidationListeners.add(listener);
      return () => invalidationListeners.delete(listener);
    },
    getInvalidationVersion: () => invalidationVersion,
    diagnostics: () => ({
      cacheSize: cache.size,
      activeCount,
      highPriorityQueued: highPriorityQueue.length,
      lowPriorityQueued: lowPriorityQueue.length,
      requestCount: requests.size,
      generation
    })
  };
}

export const logbookPirepDetailsRequests = createLogbookPirepDetailsRequestManager();

// Invalidates all non-persistent PIREP details after auth or logbook state changes.
export function clearLogbookPirepDetailsRequests() {
  logbookPirepDetailsRequests.clear();
}
