import { Harness } from "#test/harness";
import { expect, test } from "vitest";

const png = {
	type: "image" as const,
	mimeType: "image/png",
	data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",
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
	const code = `// @options: {"max_output_tokens": 2}\ntext("ab"); ${imageCall} text("cdef"); ${imageCall} text("g");`;

	// Act
	const result = await run(code);

	// Assert
	expect(result.content).toStrictEqual([
		{ type: "text", text: '"ab"' },
		png,
		{ type: "text", text: '"cde\n[output truncated]' },
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

test("returns text instead of persisting an undecodable image", async () => {
	expect.hasAssertions();
	// Arrange
	const { run } = Harness.create();
	const signatureOnly = "data:image/png;base64,iVBORw0KGgo=";

	// Act
	const result = await run(`text("before"); store("seen", true); image("${signatureOnly}");`);
	const saved = await run('return typeof load("seen");');

	// Assert
	expect(result).toMatchObject({ isError: true });
	expect(result.content).toStrictEqual([
		{ type: "text", text: '"before"' },
		{ type: "text", text: "Cannot decode or resize image. For a local file, use image(await tools.read({ path }))." },
	]);
	expect(saved.content).toStrictEqual([{ type: "text", text: '"undefined"' }]);
});
