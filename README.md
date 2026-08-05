# Standup App (StrataKit + React + TypeScript + Vite)

A small starter app for team standup entries, built with StrataKit on top of MUI.

## Stack

- React 19 + TypeScript
- Vite 8
- `@stratakit/mui` and `@stratakit/icons`
- `@mui/material` with Emotion

## Requirements

- Node.js 22+
- npm 10+

## Install

```bash
npm install
```

## Local Azure DevOps auth (.env.local)

1. Copy `.env.example` to `.env.local`.
2. Fill your own values in `.env.local`:
	- `AZDO_PAT`: your personal access token.
	- `AZDO_API_VERSION` (optional): defaults to `7.1`.
3. Restart `npm run dev` after any `.env.local` change.

Required PAT scopes:

- Build (Read)
- Code (Read)
- Graph (Read)
- Project and Team (Read)
- Release (Read)
- Work Items (Read)

`Graph (Read)` is required for resolving the team `subjectDescriptor` used by the direct "Manage team" deep link. Without it, the app falls back to the project teams listing page.

Example:

```dotenv
AZDO_PAT=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZDO_API_VERSION=7.1
```

Notes:

- `.env.local` is ignored by git.
- `.env.example` is committed as a template for teammates.
- App startup validates required env vars and fails fast if any are missing.

## Run locally

```bash
npm run dev
```

Then open the URL printed by Vite (typically http://localhost:5173).

## Build

```bash
npm run build
```

## Preview production build

```bash
npm run preview
```

## StrataKit setup notes

- App root is wrapped with `Root` from `@stratakit/mui` in `src/main.tsx`.
- StrataKit type augmentation is enabled in `tsconfig.app.json` via `@stratakit/mui/types.d.ts`.
- Vite is configured to not inline SVGs so StrataKit icons are emitted as files.
- Icons are imported from package exports (example: `@stratakit/icons/add.svg`).

## Agent skill

This repository includes a local project skill at `.github/skills/stratakit-usage/SKILL.md` to guide UI work toward StrataKit conventions.
