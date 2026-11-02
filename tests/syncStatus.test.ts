import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'

const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { formatSyncedLabel, shouldRecordTeamSync } = await server.ssrLoadModule('/src/features/standup/utils/syncStatus.ts')

const MINUTE = 60_000
const finishedLoad = { teamId: 'team', wasLoading: true, isLoading: false, failed: false, refreshRequested: false, hasSyncTime: false }

test('a team records its first successful load', () => {
  assert.equal(shouldRecordTeamSync(finishedLoad), true)
})

test('returning to an already loaded team keeps its earlier time, since the data comes from the cache', () => {
  assert.equal(shouldRecordTeamSync({ ...finishedLoad, hasSyncTime: true }), false)
})

test('a refresh records a new time for a team that already has one', () => {
  assert.equal(shouldRecordTeamSync({ ...finishedLoad, hasSyncTime: true, refreshRequested: true }), true)
})

test('nothing is recorded while loading, before a load starts, after a failure, or without a team', () => {
  assert.equal(shouldRecordTeamSync({ ...finishedLoad, isLoading: true }), false)
  assert.equal(shouldRecordTeamSync({ ...finishedLoad, wasLoading: false }), false)
  assert.equal(shouldRecordTeamSync({ ...finishedLoad, failed: true, refreshRequested: true }), false)
  assert.equal(shouldRecordTeamSync({ ...finishedLoad, teamId: '' }), false)
})

test('the synced label counts minutes, then hours, then days', () => {
  const syncedAt = Date.UTC(2026, 4, 1, 9, 0)
  assert.equal(formatSyncedLabel(syncedAt, syncedAt), 'Synced just now')
  assert.equal(formatSyncedLabel(syncedAt, syncedAt + 59_999), 'Synced just now')
  assert.equal(formatSyncedLabel(syncedAt, syncedAt + 2 * MINUTE), 'Synced 2m ago')
  assert.equal(formatSyncedLabel(syncedAt, syncedAt + 59 * MINUTE), 'Synced 59m ago')
  assert.equal(formatSyncedLabel(syncedAt, syncedAt + 60 * MINUTE), 'Synced 1h ago')
  assert.equal(formatSyncedLabel(syncedAt, syncedAt + 25 * 60 * MINUTE), 'Synced 1d ago')
})

test('a sync time slightly in the future, from clock skew between renders, reads as just now', () => {
  const syncedAt = Date.UTC(2026, 4, 1, 9, 0)
  assert.equal(formatSyncedLabel(syncedAt, syncedAt - 5_000), 'Synced just now')
})
