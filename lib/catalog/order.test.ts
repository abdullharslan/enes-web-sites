import { describe, expect, it } from "vitest";
import { moveItem } from "./order";

describe("moveItem", () => {
  const list = ["a", "b", "c", "d"];

  it("moves up, down and to the front", () => {
    expect(moveItem(list, "c", "up")).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(list, "b", "down")).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(list, "d", "first")).toEqual(["d", "a", "b", "c"]);
  });

  it("is a no-op at the edges and for unknown items", () => {
    expect(moveItem(list, "a", "up")).toEqual(list);
    expect(moveItem(list, "d", "down")).toEqual(list);
    expect(moveItem(list, "x", "first")).toEqual(list);
  });

  it("does not mutate its input", () => {
    const copy = [...list];
    moveItem(list, "c", "first");
    expect(list).toEqual(copy);
  });
});
