import { useEffect, useMemo, useState } from "react";
import ModalBackdrop from "../../components/layout/ModalBackdrop";
import Button from "../../components/ui/Button";
import Panel from "../../components/ui/Panel";
import SectionHeader from "../../components/ui/SectionHeader";
import { cn } from "../../components/ui/cn";
import {
  cardFrameClassName,
  mutedTextClassName
} from "../../components/ui/patterns";
import {
  bodySmTextClassName,
  labelTextClassName,
  sectionTitleTextClassName
} from "../../components/ui/typography";

function clampIndex(index, cardCount) {
  if (!cardCount) {
    return 0;
  }

  return Math.min(Math.max(index, 0), cardCount - 1);
}

function parseInlineFormatting(text) {
  const source = String(text || "");
  const nodes = [];
  let cursor = 0;
  let keyIndex = 0;

  // Keep inline parsing deliberately small and predictable.
  while (cursor < source.length) {
    const boldStart = source.indexOf("**", cursor);
    const italicStart = source.indexOf("_", cursor);
    const nextTokenIndex =
      boldStart < 0 ? italicStart : italicStart < 0 ? boldStart : Math.min(boldStart, italicStart);

    if (nextTokenIndex < 0) {
      nodes.push(source.slice(cursor));
      break;
    }

    if (nextTokenIndex > cursor) {
      nodes.push(source.slice(cursor, nextTokenIndex));
      cursor = nextTokenIndex;
    }

    if (source.startsWith("**", cursor)) {
      const boldEnd = source.indexOf("**", cursor + 2);
      if (boldEnd > cursor + 2) {
        nodes.push(
          <strong key={`bold-${keyIndex++}`}>{source.slice(cursor + 2, boldEnd)}</strong>
        );
        cursor = boldEnd + 2;
        continue;
      }
    }

    if (source[cursor] === "_") {
      const italicEnd = source.indexOf("_", cursor + 1);
      if (italicEnd > cursor + 1) {
        nodes.push(<em key={`italic-${keyIndex++}`}>{source.slice(cursor + 1, italicEnd)}</em>);
        cursor = italicEnd + 1;
        continue;
      }
    }

    nodes.push(source[cursor]);
    cursor += 1;
  }

  return nodes;
}

function renderTextCardDescription(description) {
  const lines = String(description || "").replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let bulletItems = [];
  let blockIndex = 0;

  const flushBullets = () => {
    if (!bulletItems.length) {
      return;
    }

    blocks.push(
      <ul key={`bullets-${blockIndex++}`} className="m-0 grid gap-2 pl-5">
        {bulletItems.map((item, itemIndex) => (
          <li key={`bullet-${blockIndex}-${itemIndex}`}>{parseInlineFormatting(item)}</li>
        ))}
      </ul>
    );
    bulletItems = [];
  };

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();

    if (!line) {
      flushBullets();
      continue;
    }

    if (line.startsWith("## ")) {
      flushBullets();
      blocks.push(
        <h4 key={`heading-2-${blockIndex++}`} className={cn("m-0", labelTextClassName)}>
          {parseInlineFormatting(line.slice(3))}
        </h4>
      );
      continue;
    }

    if (line.startsWith("### ")) {
      flushBullets();
      blocks.push(
        <h5 key={`heading-3-${blockIndex++}`} className={cn("m-0", bodySmTextClassName)}>
          {parseInlineFormatting(line.slice(4))}
        </h5>
      );
      continue;
    }

    if (line.startsWith("- ")) {
      bulletItems.push(line.slice(2));
      continue;
    }

    flushBullets();
    blocks.push(
      <p key={`paragraph-${blockIndex++}`} className={cn("m-0", mutedTextClassName)}>
        {parseInlineFormatting(line)}
      </p>
    );
  }

  flushBullets();
  return blocks;
}

