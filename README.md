# ADO Team Explorer

ADO Team Explorer is a client-side Azure DevOps dashboard for team standup and quality-assurance tracking. It helps a team review current sprint work, monitor work-item flow, spot recently changed items, and surface pull requests that are not already attached to visible work items.

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

Development board cards show only what the card's row, column, and the current sprint do not already
say. Each card has a leading edge in its column's color, the work item type, ID, effort, and a
two-line title. States of three or more words use the first three words' initials in badges and
"Moved to" tags (for example, ICR and AFT); tooltips and hover details keep the full names.
The state appears only when it differs from the column's usual state, and the sprint
only when it is not the current sprint. Each linked PR gets one compact row. The Sprint view and the
QA board use the same cards, adding an owner avatar and a caption suited to each board.
Work item type icons use StrataKit's theme-aware neutral icon color in regular cards, compact cards,
and hover details.
Hover hints throughout the app use StrataKit tooltips rather than native browser titles. Compact
cards show their full hover preview instead of opening competing tooltips on individual indicators.

Each card also names its next step and, when it is someone other than the row's developer, who it
is waiting on. For a PR, the step is the first of: fix failing checks, rework after a rejection,
respond to review feedback, checks unavailable, waiting on pending checks (the pipeline), more
approvals needed (two are required, from reviewers), and Ready to complete. A blocked card gives the
reason from its blocked tag or state. A Review card now assigned to someone other than the row's
developer says In testing or Handed off and shows who has it.

Each open PR also shows a three-segment progress strip: checks (red when failing, striped amber while
pending, green when passing), review (filling green toward the two required approvals, or red when
rejected and amber when waiting on the author), and ready to complete (outlined in green once the
PR can complete). The repository name appears only when a work item's PRs span more than one
repository.

A recently changed card has a dot in its corner and a badge saying what changed and when, such as
"Moved to Review · 3h" or "PR 912 approved · just now". Blocked, Active, and Review cards show up to
four aging dots, one for each quarter of the Freshness tab's Stale threshold that has passed without
a tracked change, turning amber at three and red at four. New and Done cards have no aging dots, and
only stale Done cards fade.

Development options > Members includes "Hide users with no activity" (off by default).
When enabled, member rows without cards matching the current filters are hidden.
PR-only cards count as activity. The setting is saved per team in browser local storage
and does not change the sprint view.

Below it, "Also hide users with only stale, done work" (also off by default) is a stricter version
of the same option. It additionally hides rows where every card is in the Done column and stale.
A card is stale once it has gone without a tracked change for at least the Stale threshold on the
Freshness tab (7 days by default). The option is always shown, but it can be
changed only while "Hide users with no activity" is on; a saved choice is kept, but has no effect,
while that option is off. A card whose freshness is still loading is not treated as stale, so its
row stays visible. Column counts and effort totals still include the hidden rows' cards, and if
every row ends up hidden the board says so. The setting is saved per team in browser local storage
and does not change the sprint view.

The board leaves its columns untinted so the cards' colored edges carry status. Active and Review,
where in-flight work lives, get the widest columns and Done the narrowest. Blocked is tinted red
only while it holds cards; when it is empty it shrinks to a narrow "Blocked · none" rail. New and
Done cards are always compact, and each cell shows up to five compact or three full cards before
"Show more".

A Needs attention bar above the board counts the visible cards that match each signal: Blocked,
Failing checks (an open PR's required check is failing), Needs approval (an open PR has fewer than
two approvals and is not waiting on its author), Idle 3+ days (Blocked, Active, or Review cards
unchanged for three days or more), With QA (a Review card now assigned to someone other than the
row's developer), Ready to complete, and Recently changed. Select one to highlight its cards in
place: the rest dim (hover or focus brings one back), matching cards move to the top of their cell
and are never hidden behind "Show more", and column headers show matches out of the total. Select
it again or choose Clear to return to the full board. The selection is not saved.

Each member's lane head sums up the lane: a load bar of their cards by column, how many cards are
open (not Done) with their total effort across all sprints, and up to two attention flags, most
urgent first (blocked, failing checks, idle 3+ days, needs approval, with QA, ready to complete).
The summary stays in view while you scroll through a tall lane. Use the chevron beside a name to
collapse the lane to one line, where each column shows a pip per card, the card count, and an icon
per attention signal present; select the chevron or any of the lane's cells to expand it again.
The Team member header shows how many people have lanes, and collapses or expands every lane at
once. Collapsed lanes are not saved.

Start standup in the toolbar walks the team one person at a time. The speaker's lane is outlined,
expanded with every card shown, and scrolled into view; every other lane collapses to one line. A
Standup bar above the board shows a turn timer (amber after two minutes), the speaker with their
place in line, and the speaking order as avatars, checked once someone has had their turn; select
an avatar to jump to that person. Next (Ctrl+Down) moves on and becomes Finish for the last person,
Previous (Ctrl+Up) goes back, and End stops at any point. Order is Alphabetical or Most attention
first, which ranks people by their cards' signals (blocked counts most, then failing checks, idle
3+ days, needs approval, and with QA or ready to complete; recently changed doesn't count).
Changing the order starts again from the top. Only team members take a turn, not the Unassigned or
Assignee unavailable lanes. The order is fixed when standup starts: people who appear on the board
later join the end of the line, and people who drop off are skipped. Starting clears the member
filter and switches to the Developers view; the member filter stays locked while standup runs, and
switching to the sprint view or changing team ends it.

Development options > Members includes "Include QA testers in standup" (off by default). When it is
on, standup continues after the developers' turns with a "Name · QA" lane for each QA tester (the
same testers as the QA page), holding the QA page's items assigned to them. These lanes appear only
during standup, load QA data only while the option is on, and don't count toward the Needs
attention bar. The setting is saved per team and included in team exports.

