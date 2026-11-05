import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { AdoRequestOptions } from '../src/ado/httpClient'

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, ws: false },
  ssr: { noExternal: ['react'] },
  plugins: [{
    name: 'ado-history-hook-test',
    enforce: 'pre',
    resolveId: (id) => id === 'react' ? '\0ado-history-react' : undefined,
    load: (id) => id === '\0ado-history-react' ? `
      export const effects = []
      export const state = []
      let stateIndex = 0
      export const beginRender = () => { stateIndex = 0 }
      export const useEffect = (effect) => { effects.push(effect) }
      export const useMemo = (factory) => factory()
      export const useState = (initial) => {
        const slot = stateIndex++
        if (!(slot in state)) state[slot] = initial
        return [state[slot], (value) => { state[slot] = value }]
      }
    ` : undefined,
  }],
})
after(() => server.close())
const { useAdoHistoryHighlights } = await server.ssrLoadModule('/src/features/standup/hooks/useAdoHistoryHighlights.ts')
const { beginRender, effects, state } = await server.ssrLoadModule('\0ado-history-react')

test('one history load shares linked PR detail requests across work items', async () => {
  effects.length = 0
  state.length = 0
  let detailRequests = 0
  const detailRequestOptions: AdoRequestOptions[] = []
  const pullRequestId = 678973
  const relation = {
    rel: 'ArtifactLink',
    url: `vstfs:///Git/PullRequestId/project-id%2Frepo-id%2F${pullRequestId}`,
  }
  const workItems = [101, 102, 103].map((id) => ({
    id,
    title: `Work item ${id}`,
    status: 'Active',
    recentActivityAt: '2026-10-01T12:00:00Z',
  }))
  const adoQueryEngine = {
    async getWorkItemUpdates(_team: unknown, _itemId: number) {
      return [
        { id: 1, revisedDate: '2026-10-01T12:00:00Z' },
        { id: 2, revisedDate: '2026-10-02T12:00:00Z', relations: { added: [relation] } },
      ]
    },
    async request<T>(options: AdoRequestOptions) {
      detailRequests += 1
      detailRequestOptions.push(options)
      return { creationDate: '2026-09-30T12:00:00Z', isDraft: false } as T
    },
  }
  const args = {
    adoQueryEngine,
    team: { orgName: 'example-org', projectName: 'example-project', repoName: 'repo' },
    tagRules: [],
    workItems,
  }

  function Render() {
    beginRender()
    useAdoHistoryHighlights(args)
    return effects.shift()?.()
  }

  const cleanup = Render()
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(detailRequests, 1)
  assert.equal(
    detailRequestOptions[0]?.path,
    `/example-project/_apis/git/repositories/repo-id/pullRequests/${pullRequestId}`,
  )
  assert.deepEqual(detailRequestOptions[0]?.params, { 'api-version': '7.1' })
  cleanup?.()

  const refreshCleanup = Render()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(detailRequests, 2, 'a separate refresh should perform a fresh detail lookup')
  refreshCleanup?.()
})

const { getCardChangeDetail } = await server.ssrLoadModule('/src/features/standup/hooks/useAdoHistoryHighlights.ts')

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

test('change details name the latest tracked change, preferring state over other edits in one revision', async () => {
  effects.length = 0
  state.length = 0
  const at = (hoursAgo: number) => new Date(Date.now() - hoursAgo * HOUR_MS).toISOString()
  const changedDate = (hoursAgo: number) => ({ 'System.ChangedDate': { newValue: at(hoursAgo) } })
  const historyById: Record<number, unknown[]> = {
    201: [
      { id: 1, fields: { ...changedDate(72), 'System.State': { newValue: 'New' }, 'System.AssignedTo': { newValue: { uniqueName: 'dev@example.com' } } } },
      { id: 2, fields: { ...changedDate(48), 'System.State': { newValue: 'In Progress' } } },
      { id: 3, fields: { ...changedDate(5), 'System.AssignedTo': { newValue: { uniqueName: 'qa@example.com' } } } },
    ],
    202: [
      { id: 1, fields: { ...changedDate(72), 'System.State': { newValue: 'In Progress' } } },
      {
        id: 2,
        fields: {
          ...changedDate(6),
          'System.State': { newValue: 'In Code Review' },
          'System.AssignedTo': { newValue: { uniqueName: 'dev@example.com' } },
        },
      },
    ],
    203: [
      { id: 1, fields: { ...changedDate(72), 'System.State': { newValue: 'In Progress' } } },
      { id: 2, fields: { ...changedDate(10), 'System.State': { newValue: 'In Code Review' } } },
    ],
  }
  const votesByPullRequestId: Record<number, unknown[]> = {
    55: [{ publishedDate: at(2), properties: { CodeReviewThreadType: { $value: 'VoteUpdate' }, CodeReviewVoteResult: { $value: '10' } } }],
    9: [{ publishedDate: at(1), properties: { CodeReviewThreadType: { $value: 'VoteUpdate' }, CodeReviewVoteResult: { $value: '-5' } } }],
  }
  const adoQueryEngine = {
    async getWorkItemUpdates(_team: unknown, itemId: number) {
      return historyById[itemId] ?? []
    },
    async request<T>(options: AdoRequestOptions) {
      const match = /pullRequests\/(\d+)\/threads$/.exec(options.path)
      return { value: match ? votesByPullRequestId[Number(match[1])] ?? [] : [] } as T
    },
  }
  const args = {
    adoQueryEngine,
    team: { orgName: 'example-org', projectName: 'example-project', repoName: 'repo' },
    tagRules: [],
    workItems: [
      { id: 201, title: 'Reassigned', status: 'Review' },
      { id: 202, title: 'Moved', status: 'Review' },
      { id: 203, title: 'Approved', status: 'Review', activePullRequests: [{ id: 55, repositoryId: 'repo-id', title: 'PR', url: '' }] },
      { id: -9, kind: 'pull-request', title: 'PR only', status: 'Review', recentActivityAt: at(30), pullRequest: { id: 9, repositoryId: 'repo-id', title: 'PR', url: '' } },
    ],
  }

  beginRender()
  useAdoHistoryHighlights(args)
  const cleanup = effects.shift()?.()
  await new Promise((resolve) => setTimeout(resolve, 20))

  beginRender()
  const { highlightsByItemId, changeDetailsByItemId } = useAdoHistoryHighlights(args)
  effects.length = 0
  cleanup?.()

  assert.equal(highlightsByItemId[201], 'new')
  assert.equal(changeDetailsByItemId[201].reason, 'Reassigned')
  assert.equal(changeDetailsByItemId[202].reason, 'Moved to In Code Review')
  assert.equal(changeDetailsByItemId[203].reason, 'PR 55 approved', 'a newer PR vote outranks an older state change')
  assert.equal(changeDetailsByItemId[-9].reason, 'Waiting for author')
  assert.equal(changeDetailsByItemId[203].idleDays, 0)
  assert.equal(changeDetailsByItemId[203].agingLevel, 0)
})

