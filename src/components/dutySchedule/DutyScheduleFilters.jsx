// Duty Schedule filters keep the feature-specific UI out of FilterBar.jsx.
import { useEffect, useMemo, useState } from "react";
import {
  buildAirportCatalogOptions,
  resolveAirportCodeToIcao
} from "../../domain/airports/airportCatalog.js";
import { buildAircraftProfileSelectOptions } from "../../domain/aircraft/aircraftCatalog.js";
import { buildAirlineSelectOption, useTransientRangeSlider } from "../ui/filterFields";
import DutyScheduleFilterPanel from "../../features/dutySchedule/DutyScheduleFilterPanel.jsx";

// Renders the Duty Schedule-only filter controls without keeping them in FilterBar.jsx.
export default function DutyScheduleFilters({
  dutyFilters,
  airlines,
  regionOptions,
  countryOptions,
  dutyEquipmentOptions,
  dutyOriginAirportOptions,
  filterBounds,
  onDutyFilterChange
}) {
  const dutyBuildModeOptions = useMemo(
    () => [
      { value: "airline", label: "Airline", keywords: "airline" },
      { value: "location", label: "Location", keywords: "location" }
    ],
    []
  );
  const dutyAirlineOptions = useMemo(
    () =>
      [{ value: "", label: "Select an airline", keywords: "select airline none" }].concat(
        airlines.map((airline) => buildAirlineSelectOption(airline))
      ),
    [airlines]
  );
  const dutyLocationKindOptions = useMemo(
    () => [
      { value: "country", label: "Country", keywords: "country" },
      { value: "region", label: "Region", keywords: "region" }
    ],
    []
  );
  const dutyLocationOptions = useMemo(
    () =>
      [
        {
          value: "",
          label: dutyFilters.locationKind === "region" ? "Select a region" : "Select a country",
          keywords: dutyFilters.locationKind === "region" ? "select region none" : "select country none"
        }
      ].concat(
        (dutyFilters.locationKind === "region" ? regionOptions : countryOptions).map((value) => ({
          value: dutyFilters.locationKind === "region" ? value.code : value,
          label: dutyFilters.locationKind === "region" ? value.name : value,
          keywords:
            dutyFilters.locationKind === "region" ? `${value.code} ${value.name}` : String(value)
        }))
      ),
    [countryOptions, dutyFilters.locationKind, regionOptions]
  );
  const dutyOriginAirportSelectOptions = useMemo(
    () =>
      [{ value: "", label: "All", keywords: "all" }].concat(
        (Array.isArray(dutyOriginAirportOptions)
          ? dutyOriginAirportOptions
          : buildAirportCatalogOptions()
        )
          .filter((airport) => airport.usedAsOrigin)
          .map((airport) => ({
            value: airport.icao,
            label: airport.name,
            selectedLabel: airport.name,
            keywords: `${airport.icao} ${airport.iata} ${airport.name} ${airport.country} ${airport.regionName} ${airport.regionCode}`
          }))
      ),
    [dutyOriginAirportOptions]
  );
  const dutyEquipmentSelectOptions = useMemo(
    () => buildAircraftProfileSelectOptions(dutyEquipmentOptions),
    [dutyEquipmentOptions]
  );
  const dutyLengthOptions = useMemo(
    () =>
      Array.from({ length: 9 }, (_, index) => {
        const length = index + 2;
        return {
          value: String(length),
          label: `${length} flights`,
          keywords: `${length} flights`
        };
      }),
    []
  );
  const dutyAddonMatchOptions = useMemo(
    () => [
      { value: "either", label: "Departure or Arrival", keywords: "departure arrival either" },
      { value: "origin", label: "Departure only", keywords: "departure only" },
      { value: "destination", label: "Arrival only", keywords: "arrival only" },
      { value: "both", label: "Departure and Arrival", keywords: "departure arrival both" }
    ],
    []
  );
  const [activeDutySection, setActiveDutySection] = useState("setup");
  const [activeDutyHelp, setActiveDutyHelp] = useState(null);
  const [originAirportInput, setOriginAirportInput] = useState(
    dutyFilters.selectedOriginAirport || ""
  );
  const resolvedOriginAirportSelection = useMemo(() => {
    const resolvedIcao = resolveAirportCodeToIcao(originAirportInput);
    if (resolvedIcao) {
      const exactMatch = dutyOriginAirportSelectOptions.find(
        (option) => String(option.value || "").trim().toUpperCase() === resolvedIcao
      );

      if (exactMatch) {
        return exactMatch.value;
      }
    }

    return dutyFilters.selectedOriginAirport || "";
  }, [dutyFilters.selectedOriginAirport, dutyOriginAirportSelectOptions, originAirportInput]);

  const flightLengthSlider = useTransientRangeSlider(
    dutyFilters.flightLengthMin,
    dutyFilters.flightLengthMax,
    ([minValue, maxValue]) => {
      onDutyFilterChange("flightLengthMin", minValue);
      onDutyFilterChange("flightLengthMax", maxValue);
    }
  );
  const distanceSlider = useTransientRangeSlider(
    dutyFilters.distanceMin,
    dutyFilters.distanceMax,
    ([minValue, maxValue]) => {
      onDutyFilterChange("distanceMin", minValue);
      onDutyFilterChange("distanceMax", maxValue);
    }
  );

  useEffect(() => {
    setActiveDutyHelp(null);
  }, [activeDutySection]);

  useEffect(() => {
    setOriginAirportInput(dutyFilters.selectedOriginAirport || "");
  }, [dutyFilters.selectedOriginAirport]);

  return (
    <DutyScheduleFilterPanel
      dutyFilters={dutyFilters}
      filterBounds={filterBounds}
      dutyBuildModeOptions={dutyBuildModeOptions}
      dutyAirlineOptions={dutyAirlineOptions}
      dutyLocationKindOptions={dutyLocationKindOptions}
      dutyLocationOptions={dutyLocationOptions}
      dutyOriginAirportSelectOptions={dutyOriginAirportSelectOptions}
      dutyEquipmentSelectOptions={dutyEquipmentSelectOptions}
      dutyLengthOptions={dutyLengthOptions}
      dutyAddonMatchOptions={dutyAddonMatchOptions}
      activeDutySection={activeDutySection}
      setActiveDutySection={setActiveDutySection}
      activeDutyHelp={activeDutyHelp}
      setActiveDutyHelp={setActiveDutyHelp}
      originAirportInput={originAirportInput}
      setOriginAirportInput={setOriginAirportInput}
      resolvedOriginAirportSelection={resolvedOriginAirportSelection}
      flightLengthSlider={flightLengthSlider}
      distanceSlider={distanceSlider}
      onDutyFilterChange={onDutyFilterChange}
    />
  );
}
