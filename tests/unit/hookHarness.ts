import React from "react";

type Slot = Record<string, unknown>;

interface Internals {
  ReactCurrentDispatcher: { current: unknown };
}

const internals = (React as unknown as { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED: Internals }).__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function sameDeps(a: unknown[] | undefined, b: unknown[] | undefined): boolean {
  return Boolean(a) && Boolean(b) && a!.length === b!.length && a!.every((value, index) => Object.is(value, b![index]));
}

export interface HookHandle<P, R> {
  result: () => R;
  rerender: (next?: P) => void;
  act: (fn: () => void) => void;
  unmount: () => void;
}

export function renderHook<P, R>(hook: (props: P) => R, initial: P): HookHandle<P, R> {
  const slots: Slot[] = [];
  let cursor = 0;
  let props = initial;
  let current: R;
  let queued: Array<() => void> = [];
  let dirty = false;

  const take = (create: () => Slot): Slot => {
    const index = cursor++;
    if (!slots[index]) slots[index] = create();
    return slots[index]!;
  };

  const effect = (run: () => void | (() => void), deps?: unknown[]): void => {
    const slot = take(() => ({ deps: undefined, ran: false, cleanup: undefined }));
    if (slot.ran && sameDeps(slot.deps as unknown[] | undefined, deps)) return;
    queued.push(() => {
      if (typeof slot.cleanup === "function") (slot.cleanup as () => void)();
      slot.cleanup = run();
      slot.deps = deps;
      slot.ran = true;
    });
  };

  const memo = <T,>(factory: () => T, deps?: unknown[]): T => {
    const slot = take(() => ({ deps: undefined, value: undefined, ready: false }));
    if (!slot.ready || !sameDeps(slot.deps as unknown[] | undefined, deps)) {
      slot.value = factory();
      slot.deps = deps;
      slot.ready = true;
    }
    return slot.value as T;
  };

  const dispatcher = {
    useState: <T,>(initialState: T | (() => T)) => {
      const slot = take(() => {
        const state: Slot = { value: typeof initialState === "function" ? (initialState as () => T)() : initialState };
        state.set = (next: unknown) => {
          const value = typeof next === "function" ? (next as (previous: unknown) => unknown)(state.value) : next;
          if (!Object.is(value, state.value)) {
            state.value = value;
            dirty = true;
          }
        };
        return state;
      });
      return [slot.value, slot.set];
    },
    useRef: <T,>(initialValue: T) => take(() => ({ current: initialValue })),
    useMemo: memo,
    useCallback: <T,>(callback: T, deps?: unknown[]) => memo(() => callback, deps),
    useEffect: effect,
    useLayoutEffect: effect,
    useDebugValue: () => undefined,
    useSyncExternalStore: <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot()
  };

  const flush = (): void => {
    let guard = 0;
    do {
      dirty = false;
      cursor = 0;
      internals.ReactCurrentDispatcher.current = dispatcher;
      try {
        current = hook(props);
      } finally {
        internals.ReactCurrentDispatcher.current = null;
      }
      const run = queued;
      queued = [];
      for (const job of run) job();
      guard += 1;
    } while (dirty && guard < 25);
  };

  flush();

  return {
    result: () => current,
    rerender: (next) => {
      if (next !== undefined) props = next;
      flush();
    },
    act: (fn) => {
      fn();
      if (dirty) flush();
    },
    unmount: () => {
      for (const slot of slots) if (slot && typeof slot.cleanup === "function") (slot.cleanup as () => void)();
    }
  };
}
