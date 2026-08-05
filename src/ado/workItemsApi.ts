import type { TeamProfile } from '../teamProfiles'
import { parseAssignedTo } from './identity'
import type { AdoRequestClient } from './httpClient'
import type { WorkItemSummary } from './types'
import { buildIterationScopedWiql } from './wiql'
import resolveStatusFromStateAndTags from './workItemStatus'
import { fetchWorkItemIconMap } from './workItemIconsApi'

const WORK_ITEM_TYPE_ICON_IDS: Record<string, string> = {
  bug: 'icon_insect',
  task: 'icon_clipboard',
  issue: 'icon_clipboard_issue',
  story: 'icon_book',
  'user story': 'icon_book',
  'product backlog item': 'icon_list',
  feature: 'icon_trophy',
  epic: 'icon_star',
}

function normalizeType(value: string): string {
  return value.trim().toLowerCase()
}

function getIconIdForWorkItemType(typeValue?: string): string {
  if (!typeValue) {
    return 'icon_clipboard'
  }

  return WORK_ITEM_TYPE_ICON_IDS[normalizeType(typeValue)] ?? 'icon_clipboard'
}

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
    'System.WorkItemType'?: unknown
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

  const workItemIconMapPromise = fetchWorkItemIconMap(client, team.orgName, signal)

  const batchResponse = await client.request<WorkItemsBatchResponse>({
    method: 'POST',
    orgName: team.orgName,
    path: '/_apis/wit/workitemsbatch',
    params: {
      'api-version': '7.1',
    },
    body: {
      ids,
      fields: ['System.Title', 'System.WorkItemType', 'System.AssignedTo', 'System.State', 'System.Tags'],
    },
    signal,
  })

  const workItemIconMap = await workItemIconMapPromise

  return (batchResponse.value ?? [])
    .map((item): WorkItemSummary | null => {
      if (typeof item.id !== 'number') {
        return null
      }

      const workItemType =
        typeof item.fields?.['System.WorkItemType'] === 'string'
          ? item.fields?.['System.WorkItemType']
          : undefined
      const iconId = getIconIdForWorkItemType(workItemType)

      return {
        id: item.id,
        title: item.fields?.['System.Title'] ?? `Work Item ${item.id}`,
        workItemType,
        workItemIconUrl: workItemIconMap[iconId],
        assignedTo: parseAssignedTo(item.fields?.['System.AssignedTo']),
        status: resolveStatusFromStateAndTags(
          item.fields?.['System.State'],
          item.fields?.['System.Tags'],
        ),
      }
    })
    .filter((item): item is WorkItemSummary => item !== null)
}
