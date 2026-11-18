import { type CodemodeOutputItem, type CodemodeResult } from "@earendil-works/pi-codemode";
import { resizeImage } from "@earendil-works/pi-coding-agent";
import { Buffer } from "node:buffer";

const MAX_CHARS = 32_000;
const CHARS_PER_TOKEN_ESTIMATE = 4;
const START = 0;
const FIRST_SECTION = 1;
const TEXT_TYPE = "text";
const IMAGE_TYPE = "image";

function textBlock(lines: string[]): CodemodeOutputItem {
	if (lines.length <= FIRST_SECTION) {
		return { type: TEXT_TYPE, text: lines.join("\n") };
	}
	const sections = lines.map((line, index) => `==> ${index + FIRST_SECTION}/${lines.length} <==\n${line}`);
	return { type: TEXT_TYPE, text: sections.join("\n") };
}

function* blocks(items: readonly CodemodeOutputItem[]): Generator<CodemodeOutputItem> {
	let lines: string[] = [];
	for (const item of items) {
		if (item.type === TEXT_TYPE) {
			lines.push(item.text);
		} else {
			if (lines.length > START) {
				yield textBlock(lines);
				lines = [];
			}
			yield item;
		}
	}
	if (lines.length > START) {
		yield textBlock(lines);
	}
}

function* boundedBlocks(items: readonly CodemodeOutputItem[], limit: number): Generator<CodemodeOutputItem> {
	let remaining = limit;
	let truncated = false;
	for (const block of blocks(items)) {
		if (block.type === IMAGE_TYPE) {
			yield block;
		} else if (!truncated) {
			if (block.text.length > remaining) {
				yield { type: TEXT_TYPE, text: `${block.text.slice(START, remaining)}\n[output truncated]` };
				truncated = true;
			} else {
				yield block;
				remaining -= block.text.length;
			}
		}
	}
}

async function checkedImage(block: Extract<CodemodeOutputItem, { type: "image" }>): Promise<CodemodeOutputItem> {
	// The sandbox checks image signatures, not whether the pixels can be decoded.
	const image = await resizeImage(Buffer.from(block.data, "base64"), block.mimeType);
	if (image === null) {
		return {
			type: TEXT_TYPE,
			text: "Cannot decode or resize image. For a local file, use image(await tools.read({ path })).",
		};
	}
	return { type: IMAGE_TYPE, data: image.data, mimeType: image.mimeType };
}

async function checkedContent(blocksToCheck: Iterable<CodemodeOutputItem>) {
	const content: CodemodeOutputItem[] = [];
	let invalidImage = false;
	for (const block of blocksToCheck) {
		if (block.type === TEXT_TYPE) {
			content.push(block);
		} else {
			// Decode one image at a time to bound worker memory.
			// eslint-disable-next-line no-await-in-loop
			const checked = await checkedImage(block);
			invalidImage ||= checked.type === TEXT_TYPE;
			content.push(checked);
		}
	}
	return { content, invalidImage };
}

export const Output = {
	async result(run: CodemodeResult, maxTokens?: number) {
		const limit = Math.min(MAX_CHARS, (maxTokens ?? Infinity) * CHARS_PER_TOKEN_ESTIMATE);
		const { content, invalidImage } = await checkedContent(boundedBlocks(run.output, limit));
		if (content.length === START) {
			content.push({ type: TEXT_TYPE, text: "" });
		}
		if (!run.ok) {
			content.push({ type: TEXT_TYPE, text: run.error.message.slice(START, MAX_CHARS) });
		}
		return { content, details: {}, isError: !run.ok || invalidImage };
	},
};
