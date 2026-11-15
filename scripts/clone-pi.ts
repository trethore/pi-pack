import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repository = "https://github.com/earendil-works/pi.git";
const destination = fileURLToPath(new URL("../pi/", import.meta.url));

function git(args: string[]): string {
	return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function main(): void {
	const [tag, ...extraArguments] = process.argv.slice(2);
	if (!tag || tag.startsWith("-") || extraArguments.length > 0) {
		throw new Error("Usage: npm run clone:pi -- <tag>");
	}
	git(["check-ref-format", `refs/tags/${tag}`]);

	if (existsSync(destination)) {
		if (!existsSync(`${destination}/.git`)) {
			throw new Error("pi/ already exists and is not a Git checkout. It has been left unchanged.");
		}

		const origin = git(["-C", destination, "config", "--get", "remote.origin.url"]);
		const status = git(["-C", destination, "status", "--porcelain", "--untracked-files=all"]);
		const head = git(["-C", destination, "rev-parse", "HEAD"]);
		const taggedCommit = git(["-C", destination, "rev-parse", "--verify", `refs/tags/${tag}^{commit}`]);
		if (origin !== repository || status || head !== taggedCommit) {
			throw new Error(`pi/ is not a clean Pi checkout at ${tag}. It has been left unchanged.`);
		}

		console.log(`pi/ already contains Pi ${tag}.`);
		return;
	}

	// --branch also accepts branch names; verify that the requested tag exists first.
	git(["ls-remote", "--exit-code", "--refs", repository, `refs/tags/${tag}`]);
	execFileSync("git", ["clone", "--depth", "1", "--branch", tag, repository, destination], {
		stdio: "inherit",
	});
	console.log(`Cloned Pi ${tag} into pi/.`);
}

try {
	main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
