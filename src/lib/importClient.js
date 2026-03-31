export function runScheduleImport(fileName, xmlText, onDebug = () => {}) {
  return new Promise((resolve, reject) => {
    onDebug(`client:start file=${fileName} chars=${xmlText?.length || 0}`);
    const worker = new Worker(new URL("../workers/importWorker.js", import.meta.url), {
      type: "module"
    });
    let settled = false;

    worker.onmessage = (event) => {
      const { type, payload, error, stack, message } = event.data;

      if (type === "debug") {
        onDebug(`worker:${message}`);
        return;
      }

      settled = true;

      if (type === "success") {
        onDebug("worker:success");
        resolve(payload);
      } else {
        onDebug(`worker:error ${error || "Import failed."}`);
        if (stack) {
          onDebug(`worker:stack ${stack}`);
        }
        reject(new Error(error || "Import failed."));
      }

      worker.terminate();
    };

    worker.onerror = (event) => {
      if (settled) {
        worker.terminate();
        return;
      }

      onDebug(
        `worker:crash message=${event.message || "unknown"} file=${event.filename || "n/a"} line=${event.lineno || 0} col=${event.colno || 0}`
      );
      worker.terminate();
      fallbackImport(fileName, xmlText, onDebug)
        .then(resolve)
        .catch((fallbackError) => {
          const workerMessage = event.message || "Import worker crashed.";
          reject(new Error(`${workerMessage} Fallback import also failed: ${fallbackError.message}`));
        });
    };

    worker.postMessage({
      fileName,
      xmlText
    });
  });
}

async function fallbackImport(fileName, xmlText, onDebug) {
  onDebug("fallback:start main-thread parser");
  const { parseScheduleImport } = await import("./import/parseSchedule");
  return parseScheduleImport(fileName, xmlText, (message) =>
    onDebug(`fallback:${message}`)
  );
}
