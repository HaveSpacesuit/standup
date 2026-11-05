# Manual QA Checklist

This checklist covers the browser-based ADO Team Explorer dashboard end to end. It is intended for
release validation, exploratory testing, and regression testing against a real Azure DevOps
organization.

## Test record

Complete this section for each test pass.

- Build/version or commit:
- Environment URL:
- Tester/date:
- Browser and version:
- Operating system:
- Azure DevOps organization/project:
- Team profile(s) used:
- PAT storage mode tested: session-only / remembered
- Test data notes (sprints, work items, PRs, members):
- Defects filed:

## Test data and accounts

Prepare data that exercises both populated and empty states:

- [ ] A valid PAT with the required Build, Code, Graph, Project and Team, Release, and Work Items
      read scopes.
- [ ] An invalid, expired, revoked, or insufficient-scope PAT.
- [ ] One configured team with current and future iterations, multiple members, multiple work-item
      types, multiple states, tags, and work items assigned to different people.
- [ ] At least one unassigned work item and, if supported by the organization, an item with missing
      or unusual metadata.
- [ ] Work items in New, Active, Review/QA, Blocked, Done, and other project-specific states.
- [ ] Work items created recently, changed recently, unchanged, and changed by different users.
- [ ] A work item with many tags, long tags, duplicate-looking tags, and no tags.
- [ ] A repository with active PRs, completed PRs, drafts, abandoned PRs, old completed PRs, PRs
      linked to visible work items, and PRs not linked to visible work items.
- [ ] A team with no work items, no members, no matching QA items, and no PRs.
- [ ] A second valid team profile with different data and a second repository.
- [ ] A valid exported team JSON file, malformed JSON, valid JSON with missing fields, and JSON
      containing extra/unknown fields.
- [ ] A project with custom work-item states and types to verify dynamic option loading.

## Release-blocking smoke test

- [ ] App loads without an uncaught browser-console error.
- [ ] First launch requests Azure DevOps access and cannot be bypassed without entering a PAT.
- [ ] A valid PAT can be entered and accepted.
- [ ] A valid team can be configured and saved.
- [ ] Team Assignments loads real data and shows the expected board.
- [ ] Quality Assurance can be opened and shows the expected QA board.
- [ ] Backlog can be opened and lists the team's open bugs ranked by Value.
- [ ] Quick filtering changes visible cards (or Backlog rows) and clearing it restores them.
- [ ] Refresh reloads data and does not duplicate cards.
- [ ] Settings can be reopened, closed, and saved without losing configuration.
- [ ] The app can be reloaded and restores the expected PAT/team/preferences according to storage mode.
- [ ] No critical path is blocked by a loading spinner, empty state, or recoverable API error.

## 1. Initial load and application shell

- [ ] Open the app in a clean browser profile with no storage.
- [ ] Verify the window title and navigation rail show "ADO Team Explorer", the rail and favicon use
      the binder icon, and static assets, layout, and initial background render correctly.
- [ ] Verify the access dialog is visible on first launch.
- [ ] Verify the access dialog cannot be dismissed with Escape or a backdrop click before a PAT is
      entered.
- [ ] Verify the PAT field is focused, masked as a password, and has an understandable label and
      placeholder.
- [ ] Verify required PAT scopes are listed accurately.
- [ ] Verify the Azure DevOps PAT creation link opens the intended page in a new tab and does not
      expose the token in the URL.
- [ ] Submit an empty PAT with the button and Enter key; verify a clear validation error and no
      data request.
- [ ] Enter a PAT with leading/trailing whitespace; verify it is trimmed before use.
- [ ] Verify the shell remains usable while data is loading and that loading controls are disabled
      where appropriate.
- [ ] Verify navigation rail/toolbar icons have meaningful accessible names and tooltips.
- [ ] Without a PAT or configured team, hover disabled Development and QA options/Refresh buttons;
      verify their tooltips appear, clicks do nothing, and no MUI disabled-child Tooltip warnings occur.
- [ ] With access and a team configured, verify those tooltips and actions still work; while loading,
      verify disabled Refresh still shows its tooltip without MUI warnings.
- [ ] Verify the current view is visually and programmatically distinguishable.
- [ ] Verify the app does not leak the PAT into visible text, query strings, links, or console logs.

## 2. PAT and Azure DevOps access

- [ ] Save a valid PAT from the first-launch dialog and verify the dialog closes.
- [ ] Enter an invalid PAT and verify the error is surfaced clearly without a false success state.
- [ ] Use a PAT lacking each required scope where practical; verify the API error is actionable.
- [ ] Open Settings and save a replacement PAT.
- [ ] Clear the PAT; verify credentials are removed, data-dependent controls are disabled, and the
      access dialog/notice returns as designed.
- [ ] Clear the PAT from Settings > ADO; after the transition settles, verify Settings is closed
      and only the Azure DevOps access dialog and one backdrop remain mounted.
- [ ] Verify Escape and backdrop clicks cannot dismiss the access dialog after clearing the PAT.
      Re-enter a PAT; verify no dialog/backdrop remains and Settings does not reopen automatically.
