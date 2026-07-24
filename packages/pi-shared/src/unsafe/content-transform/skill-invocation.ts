import { AgentSession } from '@earendil-works/pi-coding-agent';
import {
  getPiContentTransformState,
  getResourceLoaderTransformContext,
  hasPiContentTransformers,
  transformPiContent,
  type AgentSessionPrototype,
  type PiContentTransformInput,
  type PiContentTransformMetadata,
} from '@trethore/pi-shared/unsafe/content-transform/state.js';

export function transformExpandedSkillContent(
  originalText: string,
  expandedText: string,
  transform: (input: PiContentTransformInput) => string,
  metadata: PiContentTransformMetadata = {}
): string {
  if (!originalText.startsWith('/skill:')) return expandedText;
  if (expandedText === originalText) return expandedText;

  const args = getSkillInvocationArgs(originalText);
  if (!args) return transform({ surface: 'skillInvocation', content: expandedText, ...metadata });

  const argsSuffix = `\n\n${args}`;
  if (!expandedText.endsWith(argsSuffix)) {
    return transform({ surface: 'skillInvocation', content: expandedText, ...metadata });
  }

  const skillContent = expandedText.slice(0, -argsSuffix.length);
  const transformed = transform({ surface: 'skillInvocation', content: skillContent, ...metadata });
  return `${transformed}${argsSuffix}`;
}

export function installSkillInvocationContentTransform(): string[] {
  const state = getPiContentTransformState();
  if (!AgentSession?.prototype) return [];
  const prototype = AgentSession.prototype as unknown as AgentSessionPrototype;

  if (typeof prototype._expandSkillCommand !== 'function') {
    return [
      'pi-shared: AgentSession._expandSkillCommand unavailable; explicit skill invocation transforms are disabled.',
    ];
  }

  if (state.installed.has('AgentSession._expandSkillCommand')) return [];

  const expandSkillCommand = prototype._expandSkillCommand;
  prototype._expandSkillCommand = function (text: string) {
    const expanded = expandSkillCommand.call(this, text);
    if (!hasPiContentTransformers()) return expanded;

    const skillName = getSkillInvocationName(text);
    const skill = skillName
      ? this.resourceLoader?.getSkills().skills.find((entry) => entry.name === skillName)
      : undefined;
    return transformExpandedSkillContent(text, expanded, transformPiContent, {
      name: skill?.name ?? skillName,
      path: skill?.filePath,
      ...getResourceLoaderTransformContext(this.resourceLoader),
    });
  };
  state.installed.add('AgentSession._expandSkillCommand');
  return [];
}

function getSkillInvocationName(text: string): string | undefined {
  if (!text.startsWith('/skill:')) return;
  const spaceIndex = text.indexOf(' ');
  return spaceIndex === -1 ? text.slice(7) : text.slice(7, spaceIndex);
}

function getSkillInvocationArgs(text: string): string {
  const spaceIndex = text.indexOf(' ');
  return spaceIndex === -1 ? '' : text.slice(spaceIndex + 1).trim();
}
