import { describe, expect, it } from "vitest";
import {
  findCustomAirframeByInternalId,
  getAircraftByDva,
  getAircraftBySimBrief,
  getSelectedAircraftForFlight,
  normalizeAircraftCustomAirframe,
  resolveSimBriefDispatchAircraft,
  toDvaEquipmentType,
  toSimBriefAircraftCode
} from "../aircraft/aircraftIdentity.js";
import {
  buildDeltaVirtualDraftReportPayload,
  resolveDraftAircraftCompatibility,
  resolveDraftSimBriefId,
  validateDeltaVirtualDraftReportPayload
} from "./draftReport.js";

const CUSTOM_AIRFRAMES = [
  {
    internalId: "custom-738-dva",
    name: "My 737-800",
    baseType: "B738",
    matchAircraft: "B737-800"
  }
];

function buildFlight(overrides = {}) {
  return {
    airline: "dal",
    flightCode: "DL1234A",
    from: "katl",
    to: "kjfk",
    selectedAircraft: "B737-800",
    draftNetwork: "VATSIM",
    simbriefPlan: {
      pax: "142",
      cruiseAltitude: "36000",
      route: "DCT OZZZI DCT",
      ofpXmlId: "1234567890_ABCDEFGHIJ"
    },
    ...overrides
  };
}

describe("aircraft identity contracts", () => {
  it("resolves the same aircraft through DVA and SimBrief identifiers", () => {
    expect(getAircraftByDva("b737-800")?.name).toBe("B737-800");
    expect(getAircraftBySimBrief("b738")?.name).toBe("B737-800");
    expect(toDvaEquipmentType("B738")).toBe("B737-800");
    expect(toSimBriefAircraftCode("B737 800")).toBe("B738");
  });

  it("requires an exact custom-airframe internal ID and preserves its DVA link", () => {
    expect(findCustomAirframeByInternalId("custom-738-dva", CUSTOM_AIRFRAMES)?.resolvedRow?.dva).toBe(
      "B737-800"
    );
    expect(findCustomAirframeByInternalId("CUSTOM-738-DVA", CUSTOM_AIRFRAMES)).toBeNull();

    const normalized = normalizeAircraftCustomAirframe(CUSTOM_AIRFRAMES[0]);
    expect(normalized).toMatchObject({
      internalId: "custom-738-dva",
      matchAircraft: "B737-800",
      matchDva: "B737-800",
      baseType: "B738"
    });
  });

  it("dispatches a linked custom airframe by internal ID but drafts by DVA identity", () => {
    const flight = buildFlight({ selectedAircraft: "custom-738-dva" });

    expect(resolveSimBriefDispatchAircraft(flight, CUSTOM_AIRFRAMES)).toMatchObject({
      ok: true,
      dispatchType: "custom-738-dva",
      source: "custom",
      selectedAircraft: "B737-800",
      dva: "B737-800"
    });
    expect(getSelectedAircraftForFlight(flight, CUSTOM_AIRFRAMES)).toBe("B737-800");
    expect(resolveDraftAircraftCompatibility(flight, CUSTOM_AIRFRAMES)).toMatchObject({
      ok: true,
      dva: "B737-800",
      simbrief: "B738",
      validForDvaDraft: true
    });
  });

  it("fails closed for unknown aircraft selections", () => {
    const flight = buildFlight({ selectedAircraft: "UNKNOWN-AIRCRAFT" });

    expect(resolveSimBriefDispatchAircraft(flight)).toMatchObject({
      ok: false,
      reason: "Selected aircraft is missing."
    });
    expect(resolveDraftAircraftCompatibility(flight)).toMatchObject({
      ok: false,
      validForDvaDraft: false,
      resolutionSource: "unsupported"
    });
  });
});

describe("Delta Virtual draft payload contracts", () => {
  it("accepts only supported stored SimBrief identifiers", () => {
    expect(resolveDraftSimBriefId({ ofpXmlId: "1234567890_abcdefghij" })).toMatchObject({
      simBriefID: "1234567890_ABCDEFGHIJ",
      simBriefIDState: "valid"
    });
    expect(resolveDraftSimBriefId({ dvaSimBriefId: "DAL_XML_12345" }).simBriefID).toBe(
      "DAL_XML_12345"
    );
    expect(resolveDraftSimBriefId({ ofpXmlId: "https://example.test/ofp.xml" }).simBriefID).toBe("");
  });

  it("builds the exact ACARS draft shape with normalized values", () => {
    const payload = buildDeltaVirtualDraftReportPayload(
      buildFlight({ draftReportId: "42", untrustedField: "not persisted" })
    );

    expect(payload).toEqual({
      airline: "DAL",
      flight: 1234,
      leg: 1,
      airportD: "KATL",
      airportA: "KJFK",
      eqType: "B737-800",
      network: "VATSIM",
      pax: 142,
      alt: "36000",
      remarks: "Generated from DVA Flight Planner App",
      route: "DCT OZZZI DCT",
      simBriefID: "1234567890_ABCDEFGHIJ",
      id: 42
    });
    expect(payload).not.toHaveProperty("untrustedField");
  });

  it("preserves zero passengers and omits invalid report IDs", () => {
    const payload = buildDeltaVirtualDraftReportPayload(
      buildFlight({
        draftReportId: "0",
        draftNetwork: "IVAO",
        simbriefPlan: { pax: 0, route: "", cruiseAltitude: "", ofpXmlId: "bad" }
      })
    );

    expect(payload.pax).toBe(0);
    expect(payload.network).toBe("Offline");
    expect(payload.simBriefID).toBe("");
    expect(payload).not.toHaveProperty("id");
  });

  it("validates required fields and ignores extra payload properties", () => {
    const validPayload = {
      ...buildDeltaVirtualDraftReportPayload(buildFlight()),
      accessToken: "must-not-cross-the-boundary"
    };
    expect(validateDeltaVirtualDraftReportPayload(validPayload)).toEqual({ valid: true, errors: [] });

    const invalid = validateDeltaVirtualDraftReportPayload({
      airline: "",
      flight: 0,
      airportD: "",
      airportA: "",
      eqType: "",
      network: "IVAO"
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors).toEqual([
      "airline is missing",
      "flight number is missing or invalid",
      "departure airport is missing",
      "arrival airport is missing",
      "Selected aircraft is not linked to a Delta Virtual equipment type.",
      "network must be Offline or VATSIM"
    ]);
  });
});
