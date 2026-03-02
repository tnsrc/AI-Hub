# FCC AI Hub

A unified AI chat desktop application that aggregates multiple AI providers into a single interface. Built with Electron, React, and TypeScript.

## Built-in Providers

| Provider | Shortcut |
|----------|----------|
| MCA | Cmd/Ctrl+1 |
| ChatGPT | Cmd/Ctrl+2 |
| Gemini | Cmd/Ctrl+3 |
| Grok | Cmd/Ctrl+4 |
| Claude | Cmd/Ctrl+5 |

Custom providers can be added via the settings panel.

## Tech Stack

- **Electron 35** (BaseWindow + WebContentsView)
- **React 19** with TypeScript
- **Zustand** for state management
- **Electron Vite** for builds
- **Electron Builder** for packaging
- **CSS Modules** for scoped styling

## Prerequisites

- Node.js 18+
- npm 9+

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

This starts the Electron app in dev mode with hot module reloading for the renderer process.

## Build

Compile the TypeScript and bundle all assets to `out/`:

```bash
npm run build
```

Preview the production build locally:

```bash
npm start
```

## Packaging

### All platforms (from current OS)

```bash
npm run dist
```

### macOS only

```bash
npm run dist:mac
```

Outputs to `dist/`:
- `FCC AI Hub-<version>.dmg` (x64)
- `FCC AI Hub-<version>-arm64.dmg` (Apple Silicon)
- `FCC AI Hub-<version>-mac.zip` (x64)
- `FCC AI Hub-<version>-arm64-mac.zip` (Apple Silicon)

### Windows only

```bash
npm run dist:win
```

Outputs to `dist/`:
- `FCC AI Hub Setup <version>.exe` (NSIS installer)
- `FCC AI Hub <version>.exe` (portable)

> **Note:** Code signing is disabled by default (`identity: null` in `electron-builder.yml`). Configure signing credentials for production distribution.

## Testing

```bash
npm test            # run once
npm run test:watch  # watch mode
```

## Project Structure

```
src/
  main/             # Electron main process
  preload/          # Secure preload bridge (contextBridge API)
  renderer/         # React UI (sidebar, settings, overlays)
  shared/           # Types, constants, built-in provider list
  store/            # Electron Store schema and config
build/              # Icons and macOS entitlements
scripts/            # Build utilities (after-pack, icon generation)
```

## Architecture

Each AI provider runs in an isolated `WebContentsView` with its own storage partition. The shell (sidebar + overlays) renders in a separate `WebContentsView` that communicates with the main process via type-safe IPC channels. Provider views are created lazily on first switch and kept alive for instant re-switching.
