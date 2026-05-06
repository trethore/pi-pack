# Repository Guidelines

Pi-pack is a monorepo for the pi extensions I develop.

## Project Structure

Here is the structure of the project:

```text
pi-pack/                         # You are here!
├── packages/                    # Workspace packages for Pi extensions.
│   ├── pi-cut/
│   ├── pi-codexify/
│   └── pi-handy/
├── references/                  # References for source browsing and docs, DO NOT modify.
│   └── pi-mono/                 # Pi-mono source code and docs.
├── scripts/                     # Dev and maintenance scripts.
├── eslint.config.js
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## Testing and Verification

To verify changes run `set -o pipefail; { npm run typecheck && npm run lint && npm run test && npm run format; } 2>&1 | tail -n 50` to run all checks at once.
