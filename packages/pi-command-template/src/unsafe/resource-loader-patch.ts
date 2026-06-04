import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import {
  getUnsafePatchState,
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

function installSystemPromptPatch(
  state: UnsafePatchState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  if (typeof prototype.getSystemPrompt !== 'function') {
    return 'pi-command-template: DefaultResourceLoader.getSystemPrompt unavailable; SYSTEM.md templates disabled.';
  }
  if (state.installed.has('DefaultResourceLoader.getSystemPrompt')) return;

  state.originals.getSystemPrompt = prototype.getSystemPrompt;
  prototype.getSystemPrompt = function () {
    const value = state.originals.getSystemPrompt?.call(this);
    if (value === undefined) return;
    return state.transformer?.({ surface: 'system', content: value }) ?? value;
  };
  state.installed.add('DefaultResourceLoader.getSystemPrompt');
}

function installAppendSystemPromptPatch(
  state: UnsafePatchState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  if (typeof prototype.getAppendSystemPrompt !== 'function') {
    return 'pi-command-template: DefaultResourceLoader.getAppendSystemPrompt unavailable; APPEND_SYSTEM.md templates disabled.';
  }
  if (state.installed.has('DefaultResourceLoader.getAppendSystemPrompt')) return;

  state.originals.getAppendSystemPrompt = prototype.getAppendSystemPrompt;
  prototype.getAppendSystemPrompt = function () {
    const values = state.originals.getAppendSystemPrompt?.call(this) ?? [];
    return values.map(
      (content) => state.transformer?.({ surface: 'appendSystem', content }) ?? content
    );
  };
  state.installed.add('DefaultResourceLoader.getAppendSystemPrompt');
}

function installAgentsFilesPatch(
  state: UnsafePatchState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  if (typeof prototype.getAgentsFiles !== 'function') {
    return 'pi-command-template: DefaultResourceLoader.getAgentsFiles unavailable; AGENTS.md/CLAUDE.md templates disabled.';
  }
  if (state.installed.has('DefaultResourceLoader.getAgentsFiles')) return;

  state.originals.getAgentsFiles = prototype.getAgentsFiles;
  prototype.getAgentsFiles = function () {
    const result = state.originals.getAgentsFiles?.call(this) ?? { agentsFiles: [] };
    return {
      ...result,
      agentsFiles: result.agentsFiles.map((file) => ({
        ...file,
        content:
          state.transformer?.({
            surface: 'contextFiles',
            content: file.content,
            path: file.path,
          }) ?? file.content,
      })),
    };
  };
  state.installed.add('DefaultResourceLoader.getAgentsFiles');
}

function installPromptsPatch(
  state: UnsafePatchState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  if (typeof prototype.getPrompts !== 'function') {
    return 'pi-command-template: DefaultResourceLoader.getPrompts unavailable; prompt template templates disabled.';
  }
  if (state.installed.has('DefaultResourceLoader.getPrompts')) return;

  state.originals.getPrompts = prototype.getPrompts;
  prototype.getPrompts = function () {
    const result = state.originals.getPrompts?.call(this) ?? { prompts: [], diagnostics: [] };
    return {
      ...result,
      prompts: result.prompts.map((prompt) => ({
        ...prompt,
        content:
          state.transformer?.({
            surface: 'promptTemplates',
            content: prompt.content,
            path: prompt.filePath,
          }) ?? prompt.content,
      })),
    };
  };
  state.installed.add('DefaultResourceLoader.getPrompts');
}

function installSkillsPatch(
  state: UnsafePatchState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  if (typeof prototype.getSkills !== 'function') {
    return 'pi-command-template: DefaultResourceLoader.getSkills unavailable; skill metadata templates disabled.';
  }
  if (state.installed.has('DefaultResourceLoader.getSkills')) return;

  state.originals.getSkills = prototype.getSkills;
  prototype.getSkills = function () {
    const result = state.originals.getSkills?.call(this) ?? { skills: [], diagnostics: [] };
    return {
      ...result,
      skills: result.skills.map((skill) => ({
        ...skill,
        description:
          state.transformer?.({
            surface: 'skills',
            content: skill.description,
            path: skill.filePath,
          }) ?? skill.description,
      })),
    };
  };
  state.installed.add('DefaultResourceLoader.getSkills');
}
