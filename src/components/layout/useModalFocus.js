import { useEffect, useLayoutEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "[contenteditable='true']",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

// Elements made inert by open modals, with a count so nested modals restore correctly.
const inertCounts = new Map();

function getFocusable(container) {
  if (!container) {
    return [];
  }

  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter((element) => {
    if (element.closest("[inert], [hidden], [aria-hidden='true']")) {
      return false;
    }
    const style = typeof window !== "undefined" ? window.getComputedStyle(element) : null;
    return !style || (style.display !== "none" && style.visibility !== "hidden");
  });
}

// Open modals, innermost last: only the topmost one handles Escape and Tab.
const modalStack = [];

// Makes everything outside `container` inert (keyboard, pointer and assistive technology),
// walking up the ancestor chain so the modal itself and its ancestors stay live.
function inertOutside(container) {
  const touched = [];
  let node = container;

  while (node && node.parentElement && node !== document.body) {
    for (const sibling of node.parentElement.children) {
      if (
        sibling === node ||
        sibling.tagName === "SCRIPT" ||
        sibling.tagName === "STYLE" ||
        sibling.hasAttribute("data-a11y-live")
      ) {
        continue;
      }
      const count = inertCounts.get(sibling) || 0;
      if (count === 0) {
        sibling.setAttribute("inert", "");
      }
      inertCounts.set(sibling, count + 1);
      touched.push(sibling);
    }
    node = node.parentElement;
  }

  return () => {
    for (const element of touched) {
      const count = (inertCounts.get(element) || 1) - 1;
      if (count <= 0) {
        inertCounts.delete(element);
        element.removeAttribute("inert");
      } else {
        inertCounts.set(element, count);
      }
    }
  };
}

/**
 * Modal dialog behavior shared by every overlay (WCAG 2.1.2, 2.4.3, 4.1.2):
 * - moves focus into the dialog on open ([data-autofocus] first, else the first control, else the dialog),
 * - keeps Tab and Shift+Tab inside it,
 * - makes the rest of the page inert while it is open,
 * - closes on Escape when `onEscape` is given,
 * - returns focus to the element that opened it.
 */
export function useModalFocus(containerRef, { active = true, onEscape, inertBackground = true } = {}) {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;
  // Capture the opener in a layout effect: child dialogs may move focus in their own (passive)
  // effects, which run before this hook's passive effect but after all layout effects.
  const openerRef = useRef(null);
  useLayoutEffect(() => {
    if (active && typeof document !== "undefined") {
      openerRef.current = document.activeElement;
    }
  }, [active]);

  useEffect(() => {
    const container = containerRef.current;

    if (!active || !container || typeof document === "undefined") {
      return undefined;
    }

    const opener = openerRef.current && !container.contains(openerRef.current) ? openerRef.current : null;
    const releaseInert = inertBackground ? inertOutside(container) : () => {};

    if (!container.contains(document.activeElement)) {
      const target =
        container.querySelector("[data-autofocus]") ||
        getFocusable(container)[0] ||
        container;
      if (target === container && !container.hasAttribute("tabindex")) {
        container.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: false });
    }

    function handleKeyDown(event) {
      if (modalStack[modalStack.length - 1] !== container) {
        return;
      }

      // A nested popup (for example an open dropdown inside Settings) handles its own keys:
      // the event passes through two dialogs inside this container (the popup and our own panel).
      let dialogDepth = 0;
      for (let node = event.target; node && node !== container; node = node.parentElement) {
        const role = node.getAttribute?.("role");
        if (role === "dialog" || role === "alertdialog") {
          dialogDepth += 1;
        }
      }
      if (dialogDepth >= 2) {
        return;
      }

      if (event.key === "Escape" && onEscapeRef.current) {
        event.stopPropagation();
        onEscapeRef.current(event);
        return;
      }

      if (event.key !== "Tab") {
        return;
      }

      const focusable = getFocusable(container);
      if (!focusable.length) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;

      if (event.shiftKey && (current === first || !container.contains(current))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (current === last || !container.contains(current))) {
        event.preventDefault();
        first.focus();
      }
    }

    // Listen on the document so Escape and Tab work even if focus has slipped out of the dialog.
    modalStack.push(container);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const stackIndex = modalStack.lastIndexOf(container);
      if (stackIndex >= 0) {
        modalStack.splice(stackIndex, 1);
      }
      releaseInert();
      // Return focus to the opener when it still exists and focus was inside the dialog or lost.
      const current = document.activeElement;
      const focusWasInside = !current || current === document.body || container.contains(current);
      if (focusWasInside && opener && typeof opener.focus === "function" && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, inertBackground]);
}

export default useModalFocus;
