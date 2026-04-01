function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeSimBriefError(message) {
  if (!message) {
    return new Error("SimBrief dispatch failed.");
  }

  const [kind, ...rest] = String(message).split(":");
  const normalizedMessage = rest.length ? rest.join(":").trim() : String(message);
  const error = new Error(normalizedMessage || "SimBrief dispatch failed.");
  error.kind = rest.length ? kind : "dispatch_failed";
  return error;
}

export async function startSimBriefDispatch(payload) {
  if (!isTauriRuntime()) {
    throw new Error("SimBrief dispatch is only available in the desktop app.");
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke("start_simbrief_dispatch", { payload });
  } catch (error) {
    if (error instanceof Error) {
      throw normalizeSimBriefError(error.message);
    }

    throw normalizeSimBriefError(String(error));
  }
}

export async function closeSimBriefDispatchWindow() {
  if (!isTauriRuntime()) {
    return;
  }

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("close_simbrief_dispatch_window");
  } catch {
    // Window may already be closed; ignore.
  }
}
