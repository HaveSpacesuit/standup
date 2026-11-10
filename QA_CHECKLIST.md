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
- [ ] Triage opens between Quality Assurance and Backlog and lists unfinished items tagged Triage.
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

## Triage

- [ ] Confirm the default queue matches whole `Triage` tags, case-insensitively, across work-item
      types under the selected team's area and its descendants; similar tags such as PreTriage do not match.
- [ ] Confirm Completed/Removed items are excluded using each type's state categories, even when
      another type uses the same state name differently. Resolved-category items remain eligible.
- [ ] Enable new bugs and confirm only Bugs still in their type's initial state (the first
      Proposed-category state, such as New or a custom name) qualify. Approved bugs are excluded
      unless tagged. No creation-date cutoff should apply.
- [ ] Select or enter an excluded iteration path. Confirm it and its descendants exclude untagged
      new bugs, while similarly prefixed sibling paths do not; tagged items still qualify there.
- [ ] Turn new bugs off; confirm the excluded paths field is disabled with its saved paths still
      shown, changing them does not reload the queue, and turning new bugs back on restores them.
- [ ] In Triage options, add tags with **Add** and with Enter, including `a; b` and a duplicate in
      another case; remove a pill; save with a typed but not-yet-added tag and confirm it is kept.
- [ ] Verify a tagged new bug appears once, and that items are ordered oldest created first.
- [ ] Verify the Work item column matches Backlog's Bug column (ID, linked title with new-tab icon,
      wrapping tag pills) after the type icon, and that there is no separate Tags column.
- [ ] Verify the other columns match Backlog's order and formatting: Severity chips, Impact bars,
      Effort, Age, Sprint labels (This sprint, Next sprint, Backlog), State badges, and Assigned to
      (muted Unassigned), then Created by and Parent. Missing Severity/Impact/Effort are flagged on
      Bugs and dashed on other types; there is no Matched by column.
- [ ] Verify type icons, creator, effort (including zero), and parent ID/title; item and parent links
      open Azure DevOps. Inaccessible parents retain known IDs/links and show an explicit warning.
- [ ] Filter by creator, parent, type, tag and sprint label; test `/` and Ctrl/Cmd+F and clearing the filter.
- [ ] Disable both rules; confirm the No Triage rules card, that its button opens Triage options, and
      that no Triage query runs. Check the loading skeleton, the Nothing to triage card (naming the
      enabled rules), the quick-filter no-match text, failed query/retry, and unavailable metadata states.
- [ ] Confirm the navigation rail and page header use the category icon for Triage.
- [ ] Switch teams during loading and with options open; confirm data and settings stay isolated.
- [ ] Save options, reload, export/import, and delete a team; verify persistence and cleanup. Import
      an older export without Triage options and confirm defaults.
- [ ] Confirm unreadable storage and failed saves show errors, retain stored data, and recover only
      after saving replacement options.
- [ ] Confirm manual/automatic refresh updates the active queue and its sync time without duplicate
      requests or refreshing Backlog; test narrow layouts and horizontal table scrolling.

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
      Developers, Testers, List, and Rows as the default views.
- [ ] With it off, switch Development to Sprint, Quality Assurance to Flow, Backlog to Map, and Tests
      to Overlay, reload, and verify they open on Developers, Testers, List, and Rows.
- [ ] Turn it on, reload, and verify Development opens on Sprint, Quality Assurance on Flow,
      Backlog on Map, and Tests on Overlay (the views used last, even though they were chosen while
      the setting was off).
      Switch back, reload, and verify the new choices are remembered and the setting itself persists.
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
- [ ] Scroll a board taller than the window to the bottom and verify the column dividers, the Blocked
      tint, and the Blocked rail run all the way down instead of stopping where the first screen
      ended.
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
- [ ] Hover over and keyboard-focus Development and QA cards, default and compact; verify the card
      stays in place (no lift or jump) while its shadow deepens and a dimmed or faded card returns to
      full strength.
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
- [ ] On Development and QA cards, verify an unassigned-to-person change says "Assigned", a change
      between people says "Reassigned", and clearing the assignee says "Unassigned". Check the badge
      and tooltip, and verify a state change in the same update still takes priority.