Development opens on the Developers board, and Quality Assurance on Testers. Turn on Settings > Display
> "Remember last view" to reopen each page on the view you used last instead, such as Sprint or Flow.
The setting and each page's last view are saved in this browser, not in team exports.

The toolbar's View toggle switches between the Developers board and the Sprint view. The Sprint view is
the same board with one lane per sprint instead of per person: the current sprint first and open,
other sprints collapsed beneath it (with their dates), and items without a sprint last. It uses the
same cards, density, lane heads, and Needs attention bar, leaves out pull requests that have no work
item, and ignores the Members options. Each card shows its owner (the developer whose lane it sits
in on the Developers board) as an avatar, and a caption telling its journey this sprint: "Done Nov 2",
"Back from Review · 2d", "Added today", "Into Active today", "Active at start", or "4d in Active"
(amber from five days, except in New). Longer waits read in weeks, months, or years, such as
"3w in Active" or "1y in New", and the same units apply to the flow lines' "oldest" and to pull
request and change ages; hover over or focus a caption for the exact date and number of days. A thin
trail along the card's bottom edge shows the columns it has passed through, each segment sized by the
working days spent there. Hover over or focus a
card to see a dashed ghost where it started the sprint (or was added), or, if it is back there, the
farthest column it reached. The Needs attention bar adds Moved back (a card moved to an earlier
column during the sprint, such as Review to Active), and With QA compares a Review card's assignee
with its owner. Once the sprint's scope history loads, the current sprint splits into commitment
lanes and the corner label reads "Scope". **Committed at start** holds the cards planned when the
sprint began, with a note for any that rolled over from the previous sprint. **Added during sprint**
holds the cards added later, with a "Scope +13%" note comparing their effort with what was planned,
and those cards are flagged Added mid-sprint in the Needs attention bar. **Removed from sprint** is
collapsed by default. It shows the cards taken out of the sprint as dashed outlines with
struck-through effort, in the column they left from, along with where they went ("Moved to
Sprint 43 · Nov 1") and notes summing up those destinations. Removed cards never count toward the
attention bar or column totals. Each Sprint view column header also gets a flow line. It shows a
sparkline of the column's effort on each working day so far, leaving room for the days still to
come. Beside it is the change since the sprint started: Done going up is green, Blocked going up is
red, and Blocked going down is green. Active and Review also show how long their longest-staying card
has been there ("oldest 9d", amber from five days). Hover over or focus the line for details.

In the Sprint view, a replay strip under the ribbon shows the sprint's effort by column on each
working day so far, with the days still to come hatched. **Replay sprint** takes the place of Start
standup in the toolbar and plays the sprint from its first day to today, one day a second. Use
Play/Pause, Previous day and Next day, or drag the slider to pick a day; "Day 3 of 10" beside it
names the day shown. On a past day, cards move (animated, unless the system asks for reduced motion)
to the column they were in at the end of that day, and a banner notes which day is shown, with
**Back to today**. Only the current sprint's cards with history that day are shown: cards added later
leave the board, and cards removed later return to Committed at start. The Needs attention bar,
recent-change highlights, and live card details (pull requests, next steps, tags, state, and sprint)
are hidden, effort stays at its current value, and the column flow lines stop at the day shown.
Switching views or teams, or starting standup, returns to today.

Beside Refresh,
"Synced 5m ago" says when the board's data last loaded from Azure DevOps (hover for the time). It
reads "Syncing…" while data loads, when the Refresh icon also turns into a spinner. Returning to a
team that was already loaded keeps that team's earlier time until you refresh. On every page,
**Manage team** is the last entry in the Team menu and opens the team's Azure DevOps settings in a
new tab.

Development options > Display includes "Compact cards" (off by default). It makes Blocked, Active,
and Review cards compact too. Each compact card shows its
title on one line and a single status line: the state when the column does not imply it, each PR's
progress, the next step and who it is waiting on, what recently changed, and aging dots and the
sprint on the right. Hover over or focus a card to see the full card along with its state, sprint,
owner, last change, and each PR's title, repository, and checks. The setting is saved per team in
browser local storage, is included in team exports, and applies to the Developers board, the Sprint
view, and the QA board, where Recently completed cards are always compact.

A sprint ribbon above the board, in both views, keeps sprint context on one line: the current
sprint's name and dates (hover for the full iteration path), working-day progress ("Day 5 of 10",
with days left counting today), current-sprint effort in points with a stacked bar by status, the
forecast tag, a small effort flow chart (expand it for the detailed chart and data table), and the
next sprint. The chart shades the sprint's remaining days and marks today with a dashed line. Lower-priority parts drop out as the window narrows. Each column header shows its card
count and its current-sprint effort in points.

