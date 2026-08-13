import { getKeybindings, type Keybinding } from '@earendil-works/pi-tui';

export function formatKeybindingText(keybinding: Keybinding): string {
  const keys = getKeybindings().getKeys(keybinding);
  return keys.length > 0 ? keys.join('/') : keybinding;
}
