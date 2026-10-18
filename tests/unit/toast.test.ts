import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useApp } from "../../src/app/store";

vi.mock("../../src/app/db", () => ({ db: {}, nextRequestId: () => 1 }));

describe("toast queue", () => {
  beforeEach(() => {
    useApp.setState({ toasts: [] });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops an identical consecutive toast without an undo", () => {
    const { toast } = useApp.getState();
    toast("Copied");
    toast("Copied");
    expect(useApp.getState().toasts).toHaveLength(1);
  });

  it("keeps toasts that differ by tone, message or undo target", () => {
    const { toast } = useApp.getState();
    toast("Copied");
    toast("Copied", null, "error");
    toast("Saved", "h1");
    toast("Saved", "h1");
    toast("Copied");
    expect(useApp.getState().toasts.map((item) => item.message)).toEqual(["Copied", "Copied", "Saved", "Saved", "Copied"]);
  });

  it("keeps only the newest three open and marks the rest closed", () => {
    const { toast } = useApp.getState();
    for (const message of ["a", "b", "c", "d", "e"]) toast(message);
    const toasts = useApp.getState().toasts;
    expect(toasts.map((item) => item.open)).toEqual([false, false, true, true, true]);
  });

  it("never removes a toast on its own timer", () => {
    useApp.getState().toast("still here");
    vi.advanceTimersByTime(60000);
    const toasts = useApp.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.open).toBe(true);
  });

  it("removes a toast only when it is dismissed", () => {
    const { toast, dismissToast } = useApp.getState();
    toast("gone soon");
    const id = useApp.getState().toasts[0]?.id ?? -1;
    dismissToast(id);
    expect(useApp.getState().toasts).toHaveLength(0);
  });
});
