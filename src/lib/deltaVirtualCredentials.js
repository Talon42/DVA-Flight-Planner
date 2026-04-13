const DVA_AUTH_STORAGE_KEY = "flight-planner.deltava-auth";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeRememberMode(value) {
  const normalized = String(value || "").trim();
  if (normalized === "nameOnly" || normalized === "full") {
    return normalized;
  }

  return "none";
}

function normalizeSettings(settings = {}) {
  return {
    firstName: String(settings.firstName || settings.first_name || "").trim(),
    lastName: String(settings.lastName || settings.last_name || "").trim(),
    rememberMode: normalizeRememberMode(settings.rememberMode || settings.remember_mode),
    hasPassword: Boolean(settings.hasPassword ?? settings.has_password)
  };
}

export function getDefaultDeltaVirtualCredentials() {
  return {
    firstName: "",
    lastName: "",
    rememberMode: "none",
    hasPassword: false
  };
}

export async function readDeltaVirtualCredentials() {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke("read_deltava_auth_settings");
    return normalizeSettings(result);
  }

  const text = window.localStorage.getItem(DVA_AUTH_STORAGE_KEY);
  if (!text) {
    return getDefaultDeltaVirtualCredentials();
  }

  return normalizeSettings(JSON.parse(text));
}

export async function saveDeltaVirtualCredentials({
  firstName = "",
  lastName = "",
  rememberMode = "none",
  password
} = {}) {
  const normalized = normalizeSettings({
    firstName,
    lastName,
    rememberMode
  });

  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const payload = {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      rememberMode: normalized.rememberMode
    };

    const nextPassword = typeof password === "string" ? password : "";
    if (nextPassword) {
      payload.password = nextPassword;
    }

    const result = await invoke("save_deltava_auth_settings", payload);
    return normalizeSettings(result);
  }

  window.localStorage.setItem(DVA_AUTH_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function clearDeltaVirtualCredentials() {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("clear_deltava_auth_settings");
  }

  window.localStorage.removeItem(DVA_AUTH_STORAGE_KEY);
}
