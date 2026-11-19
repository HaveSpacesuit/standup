import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())

const {
  describeDropChanges,
  getBoardDropResult,
  getColumnDropOptions,
  getEditableFields,
  getIterationGroups,
  getPeopleChoices,
  getPullRequestChanges,
  getRestoreChanges,
  getShortcutAction,
  getStateGroups,
  havePullRequestsChanged,
} = await server.ssrLoadModule('/src/features/standup/utils/workItemEditing.ts')
const { getSprintLensRows, SCOPE_ADDED_ROW_KEY, SCOPE_COMMITTED_ROW_KEY, SCOPE_REMOVED_ROW_KEY, NO_SPRINT_ROW_KEY } =
  await server.ssrLoadModule('/src/features/standup/utils/sprintLens.ts')
const { DEFAULT_TAG_RULES } = await server.ssrLoadModule('/src/ado/workItemStatus.ts')
const { DEFAULT_EFFORT_SUGGESTIONS, MAX_EFFORT_SUGGESTIONS, parseEffortSuggestions, parseStoredAssignmentOptions, serializeAssignmentOptions } =
  await server.ssrLoadModule('/src/features/standup/utils/assignmentOptions.ts')
const { createDefaultAssignmentOptions, createDefaultQaOptions } = await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')
const { buildTeamDataExport, parseImportedTeamData, serializeTeamDataExport } = await server.ssrLoadModule('/src/teamDataTransfer.ts')
const { formatWorkItemLink } = await server.ssrLoadModule('/src/features/standup/utils/workItemLink.ts')

type Item = import('../src/features/standup/utils/workItemEditing.ts').EditableWorkItem
type DropOption = import('../src/features/standup/utils/workItemEditing.ts').DropOption
type IterationGroup = import('../src/features/standup/utils/workItemEditing.ts').IterationGroup

const ana = { displayName: 'Ana', uniqueName: 'ana@example.invalid' }
const bo = { displayName: 'Bo', uniqueName: 'bo@example.invalid' }
const pbiStates = [
  { name: 'New', category: 'Proposed' },
  { name: 'Approved', category: 'Proposed' },
  { name: 'Committed', category: 'InProgress' },
  { name: 'Done', category: 'Completed' },
  { name: 'Removed', category: 'Removed' },
]
const item = (fields: Partial<Item> = {}): Item => ({
  id: 7, title: 'Card', workItemType: 'Product Backlog Item', state: 'Approved', assignedTo: ana, tags: [],
  iterationPath: 'Project\\Sprint 10', workItemUrl: 'https://dev.azure.com/org/Project/_workitems/edit/7', ...fields,
})
const drop = (overrides: Record<string, unknown>) => getBoardDropResult({
  item: item(), fromLaneKey: 'ana', toLaneKey: 'ana', toLane: undefined, fromColumn: 'New', toColumn: 'New',
  states: pbiStates, tagRules: DEFAULT_TAG_RULES, ...overrides,
})
const keys = (options: DropOption[]) => options.map((option) => option.key)

test('field shortcuts ignore modified keys and keys without a field', () => {
  assert.deepEqual(getShortcutAction({ key: 's' }), { kind: 'field', field: 'state' })
  assert.deepEqual(getShortcutAction({ key: 'V' }), { kind: 'field', field: 'severity' })
  assert.deepEqual(getShortcutAction({ key: 'F2' }), { kind: 'field', field: 'title' })
  assert.deepEqual(getShortcutAction({ key: 'r' }), { kind: 'reload' })
  for (const event of [{ key: 's', shiftKey: true }, { key: 's', ctrlKey: true }, { key: 'x' }, { key: 'Enter' }]) {
    assert.equal(getShortcutAction(event), null, JSON.stringify(event))
  }
})

test('severity is offered for bugs and effort for everything but tasks without one', () => {
  assert.equal(getEditableFields(item()).includes('severity'), false)
  assert.equal(getEditableFields(item({ workItemType: 'Bug' })).includes('severity'), true)
  assert.equal(getEditableFields(item({ workItemType: 'Task' })).includes('effort'), false)
  assert.equal(getEditableFields(item({ workItemType: 'Task', effort: 3 })).includes('effort'), true)
})