test('assignment change labels distinguish first assignment, reassignment, and clearing the assignee', async () => {
  effects.length = 0
  state.length = 0
  const previous = { uniqueName: 'dev@example.test' }
  const next = { uniqueName: 'qa@example.test' }
  const cases = [
    { oldValue: undefined, newValue: next, expected: 'Assigned' },
    { oldValue: null, newValue: next, expected: 'Assigned' },
    { oldValue: '', newValue: next, expected: 'Assigned' },
    { oldValue: { displayName: '  ' }, newValue: next, expected: 'Assigned' },
    { oldValue: previous, newValue: next, expected: 'Reassigned' },
    { oldValue: { name: 'Developer' }, newValue: { displayName: 'Tester' }, expected: 'Reassigned' },
    { oldValue: '', newValue: 'Tester <qa@example.test>', expected: 'Assigned' },
    { oldValue: 'Developer <dev@example.test>', newValue: 'Tester <qa@example.test>', expected: 'Reassigned' },
    { oldValue: previous, newValue: '', expected: 'Unassigned' },
    { oldValue: previous, newValue: undefined, expected: 'Unassigned' },
    { oldValue: previous, newValue: next, omitOldValue: true, expected: 'Reassigned' },
  ]
  const baselineAt = new Date(Date.now() - 72 * HOUR_MS).toISOString()
  const changedAt = new Date(Date.now() - 23 * HOUR_MS).toISOString()
  const args = {
    adoQueryEngine: {
      async getWorkItemUpdates(_team: unknown, id: number) {
        const change = cases[id]
        return [
          {
            id: 1, revisedDate: baselineAt,
            fields: {
              'System.State': { newValue: 'Approved' },
              'System.AssignedTo': { newValue: change.oldValue },
            },
          },
          {
            id: 2, revisedDate: changedAt,
            fields: {
              'System.AssignedTo': change.omitOldValue
                ? { newValue: change.newValue }
                : { oldValue: change.oldValue, newValue: change.newValue },
            },
          },
        ]
      },
    },
    team: { orgName: 'example-org', projectName: 'example-project', repoName: 'repo' },
    tagRules: [],
    workItems: cases.map((change, id) => ({ id, title: change.expected, status: 'New' })),
  }

  beginRender()
  useAdoHistoryHighlights(args)
  const cleanup = effects.shift()?.()
  await new Promise((resolve) => setImmediate(resolve))
  beginRender()
  const { highlightsByItemId, changeDetailsByItemId } = useAdoHistoryHighlights(args)
  effects.length = 0
  cleanup?.()

  for (const [id, change] of cases.entries()) {
    assert.equal(changeDetailsByItemId[id].reason, change.expected, `case ${id}`)
    assert.equal(changeDetailsByItemId[id].changedAt, changedAt, `case ${id}`)
    assert.equal(highlightsByItemId[id], 'new', `case ${id}`)
  }
})

test('aging level climbs one step per quarter of the stale threshold and is 4 once stale', () => {
  const now = Date.parse('2026-10-20T12:00:00Z')
  const detailAfter = (idleDays: number, staleDays = 8) => getCardChangeDetail(
    { trackedAt: new Date(now - idleDays * DAY_MS).toISOString(), reason: 'Moved to Active' },
    now,
    { freshDays: 1, staleDays },
  )

  assert.deepEqual([0, 1.9, 2, 4, 6, 7.9, 8, 30].map((days) => detailAfter(days).agingLevel), [0, 0, 1, 2, 3, 3, 4, 4])
  assert.equal(detailAfter(5).idleDays, 5)
  assert.equal(detailAfter(7, 7).agingLevel, 4)

  const untracked = getCardChangeDetail({ baselineAt: new Date(now - 3 * DAY_MS).toISOString() }, now, { freshDays: 1, staleDays: 6 })
  assert.equal(untracked.agingLevel, 2, 'with no tracked change, idle time counts from the first revision')
  assert.equal(untracked.reason, undefined)
})
