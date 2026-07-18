# Minecraft Web Clone

A browser-based, Minecraft-inspired voxel game built with modern web technologies. It runs entirely in the browser and includes a main game client, a voxel engine, and an inventory UI module.

> **Genesis note:** This project was fully implemented by **Kimi K3**. Final polishing, packaging, CI/CD, and publishing were completed by **Kimi K2.7 Coding**.

---

## Overview

This repository contains three independent but related Vite + React modules:

- **`app/`** — The main game client. It provides the title screen, world selection/creation, options menus, the in-game page, and all HUD overlays such as the hotbar, pause menu, inventory, chat, and debug screen.
- **`wt-engine/`** — The voxel engine. It handles chunk storage, block definitions, mesh generation, physics, raycasting, world generation, sky rendering, and first-person input.
- **`wt-inventory/`** — A standalone inventory UI module containing the hotbar, inventory grid, item icons, and status bars.

The project uses a **hash router** so it can be deployed to any static host without server-side routing configuration.

---

## Features

- First-person voxel world exploration with pointer-lock mouse look
- Block breaking and placing
- Procedural world generation
- Day/night sky rendering and basic atmosphere
- Inventory, hotbar, and item icons
- Options screens for video, sound, controls, and mouse settings
- Key-bindings and mouse-sensitivity support
- Static-site friendly deployment via GitHub Pages

---

## Tech Stack

- **Runtime:** Node.js 22+
- **Build tool:** Vite 7
- **Framework:** React 19
- **Language:** TypeScript 5.9
- **Styling:** Tailwind CSS 3.4 + shadcn/ui
- **3D rendering:** Three.js
- **State management:** Zustand
- **Routing:** react-router (HashRouter)
- **Formatting:** Prettier

---

## Project Structure

```text
.
├── app/              # Main game client
│   ├── src/
│   │   ├── components/   # UI components and screens
│   │   ├── game/         # Game logic, engine bridge, sound
│   │   ├── pages/        # Route-level pages
│   │   ├── stores/       # Zustand stores
│   │   └── ui/hud/       # In-game HUD overlays
│   └── package.json
├── wt-engine/        # Voxel engine prototype/demo
│   ├── src/
│   │   ├── game/engine/  # Core engine: chunks, meshing, physics, etc.
│   │   └── ui/hud/       # Engine demo HUD
│   └── package.json
├── wt-inventory/     # Inventory UI module
│   ├── src/
│   │   ├── components/inventory/
│   │   └── components/ui/
│   └── package.json
├── .github/workflows/pages.yml  # GitHub Pages CI/CD
├── .prettierrc       # Shared Prettier config
└── package.json      # Root tooling (Prettier scripts)
```

---

## Getting Started

### Prerequisites

- Node.js **22+**
- npm **10+**

### Clone the repository

```bash
git clone https://github.com/your-username/your-repo-name.git
cd your-repo-name
```

### Run the main client

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:3000/` in your browser.

### Run all three modules at once

Because each module defaults to port `3000`, run the others on different ports:

```bash
# Terminal 1: main client
cd app && npm run dev

# Terminal 2: engine demo
cd wt-engine && npm run dev -- --port 3001

# Terminal 3: inventory demo
cd wt-inventory && npm run dev -- --port 3002
```

### Code formatting

From the repository root:

```bash
# Check formatting
npm install
npm run format:check

# Fix formatting
npm run format
```

---

## Available Scripts

### Root

| Script                 | Description                                |
| ---------------------- | ------------------------------------------ |
| `npm run format`       | Format the entire repository with Prettier |
| `npm run format:check` | Check formatting without writing files     |

### Each sub-project (`app/`, `wt-engine/`, `wt-inventory/`)

| Script            | Description                          |
| ----------------- | ------------------------------------ |
| `npm run dev`     | Start the Vite development server    |
| `npm run build`   | Type-check and build for production  |
| `npm run lint`    | Run ESLint                           |
| `npm run preview` | Preview the production build locally |

---

## Build & Deployment

This project is configured to deploy the main client (`app/`) to **GitHub Pages** automatically via GitHub Actions.

### Steps

1. Push the repository to GitHub.
2. Go to **Settings → Pages → Build and deployment**.
3. Select **GitHub Actions** as the source.
4. On every push to `main`, the workflow will:
   - Check code formatting
   - Install dependencies and build `app/`
   - Deploy `app/dist` to GitHub Pages

The published URL will be:

```text
https://your-username.github.io/your-repo-name/
```

Pull requests will run the formatting check and build, but will not deploy.

---

## Recent Fixes & Notes

- **Mouse look X-axis inversion** was fixed in the input system (`app/src/game/engine/input.ts` and `wt-engine/src/game/engine/input.ts`).
- A dead package mirror (`npm.mirrors.msh.team`) in the lock files was replaced with `registry.npmjs.org` so `npm install` works reliably.
- The repository uses Prettier for consistent formatting across all modules.
- ESLint currently reports some pre-existing warnings/errors in auto-generated shadcn/ui components. These do not block the production build.

---

## License

This project is licensed under the [MIT License](./LICENSE).
