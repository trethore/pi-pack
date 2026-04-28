import { describe, expect, it } from 'vitest';
import { foldRepeatedBlocks } from '../../../src/features/repeated-block-folding/fold-repeated-blocks.js';

describe('foldRepeatedBlocks', () => {
  it('folds consecutive repeated blocks at the minimum block size', () => {
    expect(foldRepeatedBlocks('a\nb\nc\na\nb\nc\n', 3)).toBe(
      'a\nb\nc\n[previous block of 3 lines repeated x1]\n'
    );
  });

  it('folds all consecutive repetitions of the same block', () => {
    expect(foldRepeatedBlocks('a\nb\nc\na\nb\nc\na\nb\nc\n', 3)).toBe(
      'a\nb\nc\n[previous block of 3 lines repeated x2]\n'
    );
  });

  it('does not fold blocks smaller than minLines', () => {
    expect(foldRepeatedBlocks('a\nb\na\nb\n', 3)).toBe('a\nb\na\nb\n');
  });

  it('does not fold empty blocks', () => {
    expect(foldRepeatedBlocks('\n\n\n\n\n\n', 3)).toBe('\n\n\n\n\n\n');
  });

  it('does not fold pure duplicate-line runs before duplicate line folding can process them', () => {
    expect(foldRepeatedBlocks('x\nx\nx\nx\nx\nx\n', 3)).toBe('x\nx\nx\nx\nx\nx\n');
  });

  it('folds repeated blocks without a final line ending', () => {
    expect(foldRepeatedBlocks('a\nb\nc\nd\na\nb\nc\nd', 4)).toBe(
      'a\nb\nc\nd\n[previous block of 4 lines repeated x1]'
    );
  });
});
