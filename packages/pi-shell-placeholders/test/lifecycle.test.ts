import { EXTENSION_NAME } from "#src/constants";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { STATE_TYPE, restoreGeneration } from "#src/state";
import { createTestSession, userTexts } from "#test/harness";

let root: string;
let cwd: string;
let agentDir: string;
const sessions: AgentSession[] = [];

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "shell-lifecycle-"));
  cwd = join(root, "project");
  agentDir = join(root, "agent");
  await Promise.all([mkdir(join(cwd, ".pi", "prompts"), { recursive: true }), mkdir(agentDir)]);
  vi.stubEnv("PI_CODING_AGENT_DIR", agentDir);
});
afterEach(async () => {
  for (const session of sessions.splice(0)) {
    session.dispose();
  }
  vi.unstubAllEnvs();
  await rm(root, { recursive: true, force: true });
});

async function start(options: Partial<Parameters<typeof createTestSession>[0]> = {}) {
  const result = await createTestSession({ cwd, agentDir, ...options });
  sessions.push(result.session);
  expect(result.extensionsResult.errors).toEqual([]);
  return result;
}

function template(content: string, name = "review") {
  return writeFile(join(cwd, ".pi", "prompts", `${name}.md`), content);
}

function configure(value: unknown) {
  return writeFile(join(cwd, ".pi", `${EXTENSION_NAME}.jsonc`), JSON.stringify(value));
}

const counter = "!`printf x >> count; cat count`";

it("loads through Pi and freezes both effective system surfaces without rewriting the prefix", async () => {
  // Arrange
  const { session, requests, errors } = await start({
    systemPrompt: `System ${counter}`,
    appendSystemPrompt: [`Append ${counter}`],
  });
  await expect(readFile(join(cwd, "count"))).rejects.toThrow();

  // Act
  await session.prompt("first");
  await session.prompt("second");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
  expect(errors).not.toHaveBeenCalled();
  expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[0])).toContain("System x");
  expect(JSON.stringify(requests[0])).toContain("Append xx");
  expect(requests[1]!.messages.slice(0, requests[0]!.messages.length)).toEqual(requests[0]!.messages);
  const saved = restoreGeneration(session.sessionManager.getBranch());
  expect(saved).toMatchObject({ status: "resolved", customPrompt: "System x", appendSystemPrompt: "Append xx" });
  expect(JSON.stringify(requests)).not.toContain(STATE_TYPE);
});

it("loads SYSTEM.md and APPEND_SYSTEM.md without executing during discovery", async () => {
  // Arrange
  await writeFile(join(cwd, ".pi", "SYSTEM.md"), counter);
  await writeFile(join(cwd, ".pi", "APPEND_SYSTEM.md"), counter);
  const { session, requests } = await start();
  await expect(readFile(join(cwd, "count"))).rejects.toThrow();

  // Act
  await session.prompt("go");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
  expect(JSON.stringify(requests)).not.toContain("!`");
});

it("restores frozen text after a reboot even when source text changes", async () => {
  // Arrange
  const manager = SessionManager.create(cwd, join(root, "sessions"));
  const first = await start({ sessionManager: manager, systemPrompt: counter });
  await first.session.prompt("first");
  const path = manager.getSessionFile()!;
  first.session.dispose();
  const resumed = await start({ sessionManager: SessionManager.open(path), systemPrompt: `changed ${counter}` });

  // Act
  await resumed.session.prompt("second");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("x");
  expect(restoreGeneration(resumed.session.sessionManager.getBranch())).toMatchObject({ customPrompt: "x" });
  expect(resumed.requests[0]!.messages.slice(0, first.requests[0]!.messages.length)).toEqual(
    first.requests[0]!.messages,
  );
  expect(resumed.errors).not.toHaveBeenCalled();
});

