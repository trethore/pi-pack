# Local changes from upstream

Intentional local changes to preserve when updating from upstream.

## Runtime and test scope

- Pi compatibility and imported tests target `v1.2.0` (`06a466935536f8c9bcacb2d5efc0fc021be1bdff`).
- Keep the local worker-only sandbox, protocol validation, canonical-name handling, and 256 MiB default / 1 GiB maximum memory limits.
- Do not expose the standalone SDK's inline/remote backends or deterministic `start()` / `deliver()` replay API. `portable.test.ts` and `deterministic.test.ts` are excluded with reasons and upstream hashes in the baseline; the shared sandbox suite runs only against the local worker.
- Record backend adaptations in `upstream/test-adaptations.json` with exact occurrence counts, and whole-suite exclusions in `upstream/exclusions.json`. Changes to expected source text or removed excluded files fail the import rather than silently changing its scope.
- Preserve the Pi 1.2.0 integration changes: `reachesTools`, explicit namespace aliases, schema constraint tags, self-contained MCP result types, misplaced-options validation, linear-time output joining, worker watch-message filtering, promise-job interrupt polling every 50 jobs, and elapsed/total time rendering.

## Render

- Remove the `codemode` header from call rendering so the code starts on the first line in both collapsed and expanded views.
- Format user-facing JSON results as indented objects and lists with triple-quoted multiline strings, without changing model-facing output.

## Configuration

- Add `pi-tytoo-codemode.jsonc` through the shared configuration loader. `prettyResults` defaults to `true`; set it to `false` to keep raw JSON rendering.
- Load configuration on session start. A trusted project file at `.pi/pi-tytoo-codemode.jsonc` takes precedence over the global file in the Pi agent directory.

## Execution

- Set `executionMode: "sequential"` so Pi's scheduler runs codemode invocations one at a time. Independent nested calls can still run in parallel.
- Count displayed top-level return values against the same character and item limits as explicit output, before committing stored-state writes. Normalize serialized returns to their displayed JSON values before accounting and transfer, and count returned strings without JSON quotes or escapes.

## Tool names

- Preserve original names as canonical tool properties and in discovery, `ALL_TOOLS`, and declarations. Quote declaration members and use bracket call syntax when needed.
- Add normalized aliases only when they are unique and do not conflict with canonical names. Reject ambiguous aliases with an error listing canonical calls; never silently route them to the first registered tool.
- Resolve aliases from each execution's fixed tool snapshot. Mid-execution registrations affect only later scripts; original names take precedence regardless of registration order.

## Manual

- Vendor `pi/packages/coding-agent/docs/codemode.md` in `manual/codemode.md` and ship it with the extension. Resolve prompt and model-error references relative to the package instead of Pi's installed docs.
- Point installation guidance to the package README and replace links to upstream settings and model docs with local guidance.
- Keep the manual aligned with local scheduling and rendering, structured and thrown errors, cooperative cancellation, discovery, output truncation, and store-size accounting.

## Model-facing text

- Centralize package-owned prompts, result notices, and recovery guidance in `src/prompts/prompts.yaml`.
- Validate the YAML and generate `src/prompts/generated.ts` for the host and QuickJS sandbox, with no runtime YAML dependency. Regenerate it during sandbox builds and root typechecks.
- Use short, direct English inspired by ASD-STE100. Clarify structured errors, successful store writes, abort signals, image inputs, discovery output, and estimated token counts. Keep renderer-sensitive output markers stable.
- Explain that script failure discards stored-state writes but does not undo completed tool actions. Document tool-specific error fields, missing lookup values, JSON omission of `undefined`, and reuse of declarations already in context.
- Record intentional upstream wording and canonical-name assertion changes in `upstream/prompt-expectations.json`. The importer checks occurrence counts and regenerates the imported tests and provenance hashes.
- Preserve regression snapshots and catalog validation tests when updating from upstream. Edit the YAML source, not the generated module.
