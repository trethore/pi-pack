# Repository Guidelines

Pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

Here is an overview of the project:

```text
packages/
scripts/
  check-duplicates.mjs
  import-pi.sh          # Use this script to download the upstream Pi source into `pi/`.
pi/                     # Generated directory containing Pi's source code for browsing.
test/
.gitattributes
.gitignore
.jscpd.json
.prettierignore
.prettierrc.json
AGENTS.md
flake.lock
flake.nix
knip.json
LICENSE
package-lock.json
package.json
README.md
tsconfig.json
vitest.config.ts
```

## Commits & Pull Requests

- Follow the Conventional Commits specification for commit messages.
- Pull request summaries should include the related issue(s), a brief description of the changes, and how the changes were tested.
