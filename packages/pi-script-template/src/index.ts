import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerScriptTemplate } from '#src/script-template/index.js';

export default function piScriptTemplate(pi: ExtensionAPI) {
  registerScriptTemplate(pi, process.cwd());
}
