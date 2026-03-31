function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeSyncError(message) {
  if (!message) {
    return new Error("Delta Virtual sync failed.");
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || "Delta Virtual sync failed.");
  error.kind = rest.length ? kind : "download_failed";
  return error;
}

export async function syncScheduleFromDeltaVirtual() {
  if (!isTauriRuntime()) {
    throw new Error("Delta Virtual sync is only available in the desktop app.");
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke("start_deltava_sync");
    const fileName = result?.fileName ?? result?.file_name;
    const xmlText = result?.xmlText ?? result?.xml_text;

    if (!fileName || !xmlText) {
      throw new Error("download_failed: Delta Virtual sync returned an incomplete payload.");
    }

    return { fileName, xmlText };
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeSyncError(error.message);
    }

    throw normalizeSyncError(String(error));
  }
}
