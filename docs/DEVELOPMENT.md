# Development

## Prerequisites

- Node.js 22+
- pnpm
- Rust toolchain for desktop native builds (optional for frontend build)

## Setup

pnpm install

## Run

- Web: pnpm --filter @synctune/web dev
- Server: pnpm --filter @synctune/server dev
- Desktop frontend: pnpm --filter @synctune/desktop dev

## Checks

pnpm lint
pnpm typecheck
pnpm test
pnpm build