- [ ] Reopen Settings after restoring access, then close it; verify no dialog/backdrop remains.
- [ ] Cancel/close settings after editing the PAT without saving; verify the previous value remains.
- [ ] Reload after saving a remembered PAT; verify it is restored.
- [ ] Reload after saving a session-only PAT; verify behavior matches the selected storage mode.
- [ ] Close the browser and start a new session; verify session-only credentials are not retained.
- [ ] Revoke the PAT in Azure DevOps, refresh, and verify the authentication error is displayed
      without stale data being presented as current.
- [ ] Restore access and verify a subsequent refresh recovers normally.
- [ ] Verify network failures, timeouts, rate limits, and 401/403/404/5xx responses produce a
      visible error and leave the app recoverable.
- [ ] Verify an in-flight request can be superseded by a team change or refresh without stale
      results replacing the current team’s data.

## 3. Settings and team profiles

### Settings navigation

- [ ] Open Settings from the navigation rail.
- [ ] Verify the Azure DevOps, Teams, and Display tabs can be selected with mouse, keyboard, and
      assistive technology.
- [ ] Close Settings with the close action and verify focus returns to the opener.
- [ ] Verify Escape/backdrop behavior is consistent with the intended modal behavior.
- [ ] Reopen Settings and verify the active team and saved values are populated.

### Team profile create/edit/delete

- [ ] Add a team profile and verify a unique profile is created.
- [ ] Verify fields exist for display name, organization, project, team name, repository, area
      path, and iteration path.
- [ ] Verify field hints explain the expected Azure DevOps values and path formats.
- [ ] Save with each required field empty; verify the correct field-specific validation message.
- [ ] Save values containing surrounding whitespace; verify values are trimmed.
- [ ] Save a complete profile and verify it appears in the team selector.
- [ ] Edit every field and verify the changes persist after closing/reopening Settings.
- [ ] Switch between two profiles while editing; verify the correct draft is shown and no values
      cross-contaminate profiles.
- [ ] Remove a saved profile and verify the selected profile falls back safely.
- [ ] Remove the last profile and verify the configured-team empty state is usable.
- [ ] Begin adding a team, then cancel/remove the draft; verify no incomplete profile is saved.
- [ ] Verify team IDs remain stable when editing and are distinct when creating profiles.

### Team selection and Azure DevOps links

- [ ] Select each configured team from the main toolbar and from the QA toolbar.
- [ ] Verify the selected team drives the board title, members, iterations, work items, QA options,
      hidden tags, and PR results.
- [ ] Verify a team-management link opens the correct project/team destination.
- [ ] Verify the Graph-enabled direct team-management link works.
- [ ] Verify the documented fallback project-team link works when team identity resolution lacks
      Graph access.
- [ ] Verify switching teams while a request is loading does not show the previous team’s data.

### Import/export

- [ ] Export the selected team and verify a JSON file downloads with readable, complete data.
- [ ] Inspect the export and verify team fields plus saved assignment/QA/page options are included,
      without including the PAT.
- [ ] Import a valid export and verify it creates or updates the expected team and options.
- [ ] Import malformed JSON; verify a visible error and no partial state change.
- [ ] Import valid JSON missing required fields; verify validation rejects it safely.
- [ ] Import JSON with unknown fields; verify behavior is safe and documented (ignored or rejected).
- [ ] Import the same export twice; verify duplicate handling is intentional and understandable.
- [ ] Import a profile with the same display name but a different ID; verify selection and storage
      remain deterministic.
- [ ] Verify canceling the file chooser changes nothing.
- [ ] Verify exported data can be imported into a clean browser profile.

### Display preferences

- [ ] Toggle dark mode on and off.
- [ ] Verify all pages, dialogs, skeletons, charts, chips, links, errors, and empty states remain
      legible in both themes.
- [ ] Reload and verify the selected appearance persists.
- [ ] Verify the display preference is not included as Azure DevOps data or PAT data.
- [ ] Verify Settings > Display shows "Remember last view" off by default, with help text naming
      Developers and Testers as the default views.
- [ ] With it off, switch Development to Sprint and Quality Assurance to Flow, reload, and verify
      they open on Developers and Testers.
- [ ] Turn it on, reload, and verify Development opens on Sprint and Quality Assurance on Flow
      (the views used last, even though they were chosen while the setting was off). Switch back,
      reload, and verify the new choices are remembered and the setting itself persists.
- [ ] With it on and Sprint remembered, start a standup and verify Development switches to the
      Developers board, then reopens on Developers after a reload.
- [ ] Verify team export does not include the setting or the remembered views.

## 4. Navigation and page lifecycle

- [ ] Navigate between Development/Team Assignments, Quality Assurance, and Backlog.
- [ ] Verify the URL/hash or active-view state, if present, matches the selected page.
- [ ] Use browser refresh on each page and verify the selected page and valid persisted state restore.
- [ ] Use browser back/forward if navigation state is represented in history; verify predictable
      restoration.
- [ ] Verify changing teams on one page updates the other page consistently.
- [ ] Verify unsaved QA options are committed only according to the dialog’s documented close/save
      behavior.
- [ ] Verify opening one modal does not leave another modal or backdrop behind it.
- [ ] Verify focus is trapped inside dialogs and returns to the initiating control on close.

## 5. Development / Team Assignments board

