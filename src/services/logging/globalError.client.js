import { logSystemError } from "./appLog.client.js";

let globalErrorLoggingInstalled = false;
const seenGlobalErrors = new Set();

function normalizeText(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

function truncateText(value, limit = 180) {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, Math.max(0, limit - 3))}...`;
}

function normalizeFilename(filename) {
  const normalized = normalizeText(filename);
  if (!normalized) {
    return "";
  }

  try {
    const parsed = new URL(normalized, window.location.href);
    return parsed.pathname.trim();
  } catch {
    return normalized.split(/[?#]/)[0];
  }
}

function normalizeReason(reason) {
  if (!reason) {
    return "Unknown rejection.";
  }

  if (reason instanceof Error) {
    return truncateText(normalizeText(reason.message || reason.name || "Unknown rejection."));
  }

  if (typeof reason === "string") {
    return truncateText(normalizeText(reason) || "Unknown rejection.");
  }

  if (typeof reason === "number" || typeof reason === "boolean") {
    return String(reason);
  }

  if (typeof reason === "object") {
    if (typeof reason.message === "string" && reason.message.trim()) {
      return truncateText(normalizeText(reason.message));
    }

    if (typeof reason.name === "string" && reason.name.trim()) {
      return truncateText(normalizeText(reason.name));
    }
  }

  return truncateText(normalizeText(String(reason)) || "Unknown rejection.");
}

function buildDedupKey(kind, message, filename, line, column) {
  return [kind, message, filename, line || 0, column || 0].join("|");
}

async function logFrontendError(kind, error, metadata) {
  try {
    await logSystemError("Frontend", kind, error, metadata);
  } catch {
    // Logger failures must never break the app bootstrap path.
  }
}

export function installGlobalErrorLogging() {
  if (globalErrorLoggingInstalled || typeof window === "undefined") {
    return;
  }

  globalErrorLoggingInstalled = true;

  window.addEventListener("error", (event) => {
    try {
      const message = truncateText(normalizeText(event?.message || event?.error?.message || "Unknown runtime error."));
      const filename = normalizeFilename(event?.filename || "");
      const line = Number(event?.lineno || 0);
      const column = Number(event?.colno || 0);
      const dedupKey = buildDedupKey("runtime-error", message, filename, line, column);
      if (seenGlobalErrors.has(dedupKey)) {
        return;
      }

      seenGlobalErrors.add(dedupKey);
      void logFrontendError("runtime-error", new Error(message), {
        filename,
        line,
        column,
        reason: normalizeReason(event?.error)
      });
    } catch {
      // Ignore logging errors.
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    try {
      const reason = event?.reason;
      const message = truncateText(normalizeReason(reason));
      const dedupKey = buildDedupKey("unhandled-rejection", message, "", 0, 0);
      if (seenGlobalErrors.has(dedupKey)) {
        return;
      }

      seenGlobalErrors.add(dedupKey);
      void logFrontendError("unhandled-rejection", new Error(message), {
        reason: normalizeReason(reason)
      });
    } catch {
      // Ignore logging errors.
    }
  });
}