test('states group by category in workflow order and keep a state the type no longer lists', () => {
  const groups = getStateGroups([pbiStates[3], pbiStates[2], pbiStates[0]], 'Legacy')
  assert.deepEqual(groups.map((group: { label: string; states: string[] }) => [group.label, group.states]), [
    ['Proposed', ['New']], ['In progress', ['Committed']], ['Completed', ['Done']], ['Other', ['Legacy']],
  ])
})

test('sprint choices: current, upcoming by start, the last three past sprints, then the backlog', () => {
  const iterations = [
    { name: 'S1', path: 'P\\S1', timeFrame: 'past', startDate: '2026-01-01' },
    { name: 'S2', path: 'P\\S2', timeFrame: 'past', startDate: '2026-01-15' },
    { name: 'S3', path: 'P\\S3', timeFrame: 'past', startDate: '2026-02-01' },
    { name: 'S4', path: 'P\\S4', timeFrame: 'past', startDate: '2026-02-15' },
    { name: 'S5', path: 'P\\S5', timeFrame: 'current', startDate: '2026-03-01' },
    { name: 'S7', path: 'P\\S7', timeFrame: 'future', startDate: '2026-04-01' },
    { name: 'S6', path: 'P\\S6', timeFrame: 'future', startDate: '2026-03-15' },
  ]
  const groups = getIterationGroups(iterations, 'P', 'P\\Old\\S0')
  assert.deepEqual(groups.map((group: { key: string; choices: { name: string }[] }) => [group.key, group.choices.map((choice) => choice.name)]), [
    ['other', ['S0']], ['current', ['S5']], ['future', ['S6', 'S7']], ['past', ['S4', 'S3', 'S2']], ['backlog', ['P (no sprint)']],
  ])
  assert.equal(getIterationGroups(iterations, 'P', 'p\\s5').some((group: { key: string }) => group.key === 'other'), false)
  assert.deepEqual(groups.flatMap((group: IterationGroup) => group.choices.filter((choice) => choice.detail).map(({ name, detail }) => [name, detail])), [
    ['S5', 'Current sprint'], ['S6', 'Next sprint'], ['S4', 'Previous sprint'],
  ])
})

test('relative sprint labels follow dates across years, skipping an undated Future bucket when finding next', () => {
  const iterations = [
    { name: 'Future', path: 'P\\Future', timeFrame: 'future' },
    { name: '2027 02', path: 'P\\2027 02', timeFrame: 'future', startDate: '2027-01-15' },
    { name: '2026 25', path: 'P\\2026 25', timeFrame: 'past', startDate: '2026-12-01' },
    { name: '2027 01', path: 'P\\2027 01', timeFrame: 'future', startDate: '2027-01-01' },
    { name: '2026 26', path: 'P\\2026 26', timeFrame: 'current', startDate: '2026-12-15' },
    { name: '2026 24', path: 'P\\2026 24', timeFrame: 'past', startDate: '2026-11-15' },
  ]
  const groups: IterationGroup[] = getIterationGroups(iterations, 'P', 'P\\Future')
  assert.deepEqual(groups.flatMap((group) => group.choices.filter((choice) => choice.detail).map(({ name, detail }) => [name, detail])), [
    ['2026 26', 'Current sprint'], ['2027 01', 'Next sprint'], ['2026 25', 'Previous sprint'],
  ])
  assert.equal(groups.find((group) => group.key === 'future')!.choices[0].name, 'Future', 'existing choice order is preserved')
  const noSprints: IterationGroup[] = getIterationGroups([], 'P', 'P\\Unlisted')
  assert.equal(noSprints.flatMap((group) => group.choices).some((choice) => choice.detail), false)
})

test('people choices skip members without an account and keep an assignee from outside the team', () => {
  const outsider = { displayName: 'Cy', uniqueName: 'cy@example.invalid' }
  const people = getPeopleChoices([{ ...bo }, { displayName: 'No account' }, { ...ana }], outsider)
  assert.deepEqual(people.map((person: { displayName: string }) => person.displayName), ['Cy', 'Ana', 'Bo'])
  assert.deepEqual(getPeopleChoices([{ ...ana }], { displayName: 'ANA', uniqueName: 'ANA@example.invalid' }).length, 1)
})

