import { createRoot } from 'react-dom/client'
import { useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { Root } from '@stratakit/mui'
import { TeamAssignmentsPage } from '../../src/features/standup/pages/TeamAssignmentsPage'

const params = new URLSearchParams(location.search)
const colorScheme = params.get('scheme') === 'dark' ? 'dark' : 'light'
const noBlocked = params.get('blocked') === '0'

const DAY = 24 * 60 * 60 * 1000
const now = Date.now()
const ago = (days: number) => new Date(now - days * DAY).toISOString()
const hoursAgo = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString()
const dateOnly = (offsetDays: number) => new Date(now + offsetDays * DAY).toISOString().slice(0, 10)

const pass = { state: 'passing', checks: [{ name: 'Build', state: 'passing', optional: false, expired: false, source: 'policy' }] }
const fail = { state: 'failing', checks: [{ name: 'Unit tests', state: 'failing', optional: false, expired: false, source: 'policy' }] }
const pend = { state: 'pending', checks: [{ name: 'Build', state: 'pending', optional: false, expired: false, source: 'policy' }] }
const icon = 'https://tfsprodcus3.visualstudio.com/_apis/wit/workItemIcons/icon_list?color=009CCC&v=2'
const bugIcon = 'https://tfsprodcus3.visualstudio.com/_apis/wit/workItemIcons/icon_insect?color=CC293D&v=2'

const people = ['Alex Example', 'Blair Nguyen', 'Casey Morgan', 'Dana Ortiz', 'Ellis Park', 'Frankie Shah']
const members = people.map((displayName) => ({ id: displayName, displayName, uniqueName: `${displayName.split(' ')[0].toLowerCase()}@example.test` }))
const identity = (name: string) => members.find((member) => member.displayName === name)!
const quinn = { displayName: 'Quinn Tester', uniqueName: 'quinn@example.test' }
const SPRINT = 'Sprint 42'

type Seed = Record<string, any> & { owner: string }
const seeds: Seed[] = [
  { owner: 'Alex Example', id: 4710, title: 'Sync folder permissions with the identity service', state: 'On Hold', status: 'Blocked', effort: 3, tags: ['Blocked - waiting on IMS', 'Web'], workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Alex Example', id: 4802, title: 'Audit log export', state: 'New', status: 'New', effort: 2, sprintName: 'Sprint 41', workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Alex Example', id: 4821, title: 'Add folder rename to the web client with optimistic updates and undo', state: 'In Progress', status: 'Active', effort: 5, tags: ['Web'], workItemIconUrl: icon, workItemType: 'Product Backlog Item',
    activePullRequests: [{ id: 912, repositoryName: 'pw-web', title: 'Folder rename API and client wiring', url: '#', approvalCount: 1, checks: fail, recentActivityAt: ago(2) }] },
  { owner: 'Alex Example', id: 4833, title: 'Thumbnail cache misses after rename', state: 'Failed Testing', status: 'Active', effort: 1, workItemIconUrl: bugIcon, workItemType: 'Bug' },
  { owner: 'Alex Example', id: 4790, title: 'Bulk move documents between datasources', state: 'In Code Review', status: 'Review', effort: 8, workItemIconUrl: icon, workItemType: 'Product Backlog Item',
    activePullRequests: [
      { id: 901, repositoryName: 'pw-web', title: 'Bulk move service', url: '#', approvalCount: 2, checks: pass, recentActivityAt: ago(1) },
      { id: 902, repositoryName: 'pw-api', title: 'Bulk move endpoint', url: '#', approvalCount: 0, checks: pend, recentActivityAt: ago(1) },
    ] },
  { owner: 'Alex Example', id: 4777, title: 'Show check-out owner in the details pane', state: 'Available for Testing', status: 'Review', effort: 2, workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: quinn },
  { owner: 'Alex Example', id: 4700, title: 'Keyboard shortcuts for the grid', state: 'Done', status: 'Done', effort: 3, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Alex Example', id: 4701, title: 'Grid column chooser', state: 'Done', status: 'Done', effort: 2, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Blair Nguyen', id: 4840, kind: 'pull-request', title: 'Bump dependencies', status: 'Active', pullRequest: { id: 930, repositoryName: 'pw-web', title: 'Bump React and MUI', url: '#', approvalCount: 1, reviewState: 'waiting-for-author', checks: pass, recentActivityAt: ago(1) } },
  { owner: 'Blair Nguyen', id: 4845, title: 'Remember the last opened folder per datasource', state: 'Committed', status: 'Active', effort: 3, tags: ['Customer', 'Web'], workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Blair Nguyen', id: 4850, kind: 'pull-request', title: 'Telemetry for search', status: 'Review', pullRequest: { id: 931, repositoryName: 'pw-web', title: 'Add telemetry to search', url: '#', approvalCount: 2, checks: pass, recentActivityAt: ago(2) } },
  { owner: 'Blair Nguyen', id: 4851, title: 'Rework the share dialog', state: 'In Code Review', status: 'Review', effort: 5, workItemIconUrl: icon, workItemType: 'Product Backlog Item',
    activePullRequests: [{ id: 932, repositoryName: 'pw-web', title: 'Share dialog rework', url: '#', approvalCount: 1, reviewState: 'rejected', checks: pass, recentActivityAt: ago(2) }] },
  { owner: 'Blair Nguyen', id: 4860, title: 'Saved searches sidebar', state: 'New', status: 'New', effort: 5, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Casey Morgan', id: 4870, title: 'Datasource picker loses focus after refresh', state: 'In Progress', status: 'Active', effort: 2, workItemIconUrl: bugIcon, workItemType: 'Bug',
    activePullRequests: [{ id: 940, repositoryName: 'pw-web', title: 'Restore focus after refresh', url: '#', approvalCount: 0, checks: pass, recentActivityAt: hoursAgo(5) }] },
  { owner: 'Casey Morgan', id: 4871, title: 'Version history compare view', state: 'In Progress', status: 'Active', effort: 8, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Casey Morgan', id: 4872, title: 'Explorer context menu parity', state: 'Done', status: 'Done', effort: 3, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Casey Morgan', id: 4873, title: 'Upload progress toast', state: 'Done', status: 'Done', effort: 1, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Casey Morgan', id: 4874, title: 'Drag files from desktop', state: 'Done', status: 'Done', effort: 5, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Dana Ortiz', id: 4880, title: 'Server-side paging for large folders', state: 'In Code Review', status: 'Review', effort: 5, workItemIconUrl: icon, workItemType: 'Product Backlog Item',
    activePullRequests: [{ id: 950, repositoryName: 'pw-api', title: 'Folder paging cursor', url: '#', approvalCount: 2, checks: pass, recentActivityAt: hoursAgo(1) }] },
  { owner: 'Dana Ortiz', id: 4881, title: 'Accessible names for toolbar buttons', state: 'New', status: 'New', effort: 1, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Dana Ortiz', id: 4882, title: 'Search highlight colors in dark mode', state: 'New', status: 'New', effort: 1, workItemIconUrl: bugIcon, workItemType: 'Bug' },
  { owner: 'Ellis Park', id: 4890, title: 'Sharing links expire too early', state: 'Design', status: 'Blocked', effort: 2, tags: ['Blocked - needs product decision'], workItemIconUrl: bugIcon, workItemType: 'Bug' },
  { owner: 'Ellis Park', id: 4891, title: 'Offline indicator in the header', state: 'In Progress', status: 'Active', effort: 3, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Ellis Park', id: 4892, title: 'Recent documents widget', state: 'Done', status: 'Done', effort: 2, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Frankie Shah', id: 4900, title: 'Move metadata panel to the right side', state: 'In Progress', status: 'Active', effort: 3, workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Frankie Shah', id: 4901, title: 'Preview PDF annotations', state: 'Available for Testing', status: 'Review', effort: 5, workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: quinn },
  { owner: 'Dana Ortiz', id: 4920, title: 'Folder templates', state: 'New', status: 'New', effort: 5, sprintName: 'Sprint 43', workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: 'Casey Morgan', id: 4921, title: 'Template picker dialog', state: 'Committed', status: 'Active', effort: 3, sprintName: 'Sprint 43', workItemIconUrl: icon, workItemType: 'Product Backlog Item' },
  { owner: '', id: 4910, title: 'Investigate slow login on VPN', state: 'New', status: 'New', effort: 2, workItemIconUrl: bugIcon, workItemType: 'Bug' },
]

const allItems = seeds
  .filter((seed) => !(noBlocked && seed.status === 'Blocked'))
  .map(({ owner, ...item }) => ({
    sprintName: item.kind === 'pull-request' ? undefined : SPRINT,
    assignedTo: owner ? identity(owner) : undefined,
    recentActivityAt: ago(1),
    ...item,
  }))
const workItemAssignees = Object.fromEntries(seeds.map((seed) => [seed.id, seed.owner
  ? { label: seed.owner, kind: 'team-member' }
  : { label: 'Unassigned', kind: 'unassigned' }]))

const changeDetailsByItemId = {
  4833: { reason: 'Moved to Failed Testing', changedAt: hoursAgo(3), idleDays: 0, agingLevel: 0 },
  4845: { reason: 'Tags changed', changedAt: hoursAgo(2), idleDays: 0, agingLevel: 0 },
  4880: { reason: 'PR 950 approved', changedAt: hoursAgo(1), idleDays: 0, agingLevel: 0 },
  4710: { idleDays: 9, agingLevel: 4 },
  4821: { idleDays: 2, agingLevel: 1 },
  4790: { idleDays: 5, agingLevel: 3 },
  4777: { idleDays: 3, agingLevel: 2 },
  4700: { idleDays: 12, agingLevel: 4 },
  4851: { idleDays: 4, agingLevel: 2 },
  4871: { idleDays: 6, agingLevel: 3 },
  4890: { idleDays: 4, agingLevel: 2 },
}
const changeHighlightsByItemId = { 4833: 'new', 4845: 'new', 4880: 'new', 4700: 'stale', 4710: 'stale', 4872: 'stale' }

const sprintStart = dateOnly(-6)
const sprintFinish = dateOnly(8)
const workingDayOffsets = Array.from({ length: 15 }, (_, index) => index - 6)
  .filter((offset) => ![0, 6].includes(new Date(`${dateOnly(offset)}T00:00:00`).getDay()))
const effortFlowPoints = workingDayOffsets.map((offset, day) => offset > 0 ? ({ date: dateOnly(offset), Blocked: null, New: null, Active: null, Review: null, Done: null }) : ({
  date: dateOnly(offset),
  Blocked: 5,
  New: Math.max(12 - day * 2, 4),
  Active: 20 - Math.min(day, 3),
  Review: 6 + day * 2,
  Done: day * 4,
}))
const sprintForecast = {
  status: 'ready',
  start: { complete: 0, inProgress: 22, notStarted: 40, total: 62 },
  current: { complete: 16, inProgress: 41, notStarted: 14, total: 71 },
  projected: { complete: 50, inProgress: 17, notStarted: 4, total: 71 },
  addedEffort: 12,
  removedEffort: 3,
}

const startMs = new Date(`${dateOnly(-6)}T00:00:00`).getTime()
const at = (daysAgo: number) => now - daysAgo * DAY
type J = [string, number][]
const journey = (steps: J, opts: { added?: number; since?: number } = {}) => ({
  steps: steps.map(([status, daysAgo]) => ({ status, at: daysAgo >= 6 ? startMs : at(daysAgo) })),
  addedAt: opts.added === undefined ? null : at(opts.added),
  sprintStart: startMs,
  firstStepSince: opts.since === undefined ? (steps[0][1] >= 6 ? startMs : at(steps[0][1])) : at(opts.since),
})
const journeysByItemId: Record<number, ReturnType<typeof journey>> = {
  4710: journey([['Blocked', 6]], { since: 9 }),
  4821: journey([['New', 6], ['Active', 4]]),
  4833: journey([['Review', 6], ['Active', 1]]),
  4790: journey([['Active', 6], ['Review', 5]]),
  4777: journey([['Active', 6], ['Review', 2]]),
  4700: journey([['Done', 6]], { since: 8 }),
  4701: journey([['Review', 6], ['Done', 1]]),
  4845: journey([['New', 2], ['Active', 0]], { added: 2 }),
  4851: journey([['Active', 6], ['Review', 3], ['Active', 2], ['Review', 1]]),
  4860: journey([['New', 0]], { added: 0 }),
  4870: journey([['New', 6], ['Active', 1]]),
  4871: journey([['Active', 6]], { since: 9 }),
  4872: journey([['Review', 6], ['Done', 4]]),
  4873: journey([['Active', 6], ['Done', 3]]),
  4874: journey([['Active', 6], ['Review', 3], ['Done', 1]]),
  4880: journey([['Active', 6], ['Review', 0]]),
  4881: journey([['New', 6]], { since: 8 }),
  4882: journey([['New', 6]], { since: 7 }),
  4890: journey([['Active', 6], ['Blocked', 4]]),
  4891: journey([['New', 6], ['Active', 3]]),
  4892: journey([['Review', 6], ['Done', 2]]),
  4900: journey([['Review', 6], ['Active', 3]]),
  4901: journey([['New', 6], ['Active', 5], ['Review', 2]]),
  4910: journey([['New', 1]], { added: 1 }),
}

const addedIds = new Set(Object.entries(journeysByItemId).filter(([, value]) => value.addedAt !== null).map(([id]) => Number(id)))
const removedItems = [
  { id: 4805, title: 'Pin favorite datasources to the sidebar', state: 'In Progress', status: 'New', effort: 3, sprintName: 'Sprint 43', iterationPath: 'PW\\Web\\Sprint 43', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: identity('Blair Nguyen') },
  { id: 4806, title: 'Explore offline sync for large datasources', state: 'New', status: 'New', effort: 5, sprintName: 'PW', iterationPath: 'PW', workItemIconUrl: icon, workItemType: 'Product Backlog Item', assignedTo: identity('Ellis Park') },
]
const sprintScope = params.get('scope') === '0' ? undefined : {
  status: 'ready' as const,
  startItemIds: new Set([...seeds.map((seed) => seed.id).filter((id) => !addedIds.has(id)), ...removedItems.map((item) => item.id)]),
  removedItems,
  assignees: { 4805: { label: 'Blair Nguyen', kind: 'team-member' }, 4806: { label: 'Ellis Park', kind: 'team-member' } },
}
const departuresByItemId = {
  4805: { leftAt: at(2), status: 'Active', journey: journey([['New', 6], ['Active', 4]]) },
  4806: { leftAt: at(4), status: 'New', journey: journey([['New', 6]]) },
}

function Preview() {
  const [quickFilterInput, setQuickFilterInput] = useState('')
  const [selectedMemberFilter, setSelectedMemberFilter] = useState('')
  const [compactCards, setCompactCards] = useState(params.get('compact') === '1')
  const quickFilterInputRef = useRef<HTMLInputElement | null>(null)
  const [teamDataSyncedAt] = useState(() => Date.now() - 2 * 60_000)
  const memberFilterOptions = people

  const workItems = useMemo(() => {
    const query = quickFilterInput.trim().toLowerCase()
    return allItems.filter((item) => {
      const owner = workItemAssignees[item.id]?.label ?? ''
      return (!query || `${item.id} ${item.title}`.toLowerCase().includes(query))
        && (!selectedMemberFilter || owner === selectedMemberFilter)
    })
  }, [quickFilterInput, selectedMemberFilter])

  const noop = () => {}
  return (
    <Box sx={{ height: '100dvh', display: 'flex', overflow: 'hidden', bgcolor: 'background.paper' }}>
      <Box sx={{ flex: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <TeamAssignmentsPage
          {...({} as any)}
          patConfigured
          colorScheme={colorScheme}
          quickFilterInput={quickFilterInput}
          onQuickFilterInputChange={setQuickFilterInput}
          onQuickFilterClear={() => setQuickFilterInput('')}
          quickFilterInputRef={quickFilterInputRef}
          selectedMemberFilter={selectedMemberFilter}
          memberFilterOptions={memberFilterOptions}
          onMemberFilterChange={setSelectedMemberFilter}
          teamOptions={[
            { id: 'team', displayName: 'PW Web', orgName: 'example-org', projectName: 'example-project', areaPath: '', iterationPath: '', teamName: 'PW Web', repoName: '' },
            { id: 'team-2', displayName: 'PW Explorer', orgName: 'example-org', projectName: 'example-project', areaPath: '', iterationPath: '', teamName: 'PW Explorer', repoName: '' },
          ]}
          selectedTeamId="team"
          onTeamChange={noop}
          teamManagementUrl="https://example.test/teams"
          onRefresh={noop}
          isTeamDataLoading={params.get('loading') === '1'}
          teamDataSyncedAt={teamDataSyncedAt}
          membersError={null}
          workItemsError={null}
          pullRequestBoardItemsError={null}
          assigneesError={null}
          assigneesHistoryWarning={null}
          retryAssigneeHistory={noop}
          members={members}
          workItems={workItems as any}
          currentIterationName={SPRINT}
          changeHighlightsByItemId={changeHighlightsByItemId as any}
          changeDetailsByItemId={changeDetailsByItemId}
          effortFlowPoints={effortFlowPoints as any}
          effortFlowLoading={false}
          sprintForecast={sprintForecast as any}
          workItemAssignees={workItemAssignees as any}
          iterationWindow={{
            current: { name: SPRINT, fullName: `PW\\Web\\${SPRINT}`, startDate: sprintStart, finishDate: sprintFinish },
            next: { name: 'Sprint 43', fullName: 'PW\\Web\\Sprint 43', startDate: dateOnly(9), finishDate: dateOnly(23) },
          }}
          iterationLoading={false}
          tagRules={[]}
          onTagRulesChange={noop}
          cardHighlightOptions={{ freshDays: 1, staleDays: 7 }}
          onCardHighlightOptionsChange={noop}
          projectWorkItemTypes={[]}
          projectWorkItemTypesLoading={false}
          includeWorkItemTypes={[]}
          onIncludeWorkItemTypesChange={noop}
          sprintFilter={{ current: true, next: false, nextNext: false, iterationPaths: [] }}
          onSprintFilterChange={noop}
          hideUsersWithNoActivity={false}
          onHideUsersWithNoActivityChange={noop}
          hideUsersWithOnlyStaleDoneWork={false}
          onHideUsersWithOnlyStaleDoneWorkChange={noop}
          compactCards={compactCards}
          onCompactCardsChange={setCompactCards}
          teamIterations={[
            { name: 'Sprint 41', path: 'PW\\Web\\Sprint 41', timeFrame: 'past', startDate: dateOnly(-20), finishDate: dateOnly(-7) },
            { name: SPRINT, path: `PW\\Web\\${SPRINT}`, timeFrame: 'current', startDate: sprintStart, finishDate: sprintFinish },
            { name: 'Sprint 43', path: 'PW\\Web\\Sprint 43', timeFrame: 'future', startDate: dateOnly(9), finishDate: dateOnly(23) },
          ] as any}
          teamIterationsLoading={false}
          teamIterationsError={null}
          journeysByItemId={journeysByItemId as any}
          sprintScope={sprintScope as any}
          departuresByItemId={departuresByItemId as any}
          rolledOverItemIds={{ 4802: true, 4871: true, 4710: true }}
        />
      </Box>
    </Box>
  )
}

createRoot(document.getElementById('root')!).render(
  <Root colorScheme={colorScheme}>
    <Preview />
  </Root>,
)
