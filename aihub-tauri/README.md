# FCC AI Hub

A native desktop application that provides unified access to multiple AI providers (ChatGPT, Claude, Gemini, etc.) through a single interface. Built with Tauri 2, React 19, and TypeScript.

## Features

- **Multi-provider support** — Access ChatGPT, Claude, Gemini, and other AI providers from one app
- **Session management** — Independent sessions per provider with state persistence
- **System tray** — Minimize to tray, quick provider switching
- **Native menus** — macOS/Windows native menu bar with keyboard shortcuts
- **Provider management** — Add, remove, reorder, and configure providers via settings
- **Lightweight** — ~3 MB installer, minimal resource usage thanks to Tauri's native webview

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Rust](https://rustup.rs/) (stable toolchain)
- Platform-specific dependencies per [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

## Development

```bash
npm install
npm run tauri dev
```

This starts the Vite dev server with hot reload and launches the Tauri window.

## Building

### macOS

```bash
npm run build:mac
```

Produces:
- `src-tauri/target/release/bundle/macos/FCC AI Hub.app` — Application bundle
- `src-tauri/target/release/bundle/dmg/FCC AI Hub_1.0.0_aarch64.dmg` — DMG installer

### Windows

```bash
npm run build:win
```

Produces:
- NSIS installer (`.exe`) — Per-machine installation with Start Menu shortcut
- Portable standalone executable

> **Note:** Windows builds must run on a Windows machine. Cross-compilation from macOS is not supported.

### Debug build

```bash
npm run build:debug
```

Produces an unoptimized build with DevTools enabled for troubleshooting.

## Project Structure

```
aihub-tauri/
├── src/                        # Frontend (React + TypeScript)
│   ├── App.tsx                 # Main app layout
│   ├── tauri-bridge.ts         # Tauri IPC bridge
│   ├── components/
│   │   ├── Sidebar/            # Provider sidebar navigation
│   │   └── Settings/           # Settings panel & add-provider dialog
│   ├── hooks/                  # React hooks
│   ├── shared/                 # Shared types and utilities
│   └── styles/                 # Global styles
├── src-tauri/                  # Backend (Rust)
│   ├── src/
│   │   ├── main.rs             # Entry point
│   │   ├── lib.rs              # App setup and plugin registration
│   │   ├── commands.rs         # Tauri IPC commands
│   │   ├── state.rs            # Application state management
│   │   ├── provider_manager.rs # AI provider configuration
│   │   ├── session_manager.rs  # Per-provider session handling
│   │   ├── menu.rs             # Native menu bar
│   │   └── tray.rs             # System tray
│   ├── icons/                  # App icons (icns, ico, png)
│   └── tauri.conf.json         # Tauri configuration
└── package.json
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [Tauri 2](https://v2.tauri.app/) |
| Frontend | React 19, TypeScript, Vite 7 |
| Backend | Rust (Tauri commands) |
| State | [Zustand](https://github.com/pmndrs/zustand) (frontend), tauri-plugin-store (persistence) |

## IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