test('undo restores earlier values and clears fields that had none', () => {
  const before = { title: 'Card', tags: ['a'], effort: undefined, state: 'New' }
  const changes = getRestoreChanges(before, ['effort', 'tags', 'state'])
  assert.deepEqual(changes, { effort: null, tags: ['a'], state: 'New' })
  assert.notEqual(changes.tags, before.tags)
})

test('a column offers each of the type’s states that land there, never Removed', () => {
  assert.deepEqual(keys(getColumnDropOptions(item({ state: 'Committed' }), 'New', pbiStates, [])), ['state:new', 'state:approved'])
  assert.deepEqual(keys(getColumnDropOptions(item(), 'New', pbiStates, [])), ['state:new'])
  assert.deepEqual(keys(getColumnDropOptions(item(), 'Done', pbiStates, [])), ['state:done'])
  assert.deepEqual(getColumnDropOptions(item(), 'Review', pbiStates, []), [])
})

test('a tag-rule column adds its tag and keeps the state; leaving it removes tags that would hold the card', () => {
  const [blocked] = getColumnDropOptions(item({ state: 'Committed', tags: ['UI'] }), 'Blocked', pbiStates, DEFAULT_TAG_RULES)
  assert.deepEqual(blocked, {
    key: 'tag:blocked', label: 'Tag “blocked”', detail: 'Stays Committed', changes: { tags: ['blocked', 'UI'] },
  })

  const held = item({ state: 'Committed', tags: ['Blocked', 'UI'] })
  assert.deepEqual(getColumnDropOptions(held, 'Active', pbiStates, DEFAULT_TAG_RULES), [{
    key: 'state:committed', label: 'Committed', detail: 'Removes Blocked', changes: { tags: ['UI'] },
  }])
  assert.deepEqual(getColumnDropOptions(held, 'Done', pbiStates, DEFAULT_TAG_RULES)[0].changes, { state: 'Done', tags: ['UI'] })
})

test('moving within a lane changes the state, or nothing in the same column', () => {
  assert.deepEqual(drop({}), { kind: 'none' })
  const result = drop({ toColumn: 'Active' })
  assert.equal(result.kind, 'options')
  assert.deepEqual(result.options.map((option: DropOption) => option.changes), [{ state: 'Committed' }])
  assert.deepEqual(drop({ toColumn: 'Review', tagRules: [] }), { kind: 'refused', reason: 'No Product Backlog Item state goes in Review' })
})

test('moving to another lane applies its change, alone on the lane head or with a column’s state', () => {
  const toBo = { toLaneKey: 'bo', toLane: { label: 'Bo', changes: { assignedTo: bo }, unchangedReason: 'Already assigned to Bo' } }
  for (const toColumn of [null, 'New']) {
    assert.deepEqual(drop({ ...toBo, toColumn }), { kind: 'options', options: [{ key: 'lane', label: 'Bo', changes: { assignedTo: bo } }] })
  }
  const combined = drop({ ...toBo, item: item({ state: 'Committed' }), fromColumn: 'Active', toColumn: 'New' })
  assert.deepEqual(combined.options.map((option: DropOption) => option.changes), [
    { assignedTo: bo, state: 'New' }, { assignedTo: bo, state: 'Approved' },
  ])
})

test('a lane that refuses cards, or already matches the card, explains why', () => {
  assert.deepEqual(drop({ toLaneKey: 'qa', toLane: { refusal: 'Tester lanes show QA work' } }), { kind: 'refused', reason: 'Tester lanes show QA work' })
  assert.deepEqual(drop({ toLaneKey: 'x' }), { kind: 'refused', reason: 'Cards can’t be moved to this lane' })
  const sameSprint = { toLaneKey: 'scope:added', toLane: { label: 'Sprint 10', changes: { iterationPath: 'project\\sprint 10' }, unchangedReason: 'Only the column changes here' } }
  assert.deepEqual(drop(sameSprint), { kind: 'refused', reason: 'Only the column changes here' })
  assert.deepEqual(drop({ ...sameSprint, toLane: { ...sameSprint.toLane, unchangedReason: undefined } }), { kind: 'refused', reason: 'Already Sprint 10' })
  // In another column the lane's own change is dropped, and the column's state still applies.
  assert.deepEqual(drop({ ...sameSprint, toColumn: 'Active' }).options[0].changes, { state: 'Committed' })
})