### Loading, empty, and summary states

- [ ] Verify the loading skeleton appears while team data is loading and does not cause major layout
      shift.
- [ ] Verify the board header and board content scroll together and columns remain aligned.
- [ ] Verify the sprint summary identifies the current sprint and displays correct counts/progress.
- [ ] Verify an empty team shows a useful empty state rather than a broken board.
- [ ] Verify a team with no current sprint or missing iteration data has a clear fallback state.
- [ ] Verify rollover sprint indicators appear only when the underlying data warrants them.
- [ ] Verify refresh disables itself during loading and re-enables afterward.

### Developers view

- [ ] Select the Developers view and verify work items are grouped by assignee.
- [ ] Verify every configured member is represented appropriately, including members with no items.
- [ ] Verify unassigned items appear in the intended unassigned group.
- [ ] Verify work items appear in the correct state/status group and preserve expected order.
- [ ] Verify counts, avatars, names, IDs, titles, types, states, tags, sprint labels, and links
      match Azure DevOps data.
- [ ] Verify long titles, IDs, names, tags, and sprint paths truncate or wrap without obscuring
      actions.
- [ ] Verify cards with no optional metadata render cleanly.
- [ ] Verify multiple assignees or unusual identity data display safely.
- [ ] Verify collapsed/expanded dense groups preserve the correct cards and counts.
- [ ] Verify the board remains usable with many members, columns, cards, and tags.
- [ ] Verify Development cards have a leading edge in their column's color, show the state only when
      it differs from the column's usual state, and show the sprint only when it is not the current
      sprint, and that QA board cards follow the same rules and also mark items with no sprint.
- [ ] Verify each open PR's next step is the first that applies of: failing checks, rejected, waiting
      for the author, checks unavailable, pending checks (Pipeline), missing approvals (Reviewers),
      and Ready to complete.
- [ ] Verify a blocked card shows the reason from its blocked tag (which is then not repeated as a
      tag) or state, Failed testing replaces the state badge, and a Review card assigned to someone
      other than the row's developer shows In testing or Handed off with that person.
- [ ] Verify each open PR's progress strip matches its checks (failing, pending, passing), approvals
      toward two (rejected and waiting for the author included), and an outlined final segment only
      when the PR is ready to complete; verify screen readers announce the strip as one labelled image.
- [ ] Verify a PR row shows its repository only when the work item's PRs span more than one
      repository, and that a linked PR row shows the PR title on hover and in its ID link's
      accessible name.
- [ ] Verify a recently changed card shows the corner dot and a badge naming the change and its age
      (state or column moves, reassignment, linked PRs, tag changes, and PR votes).
- [ ] Verify Blocked, Active, and Review cards gain an aging dot for each quarter of the Stale
      threshold without a tracked change (amber at three, red at four), New and Done cards show none,
      and only stale Done cards fade.

### Sprint view

- [ ] Select Sprint view and verify the board shows one lane per sprint: the current sprint first and
      expanded, other sprints collapsed beneath it with their dates, and No sprint last.
- [ ] Verify Sprint view cards match the Developers board's cards (density, leading edge, PR rows, attention
      bar, lane heads), pull requests without a work item are left out, and the Members options have
      no effect.
- [ ] Verify each card's owner avatar names the developer whose lane it sits in on the Developers
      board, and that With QA counts a Review card assigned to someone other than that owner.
- [ ] Verify journey captions (Done at start or on a date, Back from a column, Added today, Into a
      column today, at start, and days in a column, amber from five days outside New) match each
      card's history this sprint.
