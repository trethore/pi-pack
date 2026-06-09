import type { AgentMessage } from '#pi-codexify/features/openai-compaction/shared/agent-message.js';
import type {
  BranchSummaryEntry,
  CustomMessageEntry,
  SessionEntry,
  SessionMessageEntry,
} from '@earendil-works/pi-coding-agent';
import { NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE } from '#pi-codexify/features/openai-compaction/core/types.js';

function toBranchSummaryMessage(entry: BranchSummaryEntry): AgentMessage {
  return {
    role: 'branchSummary',
    summary: entry.summary,
    fromId: entry.fromId,
    timestamp: new Date(entry.timestamp).getTime(),
  } as AgentMessage;
}

function toCustomMessage(entry: CustomMessageEntry): AgentMessage {
  return {
    role: 'custom',
    customType: entry.customType,
    content: entry.content,
    display: entry.display,
    details: entry.details,
    timestamp: new Date(entry.timestamp).getTime(),
  } as AgentMessage;
}

function toSessionMessage(entry: SessionMessageEntry): AgentMessage {
  return entry.message;
}

export function toReplayAgentMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === 'message') return toSessionMessage(entry);
  if (entry.type === 'custom_message') {
    if (entry.customType === NATIVE_COMPACTION_DISPLAY_MESSAGE_TYPE) return undefined;
    return toCustomMessage(entry);
  }
  if (entry.type === 'branch_summary') return toBranchSummaryMessage(entry);
  return undefined;
}

export function toPiReplayAgentMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === 'message') return toSessionMessage(entry);
  if (entry.type === 'custom_message') return toCustomMessage(entry);
  if (entry.type === 'branch_summary') return toBranchSummaryMessage(entry);
  return undefined;
}