test('the drag summary lists each change in field order, with tags as additions and removals', () => {
  const card = item({ tags: ['Blocked', 'UI'] })
  assert.deepEqual(describeDropChanges(card, { tags: ['UI', 'Ready'], assignedTo: bo, state: 'Committed' }), [
    'State → Committed', 'Assigned to → Bo', 'Adds tag Ready', 'Removes tag Blocked',
  ])
  assert.deepEqual(describeDropChanges(card, { assignedTo: null, iterationPath: 'Project\\Sprint 11' }), ['Assigned to → Unassigned', 'Sprint → Sprint 11'])
  assert.deepEqual(describeDropChanges(card, { state: 'approved', assignedTo: { ...ana, displayName: 'Ana B' } }), [])
})

const sprintItem = (id: number, sprintName: string | undefined, iterationPath?: string) =>
  ({ id, title: `Card ${id}`, status: 'Active', sprintName, iterationPath })
const sprintOptions = {
  currentIterationName: 'Sprint 10',
  iterationWindow: { current: { name: 'Sprint 10', fullName: 'Project\\Team\\Sprint 10' } },
  teamIterations: [{ id: 'b', name: 'Sprint 11', path: 'Project\\Team\\Sprint 11', timeFrame: 'future' }],
}
const dropsByKey = (rows: { key: string; drop?: unknown }[]) => Object.fromEntries(rows.map((row) => [row.key, row.drop]))

test('sprint lanes move cards to the team’s sprint path, falling back to the path their cards share', () => {
  const drops = dropsByKey(getSprintLensRows([
    sprintItem(1, 'Sprint 10', 'Project\\Sprint 10'),
    sprintItem(2, 'Sprint 11'),
    sprintItem(3, 'Sprint 12', 'Project\\Other\\Sprint 12'),
    sprintItem(4, 'Mystery'),
    sprintItem(5, undefined),
  ], sprintOptions))
  assert.deepEqual(drops['sprint:sprint 10'], { label: 'Sprint 10', changes: { iterationPath: 'Project\\Team\\Sprint 10' }, unchangedReason: 'Already in Sprint 10' })
  assert.deepEqual(drops['sprint:sprint 11'].changes, { iterationPath: 'Project\\Team\\Sprint 11' })
  assert.deepEqual(drops['sprint:sprint 12'].changes, { iterationPath: 'Project\\Other\\Sprint 12' })
  assert.match(drops['sprint:mystery'].refusal, /iteration path isn’t known/)
  assert.match(drops[NO_SPRINT_ROW_KEY].refusal, /Every work item has an iteration/)
})

test('sprint scope lanes take cards only into Added during sprint, which can only change a current card’s column', () => {
  const items = [sprintItem(1, 'Sprint 10', 'Project\\Team\\Sprint 10'), sprintItem(2, 'Sprint 10', 'Project\\Team\\Sprint 10'), sprintItem(3, 'Sprint 11')]
  const rows = getSprintLensRows(items, { ...sprintOptions, scope: { startItemIds: new Set([1]), removedItems: [] } })
  const drops = dropsByKey(rows)
  assert.ok('refusal' in drops[SCOPE_COMMITTED_ROW_KEY])
  assert.ok('refusal' in drops[SCOPE_REMOVED_ROW_KEY])
  assert.deepEqual(drops[SCOPE_ADDED_ROW_KEY].changes, { iterationPath: 'Project\\Team\\Sprint 10' })

  const resolve = (card: Item, fromLaneKey: string, toColumn: string | null) => getBoardDropResult({
    item: card, fromLaneKey, toLaneKey: SCOPE_ADDED_ROW_KEY, toLane: drops[SCOPE_ADDED_ROW_KEY], fromColumn: 'Active', toColumn,
    states: pbiStates, tagRules: [],
  })
  const committed = item({ id: 1, state: 'Committed', iterationPath: 'Project\\Team\\Sprint 10' })
  assert.match(resolve(committed, SCOPE_COMMITTED_ROW_KEY, null).reason, /only its column can change here/)
  const nextSprint = item({ id: 3, state: 'Committed', iterationPath: 'Project\\Team\\Sprint 11' })
  assert.deepEqual(resolve(nextSprint, 'sprint:sprint 11', null).options[0].changes, { iterationPath: 'Project\\Team\\Sprint 10' })
})

