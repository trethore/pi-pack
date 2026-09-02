# Repository Guidelines

Pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

The project is organized as follows:

```text
packages/
  pi-codexify/
  pi-cut/
  pi-handy/
  pi-notify/
  pi-script-template/
  pi-toolbox/
  pi-toolmask/
  shared/                      # Shared utilities and types
references/pi-mono/packages/   # Pi source code and documentation for browsing; do not modify
  agent/
  ai/
  coding-agent/
  tui/
scripts/                       # Development scripts
eslint.config.js
LICENSE
package.json
README.md
tsconfig.json
```

Look at the root and package-level `package.json` files to discover scripts, paths, and dependencies.

## Development and Code Quality

- Do not use relative imports; instead use absolute ones.
- Do not add comments unless its for test sections or when documentation is explicitly requested by the user.

## Testing

Tests should be easy to scan and understand. Follow these guidelines:

- Use clear Arrange / Act / Assert sections.
- Use `it.each` for repetitive input/output test cases.
- Prefer meaningful local variable names that clearly describe the role of each value in the scenario.

## Verification

To verify changes:

```bash
npm run --silent format        # format directly after changes instead of checking first and then fixing formatting issues.
npm run --silent typecheck
npm run --silent lint
npm run --silent test
```
