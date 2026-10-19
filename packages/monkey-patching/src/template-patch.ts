import { AsyncLocalStorage } from "node:async_hooks";
import type {
  AgentSession,
  BeforeAgentStartCustomEvent,
  BeforeAgentStartUserEvent,
  ExtensionContext,
  InputSource,
  PromptTemplate,
} from "@earendil-works/pi-coding-agent";
import { PI_VERSION } from "#src/constants";

type Images = Parameters<AgentSession["steer"]>[1];
type Trigger =
  | Pick<BeforeAgentStartUserEvent, "messageType" | "prompt" | "images">
  | Pick<BeforeAgentStartCustomEvent, "messageType" | "message">;

interface Host {
  sessionManager: ExtensionContext["sessionManager"];
}

interface Methods {
  prompt(this: Host, ...args: Parameters<AgentSession["prompt"]>): Promise<void>;
  _queueUserInput(
    this: Host,
    text: string,
    images: Images,
    behavior: "steer" | "followUp",
    source: InputSource,
  ): Promise<"queued" | "handled">;
  _prepareRun(this: Host, trigger: Trigger): Promise<unknown[]>;
  _queueSteer(this: Host, text: string, images?: Images): Promise<void>;
  _queueFollowUp(this: Host, text: string, images?: Images): Promise<void>;
  dispose(this: Host): void;
}

export interface TemplateTransformEvent {
  text: string;
  template: Pick<PromptTemplate, "name" | "filePath">;
  signal: AbortSignal;
}

export type TemplateTransform = (event: TemplateTransformEvent, ctx: ExtensionContext) => string | Promise<string>;

interface Subscription {
  ctx: ExtensionContext;
  sessionManager: Host["sessionManager"];
  transform: TemplateTransform;
  controller: AbortController;
}

interface Invocation {
  host: Host;
  enabled: boolean;
  consumed: boolean;
  template: PromptTemplate | undefined;
}

interface Patch {
  add(ctx: ExtensionContext, transform: TemplateTransform): () => void;
}

const PATCH_KEY = Symbol.for("@pi-pack/monkey-patching/prompt-templates/v1");
const methodNames = ["prompt", "_queueUserInput", "_prepareRun", "_queueSteer", "_queueFollowUp", "dispose"] as const;

export function assertCompatible(prototype: object, version: string): void {
  if (version !== PI_VERSION) {
    throw new Error(`unsupported Pi version ${version}; expected ${PI_VERSION}`);
  }
  for (const name of methodNames) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (!descriptor?.configurable || typeof descriptor.value !== "function") {
      throw new Error(`unsupported Pi method ${name}`);
    }
  }
  const getter = Object.getOwnPropertyDescriptor(prototype, "promptTemplates");
  if (!getter?.configurable || typeof getter.get !== "function") {
    throw new Error("unsupported Pi promptTemplates getter");
  }
}

