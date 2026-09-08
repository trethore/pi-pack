export type ModelIdentity = { provider: string; id: string };

export function sameModel(left: ModelIdentity | undefined, right: ModelIdentity | undefined): boolean {
  return left?.id === right?.id && left?.provider === right?.provider;
}

export function modelKey(model: ModelIdentity): string {
  return `${model.provider}\0${model.id}`;
}