- [ ] Verify a card waiting two weeks or more shows coarser units (for example "3w in Active", "4mo
      in New", "1y in New"), and that its tooltip gives the date, with the year when it is not this
      year, and the exact number of days. Check the column flow line's "oldest" uses the same units.
- [ ] Verify the trail along each card's bottom edge shows the columns it passed through, sized by
      working days, and that screen readers announce it as one labelled image.
- [ ] Hover over and keyboard-focus a card and verify a dashed ghost appears where it started or was
      added (or the farthest column it reached when it is back where it started), without blocking
      card links or covering sticky headers.
- [ ] Verify Moved back appears in the Needs attention bar only in Sprint view and highlights cards
      that moved to an earlier column this sprint.
- [ ] Once the scope history loads, verify the current sprint splits into Committed at start (with
      the planning date and an "N from <previous sprint>" note for rolled-over cards), Added during
      sprint (with a "Scope +N%" note), and Removed from sprint (collapsed), and the corner label
      reads Scope.
- [ ] Verify cards added after the sprint started are flagged Added mid-sprint in the Needs attention
      bar, and that the facet appears only in Sprint view.
- [ ] Expand Removed from sprint and verify each removed card is a dashed outline with struck-through
      effort, sits in the column it left from, says where it went ("Moved to Sprint 43" or "Moved out
      of the sprint") with the date, and that the lane notes and collapsed pips match, in light and
      dark modes.
- [ ] Verify removed cards are excluded from column totals and attention counts and stay dimmed when
      a Needs attention facet is selected.
- [ ] Verify each Sprint view column header shows a flow line under its title:
      - a sparkline of the column's effort through today, with room left for the remaining days;
      - the change since sprint start (▲/▼/±0 pts), green when Done grows, red when Blocked grows,
        and green when Blocked shrinks;
      - for Active and Review, "oldest Nd", amber from five days.
      Check it in light and dark modes, that hovering or focusing it shows a tooltip, and that the
      Developers board's headers stay single-line.
- [ ] Scroll a tall Sprint view lane and verify its sticky summary stays below the taller column
      headers.
- [ ] Verify the Sprint view shows a replay strip under the ribbon: a stacked effort chart of the days
      so far with the remaining days hatched, and "Day N of M · today" beside it. Verify it reads
      "Loading sprint history…" while history loads, and that the Developers board has no strip.
- [ ] Verify the Sprint view toolbar shows **Replay sprint** instead of Start standup, disabled with a
      tooltip until the sprint's history loads, and that it plays from Day 1 to today, one day a
      second, then stops on today.
- [ ] Verify Play/Pause, Previous day, Next day, and dragging or using arrow keys on the slider each
      move the board to that day; the chart dims after the day shown and marks it with a playhead.
- [ ] On a past day, verify:
      - cards animate to the column they were in at the end of that day (and appear without motion
        when the system asks for reduced motion);
      - cards added later are gone, cards removed later are back in Committed at start, and other
        sprints' lanes are hidden;
      - the info banner names the day, and **Back to today** restores the live board;
      - the Needs attention bar, recent-change highlights, pull requests, next steps, tags, state, and
        sprint are hidden, and column counts and flow lines match the day shown;
      - compact cards show their full content without a hover card.
- [ ] Verify switching to Developers, changing team, or starting standup returns the replay to today.
- [ ] Check the replay strip, banner, and replayed cards in light and dark modes.
- [ ] Verify switching between the Developers and Sprint views preserves the selected team and filters.
- [ ] Verify changing the sprint scope updates cards and summary counts without stale cards.
- [ ] Verify the ribbon's effort flow chart shades the remaining days and marks today in light and dark
      modes, and that the detailed chart, legend, values, empty state, and tooltip still work.
- [ ] Verify chart and summary values remain correct after refresh and view switching.

### Work-item interaction

- [ ] Open a work-item link and verify it targets the correct Azure DevOps item.
- [ ] Verify links open in the intended tab/window and use safe target/rel behavior.
- [ ] Verify status labels and state tooltips are accurate.
- [ ] Verify recent-change/activity highlights appear for qualifying items only.
- [ ] Verify highlight legends/indicators are understandable and do not hide card content.
- [ ] Verify tag chips and hidden-tag effects are applied consistently in all board groupings.
- [ ] Verify cards remain clickable/accessible when filtered, highlighted, or collapsed.

## 6. Development filters and controls

- [ ] Type a case-insensitive quick-filter match for a work-item ID.
- [ ] Match by title, type, sprint label/path, tag, PR ID/title, and assignee name.
- [ ] Verify partial matches and whitespace behave predictably.
- [ ] Verify no-match results show a useful empty state.
- [ ] Clear the quick filter with the clear icon and verify all eligible cards return.
- [ ] Press Ctrl+F/Cmd+F and verify focus moves to the quick filter rather than browser find.
- [ ] Verify the shortcut works on both pages and does not trigger while typing in another field.
- [ ] Select All team members and each individual member filter.
- [ ] Verify member filtering affects only the intended board and updates counts/empty states.
- [ ] Use previous/next member filter buttons, including wraparound from first to last and last to
      first.
- [ ] Verify member-cycle buttons are disabled when there are no members or no PAT.
- [ ] Open hidden-tag/type/sprint rules and verify the dialog loads its options.
- [ ] Hide a tag for all types and verify matching cards disappear.
- [ ] Hide a tag for selected work-item types and verify only those types are affected.
- [ ] Add, edit/remove, and clear hidden-tag rules, including case and whitespace variations.
- [ ] Select sprint restrictions and verify filtering follows the selected sprint paths.
- [ ] Verify hidden-tag rules persist per team and do not affect another team.
- [ ] In Development options > Members, verify "Hide users with no activity" is off by default, hides
      member rows without cards matching the current filters, and counts PR-only cards as activity.
- [ ] Verify "Also hide users with only stale, done work" is always shown, off by default, and
      disabled until "Hide users with no activity" is checked.
- [ ] With both options checked, verify a row is hidden only when every one of its cards is in the Done
      column and stale; a row with any card in another column, or any fresh or recently changed card,
      stays visible. Include the Unassigned and Assignee unavailable rows and PR-only cards.
- [ ] Change the Stale threshold on the Freshness tab and verify rows hide and reappear to match.
- [ ] Uncheck "Hide users with no activity" and verify the stale, done option is disabled and stops
      hiding rows, then re-check it and verify the saved stale, done choice applies again.
- [ ] Verify column counts and effort totals still include cards from hidden rows, and that hiding
      every row shows an explanatory message instead of an empty board.
- [ ] Verify both Members options persist per team across a reload and do not affect Sprint view.
- [ ] In Development options > Members, verify "Include QA testers in standup" is off by default and,
      when checked, standup on the Developers board continues after the developers with a
      "Name · QA" lane per QA tester holding their assigned QA items; verify the lanes appear only
      during standup, use the QA page's testers, leave the Needs attention counts unchanged, and that
      the setting persists per team and survives export/import.
- [ ] In Development options > Display, verify "Compact cards" is off by default and, when checked,
      each Development card shows a one-line title and one status line (state, PR progress, next step,
      owner, recent change, aging dots, and sprint) on the Developers board, the Sprint view, and the
      QA board, where Recently completed cards are always compact.
- [ ] With compact cards on, hover over and keyboard-focus a card and verify its details open beside
      it (flipping near the window edge) with the full title, tags, PRs, next step, state, sprint,
      owner, last change, and each PR's checks; verify Escape closes them and their links work.
- [ ] Verify the compact cards setting persists per team across a reload and survives export/import.
- [ ] Verify filter combinations use the intended AND/OR semantics and can be cleared.
- [ ] Verify controls are disabled or explain why they are unavailable before PAT/team setup.

## 7. Pull request cards and checks

- [ ] Verify active PRs are queried for the configured repository.
- [ ] Verify completed PRs are included only when they fall within the current sprint window.
- [ ] Verify draft and abandoned PRs are excluded.
- [ ] Verify old completed PRs are excluded.
- [ ] Verify a PR linked to a visible work item does not create a duplicate PR-only card.
- [ ] Verify an unlinked qualifying PR appears as a PR-only card.
- [ ] Verify PR title, ID, repository, author, status, dates, reviewers, and links are accurate.
- [ ] Verify PR links open the correct Azure DevOps PR.
- [ ] Verify policy/build/check rows render success, pending, failure, skipped, and unavailable
      states correctly.
- [ ] Verify reviewer status icons, labels, tooltips, and accessible names are accurate.
- [ ] Verify missing checks or permissions produce a safe, explicit presentation.
- [ ] Verify PR cards participate in quick filtering and are removed/restored correctly.
- [ ] Verify repository changes update PR results and do not retain cards from the old repository.
- [ ] Verify a PR API failure does not prevent work-item cards from loading.

## 8. Quality Assurance page

- [ ] Hover over and keyboard-focus compact cards in the first and last QA columns, including
      Recently completed; verify their details open beside them without clipping, and that a narrow
      window scrolls the board sideways with its column headers aligned.

### Page and board

- [ ] Open Quality Assurance and verify the QA toolbar and selected team, and that the page opens on
      the Testers view (or the view used last, when Settings > Display > "Remember last view" is
      on), with the View toggle listing Testers and then Flow.
- [ ] Verify the loading skeleton mirrors the current view (tester lanes or flow columns, under the
      ribbon and Needs attention bar), then verify the populated board, no-results state, and
      API-error state.
- [ ] Verify the columns read Newly added, Coming up, Ready for QA, Back in development, and Recently
      completed (or the configured equivalents).
- [ ] Verify each item is placed in the correct group based on its state/history/timing.
- [ ] Verify Failed Testing items go to Back in development by default, and Coming up holds only
      current-sprint In Code Review items from the Development board that are not already in QA.
- [ ] Fail one or more work-item `/updates` requests; verify successfully loaded cards remain visible,
      affected cards appear under History unavailable, and a warning offers Refresh recovery.
- [ ] Verify state transitions into and out of QA are represented accurately.
- [ ] Verify recently created items appear in Newly added according to the lookback window.
- [ ] Configure Approved in both Back in development and Newly added. Verify a recently created
      Approved item with no QA-ready history appears only in Newly added.
- [ ] With the same overlapping state groups, verify an item that recently entered Ready for QA
      and returned to Approved appears only in Back in development, including multi-hop transitions.
- [ ] Verify an older Approved item with only recent reassignment does not fall into Newly added
      through the overlapping-state fallback.
- [ ] Verify overlapping development/new states do not override Ready for QA, Recently completed,
      or explicit column tags.
- [ ] Verify tag-grouped cards appear under the intended tags and ungrouped items remain visible.
- [ ] Verify item counts, order, metadata, links, highlights, and empty groups are correct.
- [ ] Verify long and missing metadata is safe and readable.
- [ ] Verify each card shows the person its column follows (who filed it, its owner, its tester, who
      sent it back, or who verified it) and its caption: "Filed Nd ago", "Nd in AFT" (or RFT),
      "Failed testing · Nd" or "Sent back · Nd", "Verified <date>", or "Likely today" for a Coming
      up card whose PR has two approvals and passing required checks.
- [ ] Verify Ready for QA is the widest column and Recently completed the narrowest, and that an
      empty column is a narrow rail running the board's full height with no horizontal color bar;
      verify selecting a rail expands it and Coming up can always be collapsed.
- [ ] Verify the ribbon shows the current sprint with its day and days left, a QA flow bar by column,
      the lookback window, and the next sprint.
- [ ] Verify each Needs attention facet (Failed testing, Bounced 2+ times, Needs a tester, Waiting 3+
      days, Untriaged 3+ days, Arrived late, Recently changed) counts the right cards, and that
      selecting one highlights them, dims the rest, counts matches in the column headers, and Clear
      restores the board.

### Testers and Flow views

- [ ] Verify the Testers view has one lane per QA tester, sorted by name, each with a load bar, an
      "N open · M done" caption, and flags for failed, bounced, waiting, late, and untriaged cards.
- [ ] Verify Coming up and Ready for QA cards without a tester go to Needs a tester, and cards filed,
      sent back, or verified by someone who isn't a tester go to Everyone else, which starts
      collapsed; verify each of those lanes appears only when it has cards.
- [ ] With no testers chosen in QA options, verify testers are inferred from recent QA activity,
      developers who only hand work to QA get no lane, and the info button beside the Testers
      heading opens the QA options Testers tab.
- [ ] For a team without QA activity, verify the view says "No QA testers found in recent QA
      activity." and Choose testers opens the Testers tab; if no chosen tester is on the team, verify
      it says "None of the chosen QA testers are on this team."
- [ ] Choose testers on the QA options Testers tab and verify only they get lanes.
- [ ] Collapse and expand lanes with their chevrons and with Collapse all lanes and Expand all lanes;
      verify a collapsed lane summarizes each column on one line.
- [ ] Verify lanes and columns use the Development board's surfaces and dividers in light and dark
      modes.
- [ ] Switch to Flow and verify the columns show without lanes, run to the bottom of the board, and
      split Ready for QA into Needs a tester and Testing; verify the Flow icon differs from the
      Development page's Sprint icon.

### QA standup

- [ ] Verify Start QA standup has the same color as Start standup on the Development page and sits in
      the same place, after the quick filter.
- [ ] Start QA standup and verify it switches to the Testers view and only testers take a turn (not
      Needs a tester or Everyone else); the speaker's lane is open and highlighted like the
      Development standup, the other lanes collapse, and lane toggles pause.
- [ ] Verify Next and Previous (Ctrl+Down and Ctrl+Up), the speaking-order avatars, Finish, and End;
      verify Most attention first ranks testers by their cards' QA signals and changing the order
      starts again from the top.
- [ ] Verify switching to Flow or changing team ends the QA standup.

### QA quick filter and refresh

- [ ] Filter QA cards by ID, title, type, sprint, tag, and assignee where present.
- [ ] Verify clear, no-match, keyboard-focus, loading, and disabled behavior.
- [ ] Refresh QA data and verify options remain intact and results are not duplicated.
- [ ] Change teams and verify QA results/options switch to the selected team.

### QA Options dialog

- [ ] Open QA Options and verify the Work item types, Timing, Sprints, Tag filters, Column
      classification, Freshness, and Testers tabs.
- [ ] Select all work-item types, a subset, and no types; verify the resulting query/display.
- [ ] Add a general tag filter; verify matching items appear.
- [ ] Reject blank and duplicate general tag filters without corrupting the draft.
- [ ] Remove a general tag filter and verify it no longer applies.
- [ ] Configure each state group: Ready for QA, Recently completed, Back in development, and Newly
      added.
- [ ] Add/remove tags in each state group and verify duplicate/case handling.
- [ ] Configure lookback days with minimum, maximum, zero, decimal, negative, blank, and very large
      values; verify normalization/validation is safe and visible.
- [ ] Toggle current, next, and next-next sprint filters and verify their resolved labels.
- [ ] Select registered sprint paths and add/remove a custom iteration path.
- [ ] Verify unknown/custom paths are preserved or rejected according to the UI behavior.
- [ ] Verify loading states for work-item types, states, and sprints are understandable.
- [ ] Close the dialog after changes and verify the board reloads with the committed options.
- [ ] Reopen after closing and verify all options persist.
- [ ] Verify changes made in the draft do not apply before the dialog’s commit/close action.
- [ ] Reset/clear every option where the UI supports it and verify defaults are restored.
- [ ] Configure card-highlight options and verify each highlight category appears/disappears as
      selected.
- [ ] Verify QA options and highlights are stored per team and survive a reload.

## 9. Backlog page

### Page and header

- [ ] Open Backlog from the navigation rail and verify the header shows the Backlog title, the quick
      filter, the team selector, Manage team, Backlog options, and Refresh.
- [ ] Press Ctrl/Cmd + F on Backlog and verify focus moves to the quick filter (selecting any text in
      it) rather than opening the browser's find.
- [ ] Open Backlog options; verify the placeholder dialog opens, closes with Close and Escape, and
      returns focus to the options button.
- [ ] Verify Manage team opens the selected team's Azure DevOps page in a new tab.

### Data scope

- [ ] Verify only Bugs under the selected team's area path are listed (no PBIs, Tasks, or Features).
- [ ] Verify bugs from every sprint are listed, including the current sprint, other sprints, and bugs
      in a non-sprint iteration.
- [ ] Verify bugs in Closed, Done, Removed, or any other Completed/Removed-category state are not
      listed, and bugs in other states (such as New, Active, and Resolved) are.
- [ ] Compare the list with an equivalent Azure DevOps query; verify no open bug is missing and none
      from another area path appears.
- [ ] With more than 200 open bugs, verify the list is complete and not duplicated.

### Table

- [ ] Verify the columns are, in order: ID, Title, Created Date, Assigned To, State, Iteration Path,
      Severity, Impact, Effort, and Value.
- [ ] Verify the table has no sorting, column filtering, selection, or row-click behavior, and that the
      title links are its only interactive elements.
- [ ] Hover over the rows and verify the row under the pointer is highlighted in both light and dark
      mode, the highlight follows the pointer from row to row, and the pinned column headers never
      highlight.
- [ ] Verify each Title opens the bug in Azure DevOps in a new tab with safe link attributes, and that
      a screen reader announces the new-tab behavior.
- [ ] Verify a bug with tags in Azure DevOps lists them after its title as outlined badges, in
      alphabetical order ignoring case, in both light and dark mode, and a bug without tags shows only
      its title. A numeric tag such as 2026 is shown as written, not as 99+.
- [ ] Verify the tag badges cannot be clicked or focused, and that a screen reader reads them as a
      list named Tags after the title link rather than as part of the link text.
- [ ] Verify a bug with many or long tags wraps them onto further lines within the Title column,
      without widening the table or indenting the wrapped lines.
- [ ] Verify Iteration Path shows only the last two segments of the full path.
- [ ] Verify Impact shows the bug's Priority value, Severity shows the Azure DevOps label, and Effort
      shows the value as entered (an Effort below 4 is shown as entered, though its Value uses 4).
- [ ] Verify an unassigned bug has an empty Assigned To cell, and a missing Severity, Priority,
      Effort, or other value shows a placeholder that screen readers announce as Not set.
- [ ] Verify long titles, assignee names, and iteration paths stay readable without breaking layout.
- [ ] Scroll a long list slowly and verify the column headers stay pinned, with no row text or
      borders visible above them.
- [ ] Narrow the window and verify the table scrolls horizontally inside its own area, with the
      headers staying aligned to their columns.

### Quick filter

- [ ] Type part of a bug's ID, title, tag, created date, assignee, state, iteration path, severity,
      impact, effort, or value, as the table shows it, and verify only the bugs showing that text
      remain (a bug matched by one of its tags still lists all of its tags).
- [ ] Verify matching ignores case and leading or trailing spaces.
- [ ] Verify the filter does not match what the table does not show: the iteration path segments cut
      from the display, the unrounded Value, or the placeholder for a missing value.
- [ ] Verify the remaining bugs keep their ranked order.
- [ ] Verify a filter with no matches shows a message that no bugs match (not the no-open-bugs
      state), and that the clear icon, which appears once text is entered, restores every bug.
- [ ] Verify the quick filter is disabled until a PAT is configured.
- [ ] Refresh, change teams, and switch to another page and back; verify the filter text is kept and
      the list is still narrowed by it.
- [ ] With several hundred open bugs, verify typing in the quick filter stays responsive.

### Value and ranking

- [ ] Verify Severity 1-4 score 10.648, 4.84, 2.2, and 1, and Priority 1-4 score 8, 4, 2, and 1.
- [ ] Verify Value is shown to one decimal place. For example: Severity 1, Priority 1, Effort 4 or
      less shows 213.0; Severity 2, Priority 2, Effort 8 shows 24.2.
- [ ] Verify a bug with no Severity or no Priority is scored as 4, and a bug with no Effort, or an
      Effort below 4, is scored with an Effort of 4 (Severity 4, Priority 4, no Effort shows 2.5).
- [ ] Verify bugs are ordered by exact Value (highest first), then by Severity score (highest first),
      then by Created Date (oldest first).
- [ ] Verify ranking uses the exact Value, not the displayed one: a Severity 4, Priority 1, Effort 6
      bug (13.333) ranks above a Severity 1, Priority 4, Effort 8 bug (13.31), though both show 13.3.
- [ ] Verify bugs with exactly equal Values are ordered by Severity, then Created Date: Severity 2,
      Priority 1, Effort 27.5 and Severity 3, Priority 1, Effort 12.5 both score 14.08, so the
      Severity 2 bug ranks first.
- [ ] Change a bug's Severity, Priority, or Effort in Azure DevOps, Refresh, and verify its Value
      and rank update.

### Loading, errors, and refresh

- [ ] Verify the loading skeleton, populated table, no-open-bugs state, no-team state, no-PAT state,
      and API-error state.
- [ ] Refresh Backlog and verify the results are not duplicated and a recovered error clears.
- [ ] Change teams and verify the list switches to the selected team's bugs.
- [ ] Switch to another page and back; verify the loaded bugs reappear without a new query until
      Refresh is used.

## 10. Persistence and data isolation

- [ ] Reload after every major preference change and verify expected restoration.
- [ ] Verify selected team, view, quick filters, member filter, board view, hidden tags, QA options,
      and color scheme persist according to product behavior.
- [ ] Switch between two teams repeatedly; verify no filters, tags, options, members, work items,
      or PRs bleed between profiles.
- [ ] Remove a team that has saved options; verify orphaned settings are cleaned up or safely
      ignored.
- [ ] Edit local storage/session storage values to invalid JSON/types; verify the app recovers with
      defaults and surfaces errors where appropriate.
- [ ] Verify storage keys do not contain the raw PAT in unintended locations.
- [ ] Verify clearing browser site data returns the app to the clean first-launch state.
- [ ] Open the app in two tabs, change settings/team in one, and verify behavior is safe and
      consistent when the other tab is refreshed.

## 11. Error handling and recovery

- [ ] Disconnect the network before initial load; verify a clear recoverable error.
- [ ] Disconnect during a refresh or team switch; verify prior usable data is not silently mislabeled
      as fresh and retry is possible.
- [ ] Simulate an empty API response for every major resource.
- [ ] Simulate malformed/unexpected API data and verify no blank crash screen occurs.
- [ ] Verify errors identify the affected operation (authentication, team metadata, work items,
      history, PRs, options) without exposing secrets.
- [ ] Verify a failed optional request (history, PR checks, identity, or PR query) does not hide
      successfully loaded core work items.
- [ ] Verify retry/refresh after each error recovers after the service is restored.
- [ ] Restore QA history after a failed `/updates` request and Refresh; verify the unavailable bucket
      clears and cards return to their verified QA columns.
- [ ] Verify aborting or superseding a request does not show a misleading error toast.
- [ ] Verify errors are visible in dark mode and accessible to screen readers.

## 12. Accessibility and keyboard QA

- [ ] Complete the primary workflow using keyboard only.
- [ ] Verify logical tab order through navigation, toolbar controls, cards, dialogs, and forms.
- [ ] Verify visible focus indicators in light and dark modes.
- [ ] Verify Enter/Space activate buttons, links, toggles, tabs, selects, and card actions.
- [ ] Verify Escape closes dismissible dialogs and menus without bypassing required PAT entry.
- [ ] Verify dialogs have names, descriptions where needed, and correct focus trapping.
- [ ] Verify every icon-only control has an accessible name and tooltip where useful.
- [ ] Verify form labels are associated with their inputs and validation errors are understandable.
- [ ] Verify avatars, charts, status icons, and decorative icons have appropriate alt text or are
      hidden from assistive technology.
- [ ] Verify color is not the only indication of state, status, selection, or failure.
- [ ] Verify headings, landmarks, tabs, lists, menus, and buttons expose sensible semantics.
- [ ] Test at 200% zoom and with browser text-size increases without losing critical controls.
- [ ] Test with a screen reader available in the supported browser.

## 13. Responsive, browser, and visual QA

- [ ] Test current supported Chromium, Firefox, and Safari/Edge combinations.
- [ ] Test desktop, tablet, and narrow mobile widths.
- [ ] Verify navigation rail behavior at narrow widths.
- [ ] Verify toolbar controls collapse/hide only when their function remains discoverable.
- [ ] Verify the quick filter remains reachable on narrow screens.
- [ ] Verify board horizontal scrolling, sticky/header alignment, and card readability.
- [ ] Verify dialogs fit the viewport and can scroll internally when content is long.
- [ ] Verify no horizontal page overflow outside intended board scrolling.
- [ ] Test light mode and dark mode at each key viewport.
- [ ] Test with browser zoom at 80%, 100%, 125%, and 200%.
- [ ] Verify reload and deep-link entry work from a cold browser cache.
- [ ] Verify static asset loading from the deployed production build, including SVG icons.
- [ ] Check for visual regressions: clipped text, overlapping controls, incorrect z-index, broken
      focus rings, low contrast, and layout shifts.

## 14. Performance and reliability

- [ ] Record cold-load time and time to first usable shell.
- [ ] Record time from PAT/team selection to populated board with representative data.
- [ ] Test with a large team and a large work-item/PR result set.
- [ ] Verify typing in quick filters remains responsive with many cards.
- [ ] Verify repeated refreshes do not progressively slow the app or duplicate requests/cards.
- [ ] Verify switching views/teams does not accumulate stale subscriptions or visible memory growth.
- [ ] Verify skeletons and progress indicators appear for slow requests.
- [ ] Verify browser back/forward and reload do not trigger request loops.
- [ ] Verify API throttling is handled without an unbounded retry loop.

## 15. Security and privacy

- [ ] Confirm PAT input is always masked.
- [ ] Confirm PAT is never rendered in DOM text, URLs, downloaded team exports, error messages, or
      logs.
- [ ] Confirm remembered and session-only storage behavior matches the product explanation.
- [ ] Confirm external links use safe new-tab attributes and do not grant the opener access.
- [ ] Confirm work-item, PR, and team links use the configured organization/project/repository and
      cannot be redirected by ordinary field input.
- [ ] Enter HTML/script-like strings in team fields, tags, titles, and filter text; verify they are
      rendered as text rather than executed.
- [ ] Import JSON containing HTML/script-like strings; verify they remain inert.
- [ ] Verify errors do not disclose PATs, authorization headers, or sensitive response payloads.
- [ ] Verify a cleared PAT cannot be used by a pending or newly opened request.
- [ ] Verify browser storage contains only the intended local application data.

## 16. Regression exit criteria

- [ ] Release-blocking smoke test passes.
- [ ] All changed-feature checks pass.
- [ ] No Critical or High defect remains open without explicit approval.
- [ ] All known Medium/Low defects have an owner or documented acceptance.
- [ ] Authentication, team isolation, persistence, and error-recovery checks have evidence.
- [ ] At least one populated, empty, error, narrow-width, dark-mode, and keyboard pass is complete.
- [ ] Test record is completed and linked defects/screenshots/logs are attached.
- [ ] QA sign-off:
- [ ] Engineering sign-off:
