import { parseScheduleImport } from "../lib/import/parseSchedule";

self.onmessage = (event) => {
  try {
    const payload = parseScheduleImport(
      event.data.fileName,
      event.data.xmlText,
      (message) => {
        self.postMessage({
          type: "debug",
          message
        });
      }
    );
    self.postMessage({
      type: "success",
      payload
    });
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown import error.",
      stack: error instanceof Error ? error.stack : null
    });
  }
};
