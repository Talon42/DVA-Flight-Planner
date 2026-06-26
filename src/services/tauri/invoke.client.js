import { invoke } from "@tauri-apps/api/core";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
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

  if (normalized === "appsessionid") {
    return false;
  }

  return [
    "password",
    "cookie",
    "token",
    "auth",
    "apikey",
    "authorization",
    "setcookie",
    "credential",
    "secret",
    "body",
    "payload",
    "response"
  ].some((redactedKey) => normalized.includes(redactedKey));
}

function sanitizeStructuredValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredValue(item));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).reduce((accumulator, [key, entry]) => {
      accumulator[key] = shouldRedactKey(key) ? "[REDACTED]" : sanitizeStructuredValue(entry);
      return accumulator;
    }, {});
  }

  return value;
}

function formatValue(value) {
  if (value === null) {
    return "null";
  }

  if (value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    const normalized = truncateText(normalizeText(value));
    return /^[A-Za-z0-9._:/+-]+$/.test(normalized) ? normalized : JSON.stringify(normalized);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    try {
      return truncateText(JSON.stringify(sanitizeStructuredValue(value)), 220);
    } catch {
      return "[unserializable]";
    }
  }

  if (typeof value === "object") {
    try {
      return truncateText(JSON.stringify(sanitizeStructuredValue(value)), 220);
    } catch {
      return "[unserializable]";
    }
  }

  return truncateText(String(value));
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return {};
  }

  return Object.entries(metadata).reduce((accumulator, [key, value]) => {
    if (value === undefined) {
      return accumulator;
    }

    accumulator[key] = shouldRedactKey(key) ? "[REDACTED]" : formatValue(value);
    return accumulator;
  }, {});
}

function buildLogLine(subsystem, event, error, metadata = {}) {
  const message = normalizeText(error instanceof Error ? error.message : error);
  const suffix = Object.entries(sanitizeMetadata(metadata))
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const timestamp = new Date().toISOString();
  const normalizedSubsystem = normalizeText(subsystem) || "Tauri";
  const normalizedEvent = normalizeText(event) || "command-failed";
  const normalizedMessage = message || "Unknown command failure.";

  return `[${timestamp}] [${normalizedSubsystem}] ${normalizedEvent} error=${normalizedMessage}${
    suffix ? ` ${suffix}` : ""
  }`;
}

async function appendBoundaryLogLine(line) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invoke("append_app_log_text", { text: line });
  } catch {
    // Best-effort boundary logging only.
  }
}

export async function invokeAppCommand(commandName, args = {}, options = {}) {
  if (!isTauriRuntime()) {
    throw new Error("Tauri commands are only available in the desktop app.");
  }

  try {
    return await invoke(commandName, args);
  } catch (error) {
    const line = buildLogLine(
      options.subsystem || "Tauri",
      options.event || "command-failed",
      error,
      {
        commandName,
        ...(options.metadata && typeof options.metadata === "object" ? sanitizeMetadata(options.metadata) : {})
      }
    );
    await appendBoundaryLogLine(line);
    throw error;
  }
}
