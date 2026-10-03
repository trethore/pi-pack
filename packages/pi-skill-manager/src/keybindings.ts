import { KeybindingsManager, type KeybindingDefinitions } from "@earendil-works/pi-tui";

declare module "@earendil-works/pi-tui" {
  interface Keybindings {
    "pi-skill-manager.save": true;
    "pi-skill-manager.nextSection": true;
    "pi-skill-manager.previousSection": true;
  }
}

export type ManagerKeybindings = Pick<KeybindingsManager, "getKeys" | "getUserBindings">;

export function createManagerKeybindings(keybindings: ManagerKeybindings): KeybindingsManager {
  const definitions: KeybindingDefinitions = {
    "pi-skill-manager.save": { defaultKeys: "ctrl+s", description: "Save skill selection" },
    "pi-skill-manager.nextSection": { defaultKeys: ["tab", "right"], description: "Next skill manager section" },
    "pi-skill-manager.previousSection": {
      defaultKeys: ["shift+tab", "left"],
      description: "Previous skill manager section",
    },
  };
  const navigationKeys = new Set<string>();
  for (const action of [
    "tui.select.up",
    "tui.select.down",
    "tui.select.pageUp",
    "tui.select.pageDown",
    "tui.select.confirm",
    "tui.select.cancel",
  ] as const) {
    const keys = keybindings.getKeys(action);
    definitions[action] = { defaultKeys: keys };
    for (const key of keys) navigationKeys.add(key);
  }
  const userBindings = keybindings.getUserBindings();
  const manager = new KeybindingsManager(definitions, userBindings);
  // Selection actions take precedence; do not advertise shadowed shortcut keys.
  for (const action of [
    "pi-skill-manager.save",
    "pi-skill-manager.nextSection",
    "pi-skill-manager.previousSection",
  ] as const) {
    userBindings[action] = manager.getKeys(action).filter((key) => !navigationKeys.has(key));
  }
  manager.setUserBindings(userBindings);
  return manager;
}
