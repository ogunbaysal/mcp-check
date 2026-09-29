/** Result of `measure`: the wrapped function's return value plus elapsed time. */
export interface Measured<T> {
  value: T;
  ms: number;
}

/**
 * Runs `fn`, returning its resolved value alongside the elapsed wall-clock
 * time in whole milliseconds. If `fn` rejects, the rejection propagates and
 * no timing is recorded (callers that need timing-on-failure should measure
 * around their own try/catch using `performance.now()` directly).
 */
export async function measure<T>(fn: () => Promise<T>): Promise<Measured<T>> {
  const startedAt = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - startedAt) };
}
