import { initTheme, type Theme } from '@earendil-works/pi-coding-agent';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AccountSelector } from '#pi-account/selector.js';

beforeAll(() => {
  initTheme('dark');
});

describe('account picker', () => {
  it('sets the highlighted account as default with Ctrl+S', () => {
    // Arrange
    const { selector, done, setDefault } = createSelector();

    // Act
    selector.handleInput('work');
    selector.handleInput('\u0013');

    // Assert
    expect(setDefault).toHaveBeenCalledExactlyOnceWith('work');
    expect(done).not.toHaveBeenCalled();
  });

  it('ignores Ctrl+S when no account matches', () => {
    // Arrange
    const { selector, setDefault } = createSelector();

    // Act
    selector.handleInput('zzzz');
    selector.handleInput('\u0013');

    // Assert
    expect(setDefault).not.toHaveBeenCalled();
  });

  it('preselects the current account and renders its indicator', () => {
    // Arrange
    const { selector, done } = createSelector();

    // Act
    const rendered = selector.render(80).join('\n');
    selector.handleInput('\r');

    // Assert
    expect(rendered).toContain('Provider Accounts');
    expect(rendered).toContain('* personal');
    expect(done).toHaveBeenCalledExactlyOnceWith('personal');
  });

  it('filters the list as the query changes', () => {
    // Arrange
    const { selector, done } = createSelector();

    // Act
    selector.handleInput('w');
    selector.handleInput('o');
    const rendered = selector.render(80).join('\n');
    selector.handleInput('\r');

    // Assert
    expect(rendered).toContain('work');
    expect(rendered).not.toContain('personal');
    expect(done).toHaveBeenCalledExactlyOnceWith('work');
  });

  it('supports keyboard navigation', () => {
    // Arrange
    const { selector, done } = createSelector();

    // Act
    selector.handleInput('\u001B[B');
    selector.handleInput('\r');

    // Assert
    expect(done).toHaveBeenCalledExactlyOnceWith('work');
  });

  it('does not select a hidden account when the query has no matches', () => {
    // Arrange
    const { selector, done } = createSelector();

    // Act
    selector.handleInput('zzzz');
    selector.handleInput('\r');

    // Assert
    expect(done).not.toHaveBeenCalled();
    selector.handleInput('\u001B');
    expect(done).toHaveBeenCalledExactlyOnceWith();
  });

  it('forwards focus to the search input', () => {
    // Arrange
    const { selector } = createSelector();

    // Act / Assert
    selector.focused = true;
    expect(selector.focused).toBe(true);
    selector.focused = false;
    expect(selector.focused).toBe(false);
  });
});

function createSelector() {
  const done = vi.fn();
  const setDefault = vi.fn();
  const theme = { fg: (_color: string, text: string) => text } as Theme;
  const selector = new AccountSelector(
    [
      { value: 'personal', label: '* personal', description: 'OpenAI Codex' },
      { value: 'work', label: '  work', description: 'OpenAI Codex' },
    ],
    'personal',
    theme,
    done,
    setDefault
  );
  return { selector, done, setDefault };
}
