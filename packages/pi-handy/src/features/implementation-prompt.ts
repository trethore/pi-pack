import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Key } from '@earendil-works/pi-tui';
import type { PiHandyConfig } from '#src/config/schema.js';

type ImplementationPromptApi = Pick<ExtensionAPI, 'registerShortcut' | 'sendUserMessage'>;
type SendImplementationPromptContext = Pick<ExtensionContext, 'isIdle'> & {
  ui: Pick<ExtensionContext['ui'], 'setEditorText'>;
};
type AppendImplementationPromptContext = {
  ui: Pick<ExtensionContext['ui'], 'getEditorText' | 'setEditorText'>;
};

export function registerImplementationPromptFeature(pi: ImplementationPromptApi, config: PiHandyConfig): void {
  pi.registerShortcut(Key.ctrlAlt('i'), {
    description: 'Send implementation prompt',
    handler: (ctx) => sendImplementationPrompt(pi, ctx, config.implementationPrompt.message),
  });

  pi.registerShortcut(Key.ctrl('i'), {
    description: 'Append implementation prompt',
    handler: (ctx) => appendImplementationPrompt(ctx, config.implementationPrompt.message),
  });
}

export function sendImplementationPrompt(
  pi: Pick<ExtensionAPI, 'sendUserMessage'>,
  ctx: SendImplementationPromptContext,
  message: string
): void {
  ctx.ui.setEditorText('');

  if (ctx.isIdle()) {
    pi.sendUserMessage(message);
    return;
  }

  pi.sendUserMessage(message, { deliverAs: 'steer' });
}

export function appendImplementationPrompt(ctx: AppendImplementationPromptContext, message: string): void {
  const currentText = ctx.ui.getEditorText();
  ctx.ui.setEditorText(currentText.length === 0 ? message : `${currentText}\n\n${message}`);
}
