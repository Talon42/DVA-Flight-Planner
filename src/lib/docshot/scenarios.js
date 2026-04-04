import scheduleXml from "../../../test-data/pfpxsched.xml?raw";
import { DEFAULT_DUTY_FILTERS, DEFAULT_FILTERS, DEFAULT_SORT } from "../constants";
import { parseScheduleImport } from "../import/parseSchedule";

const BASE_ADDON_SCAN = {
  roots: [
    "C:\\MSFS\\Community",
    "D:\\Addon Libraries\\Airports"
  ],
  airports: ["KATL", "KDTW", "KJFK", "KLAX", "KMSP", "KSLC", "KSEA"],
  lastScannedAt: "2026-03-28T14:12:00.000Z",
  contentHistoryFilesScanned: 18,
  airportEntriesFound: 81,
  status: "ready",
  lastError: null,
  warnings: [],
  scanDetails: []
};

const BASE_SIMBRIEF_TYPES = [
  { code: "A20N", name: "Airbus A320neo" },
  { code: "B38M", name: "Boeing 737 MAX 8" },
  { code: "CRJ9", name: "Bombardier CRJ-900" }
];

const DOCSHOT_FLIGHT_PREFERENCES = [
  { route: "KATL-KJFK", equipmentIncludes: "A20N" },
  { route: "KSEA-KSLC" },
  { route: "KDTW-KATL" },
  { route: "KLAX-KATL" }
];

let parsedSchedulePromise = null;

function getParsedSchedule() {
  if (!parsedSchedulePromise) {
    parsedSchedulePromise = Promise.resolve(
      parseScheduleImport("pfpxsched.xml", scheduleXml)
    ).then((imported) => ({
      importedAt: imported.importedAt,
      flights: imported.flights,
      importSummary: {
        ...imported.importSummary,
        source: "manual"
      }
    }));
  }

  return parsedSchedulePromise;
}

function getFlightDeterministicRank(flight) {
  return [
    Number(flight?.stdUtcMillis) || 0,
    String(flight?.flightCode || ""),
    String(flight?.route || ""),
    String(flight?.flightId || "")
  ];
}

function compareFlights(left, right) {
  const leftRank = getFlightDeterministicRank(left);
  const rightRank = getFlightDeterministicRank(right);

  for (let index = 0; index < leftRank.length; index += 1) {
    if (leftRank[index] < rightRank[index]) {
      return -1;
    }

    if (leftRank[index] > rightRank[index]) {
      return 1;
    }
  }

  return 0;
}

function selectPreferredFlights(flights) {
  const remainingFlights = [...flights].sort(compareFlights);
  const selectedFlights = [];

  for (const preference of DOCSHOT_FLIGHT_PREFERENCES) {
    const matchedFlight = remainingFlights.find((flight) => {
      if (preference.route && flight.route !== preference.route) {
        return false;
      }

      if (
        preference.equipmentIncludes &&
        !Array.isArray(flight.compatibleEquipment)
      ) {
        return false;
      }

      if (
        preference.equipmentIncludes &&
        !flight.compatibleEquipment.includes(preference.equipmentIncludes)
      ) {
        return false;
      }

      return true;
    });

    if (!matchedFlight) {
      continue;
    }

    selectedFlights.push(matchedFlight);
    const matchedIndex = remainingFlights.findIndex(
      (flight) => flight.flightId === matchedFlight.flightId
    );
    if (matchedIndex >= 0) {
      remainingFlights.splice(matchedIndex, 1);
    }
  }

  while (selectedFlights.length < 4 && remainingFlights.length) {
    selectedFlights.push(remainingFlights.shift());
  }

  return selectedFlights;
}

function deriveDocshotFlightState(flights) {
  const selectedFlights = selectPreferredFlights(flights);
  const selectedFlight = selectedFlights[0] || flights[0] || null;
  const boardFlights = selectedFlights.slice(0, 3);

  return {
    selectedFlightId: selectedFlight?.flightId || null,
    flightBoard: boardFlights.map((flight, index) => ({
      boardEntryId: `docshot-board-${index + 1}`,
      linkedFlightId: flight.flightId,
      simbriefSelectedType: index === 0 ? "A20N" : ""
    }))
  };
}

function buildFlightBoardEntries(flights, count = 3) {
  return flights.slice(0, count).map((flight, index) => ({
    boardEntryId: `docshot-board-${index + 1}`,
    linkedFlightId: flight.flightId,
    simbriefSelectedType: index === 0 ? "A20N" : ""
  }));
}

