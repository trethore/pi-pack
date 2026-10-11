<!-- Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/). -->

# Changelog

## [Unreleased]

### Added

- Regression coverage for declaration ordering, schema rendering, and tool guideline formatting.
- Regression tests for the sandbox prelude bundle, external worker dependencies, and source map.
- Regression coverage for model image validation, execution tracking, output formatting, renderer limits, search ranking, tool descriptions, and optional usage fields.

### Changed

- Simplify declaration rendering, schema conversion, and source-option parsing while preserving output and validation behavior.
- Clarify the source grammar's permissive fallback and the parser's responsibility for options validation.
- Replace esbuild with Vite 8.3.4 for sandbox builds, preserving existing commands and output paths.
- Refactor discovery, execution, model globals, rendering, tool catalogs, search ranking, and usage aggregation into clearer steps while preserving existing behavior.
- Consolidate object guards, extract image-content validation, and centralize global names, error kinds, and renderer display limits.
- Use the shared `dedent` utility for multiline tool descriptions and declare the `@pi-pack/shared` dependency.
