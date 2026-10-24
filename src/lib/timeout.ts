/**
 * A signal that aborts after `ms`. AbortSignal.timeout is missing on older browsers (Chrome < 103,
 * Safari < 16), where calling it threw and broke the form, so fall back to a controller and a timer.
 */
export function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(new DOMException("The operation timed out.", "TimeoutError")), ms);
  return c.signal;
}
