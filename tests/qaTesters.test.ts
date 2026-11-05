import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { TeamMember, WorkItemUpdate } from '../src/ado/types.ts'

// qaTesters.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { resolveQaTesters } = await server.ssrLoadModule('/src/features/standup/utils/qaTesters.ts')

const stateGroups = {
  testing: ['Available for Testing'],
  development: ['Committed', 'Failed Testing'],
  done: ['Done'],
}

const dev: TeamMember = { displayName: 'Dana Developer', uniqueName: 'dana@example.com' }
const otherDev: TeamMember = { displayName: 'Omar Coder', uniqueName: 'omar@example.com' }
const tester: TeamMember = { displayName: 'Taylor Reed', uniqueName: 'taylor@example.com' }
const members = [dev, otherDev, tester]
const automation = { displayName: 'Project Collection Build Service', uniqueName: 'build@example.com' }

function update(
  actor: { displayName: string; uniqueName?: string },
  fields: { state?: [string | undefined, string]; assignedTo?: [TeamMember | undefined, TeamMember | undefined] },
): WorkItemUpdate {
  const result: WorkItemUpdate = { revisedBy: actor, fields: {} }
  if (fields.state) {
    result.fields!['System.State'] = { oldValue: fields.state[0], newValue: fields.state[1] }
  }
  if (fields.assignedTo) {
    const [oldValue, newValue] = fields.assignedTo
    result.fields!['System.AssignedTo'] = {
      oldValue: oldValue && `${oldValue.displayName} <${oldValue.uniqueName}>`,
      newValue: newValue && `${newValue.displayName} <${newValue.uniqueName}>`,
    }
  }
  return result
}

function resolveInferred(updatesByItemId: Record<number, WorkItemUpdate[]>) {
  return resolveQaTesters({ configuredNames: [], teamMembers: members, updatesByItemId, stateGroups })
}

function names(testers: TeamMember[]): string[] {
  return testers.map((member) => member.displayName)
}

test('chosen tester names win over inference and match case-insensitively', () => {
  const result = resolveQaTesters({
    configuredNames: [' omar coder ', 'Not On Team'],
    teamMembers: members,
    updatesByItemId: {
      1: [
        update(dev, { state: ['Committed', 'Available for Testing'] }),
        update(tester, { state: ['Available for Testing', 'Done'] }),
      ],
    },
    stateGroups,
  })

  assert.deepEqual(names(result.testers), ['Omar Coder'])
  assert.equal(result.inferred, false)
})

test('a member who verifies or sends back other people\'s handoffs is inferred as a tester', () => {
  const result = resolveInferred({
    1: [
      update(dev, { state: ['Committed', 'Available for Testing'] }),
      update(tester, { state: ['Available for Testing', 'Done'] }),
    ],
    2: [
      update(otherDev, { state: ['Committed', 'Available for Testing'] }),
      update(tester, { state: ['Available for Testing', 'Failed Testing'] }),
    ],
  })

  assert.deepEqual(names(result.testers), ['Taylor Reed'])
  assert.equal(result.inferred, true)
})

test('picking up testing work counts as QA activity, even in the handoff update', () => {
  const result = resolveInferred({
    1: [update(dev, { state: ['Committed', 'Available for Testing'], assignedTo: [dev, tester] })],
  })

  assert.deepEqual(names(result.testers), ['Taylor Reed'])
})

test('developers who only hand work to QA, or move their own work along, are not testers', () => {
  const result = resolveInferred({
    1: [
      update(dev, { state: ['Committed', 'Available for Testing'] }),
      update(dev, { state: ['Available for Testing', 'Committed'] }),
      update(dev, { state: ['Committed', 'Available for Testing'] }),
      update(dev, { state: ['Available for Testing', 'Done'] }),
    ],
    2: [
      update(otherDev, { state: ['Committed', 'Available for Testing'], assignedTo: [otherDev, otherDev] }),
    ],
  })

  assert.deepEqual(names(result.testers), [])
  assert.equal(result.inferred, true)
})

test('automation handoffs credit the previous assignee as the developer', () => {
  const result = resolveInferred({
    1: [
      update(dev, { assignedTo: [undefined, dev] }),
      update(automation, { state: ['Committed', 'Available for Testing'] }),
      update(dev, { state: ['Available for Testing', 'Done'] }),
    ],
    2: [
      update(otherDev, { assignedTo: [undefined, otherDev] }),
      update(automation, { state: ['Committed', 'Available for Testing'] }),
      update(tester, { state: ['Available for Testing', 'Done'] }),
    ],
  })

  assert.deepEqual(names(result.testers), ['Taylor Reed'])
})

test('a member with more handoffs than QA actions is not a tester', () => {
  const result = resolveInferred({
    1: [
      update(dev, { state: ['Committed', 'Available for Testing'] }),
      update(dev, { state: ['Available for Testing', 'Committed'] }),
      update(dev, { state: ['Committed', 'Available for Testing'] }),
    ],
    2: [
      update(otherDev, { state: ['Committed', 'Available for Testing'] }),
      update(dev, { state: ['Available for Testing', 'Done'] }),
    ],
  })

  assert.deepEqual(names(result.testers), [])
})

test('no history infers no testers', () => {
  const result = resolveInferred({})

  assert.deepEqual(result.testers, [])
  assert.equal(result.inferred, true)
})
