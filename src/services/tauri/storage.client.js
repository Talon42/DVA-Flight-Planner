import { invokeAppCommand } from "./invoke.client.js";

export const PERSISTENCE_WRITE_SUPPRESSED_ERROR =
  "profile_clear_in_progress: User data persistence is disabled until reload.";

export function isPersistenceWriteSuppressedError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message === PERSISTENCE_WRITE_SUPPRESSED_ERROR;
}

// Treats only the backend's permanent post-clear write suppression as an intentional no-op.
async function invokePersistenceWrite(commandName, args, options) {
  try {
    return await invokeAppCommand(commandName, args, {
      ...options,
      isExpectedError: isPersistenceWriteSuppressedError
    });
  } catch (error) {
    if (isPersistenceWriteSuppressedError(error)) {
      return undefined;
    }
    throw error;
  }
}

// Persists one serialized UI-state snapshot through the Rust atomic writer.
export async function writeUiStateJson(json) {
  const serialized = String(json ?? "");

  return invokePersistenceWrite(
    "write_ui_state",
    { json: serialized },
    {
      subsystem: "UI State",
      event: "ui-state-write-failed",
      metadata: {
        byteCount: new TextEncoder().encode(serialized).length
      }
    }
  );
}

// Reads one Rust-allowlisted app-owned storage file.
export async function readAppStorageFile(key) {
  return invokeAppCommand("read_app_storage_file", { key }, {
    subsystem: "App Storage",
    event: "app-storage-read-failed",
    metadata: { key }
  });
}

// Writes one Rust-allowlisted app-owned storage file with backend validation.
export async function writeAppStorageFile(key, contents) {
  const serialized = String(contents ?? "");
  return invokePersistenceWrite("write_app_storage_file", { key, contents: serialized }, {
    subsystem: "App Storage",
    event: "app-storage-write-failed",
    metadata: { key, byteCount: new TextEncoder().encode(serialized).length }
  });
}

export async function quarantineAppStorageFile(key) {
  return invokePersistenceWrite("quarantine_app_storage_file", { key }, {
    subsystem: "App Storage",
    event: "app-storage-quarantine-failed",
    metadata: { key }
  });
}

export async function ensureAppLogFile(header) {
  return invokePersistenceWrite("ensure_app_log_file", { header: String(header || "") }, {
    subsystem: "App Storage",
    event: "app-log-ensure-failed"
  });
}

// Runs the Rust-owned allowlisted profile cleanup and returns its structured outcome.
export async function clearUserData() {
  return invokeAppCommand("clear_user_data", {}, {
    subsystem: "App Storage",
    event: "user-data-clear-failed"
  });
}
