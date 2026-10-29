import type { TeamProfile } from '../appSettings'
import { mapWithConcurrency } from './concurrency'
import type { AdoRequestClient } from './httpClient'
import { parseAssignedTo } from './identity'
import type { BacklogBug } from './types'
import { buildBacklogBugsWiql } from './wiql'
import { chunkArray, EFFORT_FIELD_NAMES, fetchWorkItemIdsByWiql, parseEffort, WORK_ITEM_BATCH_LIMIT } from './workItemsApi'
import type { ProjectWorkItemState } from './workItemTypesApi'

const BATCH_REQUEST_CONCURRENCY = 4

/** State categories that Azure DevOps keeps off its own backlogs: finished and removed work. */
const CLOSED_STATE_CATEGORIES = new Set(['completed', 'removed'])

/** Used when the Bug type reports no closed-category states to exclude. */
export const FALLBACK_CLOSED_BUG_STATES: readonly string[] = ['Closed', 'Done', 'Removed', 'Completed']

const BACKLOG_BUG_FIELDS = [
  'System.Title',
  'System.CreatedDate',
  'System.State',
  'System.AssignedTo',
  'System.IterationPath',
  'Microsoft.VSTS.Common.Severity',
  'Microsoft.VSTS.Common.Priority',
  ...EFFORT_FIELD_NAMES,
]

type BacklogBugApiItem = {
  id?: number
  fields?: Record<string, unknown>
}

type BacklogBugsBatchResponse = {
  value?: BacklogBugApiItem[]
}

/** Numeric work item fields arrive as JSON numbers, or occasionally as numeric strings. */
const parseNumericField = parseEffort

function readText(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function resolveEffort(fields: Record<string, unknown>): number | undefined {
  for (const fieldName of EFFORT_FIELD_NAMES) {
    const effort = parseNumericField(fields[fieldName])
    if (effort !== undefined) {
      return effort
    }
  }

  return undefined
}

/** Names of the Bug states that take a bug off the backlog (by state category, else well-known names). */
export function resolveClosedBugStates(bugStates: readonly ProjectWorkItemState[] | undefined): string[] {
  const closedStates = (bugStates ?? [])
    .filter((state) => CLOSED_STATE_CATEGORIES.has(state.category.trim().toLowerCase()))
    .map((state) => state.name)

  return closedStates.length > 0 ? closedStates : [...FALLBACK_CLOSED_BUG_STATES]
}

export function mapBacklogBug(
  item: BacklogBugApiItem,
  team: Pick<TeamProfile, 'orgName' | 'projectName'>,
): BacklogBug | null {
  if (typeof item.id !== 'number') {
    return null
  }

  const fields = item.fields ?? {}

  return {
    id: item.id,
    title: readText(fields['System.Title']) ?? `Bug ${item.id}`,
    state: readText(fields['System.State']),
    createdAt: readText(fields['System.CreatedDate']),
    assignedTo: parseAssignedTo(fields['System.AssignedTo']),
    iterationPath: readText(fields['System.IterationPath']),
    severity: readText(fields['Microsoft.VSTS.Common.Severity']),
    priority: parseNumericField(fields['Microsoft.VSTS.Common.Priority']),
    effort: resolveEffort(fields),
    workItemUrl: `https://dev.azure.com/${encodeURIComponent(team.orgName)}/${encodeURIComponent(team.projectName)}/_workitems/edit/${item.id}`,
  }
}

/** Fetches every open Bug for the team's area path, across all iterations. */
export async function fetchBacklogBugs(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'orgName' | 'projectName' | 'areaPath'>,
  closedStates: readonly string[],
  signal?: AbortSignal,
): Promise<BacklogBug[]> {
  const ids = await fetchWorkItemIdsByWiql(
    client,
    team,
    buildBacklogBugsWiql(team.projectName, team.areaPath, closedStates),
    signal,
  )
  if (ids.length === 0) {
    return []
  }

  const batches = await mapWithConcurrency(
    chunkArray(ids, WORK_ITEM_BATCH_LIMIT),
    BATCH_REQUEST_CONCURRENCY,
    (idsChunk) => client.request<BacklogBugsBatchResponse>({
      method: 'POST',
      orgName: team.orgName,
      path: '/_apis/wit/workitemsbatch',
      params: {
        'api-version': '7.1',
      },
      body: {
        ids: idsChunk,
        fields: BACKLOG_BUG_FIELDS,
      },
      signal,
    }),
  )

  return batches
    .flatMap((batch) => batch.value ?? [])
    .map((item) => mapBacklogBug(item, team))
    .filter((bug): bug is BacklogBug => bug !== null)
}