- [ ] Assign a tester to a Development card in a testing state and verify the card, its compact line,
      and its hover card's Last change say "Tester assigned", never "Reassigned".
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
      empty column is a narrow rail running the board's full height, headed like Development's
      empty Blocked rail: a short color bar over a green check and 0. Collapse Coming up while it
      has cards and verify its rail shows the count without the check. Verify selecting a rail
      expands it and Coming up can always be collapsed.
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
      modes, and that the dividers run to the bottom of the board after scrolling down a tall list
      of lanes.
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

- [ ] Open Backlog from the navigation rail and verify the header shows the Backlog title, the bug
      count, the quick filter, a blue Plan a sprint button, the View toggle (List and Map, with List
      pressed), the team selector, Manage team, Backlog options, and Refresh.
- [ ] Verify the count reads "N bugs" (or "1 bug"), changes to "N of M bugs" while the quick filter
      hides some, and is absent while loading, after an error, and without a team.
- [ ] Verify Refresh spins and the header says Syncing… while the backlog loads, then "Synced just
      now"; the label ages over time, and switching pages and back without Refresh does not reset it.
- [ ] Press Ctrl/Cmd + F on Backlog and verify focus moves to the quick filter (selecting any text in
      it) rather than opening the browser's find.
- [ ] Open Backlog options; verify the dialog has a Display section with Compact rows, a Value tiers
      section, a Needs attention section, and a Plan a sprint section, closes with Close and Escape,
      and returns focus to the options button.
- [ ] Verify Compact rows matches Compact cards in Development options: turning either on turns on
      both, and the setting persists per team across a reload.
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

- [ ] Verify the columns are, in order: # (rank), Value, Bug, Severity, Impact, Effort, Age, Sprint,
      State, and Assigned to.
- [ ] Verify # numbers the bugs 1, 2, 3… in ranked order, and a bug keeps its number while the quick
      filter hides others; a screen reader reads the header as Rank.
- [ ] Verify Value shows a sort icon in its header, and its header tooltip explains the order and the
      formula.
- [ ] Verify each Value has a short meter: 213.0 fills it, 2.5 leaves a sliver, and the bars grow in
      equal steps per Severity or Impact level rather than in proportion to the number. Verify the
      meter is readable in light and dark mode and is not announced by a screen reader.
- [ ] Hover a Value and verify the tooltip shows the sum in bold (such as "Value 96.8 = 4.8 × 8 ÷ 4 ×
      10") with one line each for Severity, Impact, and Effort; that its numbers have at most one
      decimal, with none for whole numbers; that it notes any assumed or raised input; and that it
      says nothing about tie-breaks.
- [ ] Verify the table has no sorting, column filtering, selection, or row-click behavior, and that the
      title links and the tier header buttons are its only interactive elements outside Plan a sprint.
- [ ] Hover over the rows and verify the bug row under the pointer is highlighted in both light and
      dark mode, the highlight follows the pointer from row to row, and the pinned column headers and
      tier headers never highlight.
- [ ] Verify each Bug cell shows the ID in bold before the title, and each title opens the bug in
      Azure DevOps in a new tab with safe link attributes, and that a screen reader announces the
      new-tab behavior.
- [ ] Verify a bug with tags in Azure DevOps lists them after its title as outlined badges, in
      alphabetical order ignoring case, in both light and dark mode, and a bug without tags shows only
      its title. A numeric tag such as 2026 is shown as written, not as 99+.
- [ ] Verify the tag badges cannot be clicked or focused, and that a screen reader reads them as a
      list named Tags after the title link rather than as part of the link text.
- [ ] Verify a bug with many or long tags wraps them onto further lines within the Bug column,
      without widening the table or indenting the wrapped lines.
- [ ] Verify Age shows how long ago each bug was created in coarsening units (13d, 2w, 4mo, 1y), its
      tooltip shows the created date, and a screen reader reads the created date.
- [ ] Verify Sprint reads This sprint (highlighted) for the current sprint, Next sprint for the
      earliest upcoming one, a later sprint's name, "Sprint N · ended" with a warning icon for a past
      sprint, and Backlog for any other iteration; hover each to see the sprint dates or the path.
- [ ] Verify a state of three or more words, such as Available for Testing, shows its abbreviation
      (AFT) with the full state in its tooltip, and a screen reader reads the full state.
- [ ] Verify New is muted text and every other state is an outlined badge, in light and dark mode.
- [ ] Verify Severity shows a chip such as "S1 · Critical": red for 1, amber for 2, neutral for 3,
      and muted for 4. A missing Severity shows a dashed amber Not set chip whose tooltip says the
      Value counts it as 4 - Low; a severity the Value cannot read is shown as written with a tooltip.
- [ ] Verify Impact shows four signal bars beside the bug's Priority (Impact 1 fills all four, Impact
      4 fills one), and its tooltip says how many users hit the bug and its score.
