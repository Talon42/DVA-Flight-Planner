import { describe, expect, it, vi } from "vitest";
import { resolveMapModeConfig } from "./mapModes.js";
import { DEFAULT_MAP_OPTIONS, normalizeMapOptions } from "./mapOptions.model.js";
import {
  getStandardMapStyleUrl,
  setLabelLayerTextLanguage,
  setLabelLayerVisibility,
  suppressRoadShieldLayers
} from "./mapTheme.js";

describe("Map option and mode contracts", () => {
  it("normalizes persisted booleans while retaining future option fields", () => {
    expect(normalizeMapOptions(null)).toEqual(DEFAULT_MAP_OPTIONS);
    expect(
      normalizeMapOptions({
        satelliteOverlay: 1,
        radarEnabled: 0,
        liveAtcEnabled: "yes",
        futureLayer: "preserved"
      })
    ).toEqual({
      satelliteOverlay: true,
      radarEnabled: false,
      labelsEnabled: true,
      liveAtcEnabled: true,
      futureLayer: "preserved"
    });
  });

  it("selects the expected projection and theme-specific standard style", () => {
    expect(resolveMapModeConfig("world", "dark")).toEqual({
      mode: "world",
      label: "World",
      mapStyle: getStandardMapStyleUrl("dark"),
      projection: "globe"
    });
    expect(resolveMapModeConfig("unknown", "light")).toEqual({
      mode: "standard",
      label: "Standard",
      mapStyle: getStandardMapStyleUrl("light"),
      projection: "mercator"
    });
  });
});

describe("Map label styling", () => {
  function createMap() {
    const layers = [
      {
        id: "place-label",
        type: "symbol",
        layout: { "text-field": ["get", "name"], visibility: "visible" }
      },
      {
        id: "aircraft-icon",
        type: "symbol",
        layout: { "icon-image": "aircraft", visibility: "visible" }
      },
      {
        id: "motorway-shield",
        type: "symbol",
        layout: { "icon-image": "road-shield", visibility: "visible" }
      },
      { id: "water-fill", type: "fill", layout: {} }
    ];
    const visibility = new Map(layers.map((layer) => [layer.id, layer.layout.visibility]));

    return {
      getStyle: vi.fn(() => ({ layers })),
      getLayoutProperty: vi.fn((id, key) => (key === "visibility" ? visibility.get(id) : null)),
      setLayoutProperty: vi.fn((id, key, value) => {
        if (key === "visibility") {
          visibility.set(id, value);
        }
      }),
      setPaintProperty: vi.fn()
    };
  }

  it("updates text label language and theme paint without touching icon-only layers", () => {
    const map = createMap();

    setLabelLayerTextLanguage(map, "dark");

    expect(map.setLayoutProperty).toHaveBeenCalledWith("place-label", "text-field", [
      "coalesce",
      ["get", "name_en"],
      ["get", "name:en"],
      ["get", "name_en-US"],
      ["get", "name:latin"],
      ["get", "name"]
    ]);
    expect(map.setPaintProperty).toHaveBeenCalledWith("place-label", "text-color", "#f2f4f8");
    expect(map.setPaintProperty).not.toHaveBeenCalledWith(
      "aircraft-icon",
      expect.any(String),
      expect.anything()
    );
  });

  it("toggles text labels and independently suppresses road shields", () => {
    const map = createMap();

    setLabelLayerVisibility(map, false);
    suppressRoadShieldLayers(map);

    expect(map.setLayoutProperty).toHaveBeenCalledWith("place-label", "visibility", "none");
    expect(map.setLayoutProperty).toHaveBeenCalledWith("motorway-shield", "visibility", "none");
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith("aircraft-icon", "visibility", "none");
    expect(map.setLayoutProperty).not.toHaveBeenCalledWith("water-fill", "visibility", "none");
  });
});
