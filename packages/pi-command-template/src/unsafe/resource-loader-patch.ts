import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import {
  getUnsafePatchState,
  transformUnsafeContent,
  type ResourceLoaderPrototype,
  type UnsafePatchState,
} from '#src/unsafe/patch-state.js';

export function installResourceLoaderPatch(): string[] {
  const state = getUnsafePatchState();
  const prototype = DefaultResourceLoader.prototype as ResourceLoaderPrototype;
  const warnings = [
    installSystemPromptPatch(state, prototype),
    installAppendSystemPromptPatch(state, prototype),
    installAgentsFilesPatch(state, prototype),
    installPromptsPatch(state, prototype),
    installSkillsPatch(state, prototype),
  ];
  return warnings.flatMap((warning) => (warning ? [warning] : []));
}

function installSystemPromptPatch(state: UnsafePatchState, prototype: ResourceLoaderPrototype): string | undefined {
  return installPrototypePatch({
    state,
    prototype,
    method: 'getSystemPrompt',
    warning: 'pi-command-template: DefaultResourceLoader.getSystemPrompt unavailable; SYSTEM.md templates disabled.',
    patch: (original) =>
      function (this: unknown) {
        const value = original.call(this);
        if (value === undefined) return;
        return transformUnsafeContent({ surface: 'system', content: value });
      },
  });
}

function installAppendSystemPromptPatch(
  state: UnsafePatchState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  return installPrototypePatch({
    state,
    prototype,
    method: 'getAppendSystemPrompt',
    warning:
      'pi-command-template: DefaultResourceLoader.getAppendSystemPrompt unavailable; APPEND_SYSTEM.md templates disabled.',
    patch: (original) =>
      function (this: unknown) {
        const values = original.call(this) ?? [];
        return values.map((content) => transformUnsafeContent({ surface: 'appendSystem', content }));
      },
  });
}

function installAgentsFilesPatch(state: UnsafePatchState, prototype: ResourceLoaderPrototype): string | undefined {
  return installPrototypePatch({
    state,
    prototype,
    method: 'getAgentsFiles',
    warning:
      'pi-command-template: DefaultResourceLoader.getAgentsFiles unavailable; AGENTS.md/CLAUDE.md templates disabled.',
    patch: (original) =>
      function (this: unknown) {
        const result = original.call(this) ?? { agentsFiles: [] };
        return {
          ...result,
          agentsFiles: result.agentsFiles.map((file) => ({
            ...file,
            content: transformUnsafeContent({
              surface: 'contextFiles',
              content: file.content,
            }),
          })),
        };
      },
  });
}

function installPromptsPatch(state: UnsafePatchState, prototype: ResourceLoaderPrototype): string | undefined {
  return installPrototypePatch({
    state,
    prototype,
    method: 'getPrompts',
    warning: 'pi-command-template: DefaultResourceLoader.getPrompts unavailable; prompt template templates disabled.',
    patch: (original) =>
      function (this: unknown) {
        const result = original.call(this) ?? { prompts: [], diagnostics: [] };
        return {
          ...result,
          prompts: result.prompts.map((prompt) => ({
            ...prompt,
            content: transformUnsafeContent({
              surface: 'promptTemplates',
              content: prompt.content,
            }),
          })),
        };
      },
  });
}

function installSkillsPatch(state: UnsafePatchState, prototype: ResourceLoaderPrototype): string | undefined {
  return installPrototypePatch({
    state,
    prototype,
    method: 'getSkills',
    warning: 'pi-command-template: DefaultResourceLoader.getSkills unavailable; skill metadata templates disabled.',
    patch: (original) =>
      function (this: unknown) {
        const result = original.call(this) ?? { skills: [], diagnostics: [] };
        return {
          ...result,
          skills: result.skills.map((skill) => ({
            ...skill,
            description: transformUnsafeContent({
              surface: 'skills',
              content: skill.description,
            }),
          })),
        };
      },
  });
}

interface PrototypePatchOptions<TMethod extends keyof ResourceLoaderPrototype> {
  state: UnsafePatchState;
  prototype: ResourceLoaderPrototype;
  method: TMethod;
  warning: string;
  patch(original: NonNullable<ResourceLoaderPrototype[TMethod]>): NonNullable<ResourceLoaderPrototype[TMethod]>;
}

function installPrototypePatch<TMethod extends keyof ResourceLoaderPrototype>(
  options: PrototypePatchOptions<TMethod>
): string | undefined {
  const original = options.prototype[options.method];
  if (typeof original !== 'function') return options.warning;

  const key = `DefaultResourceLoader.${String(options.method)}`;
  if (options.state.installed.has(key)) return;

  options.state.originals[options.method] = original;
  options.prototype[options.method] = options.patch(original as NonNullable<typeof original>);
  options.state.installed.add(key);
}
