/** Limits how many expensive operations run at once; extra callers wait their turn. */
export function createSemaphore(limit: number) {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError(`Invalid semaphore limit: ${limit}`);
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= limit) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}
