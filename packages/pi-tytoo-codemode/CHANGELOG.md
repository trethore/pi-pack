<!-- Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). -->

# Changelog

## [Unreleased]

### Added

- Regression coverage for sandbox protocol validation, worker lifecycle failures, memory limits, WASI output accounting, prelude diagnostics, image parsing, output limits, and tool-name suggestions.
- Regression coverage for declaration ordering, schema rendering, and tool guideline formatting.
- Regression tests for the sandbox prelude bundle, external worker dependencies, and source map.
- Regression coverage for model image validation, execution tracking, output formatting, renderer limits, search ranking, tool descriptions, and optional usage fields.

### Changed

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

- Clear pending bridge calls when sending fails, preventing false reports of outstanding work.
- Report worker startup and reply-send failures as sandbox errors instead of leaving execution unsettled.
- Keep console formatting working when error properties or value conversions throw, using a fallback when the value cannot be formatted.
