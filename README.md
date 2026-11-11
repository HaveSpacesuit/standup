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

On both Development and QA cards, assignment changes read "Assigned" when an unassigned item gains
an assignee, "Reassigned" when it moves between people, and "Unassigned" when its assignee is cleared.
A Development card marked In testing stays in its developer's row, so its assignment changes read
"Tester assigned" instead.

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

Row chevrons on Development, QA, and Backlog point right when collapsed and down when expanded.

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

Development opens on the Developers board, Quality Assurance on Testers, Triage on Table, Backlog on List, and Tests
on Rows. Turn on Settings > Display > "Remember last page and view" to return to your last page when opening the site
without a page route, and reopen each page on its last view, such as Sprint, Flow, Inbox, Map, or Calendar.
An explicit page route always takes precedence. When off, the site opens on Development unless a route specifies
another page. The setting, last page, and each page's last view are saved in this browser, not in team exports.

Settings > Display > **Auto-refresh current page** is off by default. When enabled, its interval defaults to
15 minutes and accepts positive whole minutes. Both choices are saved in local storage (`standup:auto-refresh`),
not in team exports. Development, Quality Assurance, Triage, Backlog, and Tests each use their own last-refresh time
(per team where applicable). Only the current page refreshes when its data reaches that age; navigating to a
page with older data refreshes it on entry. Manual refresh resets that page's clock, and an in-progress load
is never overlapped. Failed automatic refreshes retain the normal error display and wait an interval before
retrying. The browser also checks elapsed time when focus or visibility changes, so a suspended tab catches up.

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
view, and the QA board, where Recently completed cards are always compact. Backlog options shows the
same setting as "Compact rows".

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
rail that runs the board's full height, headed like the Development board's empty Blocked rail by
its color over a checked 0; select a rail to expand it. Coming up can always be collapsed, and its
rail then shows its count without the check. Column and lane toggles are not saved.

**Newly added** ranks cards by attention rather than sprint or oldest ID, in both Testers and Flow.
Creation freshness contributes up to 100 points, halving every seven days. A tag configured for Newly added
(such as Triage) adds 25 points. No state, assignee, or sprint change in the last three days adds 20 points;
the creation revision itself and unrelated edits do not count as follow-up. Unavailable history earns no
untouched bonus. Severity 1/2/3 adds 20/12/4 points, and Priority 1/2/3 adds 15/8/3; level 4 or missing/unknown
values add nothing. Equal scores show newer creation dates first, then higher IDs. This lets recent reports
lead while still surfacing important, untriaged work. Column membership, filters, tester lanes, and the ordering
of other columns are unchanged.

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

### Triage view

Triage sits between Quality Assurance and Backlog in the navigation rail, under a category icon. It
is a read-only queue for unfinished work under the selected team's area path (including descendant
areas), separate from Backlog's bug ranking and sprint planning.

**Triage options** are saved per team and included in team exports:

- **Triage tags** defaults to `Triage`. Tags appear as removable pills; type a tag and select **Add**
  or press Enter, as with Quality Assurance's tag filters. Separate several tags with `;`, as Azure
  DevOps does. A tag typed but not yet added is included when you save. Any whole tag matches,
  case-insensitively. Tagged work items of any type, iteration, or unfinished state (including
  Approved) can qualify. Removing every tag turns tag matching off.
- **Also include new bugs** is off by default. When enabled, Bugs still in their type's initial
  state qualify: the first **Proposed**-category state, which Azure DevOps assigns to new work items
  (New in Scrum and Agile, Proposed in CMMI, or a custom name). Later Proposed states such as
  Approved have already been triaged and do not count. There is no creation-date cutoff.
- **Excluded iteration paths** applies only to the new-bug rule, so it is disabled and ignored while
  that rule is off. Saved paths are kept and apply again when the rule is turned back on. Select a
  team sprint or enter a full path, such as `Project\To Refine`. That path and its descendants are
  excluded, but a matching tag still includes an item there. No exclusions means all new bugs in the
  area qualify.
- **Flag age after (working days)** defaults to 2 (1–30). An item in triage this many working days
  shows its age in amber, unless it is waiting on others. Changing it only redraws the page; it does
  not reload the queue.
- **Waiting tags** defaults to `Needs Info`, edited like Triage tags. An item carrying one is waiting
  on someone else, such as QA or the reporter: the Inbox lists it under **Waiting on others**, and its
  age is never flagged. Waiting tags do not add items to the queue, so an item also needs a Triage tag
  or the new-bug rule to appear. With none, every item counts as still to triage. Like the age flag,
  they only redraw the page.
