# Repository Guidelines

Pi-pack is a monorepo for the pi extensions I develop.

## Project Structure

Here is the structure of the project:

```text
pi-pack/                         # You are here!
├── packages/                    # Workspace packages for Pi extensions.
│   ├── pi-cut/
│   └── pi-codexify/
├── references/                  # References for source browsing and docs, DO NOT modify.
│   └── pi-mono/
├── scripts/                     # Dev and maintenance scripts.
├── eslint.config.js
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## Testing and Verification

To verify changes run `npm run typecheck && npm run lint && npm run format` to run all checks at once.