it("persists a lazy reload reset across reboot before any new request", async () => {
  // Arrange
  const manager = SessionManager.create(cwd, join(root, "sessions"));
  const first = await start({ sessionManager: manager, systemPrompt: counter });
  await first.session.prompt("first");
  const previous = structuredClone(manager.getEntries().filter((entry) => entry.type === "message"));

  // Act
  await first.session.reload();
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("x");
  expect(restoreGeneration(manager.getBranch())).toMatchObject({ status: "pending" });
  first.session.dispose();
  const resumed = await start({
    sessionManager: SessionManager.open(manager.getSessionFile()!),
    systemPrompt: counter,
  });
  await resumed.session.prompt("after reload");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
  expect(
    resumed.session.sessionManager
      .getEntries()
      .filter((entry) => entry.type === "message")
      .slice(0, previous.length),
  ).toEqual(previous);
  expect(restoreGeneration(resumed.session.sessionManager.getBranch())).toMatchObject({ customPrompt: "xx" });
  expect(resumed.errors).not.toHaveBeenCalled();
});

it("inherits snapshots in a fork and evaluates again in a new session", async () => {
  // Arrange
  const manager = SessionManager.create(cwd, join(root, "sessions"));
  const first = await start({ sessionManager: manager, systemPrompt: counter });
  await first.session.prompt("first");
  const forkPath = manager.createBranchedSession(manager.getLeafId()!)!;
  first.session.dispose();
  const fork = await start({ sessionManager: SessionManager.open(forkPath), reason: "fork", systemPrompt: counter });

  // Act
  await fork.session.prompt("forked");
  const fresh = await start({ reason: "new", systemPrompt: counter });
  await fresh.session.prompt("new");

  // Assert
  expect(restoreGeneration(fork.session.sessionManager.getBranch())).toMatchObject({ customPrompt: "x" });
  expect(restoreGeneration(fresh.session.sessionManager.getBranch())).toMatchObject({ customPrompt: "xx" });
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
});

it("restores the generation from the selected branch instead of an abandoned reload", async () => {
  // Arrange
  const { session, errors } = await start({ systemPrompt: counter });
  await session.prompt("first");
  const oldLeaf = session.sessionManager.getLeafId()!;
  await session.reload();
  await session.prompt("second generation");

  // Act
  await session.navigateTree(oldLeaf);
  await session.prompt("old branch");

  // Assert
  expect(restoreGeneration(session.sessionManager.getBranch())).toMatchObject({ customPrompt: "x" });
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
  expect(errors).not.toHaveBeenCalled();
});

it("retains the snapshot through compaction", async () => {
  // Arrange
  const { session } = await start({ systemPrompt: counter });
  await session.prompt("first");
  session.sessionManager.appendCompaction("Summary", null, 100);

  // Act
  await session.prompt("after compaction");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("x");
  expect(restoreGeneration(session.sessionManager.getBranch())).toMatchObject({ customPrompt: "x" });
});

it("freezes failed system placeholders and warns only at evaluation", async () => {
  // Arrange
  const source = "!`printf x >> attempts; printf partial; exit 1`";
  const { session, requests, notify } = await start({ systemPrompt: source });

  // Act
  await session.prompt("first");
  await session.prompt("second");

  // Assert
  expect(await readFile(join(cwd, "attempts"), "utf8")).toBe("x");
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify).toHaveBeenCalledWith(expect.stringContaining("Placeholder left unchanged"), "warning");
  expect(restoreGeneration(session.sessionManager.getBranch())).toMatchObject({ customPrompt: source });
  expect(JSON.stringify(requests)).not.toContain("Stop and report");
});

it("evaluates each template invocation after literal native argument substitution", async () => {
  // Arrange
  await template('---\ndescription: Review\n---\nValue !`printf "%s" "$1"`');
  const { session, requests, errors } = await start();

  // Act
  await session.prompt('/review "$(printf literal)"');
  await session.prompt('/review "two words"');

  // Assert
  expect(userTexts(requests[1]!)).toEqual(["Value literal", "Value two words"]);
  const users = session.sessionManager
    .getBranch()
    .filter((entry) => entry.type === "message" && entry.message.role === "user");
  expect(JSON.stringify(users)).toContain("Value literal");
  expect(JSON.stringify(users)).not.toContain("!`");
  expect(errors).not.toHaveBeenCalled();
});

