import { describe, expect, it } from "vitest";
import { CodemodeSourceError, parseCodemodeSource } from "#test/support/upstream-adapter";

describe("parseCodemodeSource", () => {
	it("returns plain code unchanged", () => {
		expect(parseCodemodeSource("text('hi')")).toEqual({ code: "text('hi')", options: {} });
		expect(parseCodemodeSource("// just a comment\nreturn 1")).toEqual({
			code: "// just a comment\nreturn 1",
			options: {},
		});
	});

	it("parses the options line and keeps line numbers", () => {
		expect(parseCodemodeSource('// @options: {"timeout_ms": 10}\nconst a = 1;\ntext(a)')).toEqual({
			code: "\nconst a = 1;\ntext(a)",
			options: { timeoutMs: 10 },
		});
		expect(parseCodemodeSource('  // @options:{"max_output_tokens":0,"timeout_ms":1500}\r\ntext(1)').options).toEqual(
			{
				maxOutputTokens: 0,
				timeoutMs: 1500,
			},
		);
		expect(parseCodemodeSource("// @options: {}\ntext(1)")).toEqual({ code: "\ntext(1)", options: {} });
	});

	it("only treats the first line as an options line", () => {
		const input = 'text(1)\n// @options: {"timeout_ms": 1}';
		expect(parseCodemodeSource(input)).toEqual({ code: input, options: {} });
		expect(parseCodemodeSource("// @optionsx {}\ntext(1)").options).toEqual({});
	});

	it("rejects empty input and invalid options", () => {
		const cases: [string, string | RegExp][] = [
			["", /Provide JavaScript source/],
			["  \n", /Provide JavaScript source/],
			["// @options:\ntext(1)", /@options must be a JSON object\. Supported fields:/],
			["// @options: {timeout_ms: 1}\ntext(1)", /Invalid @options JSON:/],
			["// @options: [1]\ntext(1)", /@options must be a JSON object\. Supported fields:/],
			[
				'// @options: {"yield": 1}\ntext(1)',
				"Unsupported @options field `yield`. Use `max_output_tokens` and `timeout_ms`.",
			],
			[
				'// @options: {"max_output_tokens": 1.5}\ntext(1)',
				"@options field `max_output_tokens` must be a non-negative safe integer",
			],
			['// @options: {"timeout_ms": 0}\ntext(1)', /@options field `timeout_ms` must be a positive integer/],
			[
				'// @options: {"timeout_ms": 1}',
				"Put JavaScript source after the @options line.",
			],
			[
				'// @options: {"timeout_ms": 1}\n  \n',
				"Put JavaScript source after the @options line.",
			],
		];
		for (const [input, message] of cases) {
			expect(() => parseCodemodeSource(input), input).toThrow(CodemodeSourceError);
			expect(() => parseCodemodeSource(input), input).toThrow(message);
		}
	});
});
