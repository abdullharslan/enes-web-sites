import { describe, expect, it } from "vitest";
import { createSemaphore } from "./semaphore";

describe("createSemaphore", () => {
  it("never runs more than `limit` tasks at once and runs them all", async () => {
    const run = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const task = async (i: number) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return i;
    };
    const results = await Promise.all(
      Array.from({ length: 7 }, (_, i) => run(() => task(i))),
    );
    expect(results).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(peak).toBe(2);
  });

  it("releases its slot when a task fails", async () => {
    const run = createSemaphore(1);
    await expect(run(async () => Promise.reject(new Error("boom")))).rejects.toThrow(
      "boom",
    );
    await expect(run(async () => "ok")).resolves.toBe("ok");
  });

  it("rejects invalid limits", () => {
    expect(() => createSemaphore(0)).toThrow(RangeError);
  });
});
