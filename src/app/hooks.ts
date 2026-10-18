import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { useApp } from "./store";

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

const COMPACT_QUERY = "(max-width: 999.98px)";

function subscribeCompact(onChange: () => void): () => void {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function narrowNow(): boolean {
  return window.matchMedia(COMPACT_QUERY).matches;
}

export function isCompactNow(): boolean {
  const layout = useApp.getState().layout;
  if (layout === "compact") return true;
  if (layout === "desktop") return false;
  return narrowNow();
}

export function useCompact(): boolean {
  const narrow = useSyncExternalStore(subscribeCompact, narrowNow, () => false);
  const layout = useApp((s) => s.layout);
  if (layout === "compact") return true;
  if (layout === "desktop") return false;
  return narrow;
}

export function useEvent<T extends (...args: never[]) => unknown>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  const stable = useRef(((...args: never[]) => ref.current(...args)) as T);
  return stable.current;
}

export function usePresence(visible: boolean, exitMs = 160): { mounted: boolean; state: "open" | "closed" } {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => {
    if (visible) {
      setMounted(true);
      return undefined;
    }
    const id = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(id);
  }, [visible, exitMs]);
  return { mounted: visible || mounted, state: visible ? "open" : "closed" };
}

export function useSwipeBack(ref: RefObject<HTMLElement>, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let tracking = false;
    let startX = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;
    let dx = 0;
    const rtl = (): boolean => document.documentElement.dir === "rtl";
    const onDown = (e: PointerEvent): void => {
      if (e.pointerType !== "touch") return;
      const edge = rtl() ? e.clientX > window.innerWidth - 24 : e.clientX < 24;
      if (!edge) return;
      tracking = true;
      startX = e.clientX;
      lastX = e.clientX;
      lastT = e.timeStamp;
      velocity = 0;
      dx = 0;
      el.style.transition = "none";
    };
    const onMove = (e: PointerEvent): void => {
      if (!tracking) return;
      const raw = e.clientX - startX;
      dx = rtl() ? Math.min(0, raw) : Math.max(0, raw);
      const dt = e.timeStamp - lastT;
      if (dt > 0) velocity = (e.clientX - lastX) / dt;
      lastX = e.clientX;
      lastT = e.timeStamp;
      el.style.transform = `translateX(${dx}px)`;
    };
    const onUp = (): void => {
      if (!tracking) return;
      tracking = false;
      const width = el.offsetWidth || window.innerWidth;
      const outward = rtl() ? -velocity : velocity;
      if (Math.abs(dx) > width * 0.3 || outward > 0.5) {
        el.style.transition = "transform 200ms var(--ease-in)";
        el.style.transform = `translateX(${rtl() ? -100 : 100}%)`;
        const done = (): void => {
          el.removeEventListener("transitionend", done);
          el.style.transition = "";
          el.style.transform = "";
          closeRef.current();
        };
        el.addEventListener("transitionend", done);
      } else {
        el.style.transition = "transform 260ms var(--ease-out)";
        el.style.transform = "";
      }
    };
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  });
}
