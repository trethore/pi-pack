# Repository Guidelines

Pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

Here is an overview of the project:

```text
packages/
scripts/
  import-pi.sh  # Use this script to download the upstream Pi source into `pi/`.
pi/             # Generated directory containing Pi's source code for browsing.
.gitattributes
.gitignore
AGENTS.md
LICENSE
README.md
```

## Commits & Pull Requests

- Follow the Conventional Commits specification for commit messages.
- Pull request summaries should include the related issue(s), a brief description of the changes, and how the changes were tested.