/**
 * Thrown when a stage of the check run exceeds its allotted time budget.
 * `stage` is a short, human-readable description (e.g. "process startup",
 * "waiting for the process to exit") used verbatim in error messages.
 */
export class TimeoutError extends Error {
  readonly stage: string;
  readonly ms: number;

  constructor(stage: string, ms: number) {
    super(`Timed out after ${String(ms)}ms while ${stage}`);
    this.name = "TimeoutError";
    this.stage = stage;
    this.ms = ms;
  }
}

/**
 * Races `promise` against a timer. On timeout, rejects with `TimeoutError`.
 * Does not cancel `promise` itself — callers that need to stop underlying
 * work (e.g. kill a child process) must do so in response to the rejection.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, stage: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new TimeoutError(stage, ms));
    }, ms);
  });
  try {
    return await Promise.race([promise, timedOut]);
  } finally {
    clearTimeout(timer);
  }
}
