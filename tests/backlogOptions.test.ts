import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { BacklogBug } from '../src/ado/types.ts'

// The modules import their siblings without file extensions, so Vite loads them rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const {
  areValidTierThresholds,
  backlogOptionsStorageKey,
  createDefaultBacklogOptions,
  parseBacklogOptions,
  parseStoredBacklogOptions,
  serializeBacklogOptions,
} = await server.ssrLoadModule('/src/features/standup/utils/backlogOptions.ts')
const { formatBacklogTierRange, getBacklogTier, groupBacklogBugsByTier } =
  await server.ssrLoadModule('/src/features/standup/utils/backlogTiers.ts')
const { rankBacklogBugs } = await server.ssrLoadModule('/src/features/standup/utils/backlogValue.ts')
const { buildTeamDataExport, parseImportedTeamData, serializeTeamDataExport } =
  await server.ssrLoadModule('/src/teamDataTransfer.ts')
const { createDefaultAssignmentOptions, createDefaultQaOptions } =
  await server.ssrLoadModule('/src/features/standup/utils/standupOptionDefaults.ts')

const thresholds = { top: 80, high: 30, medium: 12 }
const planDefaults = { defaultPlanBudget: 10, skipPlannedBugs: true, skipUnestimatedBugs: true }

function createBug(overrides: Partial<BacklogBug> & { id: number }): BacklogBug {
  return {
    title: `Bug ${overrides.id}`,
    workItemUrl: `https://dev.azure.com/org/project/_workitems/edit/${overrides.id}`,
    ...overrides,
  }
}

test('the default tiers start at Value 80, 30, and 12, with Low collapsed, New bugs flagged after a year, and a 10 pt plan', () => {
  assert.deepEqual(createDefaultBacklogOptions(), {
    tierThresholds: thresholds,
    startLowCollapsed: true,
    agingMonths: 12,
    ...planDefaults,
  })
  assert.notEqual(createDefaultBacklogOptions().tierThresholds, createDefaultBacklogOptions().tierThresholds, 'each caller gets its own copy')
  assert.equal(backlogOptionsStorageKey('team-1'), 'standup:backlog-options:team-1')
})

test('a Value falls in the highest tier whose threshold it reaches', () => {
  const cases: Array<[number, string]> = [
    [500, 'top'], [80, 'top'], [79.9, 'high'], [30, 'high'], [29.9, 'medium'], [12, 'medium'], [11.9, 'low'], [0, 'low'],
  ]
  for (const [value, tier] of cases) {
    assert.equal(getBacklogTier(value, thresholds), tier, `Value ${value}`)
  }
})

test('a Value shown as the threshold counts as reaching it', () => {
  assert.equal(getBacklogTier(79.96, thresholds), 'top', 'shown as 80.0, so it belongs under "Value 80+"')
  assert.equal(getBacklogTier(79.94, thresholds), 'high', 'shown as 79.9')
  assert.equal(getBacklogTier(11.96, thresholds), 'medium', 'shown as 12.0')
})

test('each tier names its Value range', () => {
  assert.deepEqual(
    ['top', 'high', 'medium', 'low'].map((key) => formatBacklogTierRange(key, thresholds)),
    ['Value 80+', 'Value 30–80', 'Value 12–30', 'Value under 12'],
  )
  assert.equal(formatBacklogTierRange('high', { top: 82.5, high: 30.25, medium: 12 }), 'Value 30.3–82.5', 'rounded like the Value tooltip')
})

test('ranked bugs are grouped by tier in ranked order, with the effort entered and the bugs without it', () => {
  const ranked = rankBacklogBugs([
    createBug({ id: 1, severity: '1 - Critical', priority: 1, effort: 4 }),
    createBug({ id: 2, severity: '1 - Critical', priority: 1, effort: 8 }),
    createBug({ id: 3, severity: '3 - Medium', priority: 2 }),
    createBug({ id: 4, severity: '3 - Medium', priority: 2, effort: 8 }),
    createBug({ id: 5 }),
  ])

  const groups = groupBacklogBugsByTier(ranked, thresholds)
  assert.deepEqual(
    groups.map(({ key, name, range, bugs, effortTotal, unestimatedCount }: {
      key: string; name: string; range: string; bugs: Array<{ id: number }>; effortTotal: number; unestimatedCount: number
    }) => ({ key, name, range, ids: bugs.map((bug) => bug.id), effortTotal, unestimatedCount })),
    [
      { key: 'top', name: 'Top', range: 'Value 80+', ids: [1, 2], effortTotal: 12, unestimatedCount: 0 },
      { key: 'medium', name: 'Medium', range: 'Value 12–30', ids: [3], effortTotal: 0, unestimatedCount: 1 },
      { key: 'low', name: 'Low', range: 'Value under 12', ids: [4, 5], effortTotal: 8, unestimatedCount: 1 },
    ],
    'High has no bugs, so it is left out',
  )
  assert.deepEqual(groupBacklogBugsByTier([], thresholds), [])
})

test('tier thresholds must be positive and each lower than the one above it', () => {
  assert.equal(areValidTierThresholds(thresholds), true)
  assert.equal(areValidTierThresholds({ top: 3, high: 2, medium: 0.5 }), true)
  for (const invalid of [
    { top: 30, high: 30, medium: 12 },
    { top: 80, high: 10, medium: 12 },
    { top: 80, high: 30, medium: 0 },
    { top: 80, high: 30, medium: -1 },
    { top: Number.NaN, high: 30, medium: 12 },
    { top: Number.POSITIVE_INFINITY, high: 30, medium: 12 },
  ]) {
    assert.equal(areValidTierThresholds(invalid), false, JSON.stringify(invalid))
  }
})

