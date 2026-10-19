import { AgentSession, SessionManager, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, it, vi } from "vitest";
import { PI_VERSION } from "#src/constants";
import { assertCompatible, getTemplatePatch } from "#src/template-patch";
import { registerPromptTemplateTransform, type TemplateTransformEvent } from "#src/prompt-templates";

class TestSession {
  sessionManager = SessionManager.inMemory();
  texts: string[] = [];
  disposed = false;
  templates = [{ name: "review", content: "Value $1", filePath: "/review.md" }];

  get promptTemplates() {
    return this.templates;
  }

  expand(text: string): string {
    const [name, arg = ""] = text.split(" ");
    const template = this.promptTemplates.find((entry) => `/${entry.name}` === name);
    return template ? template.content.replace("$1", arg) : text;
  }

  async prompt(text: string, options?: { expandPromptTemplates?: boolean }): Promise<void> {
    const expanded = options?.expandPromptTemplates === false ? text : this.expand(text);
    await this["_prepareRun"]({ messageType: "user", prompt: expanded });
  }

  async _queueUserInput(text: string, _images: unknown, behavior: "steer" | "followUp", _source: string) {
    const expanded = this.expand(text);
    if (behavior === "steer") {
      await this["_queueSteer"](expanded);
    } else {
      await this["_queueFollowUp"](expanded);
    }
    return "queued";
  }

  async _prepareRun(trigger: { messageType: string; prompt: string }) {
    this.texts.push(trigger.prompt);
    return [];
  }

  async _queueSteer(text: string) {
    this.texts.push(text);
  }

  async _queueFollowUp(text: string) {
    this.texts.push(text);
  }

  dispose() {
    this.disposed = true;
  }
}

const releases: (() => void)[] = [];
afterEach(() => {
  for (const release of releases.splice(0)) {
    release();
  }
});

function context(session: TestSession) {
  return {
    get sessionManager() {
      if (session.disposed) {
        throw new Error("stale context");
      }
      return session.sessionManager;
    },
    ui: { notify: vi.fn() },
  } as unknown as ExtensionContext;
}

function register(session: TestSession, transform: Parameters<ReturnType<typeof getTemplatePatch>["add"]>[1]) {
  const release = getTemplatePatch(TestSession.prototype, PI_VERSION).add(context(session), transform);
  releases.push(release);
  return release;
}

it("rejects unsupported versions and missing private methods without patching", () => {
  // Arrange
  const before = Object.getOwnPropertyDescriptors(TestSession.prototype);

  // Act / Assert
  expect(() => assertCompatible(TestSession.prototype, "1.4.0")).toThrow("unsupported Pi version");
  expect(() => assertCompatible({}, PI_VERSION)).toThrow("unsupported Pi method");
  expect(Object.getOwnPropertyDescriptors(TestSession.prototype)).toEqual(before);
});

it("chains registrations once each and restores original descriptors", async () => {
  // Arrange
  const before = Object.getOwnPropertyDescriptors(TestSession.prototype);
  const session = new TestSession();
  const first = vi.fn((event: TemplateTransformEvent) => `${event.text} first`);
  const second = vi.fn((event: TemplateTransformEvent) => `${event.text} second`);
  const removeFirst = register(session, first);
  const patchedPrompt = TestSession.prototype.prompt;
  const removeSecond = register(session, second);

  // Act
  await session.prompt("/review A");
  removeFirst();
  await session.prompt("/review B");
  removeSecond();

  // Assert
  expect(first).toHaveBeenCalledOnce();
  expect(second).toHaveBeenCalledTimes(2);
  expect(session.texts).toEqual(["Value A first second", "Value B second"]);
  expect(patchedPrompt).not.toBe(before.prompt.value);
  expect(Object.getOwnPropertyDescriptors(TestSession.prototype)).toEqual(before);
});

it("isolates overlapping invocations and sessions", async () => {
  // Arrange
  const first = new TestSession();
  const second = new TestSession();
  const gate = Promise.withResolvers<void>();
  const entered = Promise.withResolvers<void>();
  register(first, async (event) => {
    entered.resolve();
    await gate.promise;
    return `${event.text} first`;
  });
  register(second, (event) => `${event.text} second`);

  // Act
  const pending = first.prompt("/review A");
  await entered.promise;
  await second.prompt("/review B");
  gate.resolve();
  await pending;

  // Assert
  expect(first.texts).toEqual(["Value A first"]);
  expect(second.texts).toEqual(["Value B second"]);
});

