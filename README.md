# Standup App (StrataKit + React + TypeScript + Vite)

Team standup board for Azure DevOps work tracking.

The app aggregates work items and pull requests into a Kanban-style board grouped by team member and status.

## Stack

- React 19 + TypeScript
- Vite 8
- `@stratakit/mui` and `@stratakit/icons`
- `@mui/material` with Emotion

## What this app does

- Loads work items for the selected team profile and maps them to board statuses.
- Resolves team member assignees and groups rows by person.
- Shows effort badges on cards and sprint-scoped effort totals in column headers.
- Adds PR-only board cards for team PRs that are not linked to visible work items.
- Supports light/dark mode and status-tinted columns.
- Supports tag hiding plus quick in-toolbar filtering.

## Team profile configuration

Team definitions are in [src/teamProfiles.ts](src/teamProfiles.ts).

Each profile includes:

- Azure DevOps org/project
- area path and iteration path
- team name (used for team-related APIs and links)
- repository name (used for PR queries)

The selected team is persisted in local storage and restored at startup.

## Requirements

- Node.js 22+
- npm 10+

## Install

```bash
npm install
```

## Azure DevOps auth

Required PAT scopes:

- Build (Read)
- Code (Read)
- Graph (Read)
- Project and Team (Read)
- Release (Read)
- Work Items (Read)

`Graph (Read)` is required for resolving the team `subjectDescriptor` used by the direct "Manage team" deep link. Without it, the app falls back to the project teams listing page.

How it works:

1. Open the app.
2. If no PAT is configured yet, Settings opens automatically.
3. Paste your Azure DevOps PAT.
4. Optionally turn on **Remember on this machine** to store it in this browser's local storage.

Notes:

- If **Remember on this machine** is off, the PAT is kept only for the current browser session.
- You can update or clear the PAT later from **Settings**.
- Team settings are stored separately in browser local storage, so teammates can use the same hosted app with their own PAT and team configuration.

## Board behavior and filters

- Hidden tags filter:
	- Open from the toolbar using Hidden tags.
	- Hidden tags are persisted in local storage.
- Quick filter:
	- Text filter in the toolbar (left side, next to title).
	- Matches against work item id/title/type, sprint, tags, PR id/title, and team member name.
	- Includes a clear action in the input.
- Team member dropdown filter:
	- Located next to the quick filter.
	- Defaults to All team members.
	- Options only include team members currently represented on the board.
	- Combines with quick filter (AND behavior).
- Keyboard shortcut:
	- Ctrl+F (Cmd+F on macOS) focuses the quick filter input.

## PR card behavior

- Active and completed PRs are queried for the selected repository.
- Draft and abandoned PRs are excluded.
- Completed PRs are included only when created in the current sprint window.
- PRs already linked to visible work items are excluded from PR-only cards.

## Run locally

```bash
npm run dev
```

Then open the URL printed by Vite (typically http://localhost:5173).

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Preview production build

```bash
npm run preview
```

## Loading and UX notes

- Board loading uses a full-height skeleton layout to preserve spatial context.
- Header and body share a single scroll container to keep columns aligned.
- Board cells support collapsed and expanded card groups for dense columns.

## StrataKit setup notes

- App root is wrapped with `Root` from `@stratakit/mui` in `src/main.tsx`.
- StrataKit type augmentation is enabled in `tsconfig.app.json` via `@stratakit/mui/types.d.ts`.
- Vite is configured to not inline SVGs so StrataKit icons are emitted as files.
- Icons are imported from package exports (example: `@stratakit/icons/add.svg`).

## Agent skill

This repository includes a local project skill at `.github/skills/stratakit-usage/SKILL.md` to guide UI work toward StrataKit conventions.
