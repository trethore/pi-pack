import { type CodemodeOutputItem, type CodemodeResult } from "@earendil-works/pi-codemode";
import { resizeImage } from "@earendil-works/pi-coding-agent";
import { Buffer } from "node:buffer";

const maxChars = 32_000;
const charsPerTokenEstimate = 4;
const start = 0;
const firstSection = 1;
const textType = "text";
const imageType = "image";

function textBlock(lines: string[]): CodemodeOutputItem {
	if (lines.length <= firstSection) {
		return { type: textType, text: lines.join("\n") };
	}
	const sections = lines.map((line, index) => `==> ${index + firstSection}/${lines.length} <==\n${line}`);
	return { type: textType, text: sections.join("\n") };
}

function* blocks(items: readonly CodemodeOutputItem[]): Generator<CodemodeOutputItem> {
	let lines: string[] = [];
	for (const item of items) {
		if (item.type === textType) {
			lines.push(item.text);
		} else {
			if (lines.length > start) {
				yield textBlock(lines);
				lines = [];
			}
			yield item;
		}
	}
	if (lines.length > start) {
		yield textBlock(lines);
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

async function checkedImage(block: Extract<CodemodeOutputItem, { type: "image" }>): Promise<CodemodeOutputItem> {
	// The sandbox checks image signatures, not whether the pixels can be decoded.
	const image = await resizeImage(Buffer.from(block.data, "base64"), block.mimeType);
	if (image === null) {
		return {
			type: textType,
			text: "Cannot decode or resize image. For a local file, use image(await tools.read({ path })).",
		};
	}
	return { type: imageType, data: image.data, mimeType: image.mimeType };
}

async function checkedContent(blocksToCheck: Iterable<CodemodeOutputItem>) {
	const content: CodemodeOutputItem[] = [];
	let invalidImage = false;
	for (const block of blocksToCheck) {
		if (block.type === textType) {
			content.push(block);
		} else {
			// Decode one image at a time to bound worker memory.
			// eslint-disable-next-line no-await-in-loop
			const checked = await checkedImage(block);
			invalidImage ||= checked.type === textType;
			content.push(checked);
		}
	}
	return { content, invalidImage };
}

export const Output = {
	async result(run: CodemodeResult, maxTokens?: number) {
		const limit = Math.min(maxChars, (maxTokens ?? Infinity) * charsPerTokenEstimate);
		const { content, invalidImage } = await checkedContent(boundedBlocks(run.output, limit));
		if (content.length === start) {
			content.push({ type: textType, text: "" });
		}
		if (!run.ok) {
			content.push({ type: textType, text: run.error.message.slice(start, maxChars) });
		}
		return { content, details: {}, isError: !run.ok || invalidImage };
	},
};
