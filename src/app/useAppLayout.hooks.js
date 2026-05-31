import { useEffect, useState } from "react";

// Reads the current viewport size, falling back to the desktop layout baseline during SSR.
export function readViewportSize() {
  if (typeof window === "undefined") {
    return {
      width: 1400,
      height: 900
    };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
}

// Buckets the viewport into the same layout tiers used by the current shell.
export function getLayoutBucket(viewportSize) {
  if (viewportSize.width <= 1024) {
    return "compact";
  }

  if (viewportSize.width <= 1400) {
    return "standard";
  }

  return "expanded";
}

// Chooses the planner controls presentation for the active viewport width.
export function shouldUsePlannerControlsModal(viewportSize) {
  return viewportSize.width <= 1400;
}

// Provides the default compact-shell filter expansion state.
export function getDefaultBasicFilterSectionState(_viewportSize = readViewportSize()) {
  return {
    basicAdvancedFiltersOpen: false,
    basicAddonFiltersOpen: false
  };
}

// Keeps the planner controls collapsed by default until the user expands them.
export function getDefaultPlannerControlsCollapsed() {
  return true;
}

// Owns layout-only state and resize tracking so App.jsx can stay focused on behavior.
export function useAppLayout() {
  const initialViewportSize = readViewportSize();
  const initialBasicFilterSections = getDefaultBasicFilterSectionState(initialViewportSize);
  const [viewportSize, setViewportSize] = useState(initialViewportSize);
  const [plannerControlsCollapsed, setPlannerControlsCollapsed] = useState(
    getDefaultPlannerControlsCollapsed()
  );
  const [basicAdvancedFiltersOpen, setBasicAdvancedFiltersOpen] = useState(
    initialBasicFilterSections.basicAdvancedFiltersOpen
  );
  const [basicAddonFiltersOpen, setBasicAddonFiltersOpen] = useState(
    initialBasicFilterSections.basicAddonFiltersOpen
  );

  useEffect(() => {
    function handleResize() {
      setViewportSize(readViewportSize());
    }

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const layoutBucket = getLayoutBucket(viewportSize);
  const usesPlannerControlsModal = shouldUsePlannerControlsModal(viewportSize);
  const isPlannerControlsInlineCollapsed = plannerControlsCollapsed;
  const topbarTitle =
    layoutBucket === "compact" ? "DVA Flight Planner" : "Delta Virtual Airlines Flight Planner";
  const syncButtonLabel =
    layoutBucket === "compact" ? "Sync DVA" : "Sync from Delta Virtual";
  const currentWindowSizeLabel = `${viewportSize.width}x${viewportSize.height}`;

  return {
    viewportSize,
    setViewportSize,
    plannerControlsCollapsed,
    setPlannerControlsCollapsed,
    basicAdvancedFiltersOpen,
    setBasicAdvancedFiltersOpen,
    basicAddonFiltersOpen,
    setBasicAddonFiltersOpen,
    layoutBucket,
    usesPlannerControlsModal,
    isPlannerControlsInlineCollapsed,
    topbarTitle,
    syncButtonLabel,
    currentWindowSizeLabel
  };
}