- **Readiness checks** lists the fields an item needs before it is ready to clear: **Required on
  bugs** (default Severity, Impact, Effort, and Repro steps) and **Required on other types** (default
  Effort and Acceptance criteria). Choose from Severity, Impact, Effort, Repro steps, Acceptance
  criteria, and Description. Leave both empty to hide the Readiness column. Like the age flag, the
  checks only redraw the table.
- **Similar items** chooses what each item's title is compared with besides the rest of the queue,
  which is always compared: **Open bugs** and **Bugs closed in the last** 180 days (1–365), both on by
  default. A source turned off is not loaded. The saved days are kept while closed bugs are off.

Both sources exclude **Completed** and **Removed** state categories, using each work item's own
type metadata. Resolved-category items remain eligible. With no tags and the new-bug rule off,
the page shows a **No Triage rules** card with an **Open Triage options** button rather than
querying all work items. While the queue loads, skeleton rows stand in for the table, as on
Backlog. An empty queue shows a **Triage is clear** card with a success icon, the time it was
checked, and the rules that found nothing.

Items appear once, oldest created first (ID breaks ties; missing dates sort last). Columns follow
Backlog's table in order and formatting. The Work item column shows an accessible type icon, the ID,
the title linking to Azure DevOps, and the tags as pills after it. **Why** follows it, with a chip for
each rule the item meets: a tag chip such as **Triage tag**, or **New bug**. A Triage tag the item
matched appears only there, so it does not repeat on every title; its other tags stay on the title.
**Readiness** comes next: a green **Ready to clear** chip once every check for the item's type passes,
or the fields still missing, each with a dashed `?`. Repro steps, Acceptance criteria, and
Description count as filled when they hold text or an image, such as a pasted screenshot; empty
markup does not count. Only whether each field has content is kept, not the text. The Readiness and
Why tooltips both say what clears the item: removing each matched tag, and for a new bug, moving it
out of its first state or into one of the excluded iteration paths (named by their last segment).
An item that meets both rules leaves only once neither applies.
Then come colored Severity chips, Impact signal bars (the Priority field), Effort, Age, Sprint,
State, and Assigned to, followed by Created by and the immediate Parent's ID/title. Age counts
working days since the item entered triage (**Today**, then `1d`, `2d`, and so on, with weekends
skipped); after two weeks it switches to calendar time such as `3w`, as on Backlog. An item entered
triage when it was created, or later if it qualified later: when its matched tag was last added, or
when a new bug last moved back into its first state. A rule that began within an hour of creation
counts from creation. Its tooltip gives the date the item entered triage and the working-day count.
Assigned to and Parent are hidden while no item in the
queue has one, since new items rarely do; the choice is made from the whole queue, so the columns
stay put while the quick filter changes. Sprint places the iteration against the team's sprints as
Backlog does (This sprint, Next sprint, a sprint name, or Backlog). Missing Severity, Impact, and
Effort are flagged with a dashed `?`, as on Backlog, when they are one of the item type's readiness
checks, and otherwise shown as a dash; unassigned items show a muted Unassigned. Triage has no Value
score or raised-effort marker. Item and parent links open
Azure DevOps for edits. An unavailable parent's known ID/link is retained with an explicit warning.
Quick filtering searches the displayed text, including tags, why items are listed, readiness
(**Ready to clear** or the missing field names), creator, type, sprint label, parent, and the
similar-item match (such as **Possible regression of 2160021**); `/` and Ctrl/Cmd+F focus it.

#### Table and Inbox

The **View** toggle in the toolbar switches between **Table**, the default, and **Inbox**, which shows
the same items, after the quick filter, as a daily to-do list. A summary line counts the items in
triage, those new since your last visit, those ready to clear (when there are readiness checks), those
waiting on others, and, in amber, those in triage at least the age flag's working days without
waiting. The items follow in up to three groups, each longest in triage first:

- **New since your last visit**: items that entered triage after you last had the team's Triage page
  open on an earlier day. Reloading or refreshing later the same day keeps the same group, so it
  holds the day's new arrivals. On the first visit nothing counts as new, and the next group is
  titled **To triage**.
- **Still to triage**: everything else not waiting on others.
- **Waiting on others**: items carrying a waiting tag.

