// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scanAddonAirports } from "./addonAirportScan.client.js";
import { saveDeltaVirtualCredentials } from "./deltaVirtualCredentials.client.js";
import {
  deleteDeltaVirtualDraftReport,
  submitDeltaVirtualDraftReport
} from "./deltaVirtualDraftReport.client.js";
import {
  fetchDeltaVirtualPirepDetails,
  readDeltaVirtualLogbook,
  syncScheduleFromDeltaVirtual
} from "./deltaVirtual.client.js";
import { startSimBriefDispatch } from "./simbrief.client.js";

const invokeAppCommand = vi.hoisted(() => vi.fn());

vi.mock("./invoke.client.js", () => ({ invokeAppCommand }));

function draftFlight() {
  return {
    airline: "DAL",
    flightCode: "DL123",
    from: "KATL",
    to: "KJFK",
    selectedAircraft: "B737-800",
    draftNetwork: "VATSIM",
    simbriefPlan: {
      pax: 100,
      cruiseAltitude: "36000",
      route: "DCT",
      ofpXmlId: "1234567890_ABCDEFGHIJ"
    }
  };
}

beforeEach(() => {
  invokeAppCommand.mockReset();
  window.__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  delete window.__TAURI_INTERNALS__;
});

describe("frontend-to-Tauri command contracts", () => {
  it("starts DVA sync with normalized options and accepts snake-case results", async () => {
    invokeAppCommand.mockResolvedValue({
      file_name: "schedule.xml",
      xml_text: "<SCHEDULE />",
      warnings: ["fixture warning"],
      logbook_json: { fileName: "logbook.json" }
    });

    await expect(
      syncScheduleFromDeltaVirtual({ syncRunId: " run-1 ", debugEnabled: 1 })
    ).resolves.toEqual({
      fileName: "schedule.xml",
      xmlText: "<SCHEDULE />",
      warnings: ["fixture warning"],
      logbookJson: { fileName: "logbook.json" }
    });
    expect(invokeAppCommand).toHaveBeenCalledWith("start_deltava_sync", {
      syncRunId: "run-1",
      debugEnabled: true
    });
  });

  it("validates PIREP IDs before invocation and normalizes backend field names", async () => {
    await expect(fetchDeltaVirtualPirepDetails("not-an-id")).rejects.toThrow(
      "Delta Virtual PIREP id was missing or invalid"
    );
    expect(invokeAppCommand).not.toHaveBeenCalled();

    invokeAppCommand.mockResolvedValue({
      id: "DVA123",
      numeric_id: 123,
      source_url: "sanitized-fixture",
      payload_passengers: "120 passengers",
      departure_route: "DCT",
      arrival_runway_display: "22L (12000 ft)",
      fetched_at: "2026-07-21T12:00:00Z"
    });

    await expect(fetchDeltaVirtualPirepDetails("123")).resolves.toMatchObject({
      id: "DVA123",
      numericId: 123,
      sourceUrl: "sanitized-fixture",
      payloadPassengers: "120 passengers",
      departureRoute: "DCT",
      arrivalRunwayDisplay: "22L (12000 ft)",
      fetchedAt: "2026-07-21T12:00:00Z"
    });
    expect(invokeAppCommand.mock.calls[0][0]).toBe("fetch_delta_virtual_pirep_details");
    expect(invokeAppCommand.mock.calls[0][1]).toEqual({ request: { pirepId: "0x7b" } });
  });

  it("returns a safe logbook result without leaking backend errors", async () => {
    invokeAppCommand.mockRejectedValue(new Error("C:\\private\\pilot\\logbook.json"));

    await expect(readDeltaVirtualLogbook()).resolves.toEqual({
      status: "invalid",
      errorCode: "logbook_read_failed",
      dateIso: null,
      lastSyncAt: null,
      profileMetadata: null,
      entries: [],
      entryCount: 0,
      acceptedEntryCount: 0,
      rejectedEntryCount: 0,
      error: "Unable to load the Delta Virtual logbook."
    });
  });

  it("submits and deletes DVA drafts through the exact command payloads", async () => {
    invokeAppCommand
      .mockResolvedValueOnce({ ok: true, status: 200, responseText: "", id: "77" })
      .mockResolvedValueOnce({ ok: true, status: 200, responseText: "", id: 77 });

    await expect(
      submitDeltaVirtualDraftReport(draftFlight(), { debugEnabled: true })
    ).resolves.toMatchObject({ ok: true, status: 200, id: 77 });
    expect(invokeAppCommand.mock.calls[0][0]).toBe("submit_deltava_draft_flight_report");
    expect(invokeAppCommand.mock.calls[0][1]).toMatchObject({
      debugEnabled: true,
      payload: {
        airline: "DAL",
        flight: 123,
        airportD: "KATL",
        airportA: "KJFK",
        eqType: "B737-800",
        network: "VATSIM"
      }
    });

    await expect(deleteDeltaVirtualDraftReport("77", { debugEnabled: true })).resolves.toMatchObject({
      ok: true,
      id: 77
    });
    expect(invokeAppCommand.mock.calls[1][0]).toBe("delete_deltava_draft_flight_report");
    expect(invokeAppCommand.mock.calls[1][1]).toEqual({ draftReportId: 77, debugEnabled: true });
  });

  it("rejects invalid draft IDs without crossing the Tauri boundary", async () => {
    await expect(deleteDeltaVirtualDraftReport("0")).resolves.toMatchObject({
      ok: false,
      status: 0,
      id: null,
      error: "validation_failed: Draft report ID is missing or invalid."
    });
    expect(invokeAppCommand).not.toHaveBeenCalled();
  });

  it("sends credentials while keeping the password out of diagnostic metadata", async () => {
    invokeAppCommand.mockResolvedValue({
      first_name: "Jane",
      last_name: "Pilot",
      has_password: true
    });

    await expect(
      saveDeltaVirtualCredentials({ firstName: " Jane ", lastName: " Pilot ", password: "secret" })
    ).resolves.toEqual({ firstName: "Jane", lastName: "Pilot", hasPassword: true });

    expect(invokeAppCommand.mock.calls[0][0]).toBe("save_deltava_auth_settings");
    expect(invokeAppCommand.mock.calls[0][1]).toEqual({
      firstName: "Jane",
      lastName: "Pilot",
      password: "secret"
    });
    expect(invokeAppCommand.mock.calls[0][2]).toEqual({
      metadata: { hasFirstName: true, hasLastName: true, hasPassword: true }
    });
  });

  it("normalizes addon scan and SimBrief dispatch arguments", async () => {
    invokeAppCommand
      .mockResolvedValueOnce({
        roots: ["C:\\MSFS\\Community"],
        airports: ["KATL"],
        airportEntriesFound: 1,
        status: "complete"
      })
      .mockResolvedValueOnce({ status: "ready" });

    await expect(scanAddonAirports(["C:\\MSFS\\Community"])).resolves.toMatchObject({
      roots: ["C:\\MSFS\\Community"],
      airports: ["KATL"],
      airportEntriesFound: 1,
      status: "complete",
      warnings: [],
      scanDetails: []
    });
    expect(invokeAppCommand.mock.calls[0][0]).toBe("scan_addon_airports");
    expect(invokeAppCommand.mock.calls[0][1]).toEqual({ roots: ["C:\\MSFS\\Community"] });

    const dispatchPayload = { aircraft: "B738", origin: "KATL", destination: "KJFK" };
    await expect(startSimBriefDispatch(dispatchPayload, { debugEnabled: true })).resolves.toEqual({
      status: "ready"
    });
    expect(invokeAppCommand.mock.calls[1]).toEqual([
      "start_simbrief_dispatch",
      { payload: dispatchPayload, debugEnabled: true }
    ]);
  });
});
