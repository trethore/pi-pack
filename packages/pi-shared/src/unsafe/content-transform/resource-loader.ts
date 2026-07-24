import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import {
  getPiContentTransformState,
  getResourceLoaderTransformContext,
  hasPiContentTransformers,
  transformPiContent,
  type PiContentTransformState,
  type ResourceLoaderContext,
  type ResourceLoaderPrototype,
} from '@trethore/pi-shared/unsafe/content-transform/state.js';

export function installResourceLoaderContentTransform(): string[] {
  const state = getPiContentTransformState();
  const prototype = DefaultResourceLoader.prototype as ResourceLoaderPrototype;
  const warnings = [
    installSystemPromptTransform(state, prototype),
    installAppendSystemPromptTransform(state, prototype),
    installAgentsFilesTransform(state, prototype),
    installPromptsTransform(state, prototype),
    installSkillsTransform(state, prototype),
  ];
  return warnings.flatMap((warning) => (warning ? [warning] : []));
}

function installSystemPromptTransform(
  state: PiContentTransformState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  return installPrototypeTransform({
    state,
    prototype,
    method: 'getSystemPrompt',
    warning: 'pi-shared: DefaultResourceLoader.getSystemPrompt unavailable; system prompt transforms are disabled.',
    patch: (original) =>
      function (this: ResourceLoaderContext) {
        const content = original.call(this);
        if (content === undefined) return;
        return transformPiContent({
          surface: 'systemPrompt',
          content,
          ...getResourceLoaderTransformContext(this),
        });
      },
  });
}

function installAppendSystemPromptTransform(
  state: PiContentTransformState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  return installPrototypeTransform({
    state,
    prototype,
    method: 'getAppendSystemPrompt',
    warning:
      'pi-shared: DefaultResourceLoader.getAppendSystemPrompt unavailable; appended system prompt transforms are disabled.',
    patch: (original) =>
      function (this: ResourceLoaderContext) {
        const contents = original.call(this) ?? [];
        if (!hasPiContentTransformers()) return contents;
        const context = getResourceLoaderTransformContext(this);
        return mapChangedValues(contents, (content) =>
          transformPiContent({
            surface: 'appendSystemPrompt',
            content,
            ...context,
          })
        );
      },
  });
}

function installAgentsFilesTransform(
  state: PiContentTransformState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  return installPrototypeTransform({
    state,
    prototype,
    method: 'getAgentsFiles',
    warning: 'pi-shared: DefaultResourceLoader.getAgentsFiles unavailable; context file transforms are disabled.',
    patch: (original) =>
      function (this: ResourceLoaderContext) {
        const result = original.call(this) ?? { agentsFiles: [] };
        if (!hasPiContentTransformers()) return result;
        const context = getResourceLoaderTransformContext(this);
        const agentsFiles = mapChangedValues(result.agentsFiles, (file) => {
          const content = transformPiContent({
            surface: 'contextFile',
            content: file.content,
            path: file.path,
            ...context,
          });
          return content === file.content ? file : { ...file, content };
        });
        return agentsFiles === result.agentsFiles ? result : { ...result, agentsFiles };
      },
  });
}

function installPromptsTransform(
  state: PiContentTransformState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  return installPrototypeTransform({
    state,
    prototype,
    method: 'getPrompts',
    warning: 'pi-shared: DefaultResourceLoader.getPrompts unavailable; prompt template transforms are disabled.',
    patch: (original) =>
      function (this: ResourceLoaderContext) {
        const result = original.call(this) ?? { prompts: [], diagnostics: [] };
        if (!hasPiContentTransformers()) return result;
        const context = getResourceLoaderTransformContext(this);
        const prompts = mapChangedValues(result.prompts, (prompt) => {
          const content = transformPiContent({
            surface: 'promptTemplate',
            content: prompt.content,
            name: prompt.name,
            path: prompt.filePath,
            ...context,
          });
          return content === prompt.content ? prompt : { ...prompt, content };
        });
        return prompts === result.prompts ? result : { ...result, prompts };
      },
  });
}

function installSkillsTransform(
  state: PiContentTransformState,
  prototype: ResourceLoaderPrototype
): string | undefined {
  return installPrototypeTransform({
    state,
    prototype,
    method: 'getSkills',
    warning: 'pi-shared: DefaultResourceLoader.getSkills unavailable; skill description transforms are disabled.',
    patch: (original) =>
      function (this: ResourceLoaderContext) {
        const result = original.call(this) ?? { skills: [], diagnostics: [] };
        if (!hasPiContentTransformers()) return result;
        const context = getResourceLoaderTransformContext(this);
        const skills = mapChangedValues(result.skills, (skill) => {
          const description = transformPiContent({
            surface: 'skillDescription',
            content: skill.description,
            name: skill.name,
            path: skill.filePath,
            ...context,
          });
          return description === skill.description ? skill : { ...skill, description };
        });
        return skills === result.skills ? result : { ...result, skills };
      },
  });
}

interface PrototypeTransformOptions<TMethod extends keyof ResourceLoaderPrototype> {
  state: PiContentTransformState;
  prototype: ResourceLoaderPrototype;
  method: TMethod;
  warning: string;
  patch(original: NonNullable<ResourceLoaderPrototype[TMethod]>): NonNullable<ResourceLoaderPrototype[TMethod]>;
}

function installPrototypeTransform<TMethod extends keyof ResourceLoaderPrototype>(
  options: PrototypeTransformOptions<TMethod>
): string | undefined {
  const original = options.prototype[options.method];
  if (typeof original !== 'function') return options.warning;

  const key = `DefaultResourceLoader.${String(options.method)}`;
  if (options.state.installed.has(key)) return;

  options.prototype[options.method] = options.patch(original as NonNullable<typeof original>);
  options.state.installed.add(key);
}

function mapChangedValues<T>(values: T[], transform: (value: T) => T): T[] {
  let transformed: T[] | undefined;
  for (const [index, value] of values.entries()) {
    const nextValue = transform(value);
    if (!transformed && nextValue !== value) transformed = values.slice(0, index);
    transformed?.push(nextValue);
  }
  return transformed ?? values;
}