Each card shows the type icon, ID, linked title, and the item's other tags, then how it arrived:
**Filed** with when and by whom, or **Tagged “Triage”** or **Moved to New** with when, by whom, and
the created date. The Why chips follow, then only what differs from a fresh item: a state other
than the type's first, the assignee, and the parent link. A waiting item says which tag it carries
and since when; once someone other than whoever added the tag comments after it was added, the card
shows **replied** with the comment's start in a tooltip. An item past the age flag says how many
working days it has been in triage. Below, a checklist marks each readiness check filled or missing
(or shows **Ready to clear**, with a green edge on the card) beside what clears the item. Severity,
Impact, Effort, and the sprint (unless Backlog) sit to the right, folding under the title when the
page is narrow.

To tell when each item entered triage and whether anyone replied, the page reads each item's update
history and, when it has comments, its newest comment. History loads for up to 100 items; beyond
that, ages count from creation, replies are not shown, and a warning says so. An item whose history
fails to load falls back the same way, with a warning. Your last visit is kept in this browser per
team (`standup:triage-visit:<team id>`), not in team exports, and is removed with the team.

#### Similar items

Each item's title is compared with the rest of the queue and, as Triage options allow, with the
team's open bugs and recently closed bugs, to catch possible duplicates and regressions. Titles are
compared word by word, ignoring common words such as "the" and "when" and reading forms such as
"crashes" and "crashed" as one word. Rarer words count for more, so a shared "watermark" means more
than a shared "viewer". A match needs at least two shared words and a close enough overall likeness.
Only the closest match shows; when two are equally close, another queued item comes first, then an
open bug, then a closed bug.

In the Table, a tinted line under the title names the match: **Also in triage: 2193540**, **Similar
open bug 2178403**, or, in amber, **Possible regression of 2160021**, with the matched title and its
details in a tooltip. Inbox cards show the same line in full: the matched title with the shared words
highlighted, then when a closed bug was closed, where an open bug is planned and who has it, or when
the other queued item was filed. **Compare** opens the two side by side, with the shared words
highlighted, each item's state, sprint, assignee, created (and closed) dates, Severity, Impact, and
Effort, and a link to each in Azure DevOps. **Not a duplicate** stops suggesting that pair and shows
the next closest match, if there is one. It is remembered in this browser per team
(`standup:triage-not-duplicates:<team id>`, up to 500 pairs), not in team exports, and is removed
with the team.

Open bugs are the list Backlog ranks, shared with its cache. Closed bugs are Bugs in a
**Completed**-category state (a removed bug cannot regress) whose state changed within the chosen
number of days, newest first, up to 1,000. They load only while the Triage page has items to compare;
the queue shows first, and matches appear once the bugs arrive. A source that fails to load is left
out with a warning.

#### Preview panel

Select a row or Inbox card, or the eye button that shows on it while hovered or focused (always, on
touch screens), to read the item in a panel beside the list without leaving the page. Clicks on the
item's links and buttons, modified clicks, and selecting text to copy do not preview. Keys move through
the list as it is filtered and sorted: **J** and **K** preview the next and previous item (opening the
panel on the last-previewed or first item when it is closed), **O** opens the previewed item in Azure
DevOps, and **Esc** closes the panel, returning focus to the item's eye button. Keys typed into a field
or a dialog are left alone.

The panel's header shows the item's type, ID, and title, then its Severity, Impact, Effort, sprint,
state, and assignee as the Table shows them. Below that:

- **Why it's here**: how the item arrived, as the Inbox card says, and what clears it.
- **Readiness**: the readiness checklist, when there are readiness checks.
- **Similar**: the closest match, with **Compare**, when there is one.
- The item's text from Azure DevOps. A Bug leads with **Repro steps**, then System info, Description,
  and Acceptance criteria; other types lead with Description. Empty fields are left out unless a
  readiness check needs them, when they are flagged (such as **Repro steps are empty**); an item with
  no text shows its main field as empty.
- **Attachments**, each with its size, opening in a new tab.
- **Comments**: the newest five, with a link to the rest in Azure DevOps.
- **Links**: linked work items with their titles and states (parent and child first, then
  duplicates and related items, up to 50 with a count of the rest), hyperlinks, and a count of
  development links (pull requests, commits, and builds).

Text and comments keep their structure (headings, lists, tables, code, and links) but not their
colors, fonts, or sizes, so they read well in either theme, and nothing in them can run. Screenshots
pasted into the text load from the team organization's work item attachments, the only requests besides
the Azure DevOps APIs that carry the PAT; an image from anywhere else is shown as a link rather than
requested. Select a screenshot to open it full size.

