import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TeamMember } from '../src/ado/queryEngine.ts'
import {
  getAssignmentMemberFilterOptions,
  getAssignmentMemberRows,
} from '../src/features/standup/utils/assignmentMembers.ts'

const members: TeamMember[] = [
  { id: '2', displayName: 'Morgan Lane', descriptor: 'morgan-descriptor' },
  { id: '1', displayName: 'Alex Rivers', imageUrl: 'alex-image' },
]

test('assignment rows include every configured member, including members with no cards', () => {
  assert.deepEqual(
    getAssignmentMemberRows(members).map(({ label }) => label),
    ['Alex Rivers', 'Morgan Lane'],
  )
})

test('individual member selection shows only that member row', () => {
  assert.deepEqual(
    getAssignmentMemberRows(members, ' morgan lane ').map(({ label }) => label),
    ['Morgan Lane'],
  )
})

test('member rows carry the member identity so cards can detect handoffs', () => {
  assert.deepEqual(
    getAssignmentMemberRows([{ displayName: 'Alex Rivers', uniqueName: 'alex@example.test', imageUrl: 'alex-image' }])[0]?.memberIdentity,
    { displayName: 'Alex Rivers', uniqueName: 'alex@example.test', imageUrl: 'alex-image' },
  )
})

test('member filter options come from team membership and are sorted', () => {
  assert.deepEqual(getAssignmentMemberFilterOptions(members), ['Alex Rivers', 'Morgan Lane'])
})
