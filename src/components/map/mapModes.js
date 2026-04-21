import { getStandardMapStyleUrl } from "./mapTheme";

export const MAP_MODE_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "world", label: "World" }
];

export function resolveMapModeConfig(mapMode, theme) {
  if (mapMode === "world") {
    return {
      mode: "world",
      label: "World",
      mapStyle: getStandardMapStyleUrl(theme),
      projection: "globe"
    };
  }

  return {
    mode: "standard",
    label: "Standard",
    mapStyle: getStandardMapStyleUrl(theme),
    projection: "mercator"
  };
}