Details load when an item is previewed, and the next one loads ahead so **J** is instant; items already
previewed show at once until the page refreshes. If the details cannot load, the panel says why and
offers **Retry**; if only the comments or the linked items' titles fail, that section says so. An item
that leaves the queue on refresh stays in the panel as **No longer in triage**, and **J** moves on to
the item that took its place.

Drag the panel's left edge to resize it, or focus the edge and use Left and Right arrow keys (32 pixels
at a time), Home (narrowest), and End (widest); double-click the edge to reset it. The panel is 320 to
1,200 pixels wide (440 by default), and the list keeps at least 360 pixels. The width is kept in this
browser (`standup:preview-panel-width`), not in team exports.

#### Open in ADO and refresh

**Open in ADO** opens the same rules as an unsaved Azure DevOps query in a new tab, for bulk edits the
page cannot make. The query is passed in the link's `wiql` parameter, so it needs no write access. It
is available once the queue has loaded.

Refresh and automatic refresh load the active team's queue using its own sync time, and reload the
bugs Similar items compares with and the previewed item's details. Changing team
or options never shows the prior query's results as current. Older team exports without Triage
options use the defaults. Unreadable saved Triage options produce an error and suspend loading;
the original data is retained until you explicitly save replacement options.

### Backlog view

The Backlog page ranks the selected team's open bugs by development value. It queries only Bugs (no PBIs) under the team's area path, across all sprints, and leaves out bugs in a closed, done, or removed state: those in the Bug type's Completed or Removed state categories, or Closed, Done, Removed, and Completed by name if the type reports none. The header is similar to Quality Assurance's: it has the bug count ("43 bugs", or "12 of 43 bugs" while the quick filter hides some), a quick filter, a **Plan a sprint** button, a **View** toggle for List or Map, the team selector (its menu ends with **Manage team**), a Backlog options button, a "Synced 5m ago" label once the backlog has loaded fresh from Azure DevOps, and a Refresh button that spins while the backlog loads.

The table has no sorting, column filtering, or selection, and bug rows highlight when hovered. Its only buttons are on the Value tier headers, plus a checkbox per bug while planning a sprint, both described below. The columns run from why a bug ranks where it does to who has it:

- **#**: the bug's rank among all of the team's open bugs. It stays the same while the quick filter hides other bugs, so "#14" means the same thing filtered or not.
- **Value**, with a sort icon in its header because the list is ordered by it. A short meter beside the number shows its size on a log scale, so each Severity or Impact level is an equal step. The meter's ends come from the formula (2.5 to 213.0), not the team's bugs, so a full bar means the same on every team. Hover the Value for its sum, such as "Value 96.8 = 4.8 × 8 ÷ 4 × 10", and where each term came from, including any input the Value assumed or raised. The tooltip's numbers are rounded to one decimal, or none for whole numbers.
- **Bug**: the ID in bold, then the title as a link that opens the bug in a new tab, then the bug's tags as outlined badges in alphabetical order.
- **Severity**: a chip such as "S1 · Critical" whose dot and color step up with the severity: red for 1, amber for 2, neutral for 3, and muted for 4. An empty Severity shows a dashed amber **Not set** chip, since the bug may rank too low; a severity the Value cannot read is shown as written in a neutral chip.
- **Impact**: the bug's Priority field, a stand-in for how many users hit the bug, as four signal bars (Impact 1 fills all four) beside the level. Hover it for what the level means and its score.
- **Effort**: as entered. An Effort below 4 is underlined with dots, and its tooltip says the Value counts it as 4.
- **Age**: how long ago the bug was created, such as "9d", "3w", "4mo", or "1y" (the same units as the Development board); hover it for the date.
- **Sprint**: where the bug's iteration sits among the team's sprints: **This sprint** (highlighted), **Next sprint**, a later sprint's name, a past sprint marked "· ended" with a warning icon (the bug was planned but not finished), or **Backlog** for any other iteration. Hover it for the sprint's dates or the full iteration path. Until the team's sprints load, it shows the last segment of the iteration path.
- **State**: New, where most bugs wait, is muted text; any other state is an outlined badge so work under way stands out. A state of three or more words is abbreviated as on the cards, such as AFT for Available for Testing, with the full state in its tooltip.
- **Assigned to**: the assignee's avatar and name, or "Unassigned" in muted text when nobody is.

When Impact or Effort is empty, the cell shows a dashed **?** whose tooltip says what the Value assumes in its place.