The forecast tag shows the share of today's scope projected to be Done at sprint end: "On track"
at 90% or more, "At risk" below 70%, and just the percentage in between. Hover or focus it for a
current-sprint effort forecast. It splits effort into
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
Like the ribbon's effort flow chart, this uses current-sprint work items (and removed items) matching
member/text filters, excluding PR-only cards. An item added and then removed mid-sprint is not
counted. Estimate changes can distort the trend. Missing history suppresses the forecast rather
than implying certainty.

### Quality assurance view

The QA activity page surfaces recently created and changed work items for the QA side of standup,
using the Development board's cards, lane heads, and Needs attention bar, with:

- sprint and lookback filters
- state grouping and tag-based grouping
- work-item type filters
- Testers and Flow views of the same QA columns

Five columns follow work through QA: **Newly added** (recently filed New or Proposed items),
**Coming up** (current-sprint In Code Review items from the Development board), **Ready for QA**
(Available or Ready for Testing), **Back in development** (returned to Committed, Active, In
Progress, or Failed Testing after Ready for QA), and **Recently completed** (Done, Closed, or
Completed after Ready for QA). Items whose history could not load go to History unavailable. Ready
for QA gets the widest column and Recently completed the narrowest. Empty columns shrink to a narrow
rail that runs the board's full height; select a rail to expand it. Coming up can always be
collapsed. Column and lane toggles are not saved.

Each card shows the person its column follows: who filed it, its owner (Coming up), its tester, who
sent it back, or who verified it. A caption says where it stands: "Filed 3d ago", "2d in AFT",
"Failed testing · 1d" or "Sent back · 1d", "Verified Nov 2", or "Likely today" for a Coming up card
whose PR has two approvals and passing required checks. Cards without a sprint say so.

A ribbon above the board shows the current sprint and its working-day progress, a QA flow bar
splitting the board's items by column, the lookback window, and the next sprint. The Needs attention
bar counts the cards matching each QA signal: Failed testing, Bounced 2+ times (sent back from QA at
least twice), Needs a tester (Ready for QA or Coming up without a tester), Waiting 3+ days (in Ready
for QA), Untriaged 3+ days (New with no sprint), Arrived late (reached QA with three or fewer
working days left in its sprint), and Recently changed. Select one to highlight its cards: the rest
dim, and column headers count the matches.

**Testers**, the default view, gives each QA tester a lane, sorted by name, with the Developers
board's lane heads: a load bar, "N open · M done", and flags for failed, bounced, waiting, late, and
untriaged cards. Coming up and Ready for QA cards sit in their tester's lane, or in **Needs a
tester**. Other columns follow the person on the card, so work filed, sent back, or verified by
someone who isn't a tester goes to **Everyone else**, which starts collapsed behind the testers'
lanes. Each of those two lanes appears only when it has cards. Testers are the members chosen on the
QA options Testers tab. When none are chosen, they are inferred from recent QA history: people who
pick up testing work, or verify or send back other people's handoffs, more often than they hand work
to QA. An info button beside the Testers heading notes inferred testers and opens that tab, and if no
testers are found the view says so and offers Choose testers. **Flow** shows the columns without
lanes and splits Ready for QA into Needs a tester and Testing. While QA data loads, the skeleton
mirrors the current view.

**Start QA standup** sits where Start standup does on the Development page and works the same way:
it switches to the Testers view, opens only the speaker's lane, and has the same Standup bar,
shortcuts, and order options. Only testers take a turn, not Needs a tester or Everyone else. Most
attention first ranks testers by their cards' QA signals, with failed testing weighing most and
recent changes not at all. Switching to Flow or changing team ends it.

