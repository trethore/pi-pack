import type { AgentMessage } from '#pi-codexify/features/openai-compaction/shared/agent-message.js';
import type { Api, Model } from '@earendil-works/pi-ai';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import type { ResponsesCompatibleRequestPayload } from '#pi-codexify/features/openai-compaction/core/runtime.js';
import type { NativeCompactionEntry } from '#pi-codexify/features/openai-compaction/core/types.js';
import {
  compareResponsesInputParity,
  serializeMessagesToResponsesInput,
  type ResponsesInputItem,
  type ResponsesInputMessageItem,
} from '#pi-codexify/features/openai-compaction/core/serializer.js';
import {
  cloneOpaqueCompactedWindow,
  cloneResponsesInputSlice,
} from '#pi-codexify/features/openai-compaction/replay/replay-structured.js';
import {
  extractFreshAuthoritativePreamble,
  type FreshAuthoritativePreamble,
} from '#pi-codexify/features/openai-compaction/replay/replay-preamble.js';
import {
  buildLenientNativeReplayPayload,
  collectReplayMessages,
  createCompactionSummaryAgentMessage,
  createReplaySlice,
  findReplayMatch,
  type SerializedReplaySlice,
} from '#pi-codexify/features/openai-compaction/replay/replay-matching.js';

export type NativeReplaySegments = {
  boundaryIndex: number;
  firstKeptEntryIndex: number;
  instructions?: string | undefined;
  freshPreamble: ResponsesInputMessageItem[];
  trailingPreamble: ResponsesInputMessageItem[];
  compactionSummary: ResponsesInputItem[];
  preCompactionKeptWindow: SerializedReplaySlice;
  compactedWindow: unknown[];
  postCompactionTail: SerializedReplaySlice;
  originalPiReplayInput: ResponsesInputItem[];
  replayInput: unknown[];
};

export type NativeReplayPayloadRewrite = {
  ok: true;
  segments: NativeReplaySegments;
  rewrittenPayload: ResponsesCompatibleRequestPayload;
};

export type NativeReplayPayloadRewriteFailureReason =
  | 'compaction-boundary-not-found'
  | 'first-kept-entry-not-found'
  | 'unsupported-instructions'
  | 'invalid-compacted-window'
  | 'unexpected-compaction-after-boundary'
  | 'expected-pi-replay-mismatch';

export type NativeReplayPayloadRewriteFailure = {
  ok: false;
  reason: NativeReplayPayloadRewriteFailureReason;
  parity?:
    | {
        actual: string[];
        expected: string[];
        mismatches: string[];
      }
    | undefined;
};

export type NativeReplayPayloadRewriteResult = NativeReplayPayloadRewrite | NativeReplayPayloadRewriteFailure;

function findEntryIndexByIdBeforeBoundary(
  entries: readonly SessionEntry[],
  entryId: string,
  boundaryIndex: number
): number | undefined {
  const index = entries.findIndex((entry, candidateIndex) => candidateIndex < boundaryIndex && entry.id === entryId);
  return index === -1 ? undefined : index;
}

export function findCompactionBoundaryIndex(
  entries: readonly SessionEntry[],
  compactionEntryId: string
): number | undefined {
  const boundaryIndex = entries.findIndex((entry) => entry.id === compactionEntryId);
  return boundaryIndex === -1 ? undefined : boundaryIndex;
}

export function findEntriesStrictlyAfterCompactionBoundary(
  entries: readonly SessionEntry[],
  compactionEntryId: string
): SessionEntry[] | undefined {
  const boundaryIndex = findCompactionBoundaryIndex(entries, compactionEntryId);
  if (boundaryIndex === undefined) {
    return undefined;
  }

  return entries.slice(boundaryIndex + 1);
}

export function collectLiveTailMessages(entries: readonly SessionEntry[]): AgentMessage[] {
  return collectReplayMessages(entries);
}

export function serializeLiveTailToResponsesInput<TApi extends Api>(args: {
  model: Model<TApi>;
  entries: readonly SessionEntry[];
}): ResponsesInputItem[] {
  return serializeMessagesToResponsesInput(args.model, collectReplayMessages(args.entries));
}

