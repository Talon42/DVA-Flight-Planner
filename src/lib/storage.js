import {
  IMPORT_LOG_FILE,
  SAVED_SCHEDULE_FILE,
  STORAGE_DIR
} from "./constants";

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function loadFsModule() {
  return import("@tauri-apps/plugin-fs");
}

export async function readSavedSchedule() {
  if (isTauriRuntime()) {
    const { exists, readTextFile, BaseDirectory } = await loadFsModule();
    const hasFile = await exists(SAVED_SCHEDULE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      return null;
    }

    const text = await readTextFile(SAVED_SCHEDULE_FILE, {
      baseDir: BaseDirectory.AppData
    });

    return JSON.parse(text);
  }

  const text = window.localStorage.getItem("flight-planner.saved-schedule");
  return text ? JSON.parse(text) : null;
}

export async function writeSavedSchedule(savedSchedule) {
  if (isTauriRuntime()) {
    const { mkdir, writeTextFile, BaseDirectory } = await loadFsModule();
    await mkdir(STORAGE_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

    await writeTextFile(
      SAVED_SCHEDULE_FILE,
      JSON.stringify(savedSchedule, null, 2),
      { baseDir: BaseDirectory.AppData }
    );
    return;
  }

  window.localStorage.setItem(
    "flight-planner.saved-schedule",
    JSON.stringify(savedSchedule)
  );
}

async function resolveAppDataPath(relativePath) {
  try {
    const { appDataDir, join } = await import("@tauri-apps/api/path");
    const basePath = await appDataDir();
    return await join(basePath, relativePath);
  } catch {
    return relativePath;
  }
}

async function appendLogFile(relativePath, storageKey, logText) {
  if (!logText) {
    return null;
  }

  if (isTauriRuntime()) {
    try {
      const { mkdir, exists, readTextFile, writeTextFile, BaseDirectory } =
        await loadFsModule();

      await mkdir(STORAGE_DIR, {
        baseDir: BaseDirectory.AppData,
        recursive: true
      });

      const hasFile = await exists(relativePath, {
        baseDir: BaseDirectory.AppData
      });
      const existing = hasFile
        ? await readTextFile(relativePath, {
            baseDir: BaseDirectory.AppData
          })
        : "";
      const nextText = existing ? `${existing.trimEnd()}\n\n${logText}` : logText;

      await writeTextFile(relativePath, nextText, {
        baseDir: BaseDirectory.AppData
      });

      return resolveAppDataPath(relativePath);
    } catch (error) {
      const existing = window.localStorage.getItem(storageKey) || "";
      const nextText = existing ? `${existing.trimEnd()}\n\n${logText}` : logText;
      window.localStorage.setItem(storageKey, nextText);
      const reason = error instanceof Error ? error.message : String(error);
      return `browser-local-storage (fs write failed: ${reason})`;
    }
  }

  const existing = window.localStorage.getItem(storageKey) || "";
  const nextText = existing ? `${existing.trimEnd()}\n\n${logText}` : logText;
  window.localStorage.setItem(storageKey, nextText);
  return "browser-local-storage";
}

async function ensureLogFile(relativePath, storageKey) {
  const header = `[${new Date().toISOString()}] [App] log-file-created`;

  if (isTauriRuntime()) {
    const { mkdir, exists, writeTextFile, BaseDirectory } = await loadFsModule();
    await mkdir(STORAGE_DIR, {
      baseDir: BaseDirectory.AppData,
      recursive: true
    });

    const hasFile = await exists(relativePath, {
      baseDir: BaseDirectory.AppData
    });

    if (!hasFile) {
      await writeTextFile(relativePath, `${header}\n`, {
        baseDir: BaseDirectory.AppData
      });
    }

    return resolveAppDataPath(relativePath);
  }

  const existing = window.localStorage.getItem(storageKey);
  if (!existing) {
    window.localStorage.setItem(storageKey, `${header}\n`);
  }
  return "browser-local-storage";
}

async function openLogFile(relativePath, storageKey) {
  if (isTauriRuntime()) {
    const { openPath, revealItemInDir } = await import("@tauri-apps/plugin-opener");
    const fullPath = await ensureLogFile(relativePath, storageKey);
    try {
      await openPath(fullPath);
      return;
    } catch (error) {
      try {
        await revealItemInDir(fullPath);
      } catch {
        // no-op: we'll throw the original open error below
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to open log file: ${fullPath} (${reason})`);
    }
  }

  await ensureLogFile(relativePath, storageKey);
  const text = window.localStorage.getItem(storageKey);
  if (text) {
    window.alert(text);
  }
}

export async function appendImportLog(logText) {
  return appendLogFile(IMPORT_LOG_FILE, "flight-planner.import-log", logText);
}

export async function openImportLog() {
  return openLogFile(IMPORT_LOG_FILE, "flight-planner.import-log");
}

export async function confirmOverwriteSchedule() {
  if (isTauriRuntime()) {
    const { confirm } = await import("@tauri-apps/plugin-dialog");
    return confirm(
      "Importing a new schedule will replace the current saved schedule and shortlist. Continue?",
      {
        title: "Replace Saved Schedule",
        kind: "warning",
        okLabel: "Replace"
      }
    );
  }

  return window.confirm(
    "Importing a new schedule will replace the current saved schedule and shortlist. Continue?"
  );
}

export async function pickXmlScheduleFile() {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await loadFsModule();
    const path = await open({
      multiple: false,
      filters: [
        {
          name: "PFPX Schedule XML",
          extensions: ["xml"]
        }
      ]
    });

    if (!path || Array.isArray(path)) {
      return null;
    }

    const fileName = path.split(/[\\/]/).pop();
    const xmlText = await readTextFile(path);
    return { fileName, xmlText };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xml,text/xml";
    input.style.display = "none";

    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        document.body.removeChild(input);
        resolve(null);
        return;
      }

      const xmlText = await file.text();
      document.body.removeChild(input);
      resolve({
        fileName: file.name,
        xmlText
      });
    });

    document.body.appendChild(input);
    input.click();
  });
}
