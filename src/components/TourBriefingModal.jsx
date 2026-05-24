import { useEffect, useRef, useState } from "react";
import Button from "./ui/Button";
import Panel from "./ui/Panel";
import { cn } from "./ui/cn";
import { modalBackdropClassName } from "./ui/patterns";
import SectionHeader from "./ui/SectionHeader";
import { bodySmTextClassName, supportCopyTextClassName } from "./ui/typography";

function decodeBase64ToBlobUrl(base64, contentType) {
  const normalizedBase64 = String(base64 || "").trim();
  if (!normalizedBase64) {
    return "";
  }

  const binary = window.atob(normalizedBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const blob = new Blob([bytes], {
    type: String(contentType || "application/pdf").trim() || "application/pdf"
  });

  return URL.createObjectURL(blob);
}

const PDF_EMBED_SIZING_MAX_ATTEMPTS = 8;

function applyEmbeddedPdfSizing(iframe, attempt = 0) {
  if (!iframe || !iframe.isConnected) {
    return;
  }

  const scheduleRetry = () => {
    if (attempt >= PDF_EMBED_SIZING_MAX_ATTEMPTS) {
      return;
    }

    const nextAttempt = attempt + 1;
    const retry = () => applyEmbeddedPdfSizing(iframe, nextAttempt);
    if (attempt < 3 && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(retry);
    } else {
      window.setTimeout(retry, 50);
    }
  };

  let embeddedDocument = null;
  try {
    embeddedDocument = iframe.contentDocument || iframe.contentWindow?.document || null;
  } catch {
    scheduleRetry();
    return;
  }

  if (!embeddedDocument) {
    scheduleRetry();
    return;
  }

  const pdfEmbed = embeddedDocument.querySelector('embed[type="application/pdf"]');
  if (!pdfEmbed) {
    scheduleRetry();
    return;
  }

  // Packaged Tauri/Chromium creates a same-origin internal PDF wrapper that can default to a tiny height,
  // so we normalize the generated PDF document after the iframe loads.
  const { documentElement, body } = embeddedDocument;
  if (documentElement) {
    Object.assign(documentElement.style, {
      width: "100%",
      height: "100%",
      minHeight: "100%",
      margin: "0",
      padding: "0",
      overflow: "hidden"
    });
  }

  if (body) {
    Object.assign(body.style, {
      width: "100%",
      height: "100%",
      minHeight: "100%",
      margin: "0",
      padding: "0",
      overflow: "hidden",
      backgroundColor: "rgb(51, 51, 51)"
    });
  }

  Object.assign(pdfEmbed.style, {
    position: "fixed",
    inset: "0",
    display: "block",
    width: "100vw",
    height: "100vh",
    minHeight: "100vh",
    border: "0"
  });
  pdfEmbed.setAttribute("width", "100%");
  pdfEmbed.setAttribute("height", "100%");
}

export function isAllowedDvaTourBriefingUrl(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith("/attach/tbrief/")) {
    return true;
  }

  try {
    const parsed = new URL(normalized);
    return (
      parsed.protocol === "https:" &&
      /^(?:www\.)?deltava\.org$/i.test(parsed.host) &&
      parsed.pathname.startsWith("/attach/tbrief/")
    );
  } catch (_) {
    return false;
  }
}

async function openBriefingInBrowser(briefingUrl) {
  const normalizedUrl = String(briefingUrl || "").trim();
  if (!isAllowedDvaTourBriefingUrl(normalizedUrl)) {
    return;
  }

  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(normalizedUrl);
  } catch {
    window.open(normalizedUrl, "_blank", "noopener,noreferrer");
  }
}