- [ ] Verify Effort shows the value as entered; an Effort below 4 has a dotted underline and a
      tooltip saying the Value counts it as 4.
- [ ] Verify Assigned to shows the assignee's avatar (or initial) and name, and an unassigned bug
      shows Unassigned in muted text. A missing Priority or Effort shows a dashed ? whose tooltip
      says what the Value assumes, which screen readers announce as Not set.
- [ ] Turn on Compact rows and verify each bug fits on one line: a long title ends in an ellipsis
      with the full title in its tooltip, only the first tag shows with "+N" listing the rest in its
      tooltip, and Assigned to shows only the avatar with the name in its tooltip. Verify a screen
      reader still reads every tag and the assignee's name.
- [ ] Verify long titles, assignee names, and sprint names stay readable without breaking layout.
- [ ] Scroll a long list slowly and verify the column headers stay pinned, with no row text or
      borders visible above them.
- [ ] Narrow the window and verify the table scrolls horizontally inside its own area, with the
      headers staying aligned to their columns.

### Value tiers

- [ ] Verify the bugs are grouped under Top (Value 80+), High (30–80), Medium (12–30), and Low (under
      12) headers in that order, each tier in ranked order, the ranks running on across tiers, and a
      tier with no bugs left out. A bug showing 80.0 is in Top.
- [ ] Verify each tier header shows its name, bug count, Value range, and "Σ N pts", with
      "+ M unestimated" when some of its bugs have no Effort; a screen reader reads the count as
      "N bugs" and the header as the name of its rows.
- [ ] Verify each bug row has a stripe beside the rank in its tier's color (Top strongest, fading
      through High and Medium to a neutral Low), Low's Value meters are neutral, and both are readable
      in light and dark mode.
- [ ] Scroll a long list and verify each tier header stays pinned just under the column header, with
      no gap or overlap, until the next tier's header replaces it, and that no row content (such as a
      severity chip or tag) shows through or above it.
- [ ] On first visit verify Low is collapsed, showing its header with "Show N"; verify Show N and the
      chevron each expand it, focus stays on the chevron, and the chevron collapses any tier again.
- [ ] Collapse a tier, then Refresh and switch teams; verify it stays collapsed. Visit another page
      and come back; verify the tiers reset to the default.
- [ ] Type a quick filter that matches only bugs in a collapsed tier; verify the tier header counts
      the matches and Show N reveals them.
- [ ] In Backlog options > Value tiers, change a threshold and verify the list regroups at once.
      Enter thresholds out of order or empty or 0; verify the conflicting fields are marked, a message
      explains the problem, and the tiers keep the last valid thresholds.
- [ ] Turn Start with the Low tier collapsed off and on; verify Low expands and collapses at once.
- [ ] Reload and verify the thresholds and the Low setting persist per team; export the team, import
      it in a clean profile, and verify they carry over. Import an export made before Value tiers and
      verify the defaults apply.

### Summary ribbon and Needs attention

