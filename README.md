# Standup

Standup is a client-side Azure DevOps dashboard for team standup and quality-assurance tracking. It helps a team review current sprint work, monitor work-item flow, spot recently changed items, and surface pull requests that are not already attached to visible work items.

The app is a browser-based React + TypeScript single-page app. It does not have a backend service; it calls the Azure DevOps REST API directly from the browser using a personal access token (PAT).

## What the app does

### Team assignments view

The default view is a standup-style Kanban board that:

- loads team members and sprint work items from Azure DevOps
- groups work items by assignee and status
- shows sprint context and delivery progress in a compact board layout
- applies quick text filters, member filters, hidden-tag rules, and type filters
- highlights recent changes or project-specific work-item activity
- adds PR-only cards for pull requests in the selected repository that are not already linked to visible work items

### Quality assurance view

The QA activity page surfaces recently created and changed work items for review, with:

- sprint and lookback filters
- state grouping and tag-based grouping
- work-item type filters
- a compact review board for QA triage

### Team configuration

Each team profile includes the Azure DevOps organization, project, area path, iteration path, team name, and repository. Teams can be managed in the UI and exported/imported as JSON for sharing between teammates.

## Tech stack

- React 19
- TypeScript
- Vite 8
- Material UI + Emotion
- StrataKit UI components and icons

## Repository structure

```text
src/
  App.tsx                  # top-level app shell and persistence
  ado/                     # Azure DevOps API helpers and query logic
  features/standup/        # board, QA, and team-management UI
  adoAuth.ts               # PAT storage and validation
  teamConfig.ts            # per-team profile config
  teamDataTransfer.ts      # team export/import helpers
public/                   # static assets
index.html                # app entry document
vite.config.ts            # Vite configuration
```

## Requirements

- Node.js 22+
- npm 10+
- An Azure DevOps account and PAT with read access to work items, pull requests, project/team metadata, and related APIs

## Azure DevOps PAT requirements

The app validates a PAT before loading data. Required scopes include:

- Build (Read)
- Code (Read)
- Graph (Read)
- Project and Team (Read)
- Release (Read)
- Work Items (Read)

The Graph read scope is needed for resolving a team `subjectDescriptor` when building the direct "Manage team" deep link. If it is not available, the app falls back to the project team listing page.

## Getting started

### 1) Install dependencies

```bash
npm install
```

### 2) Start the app in development mode

```bash
npm run dev
```

Then open the local Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

### 3) Configure the PAT and team

On first launch:

1. open the app
2. provide your Azure DevOps PAT in the settings dialog
3. choose whether to remember it on this machine or keep it only for the current browser session
4. select or configure a team profile from Settings > Teams

PAT and team settings are kept in the browser local storage/session storage, so the app is intentionally a single-user browser client rather than a multi-user service.

## Team configuration

Team definitions are stored per profile and include:

- org name
- project name
- display name
- area path
- iteration path
- team name
- repository name

The selected team is persisted automatically and restored when the app loads.

### Importing and exporting team data

From Settings > Teams, you can:

- export the selected team's configuration and saved page options as a JSON file
- import a JSON export from another teammate or environment

The import path validates the payload before applying it, so malformed data is rejected rather than silently corrupting local settings.

## Features and workflows

### Filtering and navigation

- quick text filter across work item IDs, titles, types, sprint labels, tags, PR IDs, PR titles, and assignee names
- member filter for the current board
- hidden-tag filters persisted per team
- board toggles for work-item types and sprint scope
- keyboard shortcut: Ctrl/Cmd + F focuses the quick filter input
- tabbed navigation between Team Assignments and Quality Assurance views

### Pull request behavior

- queries active and completed PRs from the selected repository
- excludes drafts and abandoned PRs
- only includes completed PRs created within the current sprint window
- suppresses PR-only cards when the PR is already linked to a visible work item

### UX details

- board loading uses a skeleton layout to keep the page stable while data loads
- the board header and content share one scroll container for alignment
- dense columns can collapse and expand groups for easier sprint review
- light/dark visual mode is supported

## Development commands

```bash
npm run dev      # start Vite dev server
npm run build    # compile TS and create a production build
npm run lint     # run project linting
npm run preview  # preview the production Vite build locally
```

## Notes for contributors

- The app is intentionally frontend-only and reads Azure DevOps data directly in the browser.
- Team preferences are stored in `localStorage` and are keyed by team ID, so multiple team profiles can co-exist without overwriting each other's saved filters or options.
- The StrataKit app root is wrapped in `src/main.tsx`, and the repository includes a local skill under `.github/skills/stratakit-usage/SKILL.md` for UI work that should follow StrataKit conventions.

## Security and privacy considerations

- The PAT is stored in browser storage only, not on a server.
- A session-only PAT is possible for temporary usage without persisting credentials to disk.
- This app is best suited for internal or trusted environments where browser-side Azure DevOps access is acceptable.
