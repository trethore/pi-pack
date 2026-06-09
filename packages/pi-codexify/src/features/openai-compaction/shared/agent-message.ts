import type { convertToLlm } from '@earendil-works/pi-coding-agent';

export type AgentMessage = Parameters<typeof convertToLlm>[0][number];