The ranked bugs are grouped into four Value tiers: **Top** (Value 80+), **Substantial** (30–80), **Moderate** (12–30), and **Minimal** (under 12), so the bugs worth discussing stand apart from the many small ones. These names describe Value, not the separate Severity categories. Each tier starts with a header row that stays pinned under the column header while its bugs scroll by. The header shows the tier's name, how many bugs it holds, its Value range, and the total Effort entered on them, such as "Σ 81 pts + 2 unestimated", where bugs without an Effort are counted rather than summed. A tier with no bugs is left out. Each bug row has a stripe in its tier's color beside the rank, and the Value meters in Minimal are neutral rather than the accent color. A bug sits in the tier its Value reaches as displayed, so one showing 80.0 is in Top; ranks still run down the page across tiers. The chevron on a tier header collapses or expands it, and a collapsed tier shows a **Show N** button that expands it too. Minimal starts collapsed by default, since it usually holds most of the backlog. Collapsed tiers stay collapsed through a refresh and reset when you leave the page. The quick filter does not open a collapsed tier, so its matches there are counted on the header behind **Show N**.

Table columns keep their widths when tiers expand or collapse, including when every tier is collapsed.
The Bug column takes the remaining space; narrow windows scroll horizontally. Long sprint and state labels end in an
ellipsis, with their full text available in tooltips.

Backlog options > Value tiers sets the lowest Value of Top, Substantial, and Moderate; anything below Moderate is Minimal. Each threshold must be above 0 and lower than the one above it. Until all three are valid, the fields that conflict are marked with a message and the tiers keep the last valid thresholds; a valid change applies straight away. **Start with the Minimal tier collapsed** (on by default) sets whether Minimal opens collapsed, and turning it on or off collapses or expands Minimal at once. These Backlog options are saved per team in this browser and included in team exports; importing an export made before they existed uses the defaults. Stored option keys and Value thresholds are unchanged by the tier names.

Between the header and the table, a one-line summary ribbon describes the whole backlog, including bugs the quick filter hides. It shows:

- the number of open bugs;
- their total Effort, such as "Σ 348 pts + 4 unestimated";
- the Value mix, as a bar and a count per tier;
- the Severity mix, S1 to S4 plus any not set;
- what is planned, such as "6 this · 6 next · 6 ended";
- how many bugs were created since the current sprint started;
- the median age.

Each group has a tooltip with the details and takes keyboard focus so the tooltip opens from the keyboard too. The sprint groups appear only once the team's sprints have loaded. As the window narrows, the ribbon drops Severity first, then the new-this-sprint count, the median age, Planned, and finally the Value bar.

Below the ribbon, a **Needs attention** bar works like the one on the Development board, with chips for signals worth a look during sprint planning:

- **Severe, not planned**: Severity 1, or Severity 2 with Impact 1, and not in this sprint or the next.
- **In an ended sprint**.
- **Missing severity or impact**: this includes a level the Value cannot read, since the Value counts either one as 4.
- **No effort**.
- **Older than 1 year**: the bug is still New a year after it was created.

Each chip counts the bugs the quick filter leaves. Pressing a chip dims the other bugs without hiding or reordering them, says how many bugs it highlights, and adds "· N match" to each tier header, which counts the matches in a collapsed tier too. A dimmed row comes back to full strength on hover or focus. Pressing the chip again, or **Clear**, turns it off, and the chip is not saved, so it resets when you leave the page.

Backlog options > Needs attention sets the age for the last chip, from 1 to 120 months (12 by default). It applies once the number is valid and is saved and exported with the other Backlog options.

**Plan a sprint** in the header picks the highest-Value bugs that fit an effort budget, for filling a sprint or spare capacity. Like **Start standup**, it is a primary button that steps aside while planning: it opens a strip under Needs attention, moves focus to the budget, and adds two columns to the table: a checkbox before the rank and **Running** after Effort. Going down the ranked list, the planner picks each bug that fits what is left of the budget and passes over one that doesn't, so a smaller bug further down can still fill the gap. It picks from the listed bugs: the quick filter's matches, narrowed to the pressed Needs attention chip when there is one; the other bugs' checkboxes are disabled. A bug without an Effort counts as 4 pts. Picked rows are tinted, Running shows each pick's effort added to the picks above it, and a dashed cut line under the last pick reads "Cut line · 9 of 10 pts · 3 bugs above". A bug passed over above the line says why in Running: This sprint, Next sprint, No effort, Too big, or Unchecked. Each tier header adds "· N picked".

The strip has:

