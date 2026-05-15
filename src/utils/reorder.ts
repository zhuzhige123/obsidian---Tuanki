export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (items.length <= 1) {
    return [...items];
  }

  if (fromIndex < 0 || fromIndex >= items.length) {
    return [...items];
  }

  const boundedTargetIndex = Math.max(0, Math.min(toIndex, items.length - 1));
  if (fromIndex === boundedTargetIndex) {
    return [...items];
  }

  const nextItems = [...items];
  const [movedItem] = nextItems.splice(fromIndex, 1);
  nextItems.splice(boundedTargetIndex, 0, movedItem);
  return nextItems;
}

export function resolveReorderTargetIndex(
  activeIndex: number,
  insertionIndex: number,
  length: number
): number {
  if (length <= 1 || activeIndex < 0 || activeIndex >= length) {
    return activeIndex;
  }

  const boundedInsertionIndex = Math.max(0, Math.min(insertionIndex, length));
  const targetIndex = boundedInsertionIndex > activeIndex
    ? boundedInsertionIndex - 1
    : boundedInsertionIndex;

  return Math.max(0, Math.min(targetIndex, length - 1));
}

export function moveItemByInsertionIndex<T>(
  items: readonly T[],
  activeIndex: number,
  insertionIndex: number
): T[] {
  return moveItem(items, activeIndex, resolveReorderTargetIndex(activeIndex, insertionIndex, items.length));
}
