import { afterEach, describe, expect, it } from "vitest";
import { CodemodeSandbox } from "#src/sandbox/sandbox";
import type { CodemodeTool } from "#src/sandbox/types";

const TOOL_HINT = "ALL_TOOLS lists tools available to this script. Use searchTools(query) to find a tool.";
const sandboxes: CodemodeSandbox[] = [];

function createSandbox(names: string[]): CodemodeSandbox {
  const tools: CodemodeTool[] = names.map((name) => ({ name, execute: () => name }));
  const sandbox = new CodemodeSandbox({ tools });
  sandboxes.push(sandbox);
  return sandbox;
}

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

describe("guarded tool names", () => {
  it("prefers normalized exact matches over substring matches", async () => {
    // Arrange
    const sandbox = createSandbox(["read_file", "ReadFile", "read_file_extra"]);

    // Act
    const result = await sandbox.execute("tools.READFILE;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        name: "TypeError",
        message: `tools.READFILE does not exist. Did you mean tools.read_file, tools.ReadFile? ${TOOL_HINT}`,
      },
    });
  });

  it("limits substring suggestions to five names in registration order", async () => {
    // Arrange
    const sandbox = createSandbox(["lookup0", "lookup1", "lookup2", "lookup3", "lookup4", "lookup5"]);

    // Act
    const result = await sandbox.execute("tools.look;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        message: `tools.look does not exist. Did you mean tools.lookup0, tools.lookup1, tools.lookup2, tools.lookup3, tools.lookup4? ${TOOL_HINT}`,
      },
    });
  });

  it.each([20, 21])("keeps the available-name cutoff for %s tools", async (count) => {
    // Arrange
    const names = Array.from({ length: count }, (_, index) => `entry${index}`);
    const sandbox = createSandbox(names);
    const available = count === 20 ? ` Available: ${names.join(", ")}.` : "";

    // Act
    const result = await sandbox.execute("tools.missing;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        message: `tools.missing does not exist.${available} ${TOOL_HINT}`,
      },
    });
  });

  it("preserves exact matches when normalization removes every character", async () => {
    // Arrange
    const sandbox = createSandbox(["___"]);

    // Act
    const result = await sandbox.execute('tools["!!!"];');

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: {
        message: `tools["!!!"] does not exist. Did you mean tools.___? ${TOOL_HINT}`,
      },
    });
  });

  it("allows promise, JSON, symbol, and inherited-property probes", async () => {
    // Arrange
    const sandbox = createSandbox(["echo"]);

    // Act
    const result = await sandbox.execute(`
      return [
        (await tools) === tools,
        JSON.stringify(tools),
        typeof tools[Symbol.toStringTag],
        typeof tools.toString,
        Object.getPrototypeOf(tools) === null,
        Object.isFrozen(tools),
        Object.isFrozen(ALL_TOOLS),
        Object.isFrozen(ALL_TOOLS[0]),
      ];
    `);

    // Assert
    expect(result).toMatchObject({ ok: true, value: [true, "{}", "undefined", "undefined", true, true, true, true] });
  });
});

describe("canonical tool names and safe aliases", () => {
  it.each([
    { names: ["foo-bar", "foo_bar"], alias: true },
    { names: ["foo_bar", "foo-bar"], alias: true },
    { names: ["foo-bar", "foo.bar"], alias: false },
    { names: ["foo.bar", "foo-bar"], alias: false },
    { names: ["foo-bar", "foo.bar", "foo_bar"], alias: true },
  ])("preserves every original name in $names", async ({ names, alias }) => {
    // Arrange
    const sandbox = createSandbox(names);

    // Act
    const result = await sandbox.execute(`
      return {
        names: ALL_TOOLS.map(tool => tool.name),
        calls: await Promise.all(ALL_TOOLS.map(tool => tools[tool.name]({}))),
        hasAlias: "foo_bar" in tools,
        aliasResult: "foo_bar" in tools ? await tools.foo_bar({}) : null,
      };
    `);

    // Assert
    expect(result).toMatchObject({
      ok: true,
      value: { names, calls: names, hasAlias: alias, aliasResult: alias ? "foo_bar" : null },
    });
  });

  it("keeps unique aliases without replacing the canonical discovery names", async () => {
    // Arrange
    const sandbox = createSandbox(["foo-bar", "__proto__", 'quoted"name', "", "default"]);

    // Act
    const result = await sandbox.execute(`
      return {
        originals: await Promise.all(ALL_TOOLS.map(tool => tools[tool.name]({}))),
        alias: await tools.foo_bar({}),
        sameFunction: tools.foo_bar === tools["foo-bar"],
      };
    `);

    // Assert
    expect(result).toMatchObject({
      ok: true,
      value: {
        originals: ["foo-bar", "__proto__", 'quoted"name', "", "default"],
        alias: "foo-bar",
        sameFunction: true,
      },
    });
  });

  it("explains an ambiguous alias without calling a tool", async () => {
    // Arrange
    const sandbox = createSandbox(["foo-bar", "foo.bar"]);

    // Act
    const result = await sandbox.execute("await tools.foo_bar({});");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      calls: [],
      error: {
        name: "TypeError",
        message: 'Ambiguous tool alias "foo_bar". Use tools["foo-bar"], tools["foo.bar"].',
      },
    });
  });

  it.each(["foo.bar", "foo_bar"])("keeps running aliases stable when %s is registered", async (addedName) => {
    // Arrange
    const sandbox = createSandbox(["foo-bar"]);
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    sandbox.registerTool({
      name: "wait",
      execute() {
        started.resolve();
        return release.promise;
      },
    });
    const execution = sandbox.execute(`
      const alias = tools.foo_bar;
      await tools.wait({});
      return {
        names: ALL_TOOLS.map(tool => tool.name),
        value: await tools.foo_bar({}),
        sameFunction: tools.foo_bar === alias,
      };
    `);
    await started.promise;

    // Act
    sandbox.registerTool({ name: addedName, execute: () => addedName });
    release.resolve();
    const running = await execution;
    const next = await sandbox.execute(`
      return {
        names: ALL_TOOLS.map(tool => tool.name),
        hasAlias: "foo_bar" in tools,
        value: await tools[${JSON.stringify(addedName)}]({}),
        original: await tools["foo-bar"]({}),
      };
    `);

    // Assert
    expect(running).toMatchObject({
      ok: true,
      value: { names: ["foo-bar", "wait"], value: "foo-bar", sameFunction: true },
    });
    expect(next).toMatchObject({
      ok: true,
      value: {
        names: ["foo-bar", "wait", addedName],
        hasAlias: addedName === "foo_bar",
        value: addedName,
        original: "foo-bar",
      },
    });
  });

  it("restores an alias on the next execution after the conflict is removed", async () => {
    // Arrange
    const sandbox = createSandbox(["foo-bar", "foo.bar"]);
    const before = await sandbox.execute('return "foo_bar" in tools;');

    // Act
    sandbox.unregisterTool("foo.bar");
    const after = await sandbox.execute("return await tools.foo_bar({});");

    // Assert
    expect(before).toMatchObject({ ok: true, value: false });
    expect(after).toMatchObject({ ok: true, value: "foo-bar" });
  });
});
