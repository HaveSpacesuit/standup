import type { TagRule, TagRuleAction } from './ado/workItemStatus'
import type { TeamProfile } from './appSettings'
import type { AssignmentOptions, AssignmentSprintFilter } from './features/standup/utils/assignmentOptions'
import type {
  QaOptions,
  QaSprintFilter,
  QaStateGroupOverrides,
  QaTagFilterRule,
  QaTagGroups,
} from './features/standup/utils/qaOptions'
import { DEFAULT_ASSIGNMENT_SPRINT_FILTER } from './features/standup/utils/assignmentOptions'
import { DEFAULT_QA_LOOKBACK_DAYS, EMPTY_SPRINT_FILTER, normalizeQaLookbackDays } from './features/standup/utils/qaOptions'

export type TeamDataExport = {
  schemaVersion: 1
  exportedAt: string
  teamProfile: TeamProfile
  assignmentOptions: AssignmentOptions
  assignmentTagRules: TagRule[]
  qaOptions: QaOptions
}

const VALID_TAG_RULE_ACTIONS = new Set<TagRuleAction>([
  'Blocked',
  'New',
  'Active',
  'Review',
  'Done',
  'unlisted',
])

function assertObject(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(message)
  }
}

function parseStringArray(value: unknown, message: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) {
    throw new Error(message)
  }

  return value.map((entry) => entry.trim())
}

function parseOptionalStringRecord(value: unknown, message: string): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined
  }

  assertObject(value, message)
  for (const [key, entry] of Object.entries(value)) {
    if (!key || typeof entry !== 'string') {
      throw new Error(message)
    }
  }

  const normalizedEntries: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    normalizedEntries[key.trim()] = entry as string
  }

  return normalizedEntries
}

function parseSprintFilter(value: unknown, defaults: QaSprintFilter | AssignmentSprintFilter, message: string): QaSprintFilter {
  assertObject(value, message)

  return {
    current: typeof value.current === 'boolean' ? value.current : defaults.current,
    next: typeof value.next === 'boolean' ? value.next : defaults.next,
    nextNext: typeof value.nextNext === 'boolean' ? value.nextNext : defaults.nextNext,
    iterationPaths: parseStringArray(value.iterationPaths ?? [], `${message}: iterationPaths must be a string array.`),
  }
}

function parseStateGroups(value: unknown, message: string): QaStateGroupOverrides | null {
  if (value === null) {
    return null
  }

  assertObject(value, message)
  return {
    testing: parseStringArray(value.testing ?? [], `${message}: testing must be a string array.`),
    done: parseStringArray(value.done ?? [], `${message}: done must be a string array.`),
    development: parseStringArray(value.development ?? [], `${message}: development must be a string array.`),
    new: parseStringArray(value.new ?? [], `${message}: new must be a string array.`),
  }
}

function parseTagGroups(value: unknown, message: string): QaTagGroups | null {
  if (value === null) {
    return null
  }

  assertObject(value, message)
  return {
    testing: parseStringArray(value.testing ?? [], `${message}: testing must be a string array.`),
    done: parseStringArray(value.done ?? [], `${message}: done must be a string array.`),
    development: parseStringArray(value.development ?? [], `${message}: development must be a string array.`),
    new: parseStringArray(value.new ?? [], `${message}: new must be a string array.`),
  }
}

function parseTagFilterRules(value: unknown, message: string): QaTagFilterRule[] {
  if (!Array.isArray(value)) {
    throw new Error(message)
  }

  return value.map((entry, index) => {
    assertObject(entry, `${message}: entry ${index + 1} must be an object.`)

    if (entry.type !== 'tag') {
      throw new Error(`${message}: entry ${index + 1} must have type "tag".`)
    }

    if (typeof entry.tagMatch !== 'string' || !entry.tagMatch.trim()) {
      throw new Error(`${message}: entry ${index + 1} must include a tagMatch string.`)
    }

    return {
      id: typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      type: 'tag',
      tagMatch: entry.tagMatch.trim(),
    }
  })
}

function parseTagRules(value: unknown, message: string): TagRule[] {
  if (!Array.isArray(value)) {
    throw new Error(message)
  }

  return value.map((entry, index) => {
    assertObject(entry, `${message}: entry ${index + 1} must be an object.`)

    if (typeof entry.tag !== 'string' || !entry.tag.trim()) {
      throw new Error(`${message}: entry ${index + 1} must include a tag string.`)
    }

    if (!VALID_TAG_RULE_ACTIONS.has(entry.action as TagRuleAction)) {
      throw new Error(`${message}: entry ${index + 1} has an invalid action.`)
    }

    return {
      id: typeof entry.id === 'string' && entry.id.trim()
        ? entry.id.trim()
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tag: entry.tag.trim(),
      action: entry.action as TagRuleAction,
    }
  })
}