function createPatch(prototype: object): Patch {
  const originals = new Map<string, PropertyDescriptor>();
  for (const name of [...methodNames, "promptTemplates"]) {
    originals.set(name, Object.getOwnPropertyDescriptor(prototype, name)!);
  }
  const native = Object.fromEntries(
    methodNames.map((name) => [name, originals.get(name)!.value]),
  ) as unknown as Methods;
  const getTemplates = originals.get("promptTemplates")!.get as (this: Host) => readonly PromptTemplate[];
  const scope = new AsyncLocalStorage<Invocation>();
  const subscriptions = new Map<Host["sessionManager"], Set<Subscription>>();
  const installed = new Map<string, PropertyDescriptor>();

  function remove(subscription: Subscription): void {
    subscription.controller.abort();
    const key = subscription.sessionManager;
    const group = subscriptions.get(key);
    if (!group?.delete(subscription)) {
      return;
    }
    if (group.size === 0) {
      subscriptions.delete(key);
    }
    if (subscriptions.size !== 0) {
      return;
    }
    restore();
  }

  function restore(): void {
    for (const [name, descriptor] of installed) {
      const current = Object.getOwnPropertyDescriptor(prototype, name);
      if (current?.value === descriptor.value && current?.get === descriptor.get) {
        Object.defineProperty(prototype, name, originals.get(name)!);
      }
    }
    scope.disable();
    Reflect.deleteProperty(prototype, PATCH_KEY);
  }

  function invoke<T>(host: Host, enabled: boolean, action: () => T): T {
    if (!subscriptions.has(host.sessionManager)) {
      return action();
    }
    return scope.run({ host, enabled, consumed: false, template: undefined }, action);
  }

  async function transform(host: Host, text: string): Promise<string> {
    const invocation = scope.getStore();
    if (!invocation || invocation.host !== host || invocation.consumed || !invocation.template) {
      return text;
    }
    invocation.consumed = true;
    const { name, filePath } = invocation.template;
    invocation.template = undefined;
    const listeners = [...(subscriptions.get(host.sessionManager) ?? [])];
    for (const subscription of listeners) {
      const { ctx, controller } = subscription;
      controller.signal.throwIfAborted();
      const operationSignal = ctx.signal;
      const signal = operationSignal ? AbortSignal.any([controller.signal, operationSignal]) : controller.signal;
      signal.throwIfAborted();
      text = await subscription.transform({ text, template: { name, filePath }, signal }, ctx);
      signal.throwIfAborted();
    }
    return text;
  }

  const methods: Methods = {
    prompt(...args) {
      return invoke(this, args[1]?.expandPromptTemplates !== false, () => native.prompt.apply(this, args));
    },
    _queueUserInput(...args) {
      return invoke(this, true, () => native._queueUserInput.apply(this, args));
    },
    async _prepareRun(trigger) {
      const expanded =
        trigger.messageType === "user" ? { ...trigger, prompt: await transform(this, trigger.prompt) } : trigger;
      return native._prepareRun.call(this, expanded);
    },
    async _queueSteer(text, images) {
      return native._queueSteer.call(this, await transform(this, text), images);
    },
    async _queueFollowUp(text, images) {
      return native._queueFollowUp.call(this, await transform(this, text), images);
    },
    dispose() {
      const listeners = [...(subscriptions.get(this.sessionManager) ?? [])];
      for (const subscription of listeners) {
        remove(subscription);
      }
      native.dispose.call(this);
    },
  };
  for (const name of methodNames) {
    installed.set(name, { ...originals.get(name), value: methods[name] });
  }
  installed.set("promptTemplates", {
    ...originals.get("promptTemplates"),
    get(this: Host) {
      const templates = getTemplates.call(this);
      const invocation = scope.getStore();
      if (!invocation?.enabled || invocation.host !== this || invocation.consumed) {
        return templates;
      }
      // Pi reads content only for the selected template, after all input handlers.
      invocation.template = undefined;
      return templates.map((template) => ({
        ...template,
        get content() {
          invocation.template = template;
          return template.content;
        },
      }));
    },
  });
  for (const [name, descriptor] of installed) {
    Object.defineProperty(prototype, name, descriptor);
  }

  return {
    add(ctx, transformer) {
      const subscription: Subscription = {
        ctx,
        sessionManager: ctx.sessionManager,
        transform: transformer,
        controller: new AbortController(),
      };
      let group = subscriptions.get(ctx.sessionManager);
      if (!group) {
        group = new Set();
        subscriptions.set(ctx.sessionManager, group);
      }
      group.add(subscription);
      return () => remove(subscription);
    },
  };
}

export function getTemplatePatch(prototype: object, version: string): Patch {
  assertCompatible(prototype, version);
  const existing: unknown = Reflect.get(prototype, PATCH_KEY);
  if (existing !== undefined) {
    return existing as Patch;
  }
  if (!Object.isExtensible(prototype)) {
    throw new Error("cannot patch a non-extensible Pi prototype");
  }
  const patch = createPatch(prototype);
  Object.defineProperty(prototype, PATCH_KEY, { value: patch, configurable: true });
  return patch;
}
