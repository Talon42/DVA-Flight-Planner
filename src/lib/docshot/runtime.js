import { buildDocshotSnapshot, listDocshotScenarios } from "./scenarios";

const DOCSHOT_API_KEY = "__FLIGHT_PLANNER_DOCSHOT__";

function waitForFrames(frameCount = 2) {
  return new Promise((resolve) => {
    let remainingFrames = Math.max(1, Number(frameCount) || 1);

    function step() {
      remainingFrames -= 1;
      if (remainingFrames <= 0) {
        resolve();
        return;
      }

      window.requestAnimationFrame(step);
    }

    window.requestAnimationFrame(step);
  });
}

export function installDocshotRuntime({ applySnapshot, setCaptureMode }) {
  const api = {
    version: 1,
    scenarios: listDocshotScenarios(),
    async ping() {
      return {
        ready: true,
        scenarios: listDocshotScenarios()
      };
    },
    async applyScenario(scenarioId) {
      const snapshot = await buildDocshotSnapshot(scenarioId);
      await applySnapshot(snapshot);
      await waitForFrames(3);

      return {
        scenarioId,
        applied: true
      };
    },
    async setCaptureMode(active) {
      setCaptureMode(Boolean(active));
      await waitForFrames(2);

      return {
        captureMode: Boolean(active)
      };
    }
  };

  window[DOCSHOT_API_KEY] = api;
  document.body.dataset.docshotRuntime = "ready";

  return () => {
    if (window[DOCSHOT_API_KEY] === api) {
      delete window[DOCSHOT_API_KEY];
    }

    delete document.body.dataset.docshotRuntime;
    setCaptureMode(false);
  };
}
