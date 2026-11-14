// Redacts labeled secrets and URL query/fragment data before truncation or persistence.
export function redactLogText(value) {
  return String(value ?? "")
    .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => url.replace(/\/\/[^/@\s]+@/, "//[REDACTED]@").replace(/[?#].*$/, "?[REDACTED]"))
    .replace(/\b(authorization|proxy-authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/gi, "$1=[REDACTED]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [REDACTED]")
    .replace(/(["']?(?:password|passwd|token|access_token|refresh_token|api[_-]?key|secret|credential)["']?\s*[:=]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&}]+)/gi, "$1[REDACTED]");
}

function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function sensitiveKey(key) {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return normalized !== "appsessionid" && /password|cookie|token|auth|apikey|credential|secret|body|payload|response/.test(normalized);
}

function sanitize(value, depth = 0) {
  if (depth > 6) return "[depth-limit]";
  if (typeof value === "string") return redactLogText(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitize(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sensitiveKey(key) ? "[REDACTED]" : sanitize(entry, depth + 1)]));
  }
  return value;
}

function formatValue(value, limit = 160) {
  if (typeof value === "string") {
    const text = truncate(redactLogText(value).replace(/[\r\n]+/g, " ").trim(), limit);
    return /^[A-Za-z0-9._:/+-]+$/.test(text) ? text : JSON.stringify(text);
  }
  try {
    return truncate(JSON.stringify(sanitize(value)), 220);
  } catch {
    return "[unserializable]";
  }
}

// Shared by application logs, storage recovery, and the IPC boundary without importing persistence.
export function formatLogLine(level, subsystem, event, data = null, error = undefined) {
  const fields = { ...data };
  if (error !== undefined) {
    fields.error = error instanceof Error ? error.message : String(error || "Unknown error");
    if (error instanceof Error) {
      fields.errorName = error.name;
      fields.stack = error.stack?.split("\n").slice(0, 7).join("\n");
      if (error.cause !== undefined) fields.cause = error.cause instanceof Error ? error.cause.message : String(error.cause);
    }
  }
  const suffix = Object.entries(fields).filter(([, value]) => value !== undefined).map(([key, value]) => {
    const limit = /^(stack|componentStack)$/.test(key) ? 1600 : key === "error" ? 320 : 160;
    return `${key}=${sensitiveKey(key) ? "[REDACTED]" : formatValue(value, limit)}`;
  }).join(" ");
  const label = (value) => redactLogText(value).replace(/[\r\n[\]]/g, " ").trim();
  return `[${new Date().toISOString()}] [${level}] [${label(subsystem)}] ${label(event)}${suffix ? ` ${suffix}` : ""}`;
}

let logFailureReported = false;

// Never report logger failures through the logger itself.
export function reportLogWriteFailure() {
  if (logFailureReported) return;
  logFailureReported = true;
  console.error("[Logging] Unable to write the app log. Further write failures will be suppressed.");
}
