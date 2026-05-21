import { Component, useEffect, useMemo, useRef, useState } from "react";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import { cn } from "./ui/cn";
import { cardFrameClassName, modalBackdropClassName } from "./ui/patterns";
import SectionHeader from "./ui/SectionHeader";
import { bodySmTextClassName, sectionTitleTextClassName, supportCopyTextClassName } from "./ui/typography";
import { DeltaVirtualCredentialsForm } from "./settings/DeltaVirtualCredentialsForm";
import { SimBriefSettingsForm } from "./settings/SimBriefSettingsForm";
import { AddonManagementSetup } from "./settings/AddonManagementSetup";
import { logAppError } from "../lib/appLog";

class GettingStartedModalErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    logAppError("getting-started-modal-render-failed", error).catch(() => {});
  }

  render() {
    if (this.state.error) {
      return (
        <Panel
          as="section"
          padding="lg"
          className="grid w-[min(760px,calc(100vw-24px))] gap-4 bg-[var(--modal-shell-bg)]"
          role="alertdialog"
          aria-modal="true"
          aria-label="Getting Started failed to render"
        >
          <SectionHeader eyebrow="Getting Started" title="Unable to render onboarding" />
          <p className={cn("m-0", supportCopyTextClassName, "text-[var(--text-muted)]")}>
            Something went wrong while opening the onboarding modal.
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={this.props.onSkip}>
              Skip &amp; Don&apos;t Show Again
            </Button>
          </div>
        </Panel>
      );
    }

    return this.props.children;
  }
}

function buildSectionList({ dvaComplete, simBriefComplete, addonComplete }) {
  return [
    {
      id: "delta-virtual",
      title: "Delta Virtual Credentials",
      summary: dvaComplete ? "Connected and saved." : "Enter your Delta Virtual login details.",
      complete: dvaComplete
    },
    {
      id: "simbrief",
      title: "SimBrief",
      summary: simBriefComplete ? "Saved and ready." : "Enter your Navigraph alias and Pilot ID.",
      complete: simBriefComplete
    },
    {
      id: "addon",
      title: "Addon Management",
      summary: addonComplete
        ? "Addon folders are configured or skipped."
        : "Add an addon folder or skip this step.",
      complete: addonComplete
    }
  ];
}

function SectionCard({
  id,
  title,
  summary,
  complete,
  expanded,
  compact = false,
  showToggle = true,
  onToggle,
  sectionRef,
  children
}) {
  function handleHeaderClick() {
    if (showToggle) {
      onToggle?.(id);
    }
  }

  return (
    <div
      ref={sectionRef}
      className={cn(
        cardFrameClassName,
        "grid gap-3 rounded-none p-4 shadow-none",
        compact && "gap-2.5 p-3.5"
      )}
    >
      <div
        className={cn("flex items-start justify-between gap-3", showToggle && "cursor-pointer")}
        onClick={handleHeaderClick}
      >
        <div className="min-w-0">
          <h3 className={cn("m-0", sectionTitleTextClassName)}>{title}</h3>
          <p
            className={cn(
              "mt-1 m-0",
              bodySmTextClassName,
              complete ? "text-[var(--status-resolved-text)]" : "text-[var(--text-muted)]"
            )}
          >
            {summary}
          </p>
        </div>
        {showToggle ? (
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-[var(--text-muted)]"
            onClick={(event) => {
              event.stopPropagation();
              onToggle?.(id);
            }}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          >
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex transition-transform duration-150 ease-out",
                expanded ? "rotate-180" : "rotate-0"
              )}
            >
              <svg viewBox="0 0 16 16" fill="none" className="size-4">
                <path
                  d="M4 6l4 4 4-4"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </Button>
        ) : null}
      </div>

      {expanded ? <div className="grid gap-3 min-w-0">{children}</div> : null}
    </div>
  );
}

