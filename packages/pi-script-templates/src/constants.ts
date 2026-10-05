export const Scope = {
  GLOBAL: "global",
  PROJECT: "project",
} as const;
export type Scope = (typeof Scope)[keyof typeof Scope];
