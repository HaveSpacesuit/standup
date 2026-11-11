import type { TriageQueryOptions } from '../features/standup/utils/triageOptions'
import { getInitialState, type ProjectWorkItemTypeInfo } from './workItemTypesApi'

const quoteWiql = (value: string) => `'${value.replace(/'/g, "''")}'`
const isTerminalCategory = (category: string) => ['completed', 'removed'].includes(category.trim().toLowerCase())

/** Each Triage rule as a WIQL condition: a tag, or a bug in its initial state outside the excluded iterations. */
function getTriageSourceClauses(options: TriageQueryOptions, metadata: ProjectWorkItemTypeInfo): string[] {
  const sources = options.tags.map((tag) => `[System.Tags] CONTAINS ${quoteWiql(tag)}`)
  if (options.includeNewBugs) {
    const initial = getInitialState(metadata, 'Bug')
    if (!initial) throw new Error('The Bug type has no Proposed state for new bugs. Check the project process or disable the new-bug rule.')
    sources.push(`([System.WorkItemType] = 'Bug' AND [System.State] = ${quoteWiql(initial.name)}${
      options.excludedIterationPaths.map((path) => ` AND [System.IterationPath] NOT UNDER ${quoteWiql(path)}`).join('')
    })`)
  }
  if (sources.length === 0) throw new Error('Configure at least one Triage rule before querying.')
  return sources
}

/** Each type's Completed and Removed state names, after checking every state has a category WIQL can rely on. */
function getTerminalStatesByType(metadata: ProjectWorkItemTypeInfo): Array<[type: string, terminal: string[], open: string[]]> {
  const entries = Object.entries(metadata.statesByType).map(([type, states]): [string, string[], string[]] => {
    if (states.length === 0 || states.some((state) =>
      !['proposed', 'inprogress', 'resolved', 'completed', 'removed'].includes(state.category.trim().toLowerCase()))) {
      throw new Error(`State categories are unavailable for ${type}. Refresh or check the project process.`)
    }
    return [
      type,
      states.filter((state) => isTerminalCategory(state.category)).map((state) => state.name),
      states.filter((state) => !isTerminalCategory(state.category)).map((state) => state.name),
    ]
  })
  if (entries.length === 0) throw new Error('Work-item state metadata is unavailable. Refresh to retry.')
  return entries
}

const perTypeUnfinished = (types: ReturnType<typeof getTerminalStatesByType>) => types.map(([type, terminal]) =>
  `([System.WorkItemType] = ${quoteWiql(type)}${terminal.length ? ` AND [System.State] NOT IN (${terminal.map(quoteWiql).join(', ')})` : ''})`)

export function buildTriageWiql(
  projectName: string,
  areaPath: string,
  options: TriageQueryOptions,
  metadata: ProjectWorkItemTypeInfo,
): string {
  const sources = getTriageSourceClauses(options, metadata)
  const unfinished = perTypeUnfinished(getTerminalStatesByType(metadata))
  return [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quoteWiql(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quoteWiql(areaPath)}`,
    `  AND (${sources.join(' OR ')})`,
    `  AND (${unfinished.join(' OR ')})`,
    'ORDER BY [System.CreatedDate] ASC, [System.Id] ASC',
  ].join('\n')
}

/**
 * The same queue as `buildTriageWiql`, written to open as an Azure DevOps query in the browser: it selects columns worth
 * reading, sits on one line, and when no type reuses a finished state's name for an unfinished one, it leaves out the
 * finished states in a single list instead of one clause per type, so the URL stays short.
 */
export function buildTriageQueryWiql(
  projectName: string,
  areaPath: string,
  options: TriageQueryOptions,
  metadata: ProjectWorkItemTypeInfo,
): string {
  const sources = getTriageSourceClauses(options, metadata)
  const types = getTerminalStatesByType(metadata)
  const terminal = new Map(types.flatMap(([, names]) => names.map((name) => [name.toLowerCase(), name] as const)))
  const reused = types.some(([, , open]) => open.some((name) => terminal.has(name.toLowerCase())))
  const unfinished = reused
    ? [`(${perTypeUnfinished(types).join(' OR ')})`]
    : terminal.size ? [`[System.State] NOT IN (${[...terminal.values()].map(quoteWiql).join(', ')})`] : []
  return [
    'SELECT [System.Id], [System.WorkItemType], [System.Title], [System.State], [System.AssignedTo], [System.Tags], [System.CreatedDate]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quoteWiql(projectName)}`,
    `AND [System.AreaPath] UNDER ${quoteWiql(areaPath)}`,
    `AND (${sources.join(' OR ')})`,
    ...unfinished.map((clause) => `AND ${clause}`),
    'ORDER BY [System.CreatedDate] ASC, [System.Id] ASC',
  ].join(' ')
}

