# Repository Guidelines

Pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

The project is organized as follows:

```text
packages/                    # Workspace packages for Pi extensions
  pi-cut/
  pi-codexify/
  pi-script-template/
  pi-handy/
  pi-toolbox/
  pi-toolmask/
  shared/                    # Shared utilities and types for Pi extensions
references/                  # Source code and documentation as references; do not modify
  pi-mono/packages/
    agent/
    ai/
    coding-agent/
    tui/
scripts/                     # Development and maintenance scripts
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
- Prefer meaningful local variable names that clearly describe the role of each value in the scenario.
- Use `it.each` for repetitive input/output test cases.

## Verification

To verify changes:

```bash
npm run --silent format      # format code
npm run --silent typecheck   # check types
npm run --silent lint        # find linting issues
npm run --silent test        # run tests
```
