import { describe, expect, it, vi } from 'vitest';
import {
  appendImplementationPrompt,
  registerImplementationPromptFeature,
  sendImplementationPrompt,
} from '#pi-handy/features/implementation-prompt.js';
import { defaultConfig } from '#pi-handy/config/schema.js';

describe('implementation prompt feature', () => {
  it('clears the editor and sends the message when the agent is idle', () => {
    // Arrange
    const sendUserMessage = vi.fn();
    const setEditorText = vi.fn();

    // Act
    sendImplementationPrompt(
      { sendUserMessage },
      { isIdle: () => true, ui: { setEditorText } },
      'Proceed with the implementation.'
    );

    // Assert
    expect(setEditorText).toHaveBeenCalledWith('');
    expect(sendUserMessage).toHaveBeenCalledWith('Proceed with the implementation.');
  });

  it('sends the message as steering input when the agent is busy', () => {
    // Arrange
    const sendUserMessage = vi.fn();
    const setEditorText = vi.fn();

    // Act
    sendImplementationPrompt(
      { sendUserMessage },
      { isIdle: () => false, ui: { setEditorText } },
      'Proceed with the implementation.'
    );

    // Assert
    expect(setEditorText).toHaveBeenCalledWith('');
    expect(sendUserMessage).toHaveBeenCalledWith('Proceed with the implementation.', { deliverAs: 'steer' });
  });

  it.each([
    ['', 'Proceed with the implementation.'],
    ['Existing prompt', 'Existing prompt\n\nProceed with the implementation.'],
  ])('appends the message to editor text %#', (currentText, expectedText) => {
    // Arrange
    const setEditorText = vi.fn();

    // Act
    appendImplementationPrompt(
      { ui: { getEditorText: () => currentText, setEditorText } },
      'Proceed with the implementation.'
    );

    // Assert
    expect(setEditorText).toHaveBeenCalledWith(expectedText);
  });

  it('registers both hotkeys with the configured message', () => {
    // Arrange
    const shortcuts = new Map<string, (ctx: unknown) => void>();
    const sendUserMessage = vi.fn();
    const pi = {
      registerShortcut(key: string, options: { handler: (ctx: unknown) => void }) {
        shortcuts.set(key, options.handler);
      },
      sendUserMessage,
    };
    const config = {
      ...defaultConfig,
      implementationPrompt: { enabled: true, message: 'Custom message' },
    };

    // Act
    registerImplementationPromptFeature(pi, config);
    shortcuts.get('ctrl+alt+i')?.({ isIdle: () => true, ui: { setEditorText: vi.fn() } });
    const setEditorText = vi.fn();
    shortcuts.get('ctrl+i')?.({ ui: { getEditorText: () => 'Existing', setEditorText } });

    // Assert
    expect([...shortcuts.keys()]).toEqual(['ctrl+alt+i', 'ctrl+i']);
    expect(sendUserMessage).toHaveBeenCalledWith('Custom message');
    expect(setEditorText).toHaveBeenCalledWith('Existing\n\nCustom message');
  });
});
