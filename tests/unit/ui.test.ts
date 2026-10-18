import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePresence } from "../../src/app/hooks";
import { useT } from "../../src/app/i18n";
import { useApp } from "../../src/app/store";
import { renderHook } from "./hookHarness";

vi.mock("../../src/app/db", () => ({ db: {}, nextRequestId: () => 1 }));

describe("useT", () => {
  beforeEach(() => {
    useApp.setState({ lang: "en" });
  });

  it("returns the same function across renders for the same language", () => {
    const hook = renderHook(() => useT(), undefined);
    const first = hook.result();
    hook.rerender();
    hook.rerender();
    expect(hook.result()).toBe(first);
    expect(first("nContacts", 1)).toBe("1 contact");
  });

  it("returns a new function only when the language changes", () => {
    const hook = renderHook(() => useT(), undefined);
    const english = hook.result();
    useApp.setState({ lang: "ar" });
    hook.rerender();
    const arabic = hook.result();
    expect(arabic).not.toBe(english);
    hook.rerender();
    expect(hook.result()).toBe(arabic);
    expect(arabic("nContacts", 1)).toContain("جهة اتصال");
  });
});

describe("usePresence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("mounts immediately when visible", () => {
    const hook = renderHook((props: { visible: boolean }) => usePresence(props.visible, 160), { visible: true });
    expect(hook.result()).toEqual({ mounted: true, state: "open" });
  });

  it("stays mounted as closed for the exit duration, then unmounts", () => {
    const hook = renderHook((props: { visible: boolean }) => usePresence(props.visible, 160), { visible: true });
    hook.rerender({ visible: false });
    expect(hook.result()).toEqual({ mounted: true, state: "closed" });
    hook.act(() => vi.advanceTimersByTime(159));
    expect(hook.result().mounted).toBe(true);
    hook.act(() => vi.advanceTimersByTime(2));
    expect(hook.result()).toEqual({ mounted: false, state: "closed" });
  });

  it("cancels the pending unmount when it becomes visible again", () => {
    const hook = renderHook((props: { visible: boolean }) => usePresence(props.visible, 160), { visible: true });
    hook.rerender({ visible: false });
    hook.act(() => vi.advanceTimersByTime(100));
    hook.rerender({ visible: true });
    hook.act(() => vi.advanceTimersByTime(500));
    expect(hook.result()).toEqual({ mounted: true, state: "open" });
  });

  it("starts unmounted when it begins hidden and mounts when shown", () => {
    const hook = renderHook((props: { visible: boolean }) => usePresence(props.visible, 160), { visible: false });
    expect(hook.result().mounted).toBe(false);
    hook.rerender({ visible: true });
    expect(hook.result()).toEqual({ mounted: true, state: "open" });
  });
});
