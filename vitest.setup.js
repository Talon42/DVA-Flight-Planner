// Node 25 exposes a global localStorage object that Vitest copies over jsdom's Storage wrapper.
// Restore jsdom's origin-aware implementation so browser-mode persistence tests exercise the app contract.
if (typeof window !== "undefined" && window._localStorage) {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    enumerable: true,
    value: window._localStorage
  });
}
