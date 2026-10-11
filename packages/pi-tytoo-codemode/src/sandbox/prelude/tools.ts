import type { createBridge, ScriptFunction } from "#src/sandbox/prelude/bridge";
import type { WorkerData } from "#src/sandbox/protocol";

export function installGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, enumerable: true });
}

const comparable = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
function missingMessage(label: string, property: string, names: string[], hint?: string): string {
  const wanted = comparable(property);
  const exact = names.filter((name) => comparable(name) === wanted);
  const close =
    exact.length > 0
      ? exact
      : names.filter((name) => wanted && (comparable(name).includes(wanted) || wanted.includes(comparable(name))));
  let message = `${label}.${property} does not exist.`;
  if (close.length > 0) {
    message += ` Did you mean ${close
      .slice(0, 5)
      .map((name) => `${label}.${name}`)
      .join(", ")}?`;
  } else if (names.length <= 20) {
    message += ` Available: ${names.join(", ")}.`;
  }
  if (hint) {
    message += ` ${hint}`;
  }
  return `${message} Check for a member with "${property}" in ${label}.`;
}

function guard(target: Record<string, ScriptFunction>, label: string, names: string[], hint?: string) {
  return new Proxy(target, {
    get(object, property, receiver): unknown {
      if (
        typeof property !== "string" ||
        property in object ||
        property in Object.prototype ||
        property === "then" ||
        property === "toJSON"
      ) {
        return Reflect.get(object, property, receiver);
      }
      throw new TypeError(missingMessage(label, property, names, hint));
    },
  });
}

export function installTools(
  definitions: WorkerData["tools"],
  globals: WorkerData["globals"],
  rpc: ReturnType<typeof createBridge>,
) {
  const tools: Record<string, ScriptFunction> = {};
  Object.setPrototypeOf(tools, null);
  const allTools: { name: string; description: string }[] = [];
  for (const { name, jsName, description } of definitions) {
    const fn = rpc.caller("call", name);
    if (!(jsName in tools)) {
      tools[jsName] = fn;
      allTools.push(Object.freeze({ name: jsName, description }));
    }
    if (!(name in tools)) {
      tools[name] = fn;
    }
  }
  Object.freeze(tools);
  Object.freeze(allTools);
  const proxy = guard(
    tools,
    "tools",
    allTools.map((tool) => tool.name),
    "ALL_TOOLS lists every tool; searchTools(query) finds tools by topic.",
  );
  installGlobal("tools", proxy);
  installGlobal("ALL_TOOLS", allTools);
  installNamespaces(globals, rpc);
  return proxy;
}

function installNamespaces(globals: WorkerData["globals"], rpc: ReturnType<typeof createBridge>): void {
  const namespaces = new Map<string, Record<string, ScriptFunction>>();
  for (const { name, spread } of globals) {
    const fn = rpc.caller("global", name, spread);
    const dot = name.indexOf(".");
    if (dot === -1) {
      installGlobal(name, fn);
      continue;
    }
    const namespace = name.slice(0, dot);
    const members: Record<string, ScriptFunction> = namespaces.get(namespace) ?? {};
    Object.setPrototypeOf(members, null);
    members[name.slice(dot + 1)] = fn;
    namespaces.set(namespace, members);
  }
  for (const [namespace, members] of namespaces) {
    Object.freeze(members);
    installGlobal(namespace, guard(members, namespace, Object.keys(members)));
  }
}
