import type { TeamProfile } from '../teamProfiles'
import { parseAssignedTo } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { WorkItemSummary } from './types'
import { buildIterationScopedWiql } from './wiql'
import { resolveStatusFromStateAndTags } from './workItemStatus'

type WiqlResponse = {
  workItems?: Array<{ id: number }>
}

type WorkItemsBatchResponse = {
  count: number
  value: WorkItemApiItem[]
}

type WorkItemApiItem = {
  id?: number
  fields?: {
    'System.Title'?: string
    'System.AssignedTo'?: unknown
    'System.State'?: unknown
    'System.Tags'?: unknown
  }
}

export async function fetchWorkItemsForCurrentAndNextIteration(
  client: AdoRequestClient,
  team: Pick<TeamProfile, 'id' | 'orgName' | 'projectName' | 'areaPath' | 'iterationPath'>,
  signal?: AbortSignal,
): Promise<WorkItemSummary[]> {
  const wiqlQuery = buildIterationScopedWiql(team.projectName, team.areaPath, team.iterationPath)

  const wiqlResponse = await client.request<WiqlResponse>({
    method: 'POST',
    orgName: team.orgName,
    path: `/${encodeURIComponent(team.projectName)}/_apis/wit/wiql`,
    params: {
      'api-version': '7.1',
    },
    body: {
      query: wiqlQuery,
    },
    signal,
  })

  const ids = (wiqlResponse.workItems ?? []).map((item) => item.id)
  if (ids.length === 0) {
    return []
  }

  const batchResponse = await client.request<WorkItemsBatchResponse>({
    method: 'POST',
    orgName: team.orgName,
    path: '/_apis/wit/workitemsbatch',
    params: {
      'api-version': '7.1',
    },
    body: {
      ids,
      fields: ['System.Title', 'System.AssignedTo', 'System.State', 'System.Tags'],
    },
    signal,
  })

  return (batchResponse.value ?? [])
    .map((item): WorkItemSummary | null => {
      if (typeof item.id !== 'number') {
        return null
      }

      return {
        id: item.id,
        title: item.fields?.['System.Title'] ?? `Work Item ${item.id}`,
        assignedTo: parseAssignedTo(item.fields?.['System.AssignedTo']),
        status: resolveStatusFromStateAndTags(
          item.fields?.['System.State'],
          item.fields?.['System.Tags'],
        ),
      }
    })
    .filter((item): item is WorkItemSummary => item !== null)
}
