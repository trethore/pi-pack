import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerExecTool } from '#src/features/exec/index.js';

export default function piCodeact(pi: ExtensionAPI) {
  registerExecTool(pi);
}