test('effort suggestions keep positive values in order, without repeats, and fall back to the defaults', () => {
  assert.deepEqual([...DEFAULT_EFFORT_SUGGESTIONS], [4, 8, 16, 24, 40])
  assert.deepEqual(parseEffortSuggestions([40, 8, 8, -1, 0, '5', 2.5, Infinity, Number.NaN]), [2.5, 8, 40])
  for (const value of [undefined, null, [], [0, -3], 'nope', { 0: 4 }]) {
    assert.deepEqual(parseEffortSuggestions(value), [4, 8, 16, 24, 40], JSON.stringify(value))
  }
  assert.equal(parseEffortSuggestions(Array.from({ length: 15 }, (_, index) => index + 1)).length, MAX_EFFORT_SUGGESTIONS)
})

test('effort suggestions are stored per team and travel with team exports', () => {
  assert.deepEqual(createDefaultAssignmentOptions().effortSuggestions, [4, 8, 16, 24, 40])
  assert.deepEqual(parseStoredAssignmentOptions('{"compactCards":true}').effortSuggestions, [4, 8, 16, 24, 40])
  const options = { ...createDefaultAssignmentOptions(), effortSuggestions: [1, 2, 3, 5, 8] }
  assert.deepEqual(parseStoredAssignmentOptions(serializeAssignmentOptions(options)), options)

  const data = buildTeamDataExport({
    teamProfile: {
      id: 'team', orgName: 'org', projectName: 'project', displayName: 'Team',
      areaPath: 'area', iterationPath: 'iteration', teamName: 'Team', repoName: 'repo',
    },
    assignmentOptions: options,
    assignmentTagRules: [],
    qaOptions: createDefaultQaOptions(),
  })
  assert.deepEqual(parseImportedTeamData(serializeTeamDataExport(data)).assignmentOptions.effortSuggestions, [1, 2, 3, 5, 8])
  const legacy = JSON.parse(serializeTeamDataExport(data))
  delete legacy.assignmentOptions.effortSuggestions
  assert.deepEqual(parseImportedTeamData(JSON.stringify(legacy)).assignmentOptions.effortSuggestions, [4, 8, 16, 24, 40])
})

test('a copied link names the item like Azure DevOps does, even without a type, title, or link', () => {
  const url = 'https://dev.azure.com/org/Project/_workitems/edit/5/'
  assert.deepEqual(formatWorkItemLink({ id: 5, title: ' Fix it ', workItemUrl: url }), {
    text: 'Work item 5: Fix it',
    html: `<a href="${url}">Work item 5</a>: Fix it`,
  })
  assert.deepEqual(formatWorkItemLink({ id: 5, title: '', workItemType: 'Task', workItemUrl: url }), {
    text: 'Task 5',
    html: `<a href="${url}">Task 5</a>`,
  })
  assert.deepEqual(formatWorkItemLink({ id: 5, title: 'A & B', workItemType: 'Bug' }), { text: 'Bug 5: A & B', html: 'Bug 5: A &amp; B' })
})

test('a pull request counts as changed by what its card shows, not by how it was read', () => {
  const before = { id: 456, repositoryId: 'repo', title: 'Fix', url: 'https://dev.azure.com/org/Project/_git/Repo/pullrequest/456', approvalCount: 0 }
  // The batch read and the read by ID build the URL from different names, and the activity time moves on its own.
  const reread = { ...before, repositoryId: 'REPO', url: 'https://dev.azure.com/org/Project/_git/repo/pullrequest/456', recentActivityAt: 'later' }
  assert.deepEqual(getPullRequestChanges(before, reread), [])
  assert.equal(havePullRequestsChanged([before], [reread]), false)
  assert.deepEqual(getPullRequestChanges(before, { ...reread, approvalCount: 1, title: 'Fix it' }), ['Title', 'Reviews'])
  assert.equal(havePullRequestsChanged([before], [reread, { ...before, id: 457 }]), true)
  assert.equal(havePullRequestsChanged([before], [{ ...before, repositoryId: 'other' }]), true)
})
