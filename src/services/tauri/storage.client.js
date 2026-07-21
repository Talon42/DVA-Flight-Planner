import { invokeAppCommand } from "./invoke.client.js";

// Persists one serialized UI-state snapshot through the Rust atomic writer.
export async function writeUiStateJson(json) {
  const serialized = String(json ?? "");

  return invokeAppCommand(
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