// Renders the release-scoped What's New modal in automatic or manual mode.
export default function WhatsNewModal({
  isOpen = false,
  mode = "automatic",
  cards = [],
  appVersion = "",
  onFinish,
  onCloseManual
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const safeCards = useMemo(() => (Array.isArray(cards) ? cards : []), [cards]);
  const cardCount = safeCards.length;

  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    setActiveIndex((currentIndex) => clampIndex(currentIndex, cardCount));
  }, [cardCount]);

  const activeCard = useMemo(
    () => safeCards[clampIndex(activeIndex, cardCount)] || null,
    [activeIndex, cardCount, safeCards]
  );

  if (!isOpen || !activeCard) {
    return null;
  }

  const isTextCard = activeCard.layout === "text";
  const isFirstCard = activeIndex === 0;
  const isLastCard = activeIndex >= cardCount - 1;
  const finalButtonLabel = mode === "automatic" ? "Finish" : "Close";

  const handleFinalAction = async () => {
    if (mode === "automatic") {
      await onFinish?.();
      return;
    }

    onCloseManual?.();
  };

  return (
    <ModalBackdrop onClick={() => {}}>
      <Panel
        as="section"
        padding="lg"
        className="grid h-[min(760px,calc(100vh-32px))] w-[min(720px,calc(100vw-24px))] grid-rows-[auto_minmax(0,1fr)_auto] gap-4 overflow-hidden rounded-none bg-[var(--modal-shell-bg)] shadow-none bp-1024:h-[min(680px,calc(100vh-24px))] bp-1024:gap-3"
        role="dialog"
        aria-modal="true"
        aria-label={`What's New in ${appVersion}`}
        onClick={(event) => event.stopPropagation()}
      >
        <SectionHeader
          eyebrow="Release Update"
          title={`What's New in ${appVersion}`}
        />

        <div
          className={cn(
            "grid min-h-0 gap-3 overflow-hidden",
            isTextCard ? "grid-rows-[minmax(0,1fr)]" : "grid-rows-[auto_minmax(0,1fr)]"
          )}
        >
          <div
            className={cn(
              cardFrameClassName,
              isTextCard
                ? "h-full min-h-0 w-full overflow-hidden rounded-none"
                : "h-[26rem] max-h-[54vh] min-h-[18rem] w-full overflow-hidden rounded-none bp-1024:h-[22rem] bp-1024:min-h-[16rem] bp-1024:max-h-[48vh]"
            )}
          >
            {/* Text cards reuse the same fixed frame so the modal does not jump. */}
            {isTextCard ? (
              <div className="grid h-full min-h-0 w-full grid-rows-[auto_auto_minmax(0,1fr)] gap-3 p-6 bp-1024:p-5">
                <p className={cn("m-0 text-[var(--delta-red)]", labelTextClassName)}>
                  {activeCard.eyebrow}
                </p>
                <h3 className={cn("m-0", sectionTitleTextClassName)}>{activeCard.title}</h3>
                <div className="min-h-0 overflow-y-auto pr-1">
                  {activeCard.description ? (
                    <div className="grid gap-3">{renderTextCardDescription(activeCard.description)}</div>
                  ) : null}
                </div>
              </div>
            ) : activeCard.imageSrc ? (
              <img
                src={activeCard.imageSrc}
                alt={activeCard.imageAlt}
                className="block h-full w-full object-cover object-top"
              />
            ) : (
              <div
                role="img"
                aria-label={activeCard.imageAlt}
                className="grid h-full w-full place-items-center bg-[rgba(196,211,227,0.35)] px-4 text-center"
              >
                <p className={cn("m-0 text-[var(--text-muted)]", bodySmTextClassName)}>
                  Screenshot unavailable for this release card.
                </p>
              </div>
            )}
          </div>

          {isTextCard ? null : (
            <div className="grid min-h-0 content-start gap-2 overflow-hidden">
              <p className={cn("m-0 text-[var(--delta-red)]", labelTextClassName)}>
                {activeCard.eyebrow}
              </p>
              <h3 className={cn("m-0", sectionTitleTextClassName)}>{activeCard.title}</h3>
              {activeCard.description ? (
                <p className={cn(mutedTextClassName, "max-h-[5.5rem] overflow-y-auto pr-1")}>
                  {activeCard.description}
                </p>
              ) : null}
            </div>
          )}
        </div>

        <div className="grid gap-3 border-t border-[color:var(--line)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={() => setActiveIndex((currentIndex) => currentIndex - 1)}
                disabled={isFirstCard}
              >
                Previous
              </Button>
              <Button
                variant="ghost"
                onClick={() => setActiveIndex((currentIndex) => currentIndex + 1)}
                disabled={isLastCard}
              >
                Next
              </Button>
            </div>

            <div className="flex min-w-0 items-center gap-2">
              <div className="flex items-center gap-1">
                {safeCards.map((card, cardIndex) => {
                  const isActive = cardIndex === activeIndex;

                  return (
                    <button
                      key={card.id}
                      type="button"
                      className={cn(
                        "h-2.5 w-2.5 rounded-none border border-[color:var(--line)] transition-colors",
                        isActive
                          ? "bg-[var(--text-heading)]"
                          : "bg-transparent hover:bg-[var(--surface-option-selected)]"
                      )}
                      aria-label={`Show What's New item ${cardIndex + 1} of ${cardCount}`}
                      aria-current={isActive ? "step" : undefined}
                      onClick={() => setActiveIndex(cardIndex)}
                    />
                  );
                })}
              </div>
              <p className={cn("m-0 whitespace-nowrap text-[var(--text-muted)]", bodySmTextClassName)}>
                {activeIndex + 1} of {cardCount}
              </p>
            </div>

            <Button onClick={handleFinalAction}>{finalButtonLabel}</Button>
          </div>
        </div>
      </Panel>
    </ModalBackdrop>
  );
}