// Displays a synced Delta Virtual tour briefing PDF inside the app shell.
export default function TourBriefingModal({ isOpen, briefingUrl, tourName, onClose }) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [pdfFilename, setPdfFilename] = useState("");
  const pdfUrlRef = useRef("");

  useEffect(() => {
    if (!isOpen) {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = "";
      }
      setIsLoading(false);
      setError("");
      setPdfUrl("");
      setPdfFilename("");
      return undefined;
    }

    const normalizedBriefingUrl = String(briefingUrl || "").trim();
    if (!isAllowedDvaTourBriefingUrl(normalizedBriefingUrl)) {
      setError("This briefing URL could not be validated.");
      setIsLoading(false);
      setPdfUrl("");
      setPdfFilename("");
      return undefined;
    }

    let cancelled = false;

    async function loadBriefing() {
      setIsLoading(true);
      setError("");

      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = "";
      }

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke("fetch_delta_virtual_tour_briefing", {
          request: {
            briefingUrl: normalizedBriefingUrl
          }
        });

        if (cancelled) {
          return;
        }

        const nextBlobUrl = decodeBase64ToBlobUrl(result?.base64 || "", result?.contentType || "application/pdf");
        if (!nextBlobUrl) {
          throw new Error("The briefing PDF could not be decoded.");
        }

        pdfUrlRef.current = nextBlobUrl;
        setPdfUrl(nextBlobUrl);
        setPdfFilename(String(result?.filename || "").trim());
        setIsLoading(false);
      } catch (loadError) {
        if (cancelled) {
          return;
        }

        setError(loadError?.message || "The briefing PDF could not be loaded.");
        setIsLoading(false);
        setPdfUrl("");
        setPdfFilename("");
      }
    }

    loadBriefing();

    return () => {
      cancelled = true;
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = "";
      }
    };
  }, [briefingUrl, isOpen]);

  if (!isOpen) {
    return null;
  }

  const briefingTitle = `${String(tourName || "").trim() || "Tour"} Briefing`;

  function handlePdfLoad(event) {
    applyEmbeddedPdfSizing(event.currentTarget);
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 grid place-items-center overflow-auto p-4 bp-1024:p-3",
        modalBackdropClassName
      )}
      role="presentation"
      onClick={onClose}
    >
      <Panel
        as="section"
        padding="lg"
        className="flex h-[min(calc(100vh-24px),86vh)] w-[min(calc(100vw-24px),86vw)] max-w-full flex-col gap-4 overflow-hidden rounded-none bg-[var(--modal-shell-bg)] shadow-[0_20px_56px_rgba(10,24,43,0.26)] bp-1024:gap-3"
        role="dialog"
        aria-modal="true"
        aria-label={briefingTitle}
        onClick={(event) => event.stopPropagation()}
      >
        <SectionHeader
          eyebrow="Tours"
          title={briefingTitle}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-none"
                onClick={() => openBriefingInBrowser(briefingUrl)}
              >
                Open in Browser
              </Button>
              <Button variant="ghost" size="sm" className="rounded-none" onClick={onClose}>
                Close
              </Button>
            </div>
          }
        />

        <div className="min-h-0 flex-1 overflow-hidden border border-[color:var(--line)] bg-[var(--surface)]">
          {isLoading ? (
            <div className="grid h-full place-items-center px-6 py-10 text-center">
              <div className="grid justify-items-center gap-3">
                <svg
                  viewBox="0 0 24 24"
                  className="h-10 w-10 animate-spin text-[var(--delta-red)]"
                  aria-hidden="true"
                >
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    fill="none"
                    stroke="currentColor"
                    strokeDasharray="32"
                    strokeDashoffset="24"
                    strokeLinecap="round"
                    strokeWidth="2"
                  />
                </svg>
                <p className={cn("m-0", supportCopyTextClassName, "text-[var(--text-muted)]")}>
                  Loading briefing PDF...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="grid h-full place-items-center px-6 py-10 text-center">
              <div className="grid max-w-lg justify-items-center gap-4">
                <h3 className="m-0 text-[1.1rem] font-semibold text-[var(--text-heading)]">
                  Unable to load briefing PDF
                </h3>
                <p className={cn("m-0", bodySmTextClassName, "text-[var(--text-muted)]")}>{error}</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <Button variant="ghost" size="sm" className="rounded-none" onClick={onClose}>
                    Close
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-none"
                    onClick={() => openBriefingInBrowser(briefingUrl)}
                  >
                    Open in Browser
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full w-full">
              <iframe
                src={pdfUrl}
                title={briefingTitle}
                className="h-full w-full border-0"
                onLoad={handlePdfLoad}
              />
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
