export function runScheduleImport(fileName, xmlText, onDebug = () => {}) {
  return new Promise((resolve, reject) => {
    onDebug(`client:start file=${fileName} chars=${xmlText?.length || 0}`);
    const worker = new Worker(new URL("../../workers/importWorker.js", import.meta.url), {
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

      const crashMessage = event.message || "Import worker crashed.";
      const crashDetails = [
        `message=${crashMessage}`,
        `file=${event.filename || "n/a"}`,
        `line=${event.lineno || 0}`,
        `col=${event.colno || 0}`,
        event.error?.name ? `error=${event.error.name}` : null,
        event.error?.stack ? `stack=${event.error.stack}` : null
      ]
        .filter(Boolean)
        .join(" ");

      onDebug(`worker:crash ${crashDetails}`);
      worker.terminate();
      reject(new Error(`Schedule import worker crashed. ${crashDetails}`));
    };

    worker.postMessage({
      fileName,
      xmlText
    });
  });
}