test('stored options round-trip, and anything missing or invalid falls back to its default', () => {
  const options = {
    tierThresholds: { top: 120, high: 40, medium: 8 },
    startLowCollapsed: false,
    agingMonths: 18,
    defaultPlanBudget: 25,
    skipPlannedBugs: false,
    skipUnestimatedBugs: false,
  }
  assert.deepEqual(parseStoredBacklogOptions(serializeBacklogOptions(options)), options)

  for (const raw of [null, '', '{bad', '[]', '"text"', '{}']) {
    assert.deepEqual(parseStoredBacklogOptions(raw), createDefaultBacklogOptions(), String(raw))
  }
  assert.deepEqual(
    parseBacklogOptions({ tierThresholds: { top: 10, high: 20, medium: 5 }, startLowCollapsed: false }),
    { tierThresholds: thresholds, startLowCollapsed: false, agingMonths: 12, ...planDefaults },
    'thresholds out of order are replaced as a set',
  )
  assert.deepEqual(parseBacklogOptions({ tierThresholds: { top: '80', high: 30, medium: 12 } }).tierThresholds, thresholds)
  assert.equal(parseBacklogOptions({ startLowCollapsed: 'no' }).startLowCollapsed, true)
  for (const agingMonths of [0, -3, 1.5, 121, '6', null, Number.NaN]) {
    assert.equal(parseBacklogOptions({ agingMonths }).agingMonths, 12, String(agingMonths))
  }
  assert.equal(parseBacklogOptions({ agingMonths: 1 }).agingMonths, 1)
  assert.equal(parseBacklogOptions({ agingMonths: 120 }).agingMonths, 120)
  for (const defaultPlanBudget of [0, -5, 2.5, 1000, '13', null, Number.NaN]) {
    assert.equal(parseBacklogOptions({ defaultPlanBudget }).defaultPlanBudget, 10, String(defaultPlanBudget))
  }
  assert.equal(parseBacklogOptions({ defaultPlanBudget: 1 }).defaultPlanBudget, 1)
  assert.equal(parseBacklogOptions({ defaultPlanBudget: 999 }).defaultPlanBudget, 999)
  assert.equal(parseBacklogOptions({ skipPlannedBugs: 'no' }).skipPlannedBugs, true, 'only false turns a skip off')
  assert.equal(parseBacklogOptions({ skipUnestimatedBugs: false }).skipUnestimatedBugs, false)
})

const teamProfile = {
  id: 'team', orgName: 'org', projectName: 'project', displayName: 'Team',
  areaPath: 'area', iterationPath: 'iteration', teamName: 'Team', repoName: 'repo',
}

function exportWith(backlogOptions: unknown) {
  return JSON.parse(serializeTeamDataExport(buildTeamDataExport({
    teamProfile,
    assignmentOptions: createDefaultAssignmentOptions(),
    assignmentTagRules: [],
    qaOptions: createDefaultQaOptions(),
    backlogOptions,
  })))
}

test('team exports carry the Backlog options, and older exports import the defaults', () => {
  const options = {
    tierThresholds: { top: 120, high: 40, medium: 8 },
    startLowCollapsed: false,
    agingMonths: 6,
    defaultPlanBudget: 40,
    skipPlannedBugs: false,
    skipUnestimatedBugs: true,
  }
  const exported = exportWith(options)
  assert.deepEqual(exported.backlogOptions, options)
  assert.deepEqual(parseImportedTeamData(JSON.stringify(exported)).backlogOptions, options)

  const legacy = { ...exported }
  delete legacy.backlogOptions
  assert.deepEqual(parseImportedTeamData(JSON.stringify(legacy)).backlogOptions, createDefaultBacklogOptions())

  assert.deepEqual(
    parseImportedTeamData(JSON.stringify(exportWith({ startLowCollapsed: false }))).backlogOptions,
    { tierThresholds: thresholds, startLowCollapsed: false, agingMonths: 12, ...planDefaults },
    'a missing field takes its default',
  )
  assert.equal(
    parseImportedTeamData(JSON.stringify(exportWith({ skipPlannedBugs: 'yes' }))).backlogOptions.skipPlannedBugs,
    true,
    'a flag that is not true or false takes its default, like Start with the Low tier collapsed',
  )
})

test('an import with unusable Backlog options is rejected rather than silently changed', () => {
  assert.throws(() => parseImportedTeamData(JSON.stringify(exportWith('tiers'))), /Imported backlog options must be an object\./)
  assert.throws(
    () => parseImportedTeamData(JSON.stringify(exportWith({ tierThresholds: { top: 10, high: 20, medium: 5 }, startLowCollapsed: true }))),
    /tierThresholds must be positive numbers, each lower than the one above it\./,
  )
  assert.throws(
    () => parseImportedTeamData(JSON.stringify(exportWith({ tierThresholds: { top: 80, high: 30 }, startLowCollapsed: true }))),
    /tierThresholds must be positive numbers/,
  )
  for (const agingMonths of [0, 2.5, 121, '12']) {
    assert.throws(
      () => parseImportedTeamData(JSON.stringify(exportWith({ agingMonths }))),
      /agingMonths must be a whole number of months from 1 to 120\./,
      String(agingMonths),
    )
  }
  for (const defaultPlanBudget of [0, 2.5, 1000, '13']) {
    assert.throws(
      () => parseImportedTeamData(JSON.stringify(exportWith({ defaultPlanBudget }))),
      /defaultPlanBudget must be a whole number of points from 1 to 999\./,
      String(defaultPlanBudget),
    )
  }
})
