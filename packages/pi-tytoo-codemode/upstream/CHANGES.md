# Local changes from upstream

Intentional local changes to preserve when updating from upstream.

## Render

- Remove the `codemode` header from call rendering so the code starts on the first line in both collapsed and expanded views.
- Format user-facing JSON results as indented objects and lists with triple-quoted multiline strings, without changing model-facing output.

## Configuration

- Add `pi-tytoo-codemode.jsonc` through the shared configuration loader. `prettyResults` defaults to `true`; set it to `false` to keep raw JSON rendering.
- Load configuration on session start. A trusted project file at `.pi/pi-tytoo-codemode.jsonc` takes precedence over the global file in the Pi agent directory.

## Model-facing text

- Centralize package-owned prompts, result notices, and recovery guidance in `src/prompts/prompts.yaml`, preserving the existing wording and output.
- Validate the YAML and generate `src/prompts/generated.ts` for the host and QuickJS sandbox, with no runtime YAML dependency. Regenerate it during sandbox builds and root typechecks.
- Preserve regression snapshots and catalog validation tests when updating from upstream. Edit the YAML source, not the generated module.
