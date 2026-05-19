export function sortedItems<T>(items: Iterable<T>, compare: (left: T, right: T) => number): T[] {
  const sorted: T[] = [];

  for (const item of items) {
    const index = sorted.findIndex((sortedItem) => compare(item, sortedItem) < 0);
    if (index === -1) {
      sorted.push(item);
    } else {
      sorted.splice(index, 0, item);
    }
  }

  return sorted;
}