type NativeReplayBuildArgs<TApi extends Api> = {
  model: Model<TApi>;
  payload: ResponsesCompatibleRequestPayload;
  branchEntries: readonly SessionEntry[];
  compactionEntry: NativeCompactionEntry;
};

type NativeReplayBuildContext<TApi extends Api> = NativeReplayBuildArgs<TApi> & {
  boundaryIndex: number;
  firstKeptEntryIndex: number;
  freshPreamble: FreshAuthoritativePreamble;
  compactedWindow: unknown[];
};

function buildNativeReplaySegmentsInternal<TApi extends Api>(
  args: NativeReplayBuildArgs<TApi>
): NativeReplayPayloadRewriteResult {
  const context = createNativeReplayBuildContext(args);
  if (!context.ok) return context;

  if (hasCompactionAfterBoundary(context.branchEntries, context.boundaryIndex)) {
    return buildNewerCompactionReplayRewrite(context);
  }

  return buildCurrentCompactionReplayRewrite(context);
}

function createNativeReplayBuildContext<TApi extends Api>(
  args: NativeReplayBuildArgs<TApi>
): ({ ok: true } & NativeReplayBuildContext<TApi>) | NativeReplayPayloadRewriteFailure {
  const boundaryIndex = findCompactionBoundaryIndex(args.branchEntries, args.compactionEntry.id);
  if (boundaryIndex === undefined) return replayFailure('compaction-boundary-not-found');

  const firstKeptEntryIndex = findEntryIndexByIdBeforeBoundary(
    args.branchEntries,
    args.compactionEntry.firstKeptEntryId,
    boundaryIndex
  );
  if (firstKeptEntryIndex === undefined) return replayFailure('first-kept-entry-not-found');

  const freshPreamble = extractFreshAuthoritativePreamble(args.payload);
  if (!freshPreamble) return replayFailure('unsupported-instructions');

  const compactedWindow = cloneOpaqueCompactedWindow(args.compactionEntry.details?.compactedWindow ?? []);
  if (!compactedWindow) return replayFailure('invalid-compacted-window');

  return { ok: true, ...args, boundaryIndex, firstKeptEntryIndex, freshPreamble, compactedWindow };
}

function replayFailure(reason: NativeReplayPayloadRewriteFailureReason): NativeReplayPayloadRewriteFailure {
  return { ok: false, reason };
}

function hasCompactionAfterBoundary(entries: readonly SessionEntry[], boundaryIndex: number): boolean {
  for (let index = boundaryIndex + 1; index < entries.length; index++) {
    if (entries[index]?.type === 'compaction') return true;
  }
  return false;
}

function buildNewerCompactionReplayRewrite<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>
): NativeReplayPayloadRewriteResult {
  const compactionSummaryInput = serializeMessagesToResponsesInput(context.model, [
    createCompactionSummaryAgentMessage(context.compactionEntry),
  ]);
  const lenientReplay = buildLenientReplay(context, compactionSummaryInput);
  const originalPiReplayInput = cloneResponsesInputSlice(context.payload.input);
  if (!lenientReplay || !originalPiReplayInput) return replayFailure('unexpected-compaction-after-boundary');

  return createReplayRewrite(context, {
    compactionSummary: [],
    preCompactionKeptWindow: createReplaySlice([], [], []),
    postCompactionTail: createReplaySlice(
      context.branchEntries.slice(context.boundaryIndex + 1),
      [],
      lenientReplay.conversationInput
    ),
    originalPiReplayInput,
    replayInput: lenientReplay.input,
  });
}

function buildCurrentCompactionReplayRewrite<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>
): NativeReplayPayloadRewriteResult {
  const preCompactionEntries = context.branchEntries.slice(context.firstKeptEntryIndex, context.boundaryIndex);
  const postCompactionEntries = context.branchEntries.slice(context.boundaryIndex + 1);
  const compactionSummaryMessage = createCompactionSummaryAgentMessage(context.compactionEntry);
  const replayMatch = findReplayMatch({
    model: context.model,
    payloadInput: context.payload.input,
    freshPreamble: context.freshPreamble,
    compactionSummaryMessage,
    preCompactionEntries,
    postCompactionEntries,
  });

  if (!replayMatch) {
    return buildUnmatchedReplayRewrite(context, compactionSummaryMessage, preCompactionEntries, postCompactionEntries);
  }

  return buildMatchedReplayRewrite(
    context,
    compactionSummaryMessage,
    preCompactionEntries,
    postCompactionEntries,
    replayMatch
  );
}

