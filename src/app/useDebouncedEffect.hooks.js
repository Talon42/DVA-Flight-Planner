import { useEffect, useRef } from "react";

// Delays an effect until its inputs stop changing for the requested interval.
// Used to batch persistence writes without changing the saved payload shape.
export function useDebouncedEffect(effect, dependencies, delayMs) {
  const effectRef = useRef(effect);
  const timeoutRef = useRef(null);
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

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      effectRef.current();
    }, delayMs);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  });

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
        effectRef.current();
      }
    };
  }, []);
}