// Coordinates launch-time onboarding without opening the settings modal.
export default function GettingStartedModal({
  isOpen,
  dvaComplete,
  simBriefComplete,
  addonComplete,
  onFinalize,
  onSkip,
  dvaFormProps,
  simBriefFormProps,
  addonProps
}) {
  const [expandedSectionId, setExpandedSectionId] = useState(null);
  const [focusSectionId, setFocusSectionId] = useState(null);
  const [isFooterBusy, setIsFooterBusy] = useState(false);
  const wasOpenRef = useRef(false);
  const sectionRefs = useRef({});

  const sectionList = useMemo(
    () =>
      buildSectionList({
        dvaComplete,
        simBriefComplete,
        addonComplete
      }),
    [addonComplete, dvaComplete, simBriefComplete]
  );
  const allComplete = sectionList.every((section) => section.complete);

  useEffect(() => {
    if (!isOpen) {
      setExpandedSectionId(null);
      setFocusSectionId(null);
      wasOpenRef.current = false;
      return;
    }

    if (wasOpenRef.current) {
      return;
    }

    wasOpenRef.current = true;
    const firstIncomplete = sectionList.find((section) => !section.complete)?.id || null;
    setExpandedSectionId(firstIncomplete);
    setFocusSectionId(firstIncomplete);
  }, [isOpen, sectionList]);

  useEffect(() => {
    if (!focusSectionId || expandedSectionId !== focusSectionId) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const sectionNode = sectionRefs.current[focusSectionId];
      const focusTarget = sectionNode?.querySelector(
        "input:not([disabled]), button:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      );

      if (focusTarget && typeof focusTarget.focus === "function") {
        focusTarget.focus();
      }

      setFocusSectionId(null);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [expandedSectionId, focusSectionId]);

  const toggleSection = (sectionId) => {
    setExpandedSectionId((current) => (current === sectionId ? null : sectionId));
  };

  const advanceToNextIncomplete = (currentSectionId) => {
    const completionById = {
      "delta-virtual": dvaComplete,
      simbrief: simBriefComplete,
      addon: addonComplete
    };
    completionById[currentSectionId] = true;

    const currentIndex = sectionList.findIndex((section) => section.id === currentSectionId);
    const nextSectionId =
      sectionList
        .slice(currentIndex + 1)
        .find((section) => !completionById[section.id])?.id || null;

    setExpandedSectionId(nextSectionId);
    setFocusSectionId(nextSectionId);
  };

  const handleFinalize = async () => {
    setIsFooterBusy(true);
    try {
      const saved = await onFinalize?.();
      return saved;
    } finally {
      setIsFooterBusy(false);
    }
  };

  const handleSkip = async () => {
    setIsFooterBusy(true);
    try {
      const saved = await onSkip?.();
      return saved;
    } finally {
      setIsFooterBusy(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <GettingStartedModalErrorBoundary onSkip={handleSkip}>
      <div
        className={cn(
          "fixed inset-0 z-50 grid place-items-center overflow-hidden p-4 bp-1024:p-3",
          modalBackdropClassName
        )}
        role="presentation"
      >
        <Panel
          as="section"
          padding="lg"
          className="flex h-[min(calc(100vh-24px),48rem)] w-[min(800px,calc(100vw-24px))] max-w-full flex-col gap-4 overflow-hidden bg-[var(--modal-shell-bg)] bp-1024:h-[min(calc(100vh-24px),44rem)] bp-1024:gap-3"
          role="dialog"
          aria-modal="true"
          aria-label="Getting Started"
        >
          <SectionHeader
            eyebrow="Getting Started"
            title="Getting Started"
            description="Set up Delta Virtual, SimBrief, and your addon folders before you start planning."
          />

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1 app-scrollbar bp-1024:gap-2.5">
            <SectionCard
              id="delta-virtual"
              title="Delta Virtual Credentials"
              summary={dvaComplete ? "Connected and saved." : "Enter your Delta Virtual login details."}
              complete={dvaComplete}
              expanded={expandedSectionId === "delta-virtual"}
              compact
              onToggle={toggleSection}
              sectionRef={(node) => {
                sectionRefs.current["delta-virtual"] = node;
              }}
            >
              <DeltaVirtualCredentialsForm
                mode="onboarding"
                compact
                {...dvaFormProps}
                onSaved={() => advanceToNextIncomplete("delta-virtual")}
              />
            </SectionCard>

            <SectionCard
              id="simbrief"
              title="SimBrief"
              summary={simBriefComplete ? "Saved and ready." : "Enter your SimBrief details."}
              complete={simBriefComplete}
              expanded={expandedSectionId === "simbrief"}
              compact
              onToggle={toggleSection}
              sectionRef={(node) => {
                sectionRefs.current.simbrief = node;
              }}
            >
              <SimBriefSettingsForm
                mode="onboarding"
                compact
                {...simBriefFormProps}
                onSaved={() => advanceToNextIncomplete("simbrief")}
              />
            </SectionCard>

            <SectionCard
              id="addon"
              title="Addon Management"
              summary={
                addonComplete
                  ? addonProps?.addonScan?.roots?.length
                    ? `${addonProps.addonScan.roots.length} addon folder${
                        addonProps.addonScan.roots.length === 1 ? "" : "s"
                      } configured.`
                    : "Addon setup skipped."
                  : "Add an addon folder or skip this step."
              }
              complete={addonComplete}
              expanded={expandedSectionId === "addon"}
              compact
              onToggle={toggleSection}
              sectionRef={(node) => {
                sectionRefs.current.addon = node;
              }}
            >
              <AddonManagementSetup
                mode="onboarding"
                compact
                {...addonProps}
                onCompleted={() => advanceToNextIncomplete("addon")}
              />
            </SectionCard>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--line)] pt-4 bp-1024:pt-3">
            <Button variant="ghost" onClick={handleSkip} disabled={isFooterBusy}>
              Skip &amp; Don&apos;t Show Again
            </Button>
            {allComplete ? (
              <Button onClick={handleFinalize} disabled={isFooterBusy}>
                {isFooterBusy ? "Saving..." : "Finalize Boarding"}
              </Button>
            ) : null}
          </div>
        </Panel>
      </div>
    </GettingStartedModalErrorBoundary>
  );
}
