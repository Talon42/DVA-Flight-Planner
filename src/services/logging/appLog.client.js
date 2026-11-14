import { appendImportLog, openImportLog } from "../storage/storage.js";
import { formatLogLine, reportLogWriteFailure } from "./logFormat.client.js";

let debugLoggingEnabled = false;
let appSessionId = null;
let lastLoggedAppStartSessionId = "";

function createRandomToken(length = 10) {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";

  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  }

  return Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
}

function buildSessionId(prefix) {
  return `${prefix}-${createRandomToken(12)}`;
}

async function writeLog(level, subsystem, event, data, error) {
  try {
    await appendImportLog(formatLogLine(level, subsystem, event, data, error));
  } catch {
    reportLogWriteFailure();
  }
}

export async function logSystemEvent(subsystem, event, data = null) {
  if (subsystem === "App" && event === "start") {
    const sessionId = String(data?.appSessionId || "").trim();
    if (sessionId && sessionId === lastLoggedAppStartSessionId) {
      return;
    }
    if (sessionId) {
      lastLoggedAppStartSessionId = sessionId;
    }
  }

  await writeLog("INFO", subsystem, event, data);
}

export async function logSystemWarn(subsystem, event, data = null) {
  await writeLog("WARN", subsystem, event, data);
}

export async function logSystemError(subsystem, event, error, data = null) {
  await writeLog("ERROR", subsystem, event, data, error);
}

export async function logSystemDebug(subsystem, event, data = null) {
  if (debugLoggingEnabled) await writeLog("DEBUG", subsystem, event, data);
}

export async function logAppEvent(event, data = null) {
  return logSystemEvent("App", event, data);
}

export async function logAppWarn(event, data = null) {
  return logSystemWarn("App", event, data);
}

export async function logAppError(event, error, data = null) {
  return logSystemError("App", event, error, data);
}

export async function logAppDebug(event, data = null) {
  return logSystemDebug("App", event, data);
}

export function setDebugLoggingEnabled(enabled) {
  debugLoggingEnabled = Boolean(enabled);
}

export function getAppSessionId() {
  if (!appSessionId) {
    appSessionId = buildSessionId("app");
  }

  return appSessionId;
}

export function createLogRunId(prefix) {
  const normalizedPrefix = String(prefix || "run").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "run";
  return `${normalizedPrefix}-${createRandomToken(10)}`;
}

export async function openAppLogFile() {
  return openImportLog();
}