States can be shared between Back in development and Newly added. For these shared states, a
recent transition into a QA-ready state takes precedence and routes the item to Back in development.
Otherwise, items created within the lookback window appear in Newly added. Ready for QA and
Recently completed state precedence, and explicit tag-based grouping, are unchanged.

### Backlog view

The Backlog page ranks the selected team's open bugs by development value. It queries only Bugs (no PBIs) under the team's area path, across all sprints, and leaves out bugs in a closed, done, or removed state: those in the Bug type's Completed or Removed state categories, or Closed, Done, Removed, and Completed by name if the type reports none. The header is similar to Quality Assurance's: it has a quick filter, the team selector (its menu ends with **Manage team**), a Backlog options button (a placeholder dialog for now), and a Refresh button.

The table has no sorting, column filtering, or selection, and rows highlight when hovered. Its columns are ID, Title (a link that opens the bug in a new tab, followed by the bug's tags as outlined badges in alphabetical order), Created Date, Assigned To (left blank when the bug is unassigned), State, Iteration Path (the last two segments of the full path), Severity, Impact, Effort, and Value. Impact is the bug's Priority field, a stand-in for how often users encounter the bug. Effort is shown as entered; only the Value calculation raises it to a minimum of 4.

The quick filter keeps the bugs whose visible text contains what you type, checking each column as the table displays it: the ID, Title, each of the bug's tags, Created Date, Assigned To, State, Iteration Path, Severity, Impact, Effort, and the rounded Value. Because it matches what is shown, it does not search the Iteration Path segments that are cut from the display, the unrounded Value, or the dashes that stand in for missing values. Matching ignores case and surrounding spaces. The remaining bugs keep their ranked order, and a message appears when none match. The filter text is kept when you refresh, switch teams, or visit another page, but not across a browser reload. / or Ctrl/Cmd + F focuses it.

Value is `((SeverityScore * ImpactScore) / AdjustedEffort) * 10`, shown to one decimal place:

| Field value | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| SeverityScore (from Severity) | 10.648 | 4.84 | 2.2 | 1 |
| ImpactScore (from Priority) | 8 | 4 | 2 | 1 |

A missing Severity or Priority counts as 4. AdjustedEffort is the Effort field with a minimum of 4, which also applies when Effort is missing. Bugs are ranked by Value (descending), then SeverityScore (descending), then Created Date (ascending). Ranking uses the exact Value, not the rounded one that is displayed, so two bugs that both show 13.3 can still rank apart by their small difference; SeverityScore and Created Date only break ties between bugs whose exact Values are equal. Results are cached per team until you refresh.

### Tests view

The Tests page charts e2e pass percentages across a configurable lookback window (60 days by default) for each configured Azure DevOps build/YAML pipeline or classic release pipeline. Use Test options to set the number of days, enter the organization and project, type to search pipelines and stages, choose a test-publishing stage (or the whole build pipeline), and add it to the chart. The lookback window is saved in browser local storage and applies to all configured pipelines. Build history is filtered by finish time; release history is queried by creation time, then charted by the selected stage's completion time when available. Multiple pipelines appear as separate lines. Each point represents one run, including multiple runs on the same day; the x-axis shows dates and tooltips show exact times and run IDs. Click a point to open its build Tests tab or release summary in a new tab. The y-axis uses a logarithmic scale of failures (with a 1% offset for 100% pass rates), labeled in pass percentages to make differences near 100% easier to see. Each point is passed tests divided by executed test results, excluding `NotExecuted`, `Skipped`, `NotApplicable`, and `NotImpacted`. Tests must be published to Azure DevOps for the chart to find them; stages without executed test results are shown as missing data, not 0% passed. If test results cannot be loaded, the page or options dialog reminds you to ensure your PAT has Test Management (Read) access. The refresh button reloads the latest results. Tests has no filter, view, or team controls; pipeline selections are saved in browser local storage.

Test options uses two tabs: Options contains the lookback window, and Pipelines contains
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

- quick text filter across work item IDs, titles, types, sprint labels and full iteration paths, tags, PR IDs, PR titles, and assignee names (on Backlog, the text shown in any table column)
- member filter for the current board
- hidden-tag filters persisted per team
- board toggles for work-item types and sprint scope
- keyboard shortcut: / or Ctrl/Cmd + F focuses the quick filter on Development, Quality Assurance, and Backlog
- keyboard shortcut: Ctrl + Up/Down cycles the Development member filter, or moves between speakers during a standup
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
- optionally reopens Development and Quality Assurance on the view used last (Settings > Display)

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