/** Opens `wiql` as an unsaved query in Azure DevOps' Queries page. */
export function buildAdoQueryUrl(orgName: string, projectName: string, wiql: string): string {
  return `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_queries/query/?wiql=${encodeURIComponent(wiql)}`
}

export function buildIterationScopedWiql(
  projectName: string,
  areaPath: string,
  teamIterationPath: string,
  includeWorkItemTypes: string[] = [],
  includeIterationPaths: string[] = [],
  useDefaultIterationWindow = true,
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const iterationMacro = `@CurrentIteration(${quote(teamIterationPath)})`

  const clauses = [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
  ]

  if (includeIterationPaths.length > 0) {
    const pathList = includeIterationPaths.map(quote).join(', ')
    clauses.push(`  AND [System.IterationPath] IN (${pathList})`)
  } else if (useDefaultIterationWindow) {
    clauses.push(
      `  AND (`,
      `    [System.IterationPath] = ${iterationMacro}`,
      `    OR (`,
      `      [System.IterationPath] = ${iterationMacro} + 1`,
      `      AND [System.AssignedTo] <> ''`,
      `    )`,
      `  )`,
    )
  }

  if (includeWorkItemTypes.length > 0) {
    const typeList = includeWorkItemTypes.map(quote).join(', ')
    clauses.push(`  AND [System.WorkItemType] IN (${typeList})`)
  }

  clauses.push('ORDER BY [System.ChangedDate] DESC')

  return clauses.join('\n')
}

export function buildIterationMembershipWiql(
  projectName: string,
  areaPath: string,
  iterationPath: string,
  includeWorkItemTypes: string[] = [],
  asOf?: string,
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const clauses = [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    `  AND [System.IterationPath] = ${quote(iterationPath)}`,
  ]

  if (includeWorkItemTypes.length > 0) {
    clauses.push(`  AND [System.WorkItemType] IN (${includeWorkItemTypes.map(quote).join(', ')})`)
  }

  if (asOf) {
    clauses.push(`ASOF ${quote(asOf)}`)
  }

  return clauses.join('\n')
}

export function buildQaBucketCandidatesWiql(
  projectName: string,
  areaPath: string,
  lookbackDays = 21,
  includeWorkItemTypes: string[] = [],
  includeIterationPaths: string[] = [],
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const startOfWindow = `@StartOfDay('-${lookbackDays}')`

  const clauses = [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    '  AND (',
    `    [System.CreatedDate] >= ${startOfWindow}`,
    `    OR [System.ChangedDate] >= ${startOfWindow}`,
    '  )',
  ]

  if (includeWorkItemTypes.length > 0) {
    const typeList = includeWorkItemTypes.map(quote).join(', ')
    clauses.push(`  AND [System.WorkItemType] IN (${typeList})`)
  }

  if (includeIterationPaths.length > 0) {
    const pathList = includeIterationPaths.map(quote).join(', ')
    clauses.push(`  AND [System.IterationPath] IN (${pathList})`)
  }

  clauses.push('ORDER BY [System.ChangedDate] DESC')

  return clauses.join('\n')
}

/**
 * All Bugs under the area path that are not in one of the closed states, regardless of iteration.
 * WIQL cannot filter on a state category, so the caller resolves the closed state names first.
 */
export function buildBacklogBugsWiql(
  projectName: string,
  areaPath: string,
  closedStates: readonly string[] = [],
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

  const clauses = [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    `  AND [System.WorkItemType] = 'Bug'`,
  ]

  if (closedStates.length > 0) {
    clauses.push(`  AND [System.State] NOT IN (${closedStates.map(quote).join(', ')})`)
  }

  clauses.push('ORDER BY [System.Id]')

  return clauses.join('\n')
}

/**
 * Bugs under the area path that entered one of the completed states in the last `days` days, newest first. A closed
 * bug's state change date is when it was closed; WIQL cannot filter on a state category, so the caller names the states.
 */
export function buildRecentlyClosedBugsWiql(
  projectName: string,
  areaPath: string,
  completedStates: readonly string[],
  days: number,
): string {
  return [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quoteWiql(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quoteWiql(areaPath)}`,
    `  AND [System.WorkItemType] = 'Bug'`,
    `  AND [System.State] IN (${completedStates.map(quoteWiql).join(', ')})`,
    `  AND [Microsoft.VSTS.Common.StateChangeDate] >= @Today - ${Math.max(Math.trunc(days), 0)}`,
    'ORDER BY [Microsoft.VSTS.Common.StateChangeDate] DESC',
  ].join('\n')
}
