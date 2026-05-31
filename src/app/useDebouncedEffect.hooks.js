import { useEffect, useRef } from "react";

// Delays an effect until its inputs stop changing for the requested interval.
// Used to batch persistence writes without changing the saved payload shape.
export function useDebouncedEffect(effect, dependencies, delayMs) {
  const effectRef = useRef(effect);
  const dependenciesRef = useRef([]);

  useEffect(() => {
    effectRef.current = effect;
  }, [effect]);

  useEffect(() => {
    const previousDependencies = dependenciesRef.current;
    const hasChanged =
      previousDependencies.length !== dependencies.length ||
      dependencies.some((value, index) => !Object.is(value, previousDependencies[index]));

    if (!hasChanged) {
      return undefined;
    }

    dependenciesRef.current = dependencies;

    const timeoutHandle = window.setTimeout(() => {
      effectRef.current();
    }, delayMs);

    return () => {
      window.clearTimeout(timeoutHandle);
    };
  });
}
