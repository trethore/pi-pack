# Repository Guidelines

Pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

The project is organized as follows:

```text
pi-pack/                         # You are here!
  packages/                      # Workspace packages for Pi extensions
    pi-cut/
    pi-codexify/
    pi-handy/
    pi-prompt-command/
    pi-tiny-mcp/
    pi-toolbox/
    pi-shared/                   # Shared utilities and types for Pi extensions
  references/                    # Reference source code and documentation; do not modify
    pi-mono/                     # Pi-mono source code and docs
  scripts/                       # Development and maintenance scripts
  eslint.config.js
  LICENSE
  package.json
  README.md
  tsconfig.json
```

Look root and packages `package.json` to discover scripts, paths, and dependencies.

## Development and Code Quality

- Do not use relative imports; instead use absolute ones.
- Do not add comments unless documentation is explicitly requested by the user.

## Testing

Tests should be easy to scan and understand. Follow these guidelines:

- Use clear Arrange / Act / Assert sections for any non-trivial test, while allowing small one-line tests to remain compact.
- Prefer meaningful local variable names that clearly describe the role of each value in the scenario.
- Use `it.each` for repetitive input/output test cases.

## Verification

To verify changes:

```bash
npm run format      # format code
npm run typecheck   # check types
npm run lint        # find linting issues
npm run test        # run tests
```

Or you can run the following command to run all checks and tests at once:

```bash
set -o pipefail; { npm run format && npm run typecheck && npm run lint && npm run test; } 2>&1 | tail -n 50.
```