it("does not transform unregistered sessions or non-template messages", async () => {
  // Arrange
  const session = new TestSession();
  const unregistered = new TestSession();
  const transform = vi.fn((event: TemplateTransformEvent) => event.text);
  register(session, transform);

  // Act
  await unregistered.prompt("/review A");
  await session.prompt("ordinary text");
  await session.prompt("/review B", { expandPromptTemplates: false });

  // Assert
  expect(transform).not.toHaveBeenCalled();
  expect(session.templates[0]!.content).toBe("Value $1");
});

it("transforms both queue paths once and exposes selected-template metadata", async () => {
  // Arrange
  const session = new TestSession();
  const transform = vi.fn((event: TemplateTransformEvent) => `${event.text} transformed`);
  register(session, transform);

  // Act
  await session["_queueUserInput"]("/review A", undefined, "steer", "rpc");
  await session["_queueUserInput"]("/review B", undefined, "followUp", "interactive");

  // Assert
  expect(session.texts).toEqual(["Value A transformed", "Value B transformed"]);
  expect(transform).toHaveBeenCalledTimes(2);
  expect(transform.mock.calls[0]![0].template).toEqual({ name: "review", filePath: "/review.md" });
});

it("aborts an in-flight transform on disposal and safely ignores late cleanup", async () => {
  // Arrange
  const before = Object.getOwnPropertyDescriptors(TestSession.prototype);
  const session = new TestSession();
  const entered = Promise.withResolvers<void>();
  const release = register(session, async (event) => {
    entered.resolve();
    await new Promise<void>((resolve) => event.signal.addEventListener("abort", () => resolve(), { once: true }));
    return event.text;
  });
  const pending = session.prompt("/review A");
  const rejected = expect(pending).rejects.toThrow();
  await entered.promise;

  // Act
  session.dispose();
  await rejected;
  const next = new TestSession();
  const removeNext = register(next, (event) => `${event.text} next`);
  release();
  await next.prompt("/review B");
  removeNext();

  // Assert
  expect(session.texts).toEqual([]);
  expect(next.texts).toEqual(["Value B next"]);
  expect(Object.getOwnPropertyDescriptors(TestSession.prototype)).toEqual(before);
});

it("does not overwrite a later patch during cleanup", () => {
  // Arrange
  const session = new TestSession();
  const original = Object.getOwnPropertyDescriptor(TestSession.prototype, "prompt")!;
  const release = register(session, (event) => event.text);
  const foreign = vi.fn();
  Object.defineProperty(TestSession.prototype, "prompt", { ...original, value: foreign });

  // Act
  release();

  // Assert
  expect(TestSession.prototype.prompt).toBe(foreign);
  Object.defineProperty(TestSession.prototype, "prompt", original);
});

it("warns and disables the public hook if Pi's runtime shape is incompatible", () => {
  // Arrange
  const ctx = context(new TestSession());
  const original = Object.getOwnPropertyDescriptor(AgentSession.prototype, "prompt")!;
  Reflect.deleteProperty(AgentSession.prototype, "prompt");

  // Act
  try {
    const release = registerPromptTemplateTransform(ctx, () => "changed");
    release();
  } finally {
    Object.defineProperty(AgentSession.prototype, "prompt", original);
  }

  // Assert
  expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("Template transformation disabled"), "warning");
});

it("rejects a non-extensible prototype without partially installing patches", () => {
  // Arrange
  const prototype = Object.preventExtensions(
    Object.defineProperties({}, Object.getOwnPropertyDescriptors(TestSession.prototype)),
  );
  const before = Object.getOwnPropertyDescriptors(prototype);

  // Act / Assert
  expect(() => getTemplatePatch(prototype, PI_VERSION)).toThrow("non-extensible");
  expect(Object.getOwnPropertyDescriptors(prototype)).toEqual(before);
});
