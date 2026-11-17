import { type CodemodeOutputItem, type CodemodeResult } from "@earendil-works/pi-codemode";

const maxChars = 32_000;
const charsPerTokenEstimate = 4;
const start = 0;
const textType = "text";
const imageType = "image";

function* blocks(items: readonly CodemodeOutputItem[]): Generator<CodemodeOutputItem> {
	let lines: string[] = [];
	for (const item of items) {
		if (item.type === textType) {
			lines.push(item.text);
		} else {
			if (lines.length > start) {
				yield { type: textType, text: lines.join("\n") };
				lines = [];
			}
			yield item;
		}
	}
	if (lines.length > start) {
		yield { type: textType, text: lines.join("\n") };
	}
}

function* boundedBlocks(items: readonly CodemodeOutputItem[], limit: number): Generator<CodemodeOutputItem> {
	let remaining = limit;
	let truncated = false;
	for (const block of blocks(items)) {
		if (block.type === imageType) {
			yield block;
		} else if (!truncated) {
			if (block.text.length > remaining) {
				yield { type: textType, text: `${block.text.slice(start, remaining)}\n[output truncated]` };
				truncated = true;
			} else {
				yield block;
				remaining -= block.text.length;
			}
		}
	}
}

export const Output = {
	result(run: CodemodeResult, maxTokens?: number) {
		const limit = Math.min(maxChars, (maxTokens ?? Infinity) * charsPerTokenEstimate);
		const content = [...boundedBlocks(run.output, limit)];
		if (content.length === start) {
			content.push({ type: textType, text: "" });
		}
		if (!run.ok) {
			content.push({ type: textType, text: run.error.message.slice(start, maxChars) });
		}
		return { content, details: {}, isError: !run.ok };
	},
};
