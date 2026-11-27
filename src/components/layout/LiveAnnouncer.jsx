import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { announcerListeners } from "./announcer";

// Renders the app's one pair of live regions; call announce() from ./announcer to speak a message.
export default function LiveAnnouncer() {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");

  useEffect(() => {
    let clearTimer = 0;

    function handle({ text, assertive: isAssertive }) {
      const setRegion = isAssertive ? setAssertive : setPolite;
      // Clear first so the same text announced again later is still read.
      setRegion("");
      window.setTimeout(() => setRegion(text), 50);
      window.clearTimeout(clearTimer);
      clearTimer = window.setTimeout(() => {
        setPolite("");
        setAssertive("");
      }, 10000);
    }

    announcerListeners.add(handle);
    return () => {
      announcerListeners.delete(handle);
      window.clearTimeout(clearTimer);
    };
  }, []);

  // Portalled to <body> and marked so open modals never make it inert: announcements must
  // still be heard while a dialog or the sync spinner is showing.
  const regions = (
    <div data-a11y-live="">
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(regions, document.body) : regions;
}
