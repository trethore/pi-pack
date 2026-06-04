import { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  getUnsafePatchState,
  transformUnsafeContent,
  type AgentSessionPrototype,
} from '#src/unsafe/patch-state.js';

export function installAgentSessionPatch(): string[] {
  const warnings: string[] = [];
  const state = getUnsafePatchState();
  const prototype = AgentSession.prototype as unknown as AgentSessionPrototype;

  if (typeof prototype._expandSkillCommand !== 'function') {
    warnings.push(
      'pi-command-template: AgentSession._expandSkillCommand unavailable; /skill invocation templates disabled.'
    );
    return warnings;
  }

  if (!state.installed.has('AgentSession._expandSkillCommand')) {
    state.originals.expandSkillCommand = prototype._expandSkillCommand;
    prototype._expandSkillCommand = function (text: string) {
      const expanded = state.originals.expandSkillCommand?.call(this, text) ?? text;
      return transformUnsafeContent({ surface: 'skillInvocation', content: expanded });
    };
    state.installed.add('AgentSession._expandSkillCommand');
  }

  return warnings;
}
