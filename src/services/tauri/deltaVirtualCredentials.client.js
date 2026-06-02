import { invokeAppCommand } from "./invoke.client.js";

const DVA_AUTH_STORAGE_KEY = "flight-planner.deltava-auth";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeSettings(settings = {}) {
  return {
    firstName: String(settings.firstName || settings.first_name || "").trim(),
    lastName: String(settings.lastName || settings.last_name || "").trim(),
    hasPassword: Boolean(settings.hasPassword ?? settings.has_password)
  };
}

export function getDefaultDeltaVirtualCredentials() {
  return {
    firstName: "",
    lastName: "",
    hasPassword: false
  };
}

export async function readDeltaVirtualCredentials() {
  if (isTauriRuntime()) {
    const result = await invokeAppCommand("read_deltava_auth_settings");
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
  password
} = {}) {
  const normalized = normalizeSettings({
    firstName,
    lastName
  });

  if (isTauriRuntime()) {
    const payload = {
      firstName: normalized.firstName,
      lastName: normalized.lastName
    };

    const nextPassword = typeof password === "string" ? password : "";
    if (nextPassword) {
      payload.password = nextPassword;
    }

    const result = await invokeAppCommand(
      "save_deltava_auth_settings",
      payload,
      {
        metadata: {
          hasFirstName: Boolean(normalized.firstName),
          hasLastName: Boolean(normalized.lastName),
          hasPassword: Boolean(nextPassword)
        }
      }
    );
    return normalizeSettings(result);
  }

  window.localStorage.setItem(DVA_AUTH_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export async function clearDeltaVirtualCredentials() {
  if (isTauriRuntime()) {
    await invokeAppCommand("clear_deltava_auth_settings");
  }

  window.localStorage.removeItem(DVA_AUTH_STORAGE_KEY);
}