- [ ] Verify a one-line ribbon above the table shows, for every open bug of the team: the count, the
      total Effort with "+ N unestimated", the Value mix as a bar with a count per tier, the Severity
      mix (S1–S4, with "N not set" in amber when some have none), Planned ("N this · N next · N
      ended", with ended in amber), "+N new this sprint", and the median age. Check the numbers
      against the list.
- [ ] Hover or Tab to each ribbon group and verify its tooltip gives the detail: the per-tier counts
      with their Value ranges, the per-severity counts, the sprint names, and the current sprint's
      start date.
- [ ] Type a quick filter and verify the ribbon still describes the whole backlog.
- [ ] With a team whose sprints are not set up, verify the ribbon leaves out Planned and new this
      sprint.
- [ ] Narrow the window and verify the ribbon stays on one line, dropping Severity first, then new this
      sprint, the median age, Planned, and the Value bar, without clipping text.
- [ ] Verify the Needs attention bar lists Severe, not planned; In an ended sprint; Missing severity or
      impact; No effort; and Older than 1 year, each with the count of listed bugs that show it, and a
      chip with no bugs is disabled.
- [ ] Verify Severe, not planned counts S1 bugs, and S2 bugs with Impact 1, that are not in this
      sprint or the next (a sprint after next still counts); Missing severity or impact counts a
      severity the Value cannot read; and Older than 1 year counts only bugs still in New.
- [ ] Type a quick filter and verify the chip counts follow it.
- [ ] Press a chip and verify it shows as pressed, the other bugs dim but stay in place, each tier
      header adds "· N match" (accented only when N is above 0, and counted in a collapsed tier too),
      and the bar says "N of M bugs highlighted · <chip>". Hover or Tab into a dimmed row and verify
      it returns to full strength. Verify a screen reader announces the highlighted count and reads
      Highlighted on the matching rows.
- [ ] Press the chip again, or Clear, and verify the highlight is removed. Leave the page and come
      back; verify no chip is pressed.
- [ ] In Backlog options > Needs attention, change the age to 18 and verify the chip reads "Older than
      18 months" and recounts; 24 reads "Older than 2 years". Enter 0, 121, 2.5, or nothing and verify
      an error explains the range and the chip keeps the last valid age.
- [ ] Reload and verify the age persists per team; export and import the team and verify it carries
      over, and an export made before this option imports with 12 months.
- [ ] Verify the ribbon, the bar, the pressed chip, and dimmed rows are readable in light and dark
      mode, and the loading skeleton shows strips in place of the ribbon and the bar.

### Plan a sprint

- [ ] Verify Plan a sprint in the header looks like Start standup on Development (a filled primary
      button with an icon) in light and dark mode, is disabled while loading, after an error, and with
      no open bugs, and that its tooltip explains it.
- [ ] Press Plan a sprint; verify the button leaves the header, a strip opens under Needs attention
      with focus in Budget, and the table gains a checkbox column before # and a Running column after
      Effort, with the tier headers still spanning the table.
- [ ] Press Close at the end of the strip; verify the strip and both columns go away, Plan a sprint
      returns with focus on it. Open it again and verify the picks and budget are as you left them.
- [ ] With the default budget of 10 and both skips on, verify the planner checks, in ranked order,
      each bug that fits what is left of the budget, passing over bugs in this sprint or the next,
      bugs without an Effort, and bugs too big to fit, while a smaller bug further down still fills the
      gap.
- [ ] Verify picked rows are tinted, Running shows each pick's running total ("2 pts", "5 pts"…), a
      bug passed over above the last pick says why (This sprint, Next sprint, No effort, Too big, or
      Unchecked), and bugs below the last pick show nothing.
- [ ] Verify a dashed cut line under the last pick reads "Cut line · N of B pts · M bugs above", each
      tier header adds "· N picked", and the strip reads "N bugs", "N of B pts" with a meter, and the
      picks' total Value. Verify a screen reader reads the summary, including "Total Value", and the
      checkboxes as "Pick <ID>".
- [ ] Type a budget, and use − and +; verify the plan updates at once and − is disabled at 1. Enter 0,
      1000, 2.5, or nothing and verify the field is marked with an error explaining the range, the plan
      keeps the last valid budget, and leaving the field restores it.
- [ ] Uncheck a picked bug; verify its checkbox is ringed, it reads Unchecked, and the planner fills
      the space with later bugs. Check a planned or too-big bug; verify it is ringed and picked even
      over budget, and the strip shows "over by N" in amber with an amber meter.
- [ ] Uncheck a hand pick, or check a bug unchecked by hand; verify the ring goes away and the planner
      decides again. Press Reset and verify every hand choice is cleared, the budget returns to the
      default, and Reset is disabled.
- [ ] Turn Skip unestimated off; verify bugs without an Effort can be picked, count as 4 pts, and the
      strip shows "N without effort" with a tooltip. Turn Skip planned off; verify bugs in this sprint
      or the next can be picked.
- [ ] Type a quick filter and press a Needs attention chip; verify the planner picks only from the
      highlighted bugs, and the other rows' checkboxes are disabled with a tooltip saying why.
- [ ] Press Copy list and paste into a spreadsheet; verify one row per pick in ranked order with the
      ID, title, Effort, and Value, and the button says Copied. Verify it is disabled with no picks.
- [ ] Refresh with picks made; verify Plan a sprint stays out of the header while the backlog reloads,
      and the picks and budget are kept. Switch teams and verify the plan
      starts over. Leave the page and come back; verify the plan is closed and Plan a sprint is back.
- [ ] In Backlog options > Plan a sprint, verify the Default budget (10), Skip bugs already in this
      sprint or the next (on), and Skip bugs without an Effort (on). Change the default budget and
      verify an unedited strip budget follows it; enter 0, 1000, or 2.5 and verify an error explains
      the range. Verify the skip checkboxes and the strip's checkboxes change together.
- [ ] Reload and verify the plan options persist per team; export and import the team and verify they
      carry over, and an export made before them imports with the defaults.
- [ ] Verify Azure DevOps is unchanged by any of the above.
- [ ] Verify the strip, the tint, the hand-pick ring, the cut line, and the over-budget meter are
      readable in light and dark mode; that the strip wraps cleanly as the window narrows; and that
      compact rows keep their height with the checkboxes.

### Value map

- [ ] Press Map in the View toggle; verify the table gives way to a bubble chart with effort across
      and Severity score × Impact score up (both log scales), and a side panel. Verify the summary
      ribbon, Needs attention, and Plan a sprint stay above it, and List brings the table back.
- [ ] Verify bugs with the same effort, severity, and impact share one bubble showing their count;
      an Effort below 4 shares the bubble of an Effort of 4; and a bubble whose Value assumed a
      missing or unreadable input has a dashed amber outline, just left of its known neighbor.
- [ ] Verify bubble colors match the Value tiers, the diagonal bands and dashed lines follow the
      tier thresholds (change them in Backlog options and verify the map redraws), the effort labels
      are the team's own efforts starting at "≤4", and the corners read Quick wins, Big bets,
      Fill-ins, and Reconsider.
- [ ] Hover a bubble and verify its tooltip shows only the bug count and Value, Effort, Severity
      score, Impact score, "Uses an assumed default" for a dashed bubble, and "Click to list these
      bugs in the side panel" ("…show this bug…" for one bug); no bug titles. Select it and verify
      the hint reads "Click again to go back to the reading guide".
- [ ] With nothing selected, verify the panel shows Reading the map, the key, and Top 10 by Value.
      Select a bubble; verify it is marked, the panel lists its bugs with links that open in a new
      tab, and an assumed bubble says its position is a guess. Verify selecting it again, Escape,
      and Back to the reading guide each return to the guide.
- [ ] Tab into the map; verify one bubble (the highest Value) takes focus with a visible ring and
      its tooltip, arrow keys, Home, and End move in Value order, Enter or Space selects, and the
      next Tab leaves the map. Verify a screen reader reads each bubble's bug count and Value, and
      whether it is picked or outside the filter.
- [ ] Type a quick filter or press a Needs attention chip; verify every bubble stays in place, those
      without a match fade (and come back partway on hover or focus), and the panel reads "Top N by
      Value · filtered". With no matches, verify the panel says No bugs match.
- [ ] Turn on Plan a sprint; verify bubbles holding a pick are ringed, the key adds Picked in Plan a
      sprint, and picked bugs read Picked in the panel.
- [ ] Refresh with a bubble selected; verify the map's skeleton (a plot and a side panel) stands in,
      then the bubble is still selected. Switch teams and verify nothing is selected.
- [ ] Narrow the window below about 900 px; verify the panel moves under the plot, the key runs
      across, and the page does not scroll sideways. Verify the map is legible in light and dark mode.
- [ ] Verify Backlog reopens on List after a reload, or on Map when Settings > Display > "Remember
      last view" is on and Map was used last.

### Quick filter

- [ ] Type part of a bug's ID, value, title, tag, severity as its chip reads (S1 or Critical),
      impact, effort, sprint label, state (abbreviated or full), or assignee (or Unassigned), as the
      table shows it, and verify only the bugs showing that text remain (a bug matched by one of its
      tags still lists all of its tags, and in compact rows a tag behind "+N" still matches).
- [ ] Verify matching ignores case and leading or trailing spaces.
- [ ] Verify the filter does not match what the table does not show: the iteration path behind a
      Sprint label, the created date or age, the rank, the unrounded Value, the Severity picklist
      text (1 - Critical), or the mark for a missing value.
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

## 10. Tests page

### Page and header

- [ ] Verify the toolbar shows the Tests title (the page's only heading), Test options, "Synced …",
      and Refresh; Refresh spins while loading and is disabled until a PAT and a pipeline exist.
- [ ] Verify the intro line names the lookback days, and "How to read this chart" explains the
      executed-tests ratio and the log scale, plus dashed gaps (Overlay) or the usual band, exception
      colors, hatching, and the tests-ran lane (Rows); in Calendar it reads "How to read this
      calendar" and explains the cell colors, hatching, and outlines.
- [ ] Verify the empty state points to Test options when no pipeline is configured.
- [ ] Verify the toolbar shows "N pipelines"; hovering or focusing it lists each pipeline's status.
- [ ] Verify the View toggle appears only once a PAT and a pipeline exist, opens on Rows, and
      switching to Overlay or Calendar changes the chart, the intro line, "How to read this chart",
      and the loading skeleton.

### Health strip

- [ ] Verify one tile per pipeline with runs, at most four per row, each showing its short name,
      stage, latest pass rate, change vs median, sparkline, and the last run's day and counts.
- [ ] Verify the status chips: Usual (neutral), Below usual (amber), Sharp drop (red), Fewer tests
      (amber, with "N of ~M tests"), and No recent runs (amber, "N working days ago" and a hatched
      sparkline tail). Hover each chip and verify its tooltip explains the status.
- [ ] Click a tile and verify the other tiles dim, the other lines fade, the chart shades the
      focused pipeline's usual range, and hover snaps only to its runs. Click again or press Esc to
      clear focus.
- [ ] In Test options > Options, change "Flag no recent runs after" and "Flag fewer tests below",
      tab away, and verify the statuses update and the values persist after reload; invalid values
      show an error and keep the last valid value.
- [ ] In Test options > Pipelines, set a Short name and verify the tile and chart tooltip use it;
      clear it and verify the default returns.
- [ ] Verify the tiles, chips, and sparklines are readable in dark mode.

### Rows view

- [ ] Verify one row per pipeline on a shared time axis, each with a neutral line, a shaded usual
      range, and its latest pass rate at the right edge; only below-usual (amber), sharp-drop (red),
      and fewer-tests (hollow amber) runs are colored.
- [ ] Verify each row label shows the short name, stage, latest pass rate, and date (or "N working
      days ago" / "N of ~M tests"), with a status-colored left edge.
- [ ] Verify a pipeline with no recent runs hatches the idle days with "No runs for N working days".
- [ ] Verify a "Ran" lane under each row has one bar per day with runs, a dashed usual line labelled
      "~N" at the right edge, and an amber bar on days whose smallest run had fewer tests than usual.
- [ ] For a pipeline that skips many tests (for example WebView), compare a run's Ran count with
      its Azure DevOps Tests tab and verify skipped (Not executed) and Not impacted tests are not
      counted in Ran, the pass rate, or the lane.
- [ ] Verify the selected team's sprint names run along the top with a line at each sprint start,
      and the current sprint reads "Sprint N · Day X of Y"; with no sprints loaded, no labels show.
- [ ] Hover a row and verify the crosshair appears on every row with the day in the header, and each
      pill shows the day's lowest run ("99.2% · lowest of 2"), "no run", or "not run yet" for today;
      the lane shows that day's smallest run as "N tests" (amber when fewer).
- [ ] Click a row and verify run details open for the hovered day's lowest run; click the same day
      again and verify they close.
- [ ] Verify a triangle marks each run with a change above its row, in the change's color, with its
      title on hover; click one and verify the change is selected in the Changes panel.
- [ ] Click a row label (or tile) and verify the other rows fade; click again or press Esc to clear.
- [ ] Verify "Show at most one result per pipeline per day" changes only the Overlay.
- [ ] Verify the rows, band, pills, hatching, and tests-ran lane are readable in dark mode.

### Overlay chart

- [ ] Verify each pipeline has its own color and marker shape, and no line is green or red.
- [ ] Verify runs are joined by straight lines and gaps of 4 or more days are dashed.
- [ ] Verify the x-axis marks Mondays and weekends are shaded.
- [ ] Hover near (not exactly on) a point and verify the tooltip snaps to it, leads with
      "N failed of M", names any changes on the run, and ends with "Click for run details";
      clicking opens run details with a dashed line and ring on the run.
- [ ] Verify runs with changes have a colored ring that fades with its line when another pipeline
      is focused.
- [ ] With daily Average results on, verify a multi-run day's tooltip says it has no single run.
- [ ] Verify the chart is readable in dark mode, including the third (violet) series.

### Calendar view

- [ ] Verify one row of day cells per pipeline, with the same row labels as Rows; usual days are
      neutral, below-usual days amber, sharp drops red, and fewer-tests days hatched amber.
- [ ] On a day with several runs, verify the cell takes the worst one (a sharp drop outranks fewer
      tests, which outranks below usual) and its tooltip says "worst of N runs".
- [ ] Verify weekends are narrower and empty for pipelines that never run on weekends, and get
      dashed "no run" outlines for one that does.
- [ ] Verify a weekday without a run has a dashed gray outline, today has a dashed accent outline
      until the pipeline reports (a pipeline with no recent runs shows today as missed), and the
      first day of the window never shows a "no run" outline.
- [ ] Verify the selected team's sprint names and lines run along the top with Mondays dated
      beneath them, and a sprint that starts midweek doesn't strike through a date.
- [ ] Hover a cell and verify the tooltip shows the day, pipeline, the run's class, its pass rate and
      counts ("(usually ~N)" when fewer tests ran), any changes, and "Click for run details".
- [ ] Click a cell and verify run details open for that day's worst run and the cell is outlined;
      click it again and verify they close. Select a change and verify its day's cell is outlined.
- [ ] Click a row label (or tile) and verify the other rows fade; click again or press Esc to clear.
- [ ] Verify the key below the calendar names every cell, and the loading skeleton matches the
      calendar's rows, cell sizes, and weekend gaps.
- [ ] Verify the cells, hatching, and outlines are readable in light and dark mode.

### Changes panel and run details

- [ ] Verify the Changes panel sits beside the chart with a count, and below it when the page is
      narrower than 900px.
- [ ] Verify changes are grouped into This sprint (with the sprint label) or Last 2 weeks without
      sprints, and Earlier, newest first, each with an icon, title, date, and pipeline · stage ·
      detail line.
- [ ] Verify a sharp drop is listed once per episode and its recovery names the lowest run; failures
      after 5+ clean runs read "First failures in N days"; a streak of fewer-tests runs is one change
      ("N runs in a row"); only the latest run is listed as Below usual; No recent runs appears on
      the day the pipeline was flagged.
- [ ] Focus a pipeline and verify only its changes are listed with "Show all"; with none, verify
      "No changes for … in the last N days".
- [ ] Select a change and verify run details open at the top of the panel with the change, Passed /
      Failed / Ran counts, pass rate vs the previous run, usual range, and Open in Azure DevOps
      (new tab).
- [ ] In the browser network tools, verify loading the page makes no `resultsbypipeline` or
      `testresults/runs/{id}/results` request, and opening a run with failures does (a build run
      reads `resultsbypipeline`; a release run reads `resultdetailsbyrelease` grouped by test run,
      then each failing test run's results).
- [ ] Verify failing tests show up to 8 names with New or Again (New first) and "+N more"; hover a
      long name for its full name and test ID; reopen the run and verify no new request is made.
- [ ] Open a release pipeline's run with failures and verify its failing tests load.
- [ ] Press Esc with run details open and verify they close but focus stays; press Esc again and
      verify focus clears.
- [ ] Verify the panel, markers, rings, and chips are readable in dark mode.

## 11. Persistence and data isolation

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

## 12. Error handling and recovery

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

## 13. Accessibility and keyboard QA

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

## 14. Responsive, browser, and visual QA

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

## 15. Performance and reliability

- [ ] Record cold-load time and time to first usable shell.
- [ ] Record time from PAT/team selection to populated board with representative data.
- [ ] Test with a large team and a large work-item/PR result set.
- [ ] Verify typing in quick filters remains responsive with many cards.
- [ ] Verify repeated refreshes do not progressively slow the app or duplicate requests/cards.
- [ ] Verify switching views/teams does not accumulate stale subscriptions or visible memory growth.
- [ ] Verify skeletons and progress indicators appear for slow requests.
- [ ] Verify browser back/forward and reload do not trigger request loops.
- [ ] Verify API throttling is handled without an unbounded retry loop.

## 16. Security and privacy

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

## 17. Regression exit criteria

- [ ] Release-blocking smoke test passes.
- [ ] All changed-feature checks pass.
- [ ] No Critical or High defect remains open without explicit approval.
- [ ] All known Medium/Low defects have an owner or documented acceptance.
- [ ] Authentication, team isolation, persistence, and error-recovery checks have evidence.
- [ ] At least one populated, empty, error, narrow-width, dark-mode, and keyboard pass is complete.
- [ ] Test record is completed and linked defects/screenshots/logs are attached.
- [ ] QA sign-off:
- [ ] Engineering sign-off:
