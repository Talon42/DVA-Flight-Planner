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

function getBucketedViewportSize(viewportSize) {
  const width = Number(viewportSize?.width || 0);
  const height = Number(viewportSize?.height || 0);

  return {
    width: width <= 1024 ? 1024 : width <= 1400 ? 1400 : 1401,
    height: height < 850 ? 849 : 850
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
  const initialViewportSize = getBucketedViewportSize(readViewportSize());
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
    let rafId = 0;

    function applyViewportSize() {
      rafId = 0;

      const nextViewportSize = getBucketedViewportSize(readViewportSize());

      setViewportSize((currentViewportSize) =>
        currentViewportSize.width === nextViewportSize.width &&
        currentViewportSize.height === nextViewportSize.height
          ? currentViewportSize
          : nextViewportSize
      );
    }

    function handleResize() {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      rafId = requestAnimationFrame(applyViewportSize);
    }

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  const layoutBucket = getLayoutBucket(viewportSize);
  const usesPlannerControlsModal = shouldUsePlannerControlsModal(viewportSize);
  const isPlannerControlsInlineCollapsed = plannerControlsCollapsed;
  const topbarTitle =
    layoutBucket === "compact" ? "DVA Flight Planner" : "Delta Virtual Airlines Flight Planner";
  const syncButtonLabel =
    layoutBucket === "compact" ? "Sync DVA" : "Sync from Delta Virtual";

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
    syncButtonLabel
  };
}
