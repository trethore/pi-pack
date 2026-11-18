import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPOSITORY = "https://github.com/earendil-works/pi.git";
const ARGUMENT_OFFSET = 2;
const destination = fileURLToPath(new URL("../pi/", import.meta.url));

function git(args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function parseTag(): string {
	const [tag, extraArgument] = process.argv.slice(ARGUMENT_OFFSET);
	const validArguments = tag !== undefined && tag !== "" && !tag.startsWith("-") && extraArgument === undefined;
	if (!validArguments) {
		throw new Error("Usage: npm run clone:pi -- <tag>");
	}
	git(["check-ref-format", `refs/tags/${tag}`]);
	return tag;
}

function validateCheckout(tag: string): void {
	if (!existsSync(`${destination}/.git`)) {
		throw new Error("pi/ already exists and is not a Git checkout. It has been left unchanged.");
	}

	const origin = git(["-C", destination, "config", "--get", "remote.origin.url"]);
	const status = git(["-C", destination, "status", "--porcelain", "--untracked-files=all"]);
	const head = git(["-C", destination, "rev-parse", "HEAD"]);
	const taggedCommit = git(["-C", destination, "rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
	const cleanTaggedCheckout = origin === REPOSITORY && status === "" && head === taggedCommit;
	if (!cleanTaggedCheckout) {
		throw new Error(`pi/ is not a clean Pi checkout at ${tag}. It has been left unchanged.`);
	}
}

function main(): void {
	const tag = parseTag();
	if (existsSync(destination)) {
		validateCheckout(tag);
		console.log(`pi/ already contains Pi ${tag}.`);
		return;
	}

	// --branch also accepts branch names; verify that the requested tag exists first.
	git(["ls-remote", "--exit-code", "--refs", REPOSITORY, `refs/tags/${tag}`]);
	execFileSync("git", ["clone", "--depth", "1", "--branch", tag, REPOSITORY, destination], {
		stdio: "inherit",
	});
	console.log(`Cloned Pi ${tag} into pi/.`);
}

try {
	main();
} catch (error) {
	if (error instanceof Error) {
		console.error(error.message);
	} else {
		console.error(String(error));
	}
	process.exitCode = 1;
}