- **Budget**, in points, with − and + buttons. It starts at the team's default and accepts a whole number from 1 to 999; until the number is valid the field says so and the plan keeps the last valid budget.
- **Skip planned** and **Skip unestimated**, which leave out bugs already in this sprint or the next, and bugs without an Effort. These are the same settings as in Backlog options.
- A summary: the number of picks, the points used against the budget with a meter, "over by N" in amber when hand picks exceed it, the picks' total Value, and how many picks have no Effort.
- **Copy list**, which copies the picks as one tab-separated line each (ID, title, Effort, and Value) for pasting into a spreadsheet or chat.
- **Reset**, which clears hand picks and goes back to the default budget.
- **Close**, which removes the strip and the two columns and brings back the header button with focus on it. Opening the plan again brings back its picks and budget.

Checking or unchecking a bug overrides the planner, and the checkbox is ringed to show it was set by hand. A hand pick counts first, even when it is planned or pushes the plan over budget; unchecking it, or checking a bug unchecked by hand, hands it back to the planner. The plan never changes Azure DevOps. Plan a sprint, the budget, and hand picks are not saved: they survive a refresh and Close but reset when you switch teams, and leaving the page closes the plan.

Backlog options > Plan a sprint sets the **Default budget** (10 pts by default, 1–999) and whether to **Skip bugs already in this sprint or the next** and **Skip bugs without an Effort** (both on by default). They are saved and exported with the other Backlog options.

The header's **View** toggle swaps the ranked list for a **Value map**, a bubble chart of the same bugs. Effort runs to the right and Severity score × Impact score runs up, both on log scales, so bugs of equal Value lie on a diagonal:

- Bugs with the same effort, severity, and impact share a bubble, which shows how many bugs it holds.
- A bubble whose Value assumed a missing or unreadable input has a dashed amber outline. It sits just left of the bubble for the same values entered, since its place is a guess.
- Bubbles take their Value tier's color, over diagonal bands for the tiers, with a dashed line labeled at each tier threshold.
- The effort labels are the team's own efforts, not a fixed scale. The first reads "≤4", since the Value counts any effort below 4, or none, as 4.
- The corners are labeled Quick wins, Big bets, Fill-ins, and Reconsider.

Hover or focus a bubble for a short summary: its bug count and Value, its Effort, its Severity and Impact scores, whether its Value used an assumed default, and a reminder to select it. Select it to list its bugs in the side panel, with links to Azure DevOps. Select it again, press Escape, or choose **Back to the reading guide** to go back. With no bubble selected, the panel explains how to read the map, gives a key, and lists the top 10 bugs by Value. The map is one tab stop: arrow keys, Home, and End move between bubbles in Value order, and Enter or Space selects one.

The map keeps the rest of the page in step:

- Every open bug stays on the map. Bubbles outside the quick filter or the pressed Needs attention chip fade instead of disappearing, and the panel lists only what is left ("Top N by Value · filtered").
- The summary ribbon, Needs attention, and the Plan a sprint strip stay above the map. While planning, a bubble holding a pick is ringed and the panel marks its picks; picking by hand is done in the list.
- Below about 900 px wide, the panel moves under the plot.
- The selected bubble survives a refresh and is cleared when you switch teams.
- Backlog opens on List, or on the view used last when Settings > Display > "Remember last page and view" is on.

Backlog options > Display has **Compact rows**, the same setting as Compact cards on Development and Quality Assurance, so turning it on in one place turns it on in all three. Compact rows keep each bug to one line: a long title ends in an ellipsis with the full title in its tooltip, only the first tag shows, followed by "+N" whose tooltip lists the rest, and Assigned to shows only the avatar, with the name in its tooltip.

The quick filter keeps the bugs whose visible text contains what you type, checking each column as the table displays it: the ID, the rounded Value, the title, each of the bug's tags (including those behind "+N" in compact rows), Severity as its chip reads ("S1 · Critical"), Impact, Effort, Sprint, State (both the abbreviation and the full state), and Assigned to (including "Unassigned"). Because it matches what is shown, it does not search the iteration path behind a Sprint label, the unrounded Value, the Severity picklist text ("1 - Critical"), the created date, or the marks that stand in for missing values. Rank and Age are left out because they shift as bugs are added and grow older, so a filter on them would stop matching. Matching ignores case and surrounding spaces. The remaining bugs keep their ranked order, and a message appears when none match. The filter text is kept when you refresh, switch teams, or visit another page, but not across a browser reload. / or Ctrl/Cmd + F focuses it.

Value is `((SeverityScore * ImpactScore) / AdjustedEffort) * 10`, shown to one decimal place:

