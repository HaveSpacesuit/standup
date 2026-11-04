import { createRoot } from 'react-dom/client'
import { Root } from '@stratakit/mui'
import { KanbanBoardGrid } from '../../src/features/standup/components/KanbanBoardGrid'
import { STATUS_COLUMNS } from '../../src/features/standup/utils/statusColumnStyles'

const params = new URLSearchParams(location.search)
const colorScheme = params.get('scheme') === 'dark' ? 'dark' : 'light'
const compact = params.get('compact') === '1'

const now = Date.now()
const ago = (days: number) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString()

const pass = { state: 'passing', checks: [{ name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' }] }
const fail = { state: 'failing', checks: [{ name: 'Unit tests', state: 'failing', optional: false, expired: false, source: 'policy' }] }
const pend = { state: 'pending', checks: [{ name: 'Build', state: 'pending', optional: false, expired: false, source: 'policy' }] }
const icon = 'https://tfsprodcus3.visualstudio.com/_apis/wit/workItemIcons/icon_list?color=009CCC&v=2'
const bugIcon = 'https://tfsprodcus3.visualstudio.com/_apis/wit/workItemIcons/icon_insect?color=CC293D&v=2'

const alex = { displayName: 'Alex Example', uniqueName: 'alex@example.test' }
const quinn = { displayName: 'Quinn Tester', uniqueName: 'quinn@example.test' }

const items: Record<string, any[]> = {
  'alex:Blocked': [
    { id: 4710, title: 'Sync folder permissions with the identity service', state: 'On Hold', status: 'Blocked', effort: 3, tags: ['Blocked - waiting on IMS', 'Web'], sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: alex, recentActivityAt: ago(9) },
  ],
  'alex:New': [
    { id: 4802, title: 'Audit log export', state: 'New', status: 'New', effort: 2, sprintName: 'Sprint 41', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: alex, recentActivityAt: ago(1) },
  ],
  'alex:Active': [
    {
      id: 4821, title: 'Add folder rename to the web client with optimistic updates and undo', state: 'In Progress', status: 'Active', effort: 5, tags: ['Web'], sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: alex, recentActivityAt: ago(5),
      activePullRequests: [{ id: 912, repositoryName: 'pw-web', title: 'Folder rename API and client wiring', url: '#', approvalCount: 1, checks: fail, recentActivityAt: ago(2) }],
    },
    { id: 4833, title: 'Thumbnail cache misses after rename', state: 'Failed Testing', status: 'Active', effort: 1, sprintName: 'Sprint 42', workItemIconUrl: bugIcon, workItemType: 'Bug', assignedTo: alex, recentActivityAt: hoursAgo(3) },
  ],
  'alex:Review': [
    {
      id: 4790, title: 'Bulk move documents between datasources', state: 'In Code Review', status: 'Review', effort: 8, sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: alex, recentActivityAt: ago(3),
      activePullRequests: [
        { id: 901, repositoryName: 'pw-web', title: 'Bulk move service', url: '#', approvalCount: 2, checks: pass, recentActivityAt: ago(1) },
        { id: 902, repositoryName: 'pw-api', title: 'Bulk move endpoint', url: '#', approvalCount: 0, checks: pend, recentActivityAt: ago(1) },
      ],
    },
    { id: 4777, title: 'Show check-out owner in the details pane', state: 'Available for Testing', status: 'Review', effort: 2, sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: quinn, recentActivityAt: ago(6) },
  ],
  'alex:Done': [
    { id: 4700, title: 'Keyboard shortcuts for the grid', state: 'Done', status: 'Done', effort: 3, sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: alex, recentActivityAt: ago(4) },
  ],
  'sam:Active': [
    { id: 4840, kind: 'pull-request', title: 'Bump dependencies', status: 'Active', recentActivityAt: ago(1), pullRequest: { id: 930, repositoryName: 'pw-web', title: 'Bump React and MUI', url: '#', approvalCount: 1, reviewState: 'waiting-for-author', checks: pass, recentActivityAt: ago(1) } },
    { id: 4845, title: 'Remember the last opened folder per datasource', state: 'Committed', status: 'Active', effort: 3, tags: ['Customer', 'Web'], sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', recentActivityAt: hoursAgo(2) },
  ],
  'sam:Review': [
    { id: 4850, kind: 'pull-request', title: 'Telemetry for search', status: 'Review', recentActivityAt: ago(2), pullRequest: { id: 931, repositoryName: 'pw-web', title: 'Add telemetry to search', url: '#', approvalCount: 2, checks: pass, recentActivityAt: ago(2) } },
    {
      id: 4851, title: 'Rework the share dialog', state: 'In Code Review', status: 'Review', effort: 5, sprintName: 'Sprint 42', workItemIconUrl: icon, workItemType: 'Product Backlog Item', recentActivityAt: ago(2),
      activePullRequests: [{ id: 932, repositoryName: 'pw-web', title: 'Share dialog rework', url: '#', approvalCount: 1, reviewState: 'rejected', checks: pass, recentActivityAt: ago(2) }],
    },
  ],
}

const counts = Object.fromEntries(STATUS_COLUMNS.map((status) => [status, Object.entries(items).filter(([key]) => key.endsWith(`:${status}`)).reduce((sum, [, list]) => sum + list.length, 0)]))
const effort = Object.fromEntries(STATUS_COLUMNS.map((status) => [status, 0]))

const changeDetailsByItemId = {
  4833: { reason: 'Moved to Failed Testing', changedAt: hoursAgo(3), idleDays: 0, agingLevel: 0 },
  4845: { reason: 'Tags changed', changedAt: hoursAgo(2), idleDays: 0, agingLevel: 0 },
  4710: { idleDays: 9, agingLevel: 4 },
  4821: { idleDays: 2, agingLevel: 1 },
  4790: { idleDays: 5, agingLevel: 3 },
  4777: { idleDays: 3, agingLevel: 2 },
  4700: { idleDays: 12, agingLevel: 4 },
  4851: { idleDays: 4, agingLevel: 2 },
}

createRoot(document.getElementById('root')!).render(
  <Root colorScheme={colorScheme}>
    <KanbanBoardGrid
      boardGridTemplate="175px repeat(5, minmax(200px, 1fr))"
      collapsedCellCardLimit={3}
      rows={[
        { key: 'alex', label: 'Alex Example', memberIdentity: alex },
        { key: 'sam', label: 'Sam Developer', memberIdentity: { displayName: 'Sam Developer', uniqueName: 'sam@example.test' } },
      ] as any}
      cardsByCell={items as any}
      expandedCells={{}}
      currentIterationName="Sprint 42"
      statusItemCounts={counts as any}
      statusEffortTotals={effort as any}
      renderStatusColumnBackground={() => 'none'}
      onSetCellExpanded={() => {}}
      changeHighlightsByItemId={{ 4833: 'new', 4845: 'new', 4700: 'stale', 4710: 'stale' }}
      rolledOverItemIds={{ 4802: true }}
      {...({ changeDetailsByItemId, compactCards: compact } as any)}
    />
  </Root>,
)
