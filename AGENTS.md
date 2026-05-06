# Repository Guidelines

Pi-pack is a monorepo for the Pi extensions I develop.

## Project Structure

The project is organized as follows:

```text
pi-pack/                         # You are here!
├── packages/                    # Workspace packages for Pi extensions
│   ├── pi-cut/
│   ├── pi-codexify/
│   ├── pi-handy/
│   └── pi-shared/
├── references/                  # Reference source code and documentation; do not modify
│   └── pi-mono/                 # Pi-mono source code and docs
├── scripts/                     # Development and maintenance scripts
├── eslint.config.js
├── LICENSE
├── package.json
├── README.md
└── tsconfig.json
```

## Testing and Verification

To verify changes, run the following command:

```bash
set -o pipefail; { npm run typecheck && npm run lint && npm run test && npm run format; } 2>&1 | tail -n 50.
```
