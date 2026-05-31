import { cn } from "../../components/ui/cn";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function normalizePropertyList(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // fall through
    }

    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeControllerList(value, callsigns) {
  const parsedList = normalizePropertyList(value);
  const objectControllers = parsedList.filter((item) => item && typeof item === "object");
  if (objectControllers.length > 0) {
    return objectControllers;
  }

  const callsignList = normalizePropertyList(callsigns)
    .map((item) => normalizeString(item))
    .filter(Boolean);

  return callsignList.map((callsign) => ({ callsign }));
}

function formatKindLabel(kind) {
  const normalizedKind = normalizeString(kind).toLowerCase();
  if (normalizedKind === "center") {
    return "Center";
  }

  if (normalizedKind === "terminal") {
    return "Terminal";
  }

  if (normalizedKind === "sector") {
    return "Sector";
  }

  return "Region";
}

function formatUpdateTimestamp(timestamp) {
  const normalizedTimestamp = normalizeString(timestamp);
  if (!normalizedTimestamp) {
    return "";
  }

  const parsed = new Date(normalizedTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return normalizedTimestamp;
  }

  return `${parsed.toISOString().slice(11, 16)}Z`;
}

function formatControllerLine(controller) {
  const callsign = normalizeString(controller?.callsign);
  const frequency = normalizeString(controller?.frequency);

  return frequency ? `${callsign} | ${frequency}` : callsign;
}

function getRegionTitle(region) {
  const regionId = normalizeString(region?.regionId || region?.id || "");
  const kindLabel = formatKindLabel(region?.kind);
  return regionId ? `${regionId} | ${kindLabel}` : kindLabel;
}

function getControllerKey(controller) {
  return [
    normalizeString(controller?.callsign).toUpperCase(),
    normalizeString(controller?.frequency)
  ].join("|");
}

function getRegionControllerSignature(region) {
  const controllers = normalizeControllerList(region?.controllers, region?.callsigns);
  return controllers
    .map(getControllerKey)
    .filter(Boolean)
    .sort()
    .join(";");
}

function getRegionAggregateKey(region) {
  return [
    normalizeString(region?.regionId || region?.id).toUpperCase(),
    normalizeString(region?.kind).toLowerCase(),
    normalizeString(region?.source).toLowerCase(),
    getRegionControllerSignature(region)
  ].join("::");
}

function buildRegionGroups(rawRegions) {
  const groups = [];

  for (const rawRegion of rawRegions) {
    const key = getRegionAggregateKey(rawRegion);
    let group = groups.find((item) => item.key === key);

    if (!group) {
      group = {
        key,
        region: rawRegion,
        controllersByKey: new Map()
      };
      groups.push(group);
    }

    for (const controller of normalizeControllerList(rawRegion?.controllers, rawRegion?.callsigns)) {
      const controllerKey = getControllerKey(controller);
      if (controllerKey && !group.controllersByKey.has(controllerKey)) {
        group.controllersByKey.set(controllerKey, controller);
      }
    }
  }

  return groups.map((group) => ({
    ...group,
    controllers: [...group.controllersByKey.values()]
  }));
}

