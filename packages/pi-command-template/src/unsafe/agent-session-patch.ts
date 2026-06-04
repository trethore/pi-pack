import { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  getUnsafePatchState,
  transformUnsafeContent,
  type AgentSessionPrototype,
} from '#src/unsafe/patch-state.js';

export function transformExpandedSkillContent(
  originalText: string,
  expandedText: string,
  transform: (content: string) => string
): string {
  if (!originalText.startsWith('/skill:')) return expandedText;
  if (expandedText === originalText) return expandedText;

  const args = getSkillInvocationArgs(originalText);
  if (!args) return transform(expandedText);

  const argsSuffix = `\n\n${args}`;
  if (!expandedText.endsWith(argsSuffix)) return transform(expandedText);

  const skillContent = expandedText.slice(0, -argsSuffix.length);
  return `${transform(skillContent)}${argsSuffix}`;
}

function getSkillInvocationArgs(text: string): string {
  const spaceIndex = text.indexOf(' ');
  return spaceIndex === -1 ? '' : text.slice(spaceIndex + 1).trim();
}

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
      return transformExpandedSkillContent(text, expanded, (content) =>
        transformUnsafeContent({ surface: 'skillInvocation', content })
      );
    };
    state.installed.add('AgentSession._expandSkillCommand');
  }

  return warnings;
}
