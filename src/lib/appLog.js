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

function formatData(data) {
  if (!data || typeof data !== "object") {
    return "";
  }

  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return "";
  }

  return entries.map(([key, value]) => `${key}=${String(value)}`).join(" ");
}

export async function logAppEvent(event, data = null) {
  const suffix = formatData(data);
  const line = `[${nowIso()}] [App] ${event}${suffix ? ` ${suffix}` : ""}`;
  await appendImportLog(line);
}

export async function logAppError(event, error, data = null) {
  const suffix = formatData(data);
  const line = `[${nowIso()}] [App] ${event} error="${normalizeError(error)}"${
    suffix ? ` ${suffix}` : ""
  }`;
  await appendImportLog(line);
}

export async function openAppLogFile() {
  return openImportLog();
}
