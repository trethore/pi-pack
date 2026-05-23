import { describe, expect, it } from 'vitest';

import { sortedItems } from '#pi-toolbox/utils/sorted-items.js';

describe('sortedItems', () => {
  it('returns items sorted by the provided comparator', () => {
    expect(sortedItems([3, 1, 2], (left, right) => left - right)).toEqual([1, 2, 3]);
  });

  it('does not mutate source arrays', () => {
    // Arrange
    const source = [3, 1, 2];

    // Act
    const sorted = sortedItems(source, (left, right) => left - right);

    // Assert
    expect(sorted).toEqual([1, 2, 3]);
    expect(source).toEqual([3, 1, 2]);
  });

  it('accepts generic iterables', () => {
    expect(
      sortedItems(new Set(['b', 'a', 'c']), (left, right) => left.localeCompare(right))
    ).toEqual(['a', 'b', 'c']);
  });
});
