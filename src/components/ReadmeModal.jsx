import { Component, useRef } from "react";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import { cn } from "./ui/cn";
import SectionHeader from "./ui/SectionHeader";
import { supportCopyTextClassName } from "./ui/typography";
import MarkdownHelpContent from "./help/MarkdownHelpContent";

import readmeText from "../../README.md?raw";
import ModalBackdrop from "./layout/ModalBackdrop";

class ReadmeModalBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <Panel
          as="section"
          padding="lg"
          className="grid h-[min(calc(100vh-24px),48rem)] w-[min(920px,calc(100vw-24px))] gap-4 bg-[var(--modal-shell-bg)] bp-1024:h-[min(calc(100vh-24px),44rem)]"
          role="alertdialog"
          aria-modal="true"
          aria-label="README failed to render"
        >
          <SectionHeader eyebrow="Help" title="Unable to render README" />
          <p className={cn("m-0 text-[var(--text-muted)]", supportCopyTextClassName)}>
            The README content could not be displayed.
          </p>
          <div className="flex justify-end">
            <Button variant="ghost" onClick={this.props.onClose}>
              Close
            </Button>
          </div>
        </Panel>
      );
    }

    return this.props.children;
  }
}

// Renders the repository README inside the app's standard modal shell.
export default function ReadmeModal({ isOpen, onClose }) {
  const scrollContainerRef = useRef(null);

  if (!isOpen) {
    return null;
  }

  return (
    <ModalBackdrop onClick={onClose}>
      <ReadmeModalBoundary onClose={onClose}>
        <Panel
          as="section"
          padding="lg"
          className="flex h-[min(calc(100vh-24px),48rem)] w-[min(920px,calc(100vw-24px))] max-w-full flex-col gap-4 overflow-hidden bg-[var(--modal-shell-bg)] bp-1024:h-[min(calc(100vh-24px),44rem)] bp-1024:gap-3"
          role="dialog"
          aria-modal="true"
          aria-label="README"
          onClick={(event) => event.stopPropagation()}
        >
          <SectionHeader
            eyebrow="Help"
            title="README"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    const container = scrollContainerRef.current;

                    if (container) {
                      container.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                >
                  Back to Top
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            }
          />

          <div
            ref={scrollContainerRef}
            className="app-scrollbar min-h-0 flex-1 overflow-y-auto pr-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)]"
            tabIndex={0}
            role="region"
            aria-label="README contents"
          >
            <article className="grid gap-4 rounded-none bg-[var(--surface)] p-4">
              <MarkdownHelpContent markdown={readmeText} scrollContainerRef={scrollContainerRef} />
            </article>
          </div>
        </Panel>
      </ReadmeModalBoundary>
    </ModalBackdrop>
  );
}