function buildUnmatchedReplayRewrite<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  compactionSummaryMessage: AgentMessage,
  preCompactionEntries: readonly SessionEntry[],
  postCompactionEntries: readonly SessionEntry[]
): NativeReplayPayloadRewriteResult {
  const compactionSummaryInput = serializeMessagesToResponsesInput(context.model, [compactionSummaryMessage]);
  const lenientReplay = buildLenientReplay(context, compactionSummaryInput);
  if (lenientReplay) {
    return createReplayRewrite(context, {
      compactionSummary: compactionSummaryInput,
      preCompactionKeptWindow: createReplaySlice(preCompactionEntries, [], []),
      postCompactionTail: createReplaySlice(postCompactionEntries, [], lenientReplay.conversationInput),
      originalPiReplayInput: cloneResponsesInputSlice(context.payload.input) ?? [],
      replayInput: lenientReplay.input,
    });
  }

  return createExpectedReplayMismatch(context, compactionSummaryInput, preCompactionEntries, postCompactionEntries);
}

function buildLenientReplay<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  compactionSummaryInput: readonly ResponsesInputItem[]
): { input: unknown[]; conversationInput: ResponsesInputItem[] } | undefined {
  return buildLenientNativeReplayPayload({
    payload: context.payload,
    freshPreamble: context.freshPreamble,
    compactedWindow: context.compactedWindow,
    compactionSummaryInput,
  });
}

function createExpectedReplayMismatch<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  compactionSummaryInput: readonly ResponsesInputItem[],
  preCompactionEntries: readonly SessionEntry[],
  postCompactionEntries: readonly SessionEntry[]
): NativeReplayPayloadRewriteFailure {
  const expectedInput = [
    ...context.freshPreamble.leadingInput,
    ...compactionSummaryInput,
    ...serializeMessagesToResponsesInput(context.model, collectReplayMessages(preCompactionEntries)),
    ...serializeMessagesToResponsesInput(context.model, collectReplayMessages(postCompactionEntries)),
    ...context.freshPreamble.trailingInput,
  ];
  const parity = compareResponsesInputParity(context.payload.input, expectedInput);
  return {
    ok: false,
    reason: 'expected-pi-replay-mismatch',
    parity: {
      actual: parity.actual,
      expected: parity.expected,
      mismatches: parity.mismatches,
    },
  };
}

function buildMatchedReplayRewrite<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  compactionSummaryMessage: AgentMessage,
  preCompactionEntries: readonly SessionEntry[],
  postCompactionEntries: readonly SessionEntry[],
  replayMatch: Exclude<ReturnType<typeof findReplayMatch>, undefined>
): NativeReplayPayloadRewriteResult {
  const slices = createMatchedReplaySlices(
    context,
    compactionSummaryMessage,
    preCompactionEntries,
    postCompactionEntries,
    replayMatch
  );
  if (!slices) return replayFailure('expected-pi-replay-mismatch');

  return createReplayRewrite(context, {
    compactionSummary: slices.compactionSummary,
    preCompactionKeptWindow: slices.preCompactionKeptWindow,
    postCompactionTail: slices.postCompactionTail,
    originalPiReplayInput: replayMatch.originalPiReplayInput,
    replayInput: [
      ...context.freshPreamble.leadingInput,
      ...context.compactedWindow,
      ...slices.postCompactionTail.input,
      ...context.freshPreamble.trailingInput,
    ],
  });
}

type MatchedReplaySlices = Pick<
  NativeReplaySegments,
  'compactionSummary' | 'preCompactionKeptWindow' | 'postCompactionTail'
>;

