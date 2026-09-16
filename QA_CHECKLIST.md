# Manual QA Checklist

This checklist covers the browser-based Standup dashboard end to end. It is intended for
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
- [ ] Quick filtering changes visible cards and clearing it restores them.
- [ ] Refresh reloads data and does not duplicate cards.
- [ ] Settings can be reopened, closed, and saved without losing configuration.
- [ ] The app can be reloaded and restores the expected PAT/team/preferences according to storage mode.
- [ ] No critical path is blocked by a loading spinner, empty state, or recoverable API error.

## 1. Initial load and application shell

- [ ] Open the app in a clean browser profile with no storage.
- [ ] Verify the page title, favicon/static assets, layout, and initial background render correctly.
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
- [ ] Verify the current view is visually and programmatically distinguishable.
- [ ] Verify the app does not leak the PAT into visible text, query strings, links, or console logs.

## 2. PAT and Azure DevOps access

- [ ] Save a valid PAT from the first-launch dialog and verify the dialog closes.
- [ ] Enter an invalid PAT and verify the error is surfaced clearly without a false success state.
- [ ] Use a PAT lacking each required scope where practical; verify the API error is actionable.
- [ ] Open Settings and save a replacement PAT.
- [ ] Clear the PAT; verify credentials are removed, data-dependent controls are disabled, and the
      access dialog/notice returns as designed.
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

## 4. Navigation and page lifecycle

- [ ] Navigate between Development/Team Assignments and Quality Assurance.
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

### Assignment view

- [ ] Select Assignment view and verify work items are grouped by assignee.
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

### Sprint view

- [ ] Select Sprint view and verify items are grouped by sprint/iteration as intended.
- [ ] Verify current, past, future, and rollover sprint labels are correct.
- [ ] Verify switching between Assignment and Sprint views preserves the selected team and filters.
- [ ] Verify changing the sprint scope updates cards and summary counts without stale cards.
- [ ] Verify effort-flow/sprint summary details open when available.
- [ ] Verify effort-flow chart labels, legends, values, empty state, and tooltip behavior.
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

### Page and board

- [ ] Open Quality Assurance and verify the QA toolbar, board title, and selected team.
- [ ] Verify QA loading skeleton, populated board, no-results state, and API-error state.
- [ ] Verify cards are grouped into Ready for QA, Recently completed, Needs follow-up, and Newly
      added (or the configured equivalents).
- [ ] Verify each item is placed in the correct group based on its state/history/timing.
- [ ] Verify state transitions into and out of QA are represented accurately.
- [ ] Verify recently created items appear in Newly added according to the lookback window.
- [ ] Verify tag-grouped cards appear under the intended tags and ungrouped items remain visible.
- [ ] Verify item counts, order, metadata, links, highlights, and empty groups are correct.
- [ ] Verify long and missing metadata is safe and readable.

### QA quick filter and refresh

- [ ] Filter QA cards by ID, title, type, sprint, tag, and assignee where present.
- [ ] Verify clear, no-match, keyboard-focus, loading, and disabled behavior.
- [ ] Refresh QA data and verify options remain intact and results are not duplicated.
- [ ] Change teams and verify QA results/options switch to the selected team.

### QA Options dialog

- [ ] Open QA Options and verify the Work item types, Timing, and Sprints tabs.
- [ ] Select all work-item types, a subset, and no types; verify the resulting query/display.
- [ ] Add a general tag filter; verify matching items appear.
- [ ] Reject blank and duplicate general tag filters without corrupting the draft.
- [ ] Remove a general tag filter and verify it no longer applies.
- [ ] Configure each state group: Ready for QA, Recently completed, Needs follow-up, and Newly
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

## 9. Persistence and data isolation

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

## 10. Error handling and recovery

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
- [ ] Verify aborting or superseding a request does not show a misleading error toast.
- [ ] Verify errors are visible in dark mode and accessible to screen readers.

## 11. Accessibility and keyboard QA

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

## 12. Responsive, browser, and visual QA

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

## 13. Performance and reliability

- [ ] Record cold-load time and time to first usable shell.
- [ ] Record time from PAT/team selection to populated board with representative data.
- [ ] Test with a large team and a large work-item/PR result set.
- [ ] Verify typing in quick filters remains responsive with many cards.
- [ ] Verify repeated refreshes do not progressively slow the app or duplicate requests/cards.
- [ ] Verify switching views/teams does not accumulate stale subscriptions or visible memory growth.
- [ ] Verify skeletons and progress indicators appear for slow requests.
- [ ] Verify browser back/forward and reload do not trigger request loops.
- [ ] Verify API throttling is handled without an unbounded retry loop.

## 14. Security and privacy

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

## 15. Regression exit criteria

- [ ] Release-blocking smoke test passes.
- [ ] All changed-feature checks pass.
- [ ] No Critical or High defect remains open without explicit approval.
- [ ] All known Medium/Low defects have an owner or documented acceptance.
- [ ] Authentication, team isolation, persistence, and error-recovery checks have evidence.
- [ ] At least one populated, empty, error, narrow-width, dark-mode, and keyboard pass is complete.
- [ ] Test record is completed and linked defects/screenshots/logs are attached.
- [ ] QA sign-off:
- [ ] Engineering sign-off:
