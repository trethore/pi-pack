<!-- Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). -->

# Changelog

## [Unreleased]

### Added

- Add `prettyResults` (default `true`) in `pi-tytoo-codemode.jsonc` to display JSON results in a YAML-like format with triple-quoted multiline strings. Trusted project configuration overrides global configuration; model-facing output stays unchanged.
- Add `upstream/CHANGES.md` to track intentional local changes from upstream.

- Regression coverage for sandbox protocol validation, worker lifecycle failures, memory limits, WASI output accounting, prelude diagnostics, image parsing, output limits, and tool-name suggestions.
- Regression coverage for declaration ordering, schema rendering, and tool guideline formatting.
- Regression tests for the sandbox prelude bundle, external worker dependencies, and source map.
- Regression coverage for model image validation, execution tracking, output formatting, renderer limits, search ranking, tool descriptions, and optional usage fields.

### Changed

- Require Pi 1.2.0 and refresh its worker, declaration, and parser regression suites. Record the unsupported standalone portable and deterministic replay suites explicitly.
- Support MCP readiness through `reachesTools`, explicit namespace aliases, schema constraint tags, and self-contained MCP result declarations.
- Show elapsed and total execution time while preserving the header-free code display and local pretty-result rendering.

- Refactor sandbox workers and prelude helpers into named stages, centralize protocol constants, and separate image parsing from output emission.
- Default sandbox memory to 256 MiB and accept only positive integer limits up to 1 GiB. Require compiled WASM modules and reject sparse tool and global definitions.
- Reject duplicate imports during linting.
- Simplify declaration rendering, schema conversion, and source-option parsing while preserving output and validation behavior.
- Clarify the source grammar's permissive fallback and the parser's responsibility for options validation.
- Replace esbuild with Vite 8.3.4 for sandbox builds, preserving existing commands and output paths.
- Refactor discovery, execution, model globals, rendering, tool catalogs, search ranking, and usage aggregation into clearer steps while preserving existing behavior.
- Consolidate object guards, extract image-content validation, and centralize global names, error kinds, and renderer display limits.
- Use the shared `dedent` utility for multiline tool descriptions and declare the `@pi-pack/shared` dependency.

### Fixed

- Poll the shared interrupt flag every 50 promise jobs during initial execution and tool-result delivery, matching Pi 1.2.0 even when short jobs do not trigger the VM's own opcode-based polling.

- Reject misplaced options lines before executing scripts, join large text output in linear time, and ignore Node watch-mode dependency messages on the worker channel.

- Clear pending bridge calls when sending fails, preventing false reports of outstanding work.
- Report worker startup and reply-send failures as sandbox errors instead of leaving execution unsettled.
- Keep console formatting working when error properties or value conversions throw, using a fallback when the value cannot be formatted.
