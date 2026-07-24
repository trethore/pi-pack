export type ScriptScope = 'global' | 'project';

export interface TemplateScript {
  name: string;
  filePath: string;
  scope: ScriptScope;
}
