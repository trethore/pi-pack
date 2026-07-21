import { afterEach, describe, expect, it } from 'vitest';
import { disableUnsafePiCommandTemplatePatch, installUnsafePiCommandTemplatePatch } from '#src/unsafe/index.js';
import { getUnsafePatchState, transformUnsafeContent } from '#src/unsafe/patch-state.js';

const firstId = 'test:first';
const secondId = 'test:second';

function installTestTransformers(): void {
  installUnsafePiCommandTemplatePatch(firstId, ({ content }) => `${content} first`);
  installUnsafePiCommandTemplatePatch(secondId, ({ content }) => `${content} second`);
}

describe('unsafe patch state', () => {
  afterEach(() => {
    disableUnsafePiCommandTemplatePatch(firstId);
    disableUnsafePiCommandTemplatePatch(secondId);
  });

  it('composes transformers by id', () => {
    // Arrange
    installTestTransformers();

    // Act
    const output = transformUnsafeContent({ surface: 'system', content: 'value' });

    // Assert
    expect(output).toBe('value first second');
  });

  it('disables one transformer without clearing others', () => {
    // Arrange
    installTestTransformers();

    // Act
    disableUnsafePiCommandTemplatePatch(firstId);
    const output = transformUnsafeContent({ surface: 'system', content: 'value' });

    // Assert
    expect(output).toBe('value second');
  });

  it('replaces migrated legacy transformers on install', () => {
    // Arrange
    const state = getUnsafePatchState();
    state.transformers.set('legacy', ({ content }) => `${content} legacy`);

    // Act
    installUnsafePiCommandTemplatePatch(firstId, ({ content }) => `${content} current`);
    const output = transformUnsafeContent({ surface: 'system', content: 'value' });

    // Assert
    expect(output).toBe('value current');
  });

  it('clears migrated legacy transformers on disable', () => {
    // Arrange
    const state = getUnsafePatchState();
    state.transformers.set('legacy', ({ content }) => `${content} legacy`);

    // Act
    disableUnsafePiCommandTemplatePatch(firstId);
    const output = transformUnsafeContent({ surface: 'system', content: 'value' });

    // Assert
    expect(output).toBe('value');
  });
});
