import { invoke } from "@tauri-apps/api/core";
import { formatLogLine, reportLogWriteFailure } from "../logging/logFormat.client.js";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function appendBoundaryLogLine(line) {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    await invoke("append_app_log_text", { text: line });
  } catch {
    reportLogWriteFailure();
  }
}

export async function invokeAppCommand(commandName, args = {}, options = {}) {
  if (!isTauriRuntime()) {
    throw new Error("Tauri commands are only available in the desktop app.");
  }

  try {
    return await invoke(commandName, args);
  } catch (error) {
    if (typeof options.isExpectedError === "function" && options.isExpectedError(error)) {
      throw error;
    }
    const line = formatLogLine(
      "ERROR",
      options.subsystem || "Tauri",
      options.event || "command-failed",
      {
        commandName,
        ...(options.metadata && typeof options.metadata === "object" ? options.metadata : {})
      },
      error
    );
    await appendBoundaryLogLine(line);
    throw error;
  }
}