function deriveDutyScenarioState(schedule) {
  const selectedFlights = selectPreferredFlights(schedule.flights);
  const anchorFlight = selectedFlights[0] || schedule.flights[0] || null;
  const selectedEquipment = anchorFlight?.compatibleEquipment?.[0] || "";

  return {
    plannerMode: "duty",
    plannerControlsCollapsed: false,
    dutyFilters: {
      ...DEFAULT_DUTY_FILTERS,
      buildMode: "airline",
      selectedAirline: anchorFlight?.airlineName || "",
      selectedEquipment,
      flightLengthMin: Math.max(0, Number(anchorFlight?.blockMinutes || 0) - 60),
      flightLengthMax: Math.max(
        Number(anchorFlight?.blockMinutes || 0) + 90,
        DEFAULT_DUTY_FILTERS.flightLengthMax ?? 0
      ),
      distanceMin: Math.max(0, Number(anchorFlight?.distanceNm || 0) - 400),
      distanceMax: Math.max(
        Number(anchorFlight?.distanceNm || 0) + 700,
        DEFAULT_DUTY_FILTERS.distanceMax ?? 0
      ),
      dutyLength: 3
    },
    selectedFlightId: anchorFlight?.flightId || null,
    statusMessage: "Duty schedule filters ready."
  };
}

async function buildBaseSnapshot(overrides = {}) {
  const schedule = await getParsedSchedule();
  const docshotFlightState = deriveDocshotFlightState(schedule.flights);

  return {
    theme: "light",
    schedule,
    plannerMode: "basic",
    filters: { ...DEFAULT_FILTERS },
    dutyFilters: { ...DEFAULT_DUTY_FILTERS },
    plannerControlsCollapsed: true,
    basicAdvancedFiltersOpen: false,
    basicAddonFiltersOpen: false,
    scheduleTableTimeDisplayMode: "local",
    sort: { ...DEFAULT_SORT },
    selectedFlightId: docshotFlightState.selectedFlightId,
    flightBoard: docshotFlightState.flightBoard,
    expandedBoardFlightId: null,
    addonScan: BASE_ADDON_SCAN,
    isSettingsOpen: false,
    statusMessage: "Ready",
    isDevToolsEnabled: false,
    devWindowWidth: null,
    simBriefSettings: {
      username: "Talon42",
      pilotId: "11384",
      dispatchUnits: "LBS",
      customAirframes: []
    },
    simBriefAircraftTypes: BASE_SIMBRIEF_TYPES,
    simBriefDispatchState: {
      flightId: "",
      isDispatching: false,
      message: ""
    },
    ...overrides
  };
}

const SCENARIO_BUILDERS = {
  "hero-overview": async () => buildBaseSnapshot(),
  "quick-start-overview": async () =>
    buildBaseSnapshot({
      plannerControlsCollapsed: false,
      basicAdvancedFiltersOpen: true,
      statusMessage: "Schedule imported and ready for planning."
    }),
  "flight-board-overview": async () => {
    const schedule = await getParsedSchedule();
    const selectedFlights = selectPreferredFlights(schedule.flights);
    const boardEntries = buildFlightBoardEntries(selectedFlights, 4);
    const selectedFlightId =
      selectedFlights[0]?.flightId || schedule.flights[0]?.flightId || null;

    return {
      ...(await buildBaseSnapshot({
        schedule,
        selectedFlightId,
        flightBoard: boardEntries,
        statusMessage: "Flight Board ready."
      })),
      expandedBoardFlightId: null
    };
  },
  "sync-import-status": async () => {
    const snapshot = await buildBaseSnapshot();

    return {
      ...snapshot,
      schedule: {
        ...snapshot.schedule,
        importSummary: {
          ...snapshot.schedule.importSummary,
          source: "deltava-sync",
          sourceFileName: "deltava-sync.xml"
        }
      },
      statusMessage: "Schedule synced from Delta Virtual."
    };
  },
  "duty-schedule-builder": async () => {
    const schedule = await getParsedSchedule();

    return buildBaseSnapshot({
      ...deriveDutyScenarioState(schedule)
    });
  },
  "addon-airports-panel": async () =>
    buildBaseSnapshot({
      isSettingsOpen: true,
      statusMessage: "Addon airport cache ready."
    })
};

export function listDocshotScenarios() {
  return Object.keys(SCENARIO_BUILDERS);
}

export async function buildDocshotSnapshot(scenarioId) {
  const builder = SCENARIO_BUILDERS[scenarioId];

  if (!builder) {
    throw new Error(`Unknown docshot scenario: ${scenarioId}`);
  }

  return builder();
}
