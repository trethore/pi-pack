export const extensionName = "pi-openai";

export const Destination = {
  GLOBAL: "global",
  PROJECT: "project",
} as const;
export type Destination = (typeof Destination)[keyof typeof Destination];

export const Feature = {
  VERBOSITY: "verbosity",
  REASONING_SUMMARY: "reasoningSummary",
  WEB_SEARCH: "webSearch",
  SERVICE_TIER: "serviceTier",
} as const;
export type Feature = (typeof Feature)[keyof typeof Feature];

export const Verbosity = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
} as const;
export type Verbosity = (typeof Verbosity)[keyof typeof Verbosity];

export const ReasoningSummary = {
  AUTO: "auto",
  CONCISE: "concise",
  DETAILED: "detailed",
  NONE: "none",
} as const;
export type ReasoningSummary = (typeof ReasoningSummary)[keyof typeof ReasoningSummary];

export const ServiceTier = {
  DEFAULT: "default",
  PRIORITY: "priority",
  ULTRAFAST: "ultrafast",
} as const;
export type ServiceTier = (typeof ServiceTier)[keyof typeof ServiceTier];
