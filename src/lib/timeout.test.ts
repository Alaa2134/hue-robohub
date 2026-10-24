import { afterEach, describe, expect, it, vi } from "vitest";
import { timeoutSignal } from "./timeout";

const native = AbortSignal.timeout;
afterEach(() => {
  AbortSignal.timeout = native;
  vi.useRealTimers();
});

describe("timeoutSignal", () => {
  it("aborts after the delay on browsers without AbortSignal.timeout", () => {
    vi.useFakeTimers();
    // @ts-expect-error: an old browser.
    AbortSignal.timeout = undefined;
    const s = timeoutSignal(100);
    vi.advanceTimersByTime(99);
    expect(s.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(s.aborted).toBe(true);
    expect((s.reason as DOMException).name).toBe("TimeoutError");
  });
});
