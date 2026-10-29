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

Assignments options > Members includes "Hide users with no activity" (off by default).
When enabled, member rows without cards matching the current filters are hidden.
PR-only cards count as activity. The setting is saved per team in browser local storage
and does not change the sprint view.

Hover or focus the Days remaining tag for a current-sprint effort forecast. It splits effort into
three exclusive buckets, so nothing is counted twice: Not started (Blocked + New), In progress
(Active + Review), and Complete (Done). A stacked bar above each column shows the split at a glance:

- Start: the sprint-start snapshot, as committed.
- Now: current effort.
- Projected end: where the current pace lands at sprint end, drawn hatched because it is an estimate.

Every column adds up to 100% of its own total, so percentages are never skewed by scope changes;
a Total effort row shows each column's absolute effort. Scope changes appear separately below the
table as committed at start + added − removed = in sprint now.
Sprint-start membership comes from a WIQL `ASOF` query at the sprint start date, so items that
joined later count as added scope, and removed items stay in the Start column (which is why Start
can total more than Now).
The projection is a linear weekday trend per bucket, shown after at least one working day has
elapsed. It is measured against today's scope (added and removed effort are not trended), so the
projected buckets add up to the same total as Now. Unfinished work cannot fall below zero, Complete
is capped at today's scope, and Not started is capped at the effort still unfinished.
Projected effort is rounded to whole numbers that still add up to the total.
Like the footer chart, this uses current-sprint work items (and removed items) matching
member/text filters, excluding PR-only cards. An item added and then removed mid-sprint is not
counted. Estimate changes can distort the trend. Missing history suppresses the forecast rather
than implying certainty.

### Quality assurance view

The QA activity page surfaces recently created and changed work items for review, with:

- sprint and lookback filters
- state grouping and tag-based grouping
- work-item type filters
- a compact review board for QA triage

States can be shared between Needs follow-up and Newly added. For these shared states, a
recent transition into a QA-ready state takes precedence and routes the item to Needs follow-up.
Otherwise, items created within the lookback window appear in Newly added. Ready for QA and
Recently completed state precedence, and explicit tag-based grouping, are unchanged.

### Backlog view

The Backlog page ranks the selected team's open bugs by development value. It queries only Bugs (no PBIs) under the team's area path, across all sprints, and leaves out bugs in a closed, done, or removed state: those in the Bug type's Completed or Removed state categories, or Closed, Done, Removed, and Completed by name if the type reports none. The header matches Quality Assurance without the quick filter: it has the team selector, **Manage team**, a Backlog settings button (a placeholder dialog for now), and a Refresh button.

The table is read-only (no sorting, filtering, or selection). Its columns are ID, Title (a link that opens the bug in a new tab), Created Date, Assigned To (left blank when the bug is unassigned), State, Iteration Path (the last two segments of the full path), Severity, Impact, Effort, and Value. Impact is the bug's Priority field, a stand-in for how often users encounter the bug. Effort is shown as entered; only the Value calculation raises it to a minimum of 4.

Value is `((SeverityScore * ImpactScore) / AdjustedEffort) * 10`, shown to one decimal place:

| Field value | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| SeverityScore (from Severity) | 10.648 | 4.84 | 2.2 | 1 |
| ImpactScore (from Priority) | 8 | 4 | 2 | 1 |

A missing Severity or Priority counts as 4. AdjustedEffort is the Effort field with a minimum of 4, which also applies when Effort is missing. Bugs are ranked by Value (descending), then SeverityScore (descending), then Created Date (ascending). Ranking uses the exact Value, not the rounded one that is displayed, so two bugs that both show 13.3 can still rank apart by their small difference; SeverityScore and Created Date only break ties between bugs whose exact Values are equal. Results are cached per team until you refresh.

### Tests view

The Tests page charts e2e pass percentages across a configurable lookback window (60 days by default) for each configured Azure DevOps build/YAML pipeline or classic release pipeline. Use Tests settings to set the number of days, enter the organization and project, type to search pipelines and stages, choose a test-publishing stage (or the whole build pipeline), and add it to the chart. The lookback window is saved in browser local storage and applies to all configured pipelines. Build history is filtered by finish time; release history is queried by creation time, then charted by the selected stage's completion time when available. Multiple pipelines appear as separate lines. Each point represents one run, including multiple runs on the same day; the x-axis shows dates and tooltips show exact times and run IDs. Click a point to open its build Tests tab or release summary in a new tab. The y-axis uses a logarithmic scale of failures (with a 1% offset for 100% pass rates), labeled in pass percentages to make differences near 100% easier to see. Each point is passed tests divided by executed test results, excluding `NotExecuted`, `Skipped`, `NotApplicable`, and `NotImpacted`. Tests must be published to Azure DevOps for the chart to find them; stages without executed test results are shown as missing data, not 0% passed. If test results cannot be loaded, the page or settings dialog reminds you to ensure your PAT has Test Management (Read) access. The refresh button reloads the latest results. Tests has no filter, view, or team controls; pipeline selections are saved in browser local storage.

Tests settings uses two tabs: Options contains the lookback window, and Pipelines contains
the configured pipeline list and controls for adding or removing pipelines.
Options also includes an optional pass rate filter (unchecked by default). Enable it and enter
a percentage from 0 to 100 inclusive to hide chart points at or below that pass rate. For
example, 0 excludes 0% results and 20 excludes results at 20% or lower; 100 hides all results.
Decimal thresholds are supported. The setting is saved in browser local storage and applies
to all configured pipelines without refetching results. Disabling it restores the hidden points.
Options also includes "Show at most one result per pipeline per day" (unchecked by default).
Choose Lowest result, Average result, or Highest result. Days use the browser's local timezone,
and the pass rate filter is applied to individual runs before grouping. Average is the arithmetic
mean of run percentages, not weighted by test count. Multi-run averages have no run link;
single-run days and lowest/highest selections retain their original run links. Ties select the
earliest run (then the lowest run ID). Daily options are saved in browser local storage.

Run the Tests data regression tests with `node --experimental-strip-types --test tests/*.test.ts`.

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
  features/standup/        # board, QA, Backlog, Tests, and team-management UI
  adoAuth.ts               # PAT storage and validation
  appSettings.ts           # persisted app settings and team profiles
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
- Test Management (Read)
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

Unreadable saved team profiles or QA options produce a recovery warning. Only readable profiles are loaded; unreadable QA options use defaults (all types and sprints, a 21-day lookback, no hidden-tag filters, and default classification). Back up the affected browser local-storage entry before importing a team backup or saving a replacement configuration. Closing QA Options without changes preserves unreadable data; **Use default QA options** explicitly replaces it with defaults.

## Features and workflows

### Filtering and navigation

- quick text filter across work item IDs, titles, types, sprint labels and full iteration paths, tags, PR IDs, PR titles, and assignee names
- member filter for the current board
- hidden-tag filters persisted per team
- board toggles for work-item types and sprint scope
- keyboard shortcut: Ctrl/Cmd + F focuses the quick filter on Development and Quality Assurance
- navigation between Development, Quality Assurance, Backlog, and Tests pages

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