| Field value | 1 | 2 | 3 | 4 |
| --- | --- | --- | --- | --- |
| SeverityScore (from Severity) | 10.648 | 4.84 | 2.2 | 1 |
| ImpactScore (from Priority) | 8 | 4 | 2 | 1 |

A missing Severity or Priority counts as 4. AdjustedEffort is the Effort field with a minimum of 4, which also applies when Effort is missing. Bugs are ranked by Value (descending), then SeverityScore (descending), then Created Date (ascending). Ranking uses the exact Value, not the rounded one that is displayed, so two bugs that both show 13.3 can still rank apart by their small difference; SeverityScore and Created Date only break ties between bugs whose exact Values are equal. Results are cached per team until you refresh.

### Tests view

The Tests page charts e2e pass percentages across a configurable lookback window (60 days by default) for each configured Azure DevOps build/YAML pipeline or classic release pipeline. Use Test options to set the number of days, enter the organization and project, type to search pipelines and stages, choose a test-publishing stage (or the whole build pipeline), and add it to the chart. The lookback window is saved in browser local storage and applies to all configured pipelines. Build history is filtered by finish time; release history is queried by creation time, then charted by the selected stage's completion time when available. Each point is passed tests divided by the tests that ran: `NotExecuted` (how skipped tests are usually published), `Skipped`, `NotApplicable`, `NotImpacted`, `None`, `Unspecified`, `InProgress`, and `Paused` results are left out of every test count, so a pipeline that skips most of a shared suite is measured by the tests it actually ran. Tests must be published to Azure DevOps for the chart to find them; stages without executed test results are shown as missing data, not 0% passed. If test results cannot be loaded, the page or options dialog reminds you to ensure your PAT has Test Management (Read) access. The refresh button reloads the latest results, and "Synced 3m ago" beside it shows when they last loaded. Tests has no filter or team controls; pipeline selections are saved in browser local storage.

After the first visit, Tests keeps its loaded results and page state when navigating away, including when switching teams on another page. Team sprint labels can update without reloading pipeline results. Use Refresh to fetch fresh results; changing pipeline sources, the lookback window, or the PAT also reloads them. If global auto-refresh is enabled, Tests reloads only while it is the current page and its results are old enough, including when returning to stale results.

The toolbar's View toggle switches between Rows (the default) and Calendar. Rows uses a logarithmic scale of failures (with a 1% offset for 100% pass rates), labeled in pass percentages so differences near 100% stay visible; "How to read this chart" (or "How to read this calendar") beside the intro line explains the view. A saved preference for the retired Overlay view falls back to Rows.