function createMatchedReplaySlices<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  compactionSummaryMessage: AgentMessage,
  preCompactionEntries: readonly SessionEntry[],
  postCompactionEntries: readonly SessionEntry[],
  replayMatch: Exclude<ReturnType<typeof findReplayMatch>, undefined>
): MatchedReplaySlices | undefined {
  const compactionSummaryInput = serializeMessagesToResponsesInput(context.model, [compactionSummaryMessage]);
  const counts = createMatchedReplayCounts(context, compactionSummaryInput, replayMatch);
  const compactionSummary = cloneResponsesInputSlice(
    context.payload.input.slice(counts.freshPreamble, counts.freshPreamble + counts.compactionSummary)
  );
  const preCompactionKeptWindow = cloneResponsesInputSlice(
    context.payload.input.slice(counts.preCompactionStart, counts.preCompactionEnd)
  );
  if (!compactionSummary || !preCompactionKeptWindow || !replayMatch.actualPostCompactionTail) return undefined;

  const contextPostCompactionTailMessages = collectReplayMessages(postCompactionEntries);
  const contextPostCompactionTail = [
    ...serializeMessagesToResponsesInput(context.model, contextPostCompactionTailMessages),
    ...replayMatch.extraPostCompactionTail,
  ];
  return {
    compactionSummary,
    preCompactionKeptWindow: createReplaySlice(
      preCompactionEntries,
      replayMatch.preCompactionKept.messages,
      preCompactionKeptWindow
    ),
    postCompactionTail: createReplaySlice(
      postCompactionEntries,
      contextPostCompactionTailMessages,
      contextPostCompactionTail
    ),
  };
}

function createMatchedReplayCounts<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  compactionSummaryInput: readonly ResponsesInputItem[],
  replayMatch: Exclude<ReturnType<typeof findReplayMatch>, undefined>
): {
  freshPreamble: number;
  compactionSummary: number;
  preCompactionStart: number;
  preCompactionEnd: number;
} {
  const freshPreamble = context.freshPreamble.leadingInput.length;
  const compactionSummary = compactionSummaryInput.length;
  const preCompactionStart = freshPreamble + compactionSummary;
  const preCompactionEnd = preCompactionStart + replayMatch.preCompactionKept.input.length;
  return { freshPreamble, compactionSummary, preCompactionStart, preCompactionEnd };
}

function createReplayRewrite<TApi extends Api>(
  context: NativeReplayBuildContext<TApi>,
  input: Pick<
    NativeReplaySegments,
    'compactionSummary' | 'preCompactionKeptWindow' | 'postCompactionTail' | 'originalPiReplayInput' | 'replayInput'
  >
): NativeReplayPayloadRewrite {
  return {
    ok: true,
    segments: {
      boundaryIndex: context.boundaryIndex,
      firstKeptEntryIndex: context.firstKeptEntryIndex,
      instructions: context.freshPreamble.instructions,
      freshPreamble: context.freshPreamble.leadingInput,
      trailingPreamble: context.freshPreamble.trailingInput,
      compactedWindow: context.compactedWindow,
      ...input,
    },
    rewrittenPayload: {
      ...context.payload,
      ...(context.freshPreamble.instructions === undefined ? {} : { instructions: context.freshPreamble.instructions }),
      input: input.replayInput,
    },
  };
}

export function buildNativeReplaySegments<TApi extends Api>(args: {
  model: Model<TApi>;
  payload: ResponsesCompatibleRequestPayload;
  branchEntries: readonly SessionEntry[];
  compactionEntry: NativeCompactionEntry;
}): NativeReplayPayloadRewriteResult {
  return buildNativeReplaySegmentsInternal(args);
}

export function rewriteResponsesPayloadWithNativeReplay<TApi extends Api>(args: {
  model: Model<TApi>;
  payload: ResponsesCompatibleRequestPayload;
  branchEntries: readonly SessionEntry[];
  compactionEntry: NativeCompactionEntry;
}): NativeReplayPayloadRewriteResult {
  return buildNativeReplaySegmentsInternal(args);
}

export { collectReplayMessages } from '#pi-codexify/features/openai-compaction/replay/replay-matching.js';
export type { SerializedReplaySlice } from '#pi-codexify/features/openai-compaction/replay/replay-matching.js';
