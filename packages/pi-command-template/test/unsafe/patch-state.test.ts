import { describe, expect, it } from 'vitest';
import { disableUnsafePiCommandTemplatePatch, installUnsafePiCommandTemplatePatch } from '#src/unsafe/index.js';
import { getUnsafePatchState, transformUnsafeContent } from '#src/unsafe/patch-state.js';

describe('unsafe patch state', () => {
  it('composes transformers by id and disables one without clearing others', () => {
    const firstId = 'test:first';
    const secondId = 'test:second';
    disableUnsafePiCommandTemplatePatch(firstId);
    disableUnsafePiCommandTemplatePatch(secondId);

    installUnsafePiCommandTemplatePatch(firstId, ({ content }) => `${content} first`);
    installUnsafePiCommandTemplatePatch(secondId, ({ content }) => `${content} second`);

    expect(transformUnsafeContent({ surface: 'system', content: 'value' })).toBe('value first second');

    disableUnsafePiCommandTemplatePatch(firstId);

    expect(transformUnsafeContent({ surface: 'system', content: 'value' })).toBe('value second');

    disableUnsafePiCommandTemplatePatch(secondId);
  });

  it('replaces migrated legacy transformers on install', () => {
    const id = 'test:current';
    const state = getUnsafePatchState();
    state.transformers.set('legacy', ({ content }) => `${content} legacy`);

    installUnsafePiCommandTemplatePatch(id, ({ content }) => `${content} current`);

    expect(transformUnsafeContent({ surface: 'system', content: 'value' })).toBe('value current');

    disableUnsafePiCommandTemplatePatch(id);
  });

  it('clears migrated legacy transformers on disable', () => {
    const id = 'test:disabled';
    const state = getUnsafePatchState();
    state.transformers.set('legacy', ({ content }) => `${content} legacy`);

    disableUnsafePiCommandTemplatePatch(id);

    expect(transformUnsafeContent({ surface: 'system', content: 'value' })).toBe('value');
  });
});
