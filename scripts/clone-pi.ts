import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const REPOSITORY = "https://github.com/earendil-works/pi.git";
const FILE_NOT_FOUND_CODE = "ENOENT";
const ARGUMENT_OFFSET = 2;
const destination = fileURLToPath(new URL("../pi/", import.meta.url));

const execute = promisify(execFile);

async function exists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch (error) {
		const missing = error instanceof Error && "code" in error && error.code === FILE_NOT_FOUND_CODE;
		if (missing) {
			return false;
		}
		throw error;
	}
}

async function git(args: string[]): Promise<string> {
	const { stdout } = await execute("git", args);
	return stdout.trim();
}

async function parseTag(): Promise<string> {
	const [tag, extraArgument] = process.argv.slice(ARGUMENT_OFFSET);
	const validArguments = tag !== undefined && tag !== "" && !tag.startsWith("-") && extraArgument === undefined;
	if (!validArguments) {
		throw new Error("Usage: npm run clone:pi -- <tag>");
	}
	await git(["check-ref-format", `refs/tags/${tag}`]);
	return tag;
}

async function validateCheckout(tag: string): Promise<void> {
	if (!await exists(`${destination}/.git`)) {
		throw new Error("pi/ already exists and is not a Git checkout. It has been left unchanged.");
	}

	const origin = await git(["-C", destination, "config", "--get", "remote.origin.url"]);
	const status = await git(["-C", destination, "status", "--porcelain", "--untracked-files=all"]);
	const head = await git(["-C", destination, "rev-parse", "HEAD"]);
	const taggedCommit = await git(["-C", destination, "rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
	const cleanTaggedCheckout = origin === REPOSITORY && status === "" && head === taggedCommit;
	if (!cleanTaggedCheckout) {
		throw new Error(`pi/ is not a clean Pi checkout at ${tag}. It has been left unchanged.`);
	}
}

async function main(): Promise<void> {
	const tag = await parseTag();
	if (await exists(destination)) {
		await validateCheckout(tag);
		console.log(`pi/ already contains Pi ${tag}.`);
		return;
	}

	// --branch also accepts branch names; verify that the requested tag exists first.
	await git(["ls-remote", "--exit-code", "--refs", REPOSITORY, `refs/tags/${tag}`]);
	await git(["clone", "--depth", "1", "--branch", tag, REPOSITORY, destination]);
	console.log(`Cloned Pi ${tag} into pi/.`);
}

try {
	await main();
} catch (error) {
	if (error instanceof Error) {
		console.error(error.message);
	} else {
		console.error(String(error));
	}
	process.exitCode = 1;
}
