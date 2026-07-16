import { describe, expect, it } from 'vitest';

import { seekSequence } from '#pi-toolbox/features/apply-patch/seek-sequence.js';

describe('seekSequence', () => {
  it('matches exact lines from the requested start position', () => {
    expect(seekSequence(['one', 'two', 'three'], ['two', 'three'], 0, false)).toBe(1);
    expect(seekSequence(['one', 'two', 'three'], ['one'], 1, false)).toBeUndefined();
  });

  it('allows trailing whitespace differences without ignoring indentation', () => {
    expect(seekSequence(['  value  '], ['  value'], 0, false)).toBe(0);
    expect(seekSequence(['  value'], ['value'], 0, false)).toBeUndefined();
  });

  it('only matches the final sequence when end-of-file is requested', () => {
    expect(seekSequence(['value', 'other', 'value'], ['value'], 0, true)).toBe(2);
  });
});
