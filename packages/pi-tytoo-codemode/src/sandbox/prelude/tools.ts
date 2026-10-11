import { BridgeMessageType } from "#src/sandbox/bridge-protocol";
import type { createBridge, ScriptFunction } from "#src/sandbox/prelude/bridge";
import type { WorkerData } from "#src/sandbox/protocol";

const MAX_NAME_SUGGESTIONS = 5;
const MAX_LISTED_NAMES = 20;
const TOOLS_GLOBAL_NAME = "tools";
const ALL_TOOLS_GLOBAL_NAME = "ALL_TOOLS";
const TOOL_DISCOVERY_HINT = "ALL_TOOLS lists every tool; searchTools(query) finds tools by topic.";

type ToolMembers = Record<string, ScriptFunction>;
type RpcBridge = ReturnType<typeof createBridge>;

export function installGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, enumerable: true });
}

function normalizeForComparison(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCloseNames(property: string, names: string[]): string[] {
  const wanted = normalizeForComparison(property);
  const exact: string[] = [];
  const partial: string[] = [];

  for (const name of names) {
    const candidate = normalizeForComparison(name);
    if (candidate === wanted) {
      exact.push(name);
    } else if (wanted !== "" && (candidate.includes(wanted) || wanted.includes(candidate))) {
      partial.push(name);
    }
  }

  return exact.length > 0 ? exact : partial;
}

function formatSuggestions(label: string, names: string[]): string {
  function qualifyName(name: string): string {
    return `${label}.${name}`;
  }

  return names.slice(0, MAX_NAME_SUGGESTIONS).map(qualifyName).join(", ");
}

function missingMemberMessage(label: string, property: string, names: string[], hint?: string): string {
  const close = findCloseNames(property, names);
  let message = `${label}.${property} does not exist.`;

  if (close.length > 0) {
    message += ` Did you mean ${formatSuggestions(label, close)}?`;
  } else if (names.length <= MAX_LISTED_NAMES) {
    message += ` Available: ${names.join(", ")}.`;
  }

  if (hint) {
    message += ` ${hint}`;
  }

  return `${message} Check for a member with "${property}" in ${label}.`;
}

function guardMembers(target: ToolMembers, label: string, names: string[], hint?: string) {
  function getProperty(object: ToolMembers, property: string | symbol, receiver: unknown): unknown {
    if (
      typeof property !== "string" ||
      property in object ||
      property in Object.prototype ||
      property === "then" ||
      property === "toJSON"
    ) {
      return Reflect.get(object, property, receiver);
    }

    throw new TypeError(missingMemberMessage(label, property, names, hint));
  }

  return new Proxy(target, { get: getProperty });
}

function createToolTable(definitions: WorkerData["tools"], rpc: RpcBridge) {
  const tools: ToolMembers = {};
  Object.setPrototypeOf(tools, null);

  const allTools: { name: string; description: string }[] = [];
  const names: string[] = [];

  for (const { name, jsName, description } of definitions) {
    const fn = rpc.caller(BridgeMessageType.Call, name);
    if (!(jsName in tools)) {
      tools[jsName] = fn;
      allTools.push(Object.freeze({ name: jsName, description }));
      names.push(jsName);
    }

    if (!(name in tools)) {
      tools[name] = fn;
    }
  }

  Object.freeze(tools);
  Object.freeze(allTools);

  return { tools, allTools, names };
}

export function installTools(definitions: WorkerData["tools"], globals: WorkerData["globals"], rpc: RpcBridge) {
  const { tools, allTools, names } = createToolTable(definitions, rpc);
  const proxy = guardMembers(tools, TOOLS_GLOBAL_NAME, names, TOOL_DISCOVERY_HINT);

  installGlobal(TOOLS_GLOBAL_NAME, proxy);
  installGlobal(ALL_TOOLS_GLOBAL_NAME, allTools);
  installNamespaces(globals, rpc);

  return proxy;
}

function installNamespaces(globals: WorkerData["globals"], rpc: RpcBridge): void {
  const namespaces = new Map<string, ToolMembers>();

  function registerGlobal(name: string, spread: boolean): void {
    const fn = rpc.caller(BridgeMessageType.Global, name, spread);
    const dot = name.indexOf(".");
    if (dot === -1) {
      installGlobal(name, fn);
      return;
    }

    const namespace = name.slice(0, dot);
    const members: ToolMembers = namespaces.get(namespace) ?? {};
    Object.setPrototypeOf(members, null);
    members[name.slice(dot + 1)] = fn;
    namespaces.set(namespace, members);
  }

  for (const { name, spread } of globals) {
    registerGlobal(name, spread);
  }

  for (const [namespace, members] of namespaces) {
    Object.freeze(members);
    installGlobal(namespace, guardMembers(members, namespace, Object.keys(members)));
  }
}