it("evaluates queued template invocations once, before delivery", async () => {
  // Arrange
  await template('!`printf "%s\\n" "$1" >> invocations; printf "%s" "$1"`');
  const { session, controls, requests, errors } = await start();
  controls.beforeResponse = async (request) => {
    if (request === 1) {
      await session.steer("/review steering");
      await session.followUp("/review followup");
      expect(await readFile(join(cwd, "invocations"), "utf8")).toBe("steering\nfollowup\n");
    }
  };

  // Act
  await session.prompt("start");

  // Assert
  expect(await readFile(join(cwd, "invocations"), "utf8")).toBe("steering\nfollowup\n");
  expect(userTexts(requests.at(-1)!)).toEqual(["start", "steering", "followup"]);
  expect(errors).not.toHaveBeenCalled();
});

it("does not execute ordinary chat, disabled expansion, or template discovery", async () => {
  // Arrange
  await template(counter);
  const { session, requests } = await start();
  await expect(readFile(join(cwd, "count"))).rejects.toThrow();

  // Act
  await session.prompt(counter);
  await session.prompt("/review", { expandPromptTemplates: false });

  // Assert
  await expect(readFile(join(cwd, "count"))).rejects.toThrow();
  expect(userTexts(requests.at(-1)!)).toEqual([counter, "/review"]);
});

it("does not reinterpret template stdout that starts with a slash or contains placeholders", async () => {
  // Arrange
  await template("!`cat value`");
  await writeFile(join(cwd, "value"), "/review !`touch forbidden` $1\n");
  const { session, requests } = await start();

  // Act
  await session.prompt("/review argument");

  // Assert
  expect(userTexts(requests[0]!)).toEqual(["/review !`touch forbidden` $1\n"]);
  await expect(readFile(join(cwd, "forbidden"))).rejects.toThrow();
});

it.each([{ enabled: false }, { surfaces: { system: false, appendSystem: false, promptTemplates: false } }])(
  "respects disabled configuration: %j",
  async (config) => {
    // Arrange
    await configure(config);
    await template(counter);
    const { session, requests } = await start({ systemPrompt: counter, appendSystemPrompt: [counter] });

    // Act
    await session.prompt("/review");

    // Assert
    await expect(readFile(join(cwd, "count"))).rejects.toThrow();
    expect(userTexts(requests[0]!)).toEqual([counter]);
  },
);

it("reloads templates without stacking patches", async () => {
  // Arrange
  await template(counter);
  const { session, requests, errors } = await start();
  await session.prompt("/review");

  // Act
  await session.reload();
  await session.reload();
  await session.prompt("/review");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
  expect(userTexts(requests.at(-1)!)).toEqual(["x", "xx"]);
  expect(errors).not.toHaveBeenCalled();
});

it("preserves input transformations and extension-command precedence", async () => {
  // Arrange
  await template('Expanded !`printf "%s" "$1"`');
  const handled = vi.fn();
  const { session, requests } = await start({
    extensionFactories: [
      (pi) => {
        pi.on("input", (event) =>
          event.text === "/alias" ? { action: "transform", text: "/review argument" } : { action: "continue" },
        );
        pi.registerCommand("blocked", { description: "Test command", handler: handled });
      },
    ],
  });
  await template("!`touch forbidden`", "blocked");
  await session.reload();

  // Act
  await session.prompt("/alias", { source: "rpc" });
  await session.prompt("/blocked");

  // Assert
  expect(userTexts(requests[0]!)).toEqual(["Expanded argument"]);
  expect(handled).toHaveBeenCalledOnce();
  expect(requests).toHaveLength(1);
  await expect(readFile(join(cwd, "forbidden"))).rejects.toThrow();
});

