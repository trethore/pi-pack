import { Harness } from "#test/harness";
import { expect, test } from "vitest";

const png = {
	type: "image" as const,
	mimeType: "image/png",
	data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
};
const imageCall = `image("data:image/png;base64,${png.data}");`;

test("shows a structured read result as an image in only mode", async () => {
	expect.hasAssertions();
	// Arrange
	const { run, executeTool } = Harness.create("only");
	executeTool.mockResolvedValue({
		toolCall: { type: "toolCall", name: "read", id: "child", arguments: {} },
		isError: false,
		result: { details: {}, content: [png], structuredContent: { ...png, note: "screenshot" } },
	});

	// Act
	const result = await run('image(await tools.read({ path: "shot.png" }));');

	// Assert
	expect(result.content).toStrictEqual([png]);
});

test("keeps image order and one text budget across images", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const code = `// @options: {"max_output_tokens": 1}\ntext("ab"); ${imageCall} text("cdef"); ${imageCall} text("g");`;

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([
		{ type: "text", text: "ab" },
		png,
		{ type: "text", text: "cd\n[output truncated]" },
		png,
	]);
});

test("keeps an emitted image before a later script error", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();

	// Act
	const result = await run(`${imageCall} throw Error("stop");`);

	// Assert
	expect(result).toMatchObject({ isError: true, content: [png, { type: "text", text: "stop" }] });
});
