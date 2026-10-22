import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { TeamProfile } from '../src/appSettings.ts'
import { validateTeamProfile } from '../src/features/standup/utils/teamProfileValidation.ts'

const completeTeamProfile: TeamProfile = {
  id: 'qa-team',
  displayName: 'QA Team',
  orgName: 'organization-one',
  projectName: 'project-one',
  areaPath: 'area',
  iterationPath: 'iteration',
  teamName: 'QA',
  repoName: 'repo',
}

test('team validation identifies the first missing field and its message', () => {
  assert.deepEqual(validateTeamProfile({ ...completeTeamProfile, displayName: '  ' }), {
    field: 'displayName',
    message: 'Display name is required.',
  })
})

test('team validation reports later missing fields after earlier fields are filled', () => {
  assert.deepEqual(validateTeamProfile({ ...completeTeamProfile, orgName: '' }), {
    field: 'orgName',
    message: 'Organization is required.',
  })
})

test('team validation accepts a complete profile', () => {
  assert.equal(validateTeamProfile(completeTeamProfile), null)
})
