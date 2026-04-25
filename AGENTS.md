# Repository Guidelines

Pi-pack is a monorepo for the pi extensions I develop.

## Project Structure

Here is the structure of the project:

```text
pi-pack/                         # You are here!
├── packages/                    # Workspace packages for Pi extensions.
│   └── pi-cut/                  # pi-cut extension package.
│       ├── src/
│       │   ├── config/          # Configuration schema, loading, and path helpers.
│       │   ├── features/        # User-facing behavior, organized by feature area.
│       │   ├── shared/          # Shared helpers used across features.
│       │   └── index.ts         # Thin extension entrypoint.
│       ├── package.json
│       ├── pi-cut.example.jsonc
│       └── README.md            # Package overview and user-facing documentation.
├── references/                  # References for source browsing and docs, not to modify.
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
