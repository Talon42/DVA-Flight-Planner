import { appendImportLog, openImportLog } from "./storage";

function nowIso() {
  return new Date().toISOString();
}

function normalizeError(error) {
  if (!error) {
    return "Unknown error";
  }

  if (error instanceof Error) {
    return error.message || "Unknown error";
  }

  return String(error);
}

function isSimpleString(value) {
  return (
    value.length > 0 &&
    value.length <= 64 &&
    /^[A-Za-z0-9._:/+-]+$/.test(value)
  );
}

function truncateText(value, limit = 160) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function shouldRedactKey(key) {
  const normalized = String(key || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

  return [
    "password",
    "cookie",
    "token",
    "auth",
    "apikey",
    "authorization",
    "setcookie",
    "credential",
    "secret"
  ].some((redactedKey) => normalized === redactedKey);
}

function formatStringValue(value) {
  const trimmed = String(value).replace(/\r?\n+/g, " ").trim();
  const truncated = truncateText(trimmed);

  if (isSimpleString(truncated)) {
    return truncated;
  }

  return JSON.stringify(truncated);
}

function formatComplexValue(value) {
  try {
    return truncateText(JSON.stringify(value), 220);
  } catch {
    return JSON.stringify(String(value));
  }
}

function formatData(data) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return "";
  }

  return entries
    .map(([key, value]) => {
      if (shouldRedactKey(key)) {
        return `${key}=[REDACTED]`;
      }

      return `${key}=${formatValue(value)}`;
    })
    .join(" ");
}

function formatValue(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "string") {
    return formatStringValue(value);
  }

  if (Array.isArray(value)) {
    return formatComplexValue(value);
  }

  if (typeof value === "object") {
    return formatComplexValue(value);
  }

  return String(value);
}

export async function logSystemEvent(subsystem, event, data = null) {
  const suffix = formatData(data);
  const line = `[${nowIso()}] [${subsystem}] ${event}${suffix ? ` ${suffix}` : ""}`;
  await appendImportLog(line);
}

export async function logSystemError(subsystem, event, error, data = null) {
  const suffix = formatData(data);
  const line = `[${nowIso()}] [${subsystem}] ${event} error=${formatStringValue(
    normalizeError(error)
  )}${
    suffix ? ` ${suffix}` : ""
  }`;
  await appendImportLog(line);
}

export async function logAppEvent(event, data = null) {
  return logSystemEvent("App", event, data);
}

export async function logAppError(event, error, data = null) {
  return logSystemError("App", event, error, data);
}

export async function openAppLogFile() {
  return openImportLog();
}
