# Standup App (StrataKit + React + TypeScript + Vite)

A small starter app for daily standup entries, built with StrataKit on top of MUI.

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
