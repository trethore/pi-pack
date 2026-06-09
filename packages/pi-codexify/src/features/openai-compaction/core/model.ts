import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

export interface ResponsesModelDescriptor {
  provider: string;
  api: string;
  id: string;
}

export function isOpenAIResponsesModel(model: Partial<ResponsesModelDescriptor> | null | undefined): boolean {
  if (!model) return false;
  return model.provider === 'openai' && model.api === 'openai-responses';
}

export function isOpenAIResponsesContext(ctx: ExtensionContext): boolean {
  return isOpenAIResponsesModel(ctx.model);
}
