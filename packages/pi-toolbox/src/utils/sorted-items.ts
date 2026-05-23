export function sortedItems<T>(items: Iterable<T>, compare: (left: T, right: T) => number): T[] {
  const sorted = [...items];
  return sorted.sort(compare);
}
