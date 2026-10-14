export type MoveDirection = "up" | "down" | "first";

/** Returns a new list with `item` moved one step up/down or to the front (no-op at edges). */
export function moveItem<T>(list: readonly T[], item: T, direction: MoveDirection): T[] {
  const index = list.indexOf(item);
  const result = [...list];
  if (index === -1) return result;
  const target = direction === "first" ? 0 : direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= list.length || target === index) return result;
  result.splice(index, 1);
  result.splice(target, 0, item);
  return result;
}
