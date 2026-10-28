# Architecture

SyncTune is a local-first music player with synchronized listening rooms.

## Applications

- Desktop: Tauri 2 + React/Vite frontend. Audio playback occurs here.
- Web: React/Vite client for browser access.
- Server: Express + Socket.IO coordination service. Does not distribute audio.

## Shared packages

- contracts: shared types and Zod schemas.
- domain: framework-independent rules.
- sync-engine: future clock sync and drift correction.
- audio-core: playback adapter interface.
- ui: reusable React components.
- config: shared tooling configuration.

## Local-network-only design

The server coordinates room state over LAN. Audio playback occurs on client devices. The server never distributes copyrighted audio.