function parseTeamProfile(value: unknown): TeamProfile {
  assertObject(value, 'Imported team data must include a teamProfile object.')

  const requiredFields = ['id', 'orgName', 'projectName', 'displayName', 'areaPath', 'iterationPath', 'teamName', 'repoName'] as const
  for (const field of requiredFields) {
    if (typeof value[field] !== 'string' || !value[field]?.trim()) {
      throw new Error(`Imported team profile is missing ${field}.`)
    }
  }

  const id = value.id as string
  const orgName = value.orgName as string
  const projectName = value.projectName as string
  const displayName = value.displayName as string
  const areaPath = value.areaPath as string
  const iterationPath = value.iterationPath as string
  const teamName = value.teamName as string
  const repoName = value.repoName as string

  return {
    id: id.trim(),
    orgName: orgName.trim(),
    projectName: projectName.trim(),
    displayName: displayName.trim(),
    areaPath: areaPath.trim(),
    iterationPath: iterationPath.trim(),
    teamName: teamName.trim(),
    repoName: repoName.trim(),
    extra: parseOptionalStringRecord(value.extra, 'Imported team profile extra must be a string map.'),
  }
}

function parseAssignmentOptions(value: unknown): AssignmentOptions {
  assertObject(value, 'Imported team data must include assignmentOptions.')

  return {
    includeWorkItemTypes: parseStringArray(
      value.includeWorkItemTypes ?? [],
      'Imported assignment options includeWorkItemTypes must be a string array.',
    ),
    sprintFilter: parseSprintFilter(
      value.sprintFilter ?? DEFAULT_ASSIGNMENT_SPRINT_FILTER,
      DEFAULT_ASSIGNMENT_SPRINT_FILTER,
      'Imported assignment options sprintFilter is invalid.',
    ),
  }
}

function parseQaOptions(value: unknown): QaOptions {
  assertObject(value, 'Imported team data must include qaOptions.')

  if (typeof value.lookbackDays !== 'number' || !Number.isFinite(value.lookbackDays)) {
    throw new Error('Imported QA options must include a numeric lookbackDays value.')
  }

  return {
    generalFilters: parseTagFilterRules(
      value.generalFilters ?? [],
      'Imported QA options generalFilters must be a tag-rule array.',
    ),
    includeWorkItemTypes: parseStringArray(
      value.includeWorkItemTypes ?? [],
      'Imported QA options includeWorkItemTypes must be a string array.',
    ),
    lookbackDays: normalizeQaLookbackDays(value.lookbackDays ?? DEFAULT_QA_LOOKBACK_DAYS),
    sprintFilter: parseSprintFilter(
      value.sprintFilter ?? EMPTY_SPRINT_FILTER,
      EMPTY_SPRINT_FILTER,
      'Imported QA options sprintFilter is invalid.',
    ),
    stateGroups: parseStateGroups(value.stateGroups ?? null, 'Imported QA options stateGroups are invalid.'),
    tagGroups: parseTagGroups(value.tagGroups ?? null, 'Imported QA options tagGroups are invalid.'),
  }
}

export function buildTeamDataExport({
  teamProfile,
  assignmentOptions,
  assignmentTagRules,
  qaOptions,
}: Omit<TeamDataExport, 'schemaVersion' | 'exportedAt'>): TeamDataExport {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    teamProfile,
    assignmentOptions,
    assignmentTagRules,
    qaOptions,
  }
}

export function serializeTeamDataExport(value: TeamDataExport): string {
  return JSON.stringify(value, null, 2)
}

export function parseImportedTeamData(jsonText: string): TeamDataExport {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error('Imported team data is not valid JSON.')
  }

  assertObject(parsed, 'Imported team data must be a JSON object.')

  if (parsed.schemaVersion !== 1) {
    throw new Error('Imported team data has an unsupported schemaVersion.')
  }

  return {
    schemaVersion: 1,
    exportedAt: typeof parsed.exportedAt === 'string' && parsed.exportedAt.trim()
      ? parsed.exportedAt
      : new Date().toISOString(),
    teamProfile: parseTeamProfile(parsed.teamProfile),
    assignmentOptions: parseAssignmentOptions(parsed.assignmentOptions),
    assignmentTagRules: parseTagRules(
      parsed.assignmentTagRules ?? [],
      'Imported assignment tag rules must be an array of tag rule objects.',
    ),
    qaOptions: parseQaOptions(parsed.qaOptions),
  }
}
