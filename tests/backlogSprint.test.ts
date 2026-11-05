import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { createServer } from 'vite'
import type { TeamIterationOption } from '../src/ado/types.ts'

// backlogSprint.ts imports its siblings without file extensions, so Vite loads it rather than Node directly.
const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } })
after(() => server.close())
const { createBacklogSprintResolver } = await server.ssrLoadModule('/src/features/standup/utils/backlogSprint.ts')

function iteration(
  name: string,
  timeFrame: TeamIterationOption['timeFrame'],
  startDate?: string,
): TeamIterationOption {
  return { name, path: `Project\\Team\\${name}`, timeFrame, startDate, finishDate: undefined }
}

const iterations: TeamIterationOption[] = [
  iteration('Sprint 4', 'past', '2026-05-18'),
  iteration('Sprint 5', 'current', '2026-06-01'),
  // Listed out of order, so the next sprint is found by its start date, not its position.
  iteration('Sprint 7', 'future', '2026-06-29'),
  iteration('Sprint 6', 'future', '2026-06-15'),
]

test('a bug in a team sprint is labelled relative to today', () => {
  const resolve = createBacklogSprintResolver(iterations)

  assert.deepEqual(
    ['Sprint 5', 'Sprint 6', 'Sprint 7', 'Sprint 4'].map((name) => {
      const { kind, label } = resolve(`Project\\Team\\${name}`)
      return [kind, label]
    }),
    [
      ['current', 'This sprint'],
      ['next', 'Next sprint'],
      ['future', 'Sprint 7'],
      ['past', 'Sprint 4 · ended'],
    ],
  )
  assert.equal(resolve('Project\\Team\\Sprint 5').iteration, iterations[1], 'the sprint itself, for its dates')
})

test('paths match without regard to case or surrounding whitespace', () => {
  const resolve = createBacklogSprintResolver(iterations)

  assert.equal(resolve('  project\\TEAM\\sprint 5 ').label, 'This sprint')
})

test('a path that is none of the team sprints is the backlog', () => {
  const resolve = createBacklogSprintResolver(iterations)

  for (const path of ['Project', 'Project\\Team', 'Project\\Other Team\\Sprint 5', '', undefined]) {
    const sprint = resolve(path)
    assert.deepEqual([sprint.kind, sprint.label, sprint.iteration], ['backlog', 'Backlog', undefined], String(path))
  }
})

test('without any future sprint dated, the first future sprint is still the next one', () => {
  const resolve = createBacklogSprintResolver([iteration('Sprint 9', 'future'), iteration('Sprint 8', 'future')])

  assert.equal(resolve('Project\\Team\\Sprint 9').label, 'Next sprint')
  assert.equal(resolve('Project\\Team\\Sprint 8').label, 'Sprint 8')
})

test('before the team sprints load, a bug shows its path\'s last segment, or Backlog without a path', () => {
  const resolve = createBacklogSprintResolver([])

  assert.deepEqual(resolve('Project\\Team\\Sprint 5'), { kind: 'unknown', label: 'Sprint 5' })
  assert.deepEqual(resolve(' Project \\ Team \\ '), { kind: 'unknown', label: 'Team' })
  assert.deepEqual(resolve(''), { kind: 'backlog', label: 'Backlog' })
  assert.deepEqual(resolve(undefined), { kind: 'backlog', label: 'Backlog' })
})
