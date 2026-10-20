import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getTeamProfileLabel, type TeamProfile } from '../src/appSettings.ts'

const team: TeamProfile = {
  id: 'qa-team',
  displayName: 'QA Team',
  orgName: 'organization-one',
  projectName: 'project-one',
  areaPath: 'area',
  iterationPath: 'iteration',
  teamName: 'QA',
  repoName: 'repo',
}

test('team labels include the display name, organization, and project', () => {
  assert.equal(getTeamProfileLabel(team), 'QA Team (organization-one/project-one)')
})

test('duplicate display names are distinguishable by organization or project', () => {
  const profiles = [
    team,
    { ...team, id: 'other-org', orgName: 'organization-two' },
    { ...team, id: 'other-project', projectName: 'project-two' },
  ]
  const original = structuredClone(profiles)

  assert.deepEqual(profiles.map(getTeamProfileLabel), [
    'QA Team (organization-one/project-one)',
    'QA Team (organization-two/project-one)',
    'QA Team (organization-one/project-two)',
  ])
  assert.deepEqual(profiles, original)
})