// Renders the compact regional popup shown when the user clicks an active regional polygon.
export default function VatsimRegionPopup({ region, isDarkTheme, onClose }) {
  if (!region) {
    return null;
  }

  const rawRegions = Array.isArray(region?.regions) && region.regions.length
    ? region.regions
    : [region].filter(Boolean);
  const groupedRegions = buildRegionGroups(rawRegions);
  const isStackedSelection = rawRegions.length > 1;
  const regionId = normalizeString(region?.regionId || region?.id || "");
  const regionName = normalizeString(region?.name || regionId);
  const kindLabel = formatKindLabel(region?.kind);
  const updateLabel = formatUpdateTimestamp(region?.updateTimestamp);
  const controllers = normalizeControllerList(region?.controllers, region?.callsigns);
  const controllerCount = Number(region?.controllerCount) || controllers.length;

  return (
    <div
      className={cn(
        "pointer-events-auto w-[320px] rounded-none border shadow-[0_10px_28px_rgba(0,0,0,0.2)]",
        isDarkTheme
          ? "border-[color:rgba(255,255,255,0.18)] bg-[rgba(10,14,20,0.95)] text-white"
          : "border-[color:var(--line)] bg-[var(--surface)] text-[var(--text-primary)]"
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--line)] px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-[12px] font-semibold leading-none tracking-[0.12em]">
            {regionId || regionName}
          </div>
          <div className="mt-1 truncate text-[10px] leading-tight opacity-85">
            {kindLabel}
          </div>
          {regionName && regionName !== regionId ? (
            <div className="mt-0.5 truncate text-[10px] leading-tight opacity-75">
              {regionName}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={cn(
            "shrink-0 rounded-none border px-1.5 py-0.5 text-[10px] leading-none transition-colors",
            isDarkTheme
              ? "border-[color:rgba(255,255,255,0.16)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)]"
              : "border-[color:var(--button-ghost-border)] bg-[var(--button-ghost-bg)] hover:bg-[var(--button-ghost-border)]"
          )}
          aria-label={`Close live ATC details for ${regionId || regionName}`}
          onClick={onClose}
        >
          Close
        </button>
      </div>

      {isStackedSelection ? (
        <div className="max-h-[208px] overflow-auto px-3 pb-3 pt-2">
          <div className="mb-2 text-[10px] uppercase tracking-[0.12em] opacity-85">
            {groupedRegions.length} {groupedRegions.length === 1 ? "region" : "regions"} at this point
          </div>
          {rawRegions.length > groupedRegions.length ? (
            <div className="mb-2 text-[10px] leading-tight opacity-70">
              Component polygons: {rawRegions.length}
            </div>
          ) : null}
          <div className="space-y-1.5">
            {groupedRegions.map((group, index) => {
              const activeRegion = group.region;
              return (
                <div
                  key={`${group.key}-${index}`}
                  className={cn(
                    "rounded-none border px-2 py-1.5",
                    isDarkTheme
                      ? "border-[color:rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)]"
                      : "border-[color:var(--line)] bg-[var(--surface-soft)]"
                  )}
                >
                  <div className="truncate text-[11px] font-semibold leading-tight">
                    {getRegionTitle(activeRegion)}
                  </div>
                  {normalizeString(activeRegion?.name) ? (
                    <div className="truncate text-[10px] leading-tight opacity-80">
                      {normalizeString(activeRegion.name)}
                    </div>
                  ) : null}
                  {group.controllers.length ? (
                    <div className="mt-1 space-y-0.5">
                      {group.controllers.map((controller, controllerIndex) => (
                        <div
                          key={`${getControllerKey(controller)}-${controllerIndex}`}
                          className="truncate text-[10px] leading-tight"
                        >
                          {formatControllerLine(controller)}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 px-3 py-2 text-[10px] uppercase tracking-[0.12em] opacity-85">
            <span>{controllerCount} {controllerCount === 1 ? "controller" : "controllers"}</span>
            {updateLabel ? <span>Updated {updateLabel}</span> : null}
          </div>

          <div className="max-h-[176px] overflow-auto px-3 pb-3">
            {controllers.length ? (
              <div className="space-y-1">
                {controllers.map((controller, index) => (
                  <div
                    key={`${normalizeString(controller?.callsign) || "controller"}-${index}`}
                    className={cn(
                      "rounded-none border px-2 py-1",
                      isDarkTheme
                        ? "border-[color:rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.03)]"
                        : "border-[color:var(--line)] bg-[var(--surface-soft)]"
                    )}
                  >
                    <div className="truncate text-[11px] font-medium leading-tight">
                      {formatControllerLine(controller)}
                    </div>
                    {normalizeString(controller?.name) ? (
                      <div className="truncate text-[10px] leading-tight opacity-75">
                        {normalizeString(controller.name)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] leading-tight opacity-75">No active controller details available.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
