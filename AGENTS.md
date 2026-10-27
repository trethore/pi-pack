# pi-pack

pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

Here is an overview of the project:

```
packages/
scripts/
test/
.gitattributes
.gitignore
.prettierignore
.prettierrc.json
AGENTS.md
LICENSE
oxlint.config.ts
package.json
README.md
tsconfig.json
vitest.config.ts
```

## Development

- Tests must be easy to scan and understand with clear `Arrange / Act / Assert` sections.
- To browse the Pi source code, use the gitignored `pi/` directory. If it doesn't exist, run `npm run clone:pi -- <tag>`
  to clone the Pi repository at a specific tag, for example `npm run clone:pi -- v1.4.0`.

## Commits & Pull Requests

- Follow the Conventional Commits specification for commit messages.
- Pull request summaries should include the related issue(s), a brief description of the changes, and how the changes
  were tested.
