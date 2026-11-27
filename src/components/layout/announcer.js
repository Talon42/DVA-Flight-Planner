// Shared announcer for status messages (WCAG 4.1.3). <LiveAnnouncer /> (mounted once in AppShell)
// subscribes to these messages and renders them in polite and assertive live regions.
export const announcerListeners = new Set();
let lastMessage = { text: "", at: 0 };

/**
 * Speaks a status message to screen reader users without moving focus.
 * Polite by default; pass { assertive: true } for errors that need immediate attention.
 * Identical messages within a second are dropped so rapid repeated updates are not re-read.
 */
export function announce(message, { assertive = false } = {}) {
  const text = String(message ?? "").trim();
  if (!text) {
    return;
  }

  const now = Date.now();
  if (text === lastMessage.text && now - lastMessage.at < 1000) {
    return;
  }
  lastMessage = { text, at: now };

  for (const listener of announcerListeners) {
    listener({ text, assertive, id: now });
  }
}

const ERROR_PATTERN = /\b(unable|failed|failure|error|cannot|can't|could not|invalid|rejected)\b/i;

// Status strings that come from app hooks: errors are announced assertively, the rest politely.
export function announceStatus(message) {
  const text = String(message ?? "").trim();
  if (!text || text === "Ready") {
    return;
  }
  announce(text, { assertive: ERROR_PATTERN.test(text) });
}