it.each([
  ["!`printf partial; exit 2`", {}],
  ["!`printf too-long`", { maxOutputChars: 3 }],
  ["!`printf partial; sleep 10`", { timeoutMs: 40 }],
])("preserves a failed template in both history and requests: %s", async (source, execution) => {
  // Arrange
  await configure({ execution });
  await template(source);
  const { session, requests, notify, errors } = await start();

  // Act
  await session.prompt("/review");

  // Assert
  expect(userTexts(requests[0]!)).toEqual([source]);
  expect(notify).toHaveBeenCalledOnce();
  expect(errors).not.toHaveBeenCalled();
  const entry = session.sessionManager
    .getBranch()
    .find((candidate) => candidate.type === "message" && candidate.message.role === "user");
  expect(entry).toMatchObject({ message: { content: [{ type: "text", text: source }] } });
});

it.each(["system", "appendSystem", "promptTemplates"])("disables only the selected surface: %s", async (surface) => {
  // Arrange
  await configure({ surfaces: { [surface]: false } });
  await template(counter);
  const { session } = await start({ systemPrompt: counter, appendSystemPrompt: [counter] });

  // Act
  await session.prompt("/review");

  // Assert
  expect(await readFile(join(cwd, "count"), "utf8")).toBe("xx");
});

it("does not execute from an untrusted project", async () => {
  // Arrange
  await template(counter);
  await writeFile(join(cwd, ".pi", "SYSTEM.md"), counter);
  await configure({ enabled: true });
  const { session } = await start({ projectTrusted: false });

  // Act
  await session.prompt("/review");

  // Assert
  await expect(readFile(join(cwd, "count"))).rejects.toThrow();
});

it("does not execute when configuration is invalid", async () => {
  // Arrange
  await configure({ execution: { maxOutputChars: -1 } });
  await template(counter);
  const { session, errors } = await start({ systemPrompt: counter });

  // Act
  await session.prompt("/review");

  // Assert
  expect(errors).toHaveBeenCalled();
  await expect(readFile(join(cwd, "count"))).rejects.toThrow();
});

it("isolates concurrently expanding native queue invocations", async () => {
  // Arrange
  await template('!`sleep 0.02; printf "%s\\n" "$1" >> invocations; printf "%s" "$1"`');
  const { session, controls, requests } = await start();
  controls.beforeResponse = async (request) => {
    if (request === 1) {
      await Promise.all([session.steer("/review one"), session.steer("/review two")]);
    }
  };

  // Act
  await session.prompt("start");

  // Assert
  expect((await readFile(join(cwd, "invocations"), "utf8")).trim().split("\n").toSorted()).toEqual(["one", "two"]);
  expect(userTexts(requests.at(-1)!).slice(1).toSorted()).toEqual(["one", "two"]);
});

it("marks Pi busy during template execution so concurrent submissions queue normally", async () => {
  // Arrange
  await template("!`touch started; sleep 0.1; printf resolved`");
  const { session, requests, errors } = await start();

  // Act
  const pending = session.prompt("/review");
  await vi.waitFor(() => readFile(join(cwd, "started")));
  expect(session.isStreaming).toBe(true);
  await session.prompt("followup", { streamingBehavior: "followUp" });
  await pending;

  // Assert
  expect(userTexts(requests.at(-1)!)).toEqual(["resolved", "followup"]);
  expect(errors).not.toHaveBeenCalled();
});

it("cancels template execution on SDK disposal without sending a request", async () => {
  // Arrange
  await template("!`touch started; sleep 20`");
  const { session, requests } = await start();
  const pending = session.prompt("/review");
  const rejected = expect(pending).rejects.toThrow();
  await vi.waitFor(() => readFile(join(cwd, "started")));

  // Act
  session.dispose();
  await rejected;

  // Assert
  expect(requests).toEqual([]);
});

it.each([{ enabled: false }, { surfaces: { promptTemplates: false } }, { execution: { maxOutputChars: -1 } }])(
  "leaves Pi's template methods untouched when execution is disabled: %j",
  async (config) => {
    // Arrange
    await configure(config);
    const before = Object.getOwnPropertyDescriptors(AgentSession.prototype);

    // Act
    await start();

    // Assert
    expect(Object.getOwnPropertyDescriptors(AgentSession.prototype)).toEqual(before);
  },
);
