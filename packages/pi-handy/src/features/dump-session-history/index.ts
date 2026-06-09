import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  convertToLlm,
  getAgentDir,
  serializeConversation,
  type ExtensionAPI,
  type SessionEntry,
} from '@earendil-works/pi-coding-agent';

const SESSION_HISTORY_FILE_PREFIX = '.session-history-';

type AgentMessage = Parameters<typeof convertToLlm>[0][number];
type NotificationType = 'info' | 'warning' | 'error' | 'success';

export function registerDumpSessionHistoryCommand(pi: ExtensionAPI) {
  pi.registerCommand('dumphistory', {
    description: 'Dump the current session history to ~/.pi/agent/',
    handler: async (_args, ctx) => {
      await handleDumpSessionHistoryCommand(ctx);
    },
  });
}

export async function handleDumpSessionHistoryCommand(
  ctx: {
    sessionManager: {
      getBranch(): SessionEntry[];
      getSessionFile(): string | undefined;
      getSessionId(): string;
      getCwd(): string;
    };
    ui: {
      notify(message: string, type?: NotificationType): void;
    };
  },
  options: { now?: Date; outputDirectory?: string } = {}
): Promise<string | undefined> {
  const history = buildSessionHistory(ctx.sessionManager.getBranch());
  if (history.trim().length === 0) {
    ctx.ui.notify('No session history to dump', 'warning');
    return undefined;
  }

  const outputDirectory = options.outputDirectory ?? getAgentDir();
  await mkdir(outputDirectory, { recursive: true });

  const filePath = path.join(
    outputDirectory,
    `${SESSION_HISTORY_FILE_PREFIX}${(options.now ?? new Date()).toISOString()}`
  );
  const content = formatSessionHistoryDump({
    cwd: ctx.sessionManager.getCwd(),
    sessionId: ctx.sessionManager.getSessionId(),
    sessionFile: ctx.sessionManager.getSessionFile(),
    history,
  });

  await writeFile(filePath, content, 'utf8');
  ctx.ui.notify(`Session history dumped to ${filePath}`, 'success');
  return filePath;
}

export function buildSessionHistory(branch: SessionEntry[]): string {
  return serializeConversation(
    convertToLlm(branch.map((entry) => entryToMessage(entry)).filter((message) => message !== undefined))
  );
}

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === 'message') {
    return entry.message;
  }

  if (entry.type === 'custom_message') {
    return {
      role: 'custom',
      customType: entry.customType,
      content: entry.content,
      display: entry.display,
      details: entry.details,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }

  if (entry.type === 'compaction') {
    return {
      role: 'compactionSummary',
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }

  if (entry.type === 'branch_summary') {
    return {
      role: 'branchSummary',
      summary: entry.summary,
      fromId: entry.fromId,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }

  return undefined;
}

function formatSessionHistoryDump(input: {
  cwd: string;
  sessionId: string;
  sessionFile: string | undefined;
  history: string;
}): string {
  const sessionFile = input.sessionFile ?? '(not persisted)';
  return `# Pi session history\n\nSession id: ${input.sessionId}\nSession file: ${sessionFile}\nCwd: ${input.cwd}\n\n${input.history}\n`;
}
