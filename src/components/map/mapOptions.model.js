export const DEFAULT_MAP_OPTIONS = {
  satelliteOverlay: false,
  radarEnabled: false,
  labelsEnabled: true,
  liveAtcEnabled: false
};

// Normalizes persisted map options while preserving unknown future fields.
export function normalizeMapOptions(value) {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_MAP_OPTIONS };
  }

  return {
    ...value,
    satelliteOverlay: Boolean(value.satelliteOverlay),
    radarEnabled: Boolean(value.radarEnabled),
    labelsEnabled: value.labelsEnabled === undefined ? DEFAULT_MAP_OPTIONS.labelsEnabled : Boolean(value.labelsEnabled),
    liveAtcEnabled: Boolean(value.liveAtcEnabled)
  };
}