**Rows** gives each pipeline its own short row on a shared time axis: a neutral line of every run, the pipeline's usual range as a shaded band, and its latest pass rate labelled at the right edge. Only exceptions get color: amber for a run below usual, red for a sharp drop, and a hollow amber point when fewer tests ran than usual. A pipeline with no recent runs hatches the days since its last run. Under each row, a tests-ran lane has one bar per day for that day's smallest run (so a full rerun can't hide a short run), a dashed line at the usual count labelled "~840" at the right edge, and an amber bar when the run had fewer tests than usual; a pass rate can look fine while half the suite never ran. Each row's label shows the short name, stage, latest pass rate, and its date (or "N working days ago" / "121 of ~220 tests" when that is the story); its left edge takes the status color. Sprint names from the team selected on the other pages run along the top, with a line where each sprint starts, and the current sprint reads "Sprint 42 · Day 9 of 10" (working days); projects share sprint dates, so one team's sprints label every pipeline. Hovering any row shows a crosshair on every row for that day, with the day in the header and each pipeline's lowest run that day ("99.2% · lowest of 2"), "no run", or "not run yet" for today, plus the tests that day's smallest run ran ("842 tests", amber when fewer) in its lane. Click a row to open that day's lowest run in run details. A small triangle above a row marks each run with a change (see Changes below), in the change's color; hover it for its title and click it to open the change.

**Calendar** turns each pipeline's row into one cell per day, colored by that day's worst run, so a streak of bad days, a run of short suites, or a week without results stands out at a glance. A usual day is neutral, a day below usual is amber, a sharp drop is red, and a day when fewer tests ran is hatched amber; a sharp drop outranks fewer tests, which outranks below usual. Weekends are narrower and stay empty unless the pipeline has run on a weekend. A day without a run has a dashed outline, and today has an accent-colored dashed outline until the pipeline reports (a pipeline with no recent runs shows today as missed); the first day of the window gets no outline, since the window opens partway through it. Sprint names and lines run along the top as in Rows, with Mondays dated beneath them. Hover a cell for the day's worst run ("Below usual · worst of 2 runs"), its counts, and any changes on it; click it to open that run in run details, where the cell is outlined. A key below the calendar names each cell.

A health strip above the chart shows one tile per pipeline with runs (up to four per row). Each tile shows the pipeline's short name (the parenthetical in its name, such as "PWW", unless a short name is set in Test options) and stage, its latest pass rate, the change against its median, a 21-day sparkline, and a status chip whose tooltip explains the status:

- **Usual** — the latest run is within or above the pipeline's usual range (the middle 80% of its runs in the lookback window, ignoring sharp drops).
- **Below usual** — the latest run is below that range by more than a small noise margin.
- **Sharp drop** — the latest run failed about 4× the pipeline's median failure rate or worse.
- **Fewer tests** — the latest run executed fewer than 80% of the pipeline's usual test count.
- **No recent runs** — no results for 2 or more working days; the sparkline hatches the idle days.

The toolbar summarizes the statuses ("4 pipelines"; hover or focus it for counts). Click a tile (or a row's label in Rows or Calendar) to focus its pipeline: the other rows fade. Click it again or press Esc to clear focus. Health uses all runs that pass the pass rate filter.

A **Changes** panel beside the chart (below it when the page is narrower than 900px) lists what changed across the pipelines, newest first, so standup can start from "what's new" instead of scanning every line. Each change is compared with its pipeline's usual range:

- **Sharp drop to 81.9%** — once per sharp-drop episode, on its first run.
- **Recovered after 4 days** — the first run after a sharp-drop episode, with the episode's lowest run.
- **First failures in 8 days** — failures after 5 or more clean runs in a row (not called out when the run is a sharp drop).
- **Fewer tests ran** — once per streak of runs with fewer tests than usual ("121 of ~220 tests · 3 runs in a row").
- **Below usual: 95.4%** — the latest run only.
- **No recent runs** — on the working day the pipeline was flagged.

Changes are grouped into **This sprint** (the current sprint of the selected team, or the last 2 weeks without one) and **Earlier**. Focusing a pipeline lists only its changes, with **Show all** to clear the focus. Select a change (or click a run on the chart) to open **run details** at the top of the panel: the pipeline, stage, date, and build or release number; the change; passed, failed, and ran counts; the pass rate against the previous run and the usual range; and **Open in Azure DevOps**. Select it again, close it, or press Esc to close run details; a second Esc clears the focus.

When a run has failures, run details lists its failing tests (up to 8, then "+N more"). They load only when the run is opened, never when the page loads, and stay cached until you leave the page. A test is marked **New** when it didn't fail in the pipeline's previous run and **Again** when it did; labels are left off for the first run in the lookback window, or when the previous run's list couldn't be read in full. Failing tests are read from Azure DevOps (up to 200 per run) with the same Test Management (Read) access as the chart. A build run lists its Failed and Aborted results, the only outcomes Azure DevOps can list a pipeline's results by. A release run needs the stage instance it ran in; its failing tests are read from that stage's test runs that have failures.

Test options uses two tabs: Options contains the lookback window, and Pipelines contains
the configured pipeline list and controls for adding or removing pipelines.
Options also includes an optional pass rate filter (unchecked by default). Enable it and enter
a percentage from 0 to 100 inclusive to hide chart points at or below that pass rate. For
example, 0 excludes 0% results and 20 excludes results at 20% or lower; 100 hides all results.
Decimal thresholds are supported. The setting is saved in browser local storage and applies
to all configured pipelines without refetching results. Disabling it restores the hidden points.
Rows and Calendar use every run and read each day's lowest or worst result; there is no configurable daily aggregation.
Under "Pipeline health", Options sets when a pipeline is flagged: "Flag no recent runs after
(working days)" (2 by default) and "Flag fewer tests below (% of usual)" (80 by default). Both
are saved in browser local storage when the field loses focus. In Pipelines, each configured
pipeline has an optional "Short name" (up to 24 characters) that replaces the default short name
on its health tile and in chart tooltips; leave it blank to use the default.

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
- the board header and content share one scroll container for alignment, and the column dividers
  and tints run the full height of the board however far it scrolls
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
- The PAT is sent only to Azure DevOps: its APIs, and the team organization's work item attachments
  when previewing screenshots. Images linked from anywhere else are never requested.
- Work item text and comments are rendered from an allowlist of formatting tags; scripts, styles,
  frames, forms, and event handlers are dropped.
- This app is best suited for internal or trusted environments where browser-side Azure DevOps access is acceptable.
