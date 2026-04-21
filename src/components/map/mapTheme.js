export const STANDARD_MAP_STYLE_URLS = {
  light: "https://api.protomaps.com/styles/v5/white/en.json?key=97f946fa48c2dff3",
  dark: "https://api.protomaps.com/styles/v5/black/en.json?key=97f946fa48c2dff3"
};

export function getStandardMapStyleUrl(theme) {
  return theme === "dark" ? STANDARD_MAP_STYLE_URLS.dark : STANDARD_MAP_STYLE_URLS.light;
}

function isLikelyLabelLayerId(layerId) {
  const normalizedId = String(layerId || "").toLowerCase();
  return (
    normalizedId.includes("label") ||
    normalizedId.includes("place") ||
    normalizedId.includes("road") ||
    normalizedId.includes("settlement") ||
    normalizedId.includes("airport") ||
    normalizedId.includes("poi") ||
    normalizedId.includes("transit") ||
    normalizedId.includes("admin") ||
    normalizedId.includes("boundary") ||
    normalizedId.includes("waterway")
  );
}

function isLikelyLabelLayer(layer) {
  if (!layer || layer.type !== "symbol") {
    return false;
  }

  const layout = layer.layout || {};
  const textField = layout["text-field"];
  const iconImage = layout["icon-image"];
  const sourceLayer = String(layer["source-layer"] || "");

  if (!textField && !isLikelyLabelLayerId(layer.id) && !isLikelyLabelLayerId(sourceLayer)) {
    return false;
  }

  // Keep icon-only symbol layers visible; the toggle is meant to hide text labels.
  return Boolean(textField) || !iconImage;
}

function buildEnglishLabelExpression() {
  return [
    "coalesce",
    ["get", "name_en"],
    ["get", "name:en"],
    ["get", "name_en-US"],
    ["get", "name:latin"],
    ["get", "name"]
  ];
}

function getLabelPaintOverrides(theme) {
  if (theme === "dark") {
    return {
      "text-color": "#f2f4f8",
      "text-halo-color": "rgba(0, 0, 0, 0.92)",
      "text-halo-width": 1.25
    };
  }

  return {
    "text-color": "#111827",
    "text-halo-color": "rgba(255, 255, 255, 0.94)",
    "text-halo-width": 1.25
  };
}

export function setLabelLayerTextLanguage(map, theme) {
  const style = map?.getStyle?.();
  if (!style?.layers?.length) {
    return;
  }

  const englishTextField = buildEnglishLabelExpression();
  const paintOverrides = getLabelPaintOverrides(theme);

  for (const layer of style.layers) {
    if (!isLikelyLabelLayer(layer)) {
      continue;
    }

    try {
      map.setLayoutProperty(layer.id, "text-field", englishTextField);
      for (const [paintKey, paintValue] of Object.entries(paintOverrides)) {
        map.setPaintProperty(layer.id, paintKey, paintValue);
      }
    } catch {
      // Some styles expose transient or non-standard layers; ignore those safely.
    }
  }
}

export function setLabelLayerVisibility(map, labelsEnabled) {
  const style = map?.getStyle?.();
  if (!style?.layers?.length) {
    return;
  }

  const nextVisibility = labelsEnabled ? "visible" : "none";

  for (const layer of style.layers) {
    if (!isLikelyLabelLayer(layer)) {
      continue;
    }

    try {
      if (map.getLayoutProperty(layer.id, "visibility") !== nextVisibility) {
        map.setLayoutProperty(layer.id, "visibility", nextVisibility);
      }
    } catch {
      // Some styles expose transient or non-standard layers; ignore those safely.
    }
  }
}
