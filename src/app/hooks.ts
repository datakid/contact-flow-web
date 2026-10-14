import { useEffect, useRef, useState } from "react";
import { useApp } from "./store";

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function useWindowWidth(): number {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

export function useCompact(): boolean {
  const width = useWindowWidth();
  const layout = useApp((s) => s.layout);
  if (layout === "compact") return true;
  if (layout === "desktop") return false;
  return width < 1000;
}

export function useEvent<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useRef(((...args: never[]) => ref.current(...args)) as T);
  return stable.current;
}

export function useClipboard(): (text: string) => Promise<boolean> {
  return async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
}
