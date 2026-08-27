import { Box, CircularProgress, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useMemo } from 'react'
import type { ResolvedWorkItemAssignee, TeamMember, WorkItemSummary } from '../../../ado/queryEngine'
import type { IdentityRef } from '../../../ado/identity'
import {
  getStatusColumnBackground,
  getStatusColumnColor,
  STATUS_COLUMNS,
  type StatusColumn,
} from '../utils/statusColumnStyles'
import { sortWorkItemsBySprintStatusAndId } from '../utils/workItemSorting'
import { WorkItemCard } from './WorkItemCard'
import type { ChangeHighlightState } from '../hooks/useAdoHistoryHighlights'

const BOARD_GRID_TEMPLATE = '220px repeat(5, minmax(200px, 1fr))'

type SprintSummaryBoardProps = {
  patConfigured: boolean
  isLoading: boolean
  colorScheme: 'light' | 'dark'
  workItemsError: string | null
  workItems: WorkItemSummary[]
  currentIterationName: string | null
  /** Distinct status columns each item occupied since the start of the current sprint, used to draw move-history arrows. */
  visitedStatusesByItemId: Record<number, StatusColumn[]>
  members: TeamMember[]
  workItemAssignees: Record<number, ResolvedWorkItemAssignee>
  changeHighlightsByItemId: Record<number, ChangeHighlightState>
}

function createEmptyStatusRecord(): Record<StatusColumn, number> {
  return { Blocked: 0, New: 0, Active: 0, Review: 0, Done: 0 }
}

/** Finds the farthest column an item visited on one side of its current column since sprint start,
 * preferring the left side per the move-history metric (left takes priority over right). */
function findMoveHistorySourceColumnIndex(visitedStatuses: StatusColumn[], currentColumnIndex: number): number | null {
  const visitedIndices = visitedStatuses.map((status) => STATUS_COLUMNS.indexOf(status))

  const leftIndices = visitedIndices.filter((index) => index < currentColumnIndex)
  if (leftIndices.length > 0) {
    return Math.min(...leftIndices)
  }

  const rightIndices = visitedIndices.filter((index) => index > currentColumnIndex)
  if (rightIndices.length > 0) {
    return Math.max(...rightIndices)
  }

  return null
}

/** Draws a line + arrowhead from the center of the source (visited) column to the near border of the
 * card's current column, spanning only the empty columns between them so it never overlaps a card. */
function MoveHistoryArrow({
  sourceColumnIndex,
  currentColumnIndex,
  rowNumber,
  color,
}: {
  sourceColumnIndex: number
  currentColumnIndex: number
  rowNumber: number
  color: string
}) {
  const pointsRight = sourceColumnIndex < currentColumnIndex
  const spanStart = pointsRight ? sourceColumnIndex : currentColumnIndex + 1
  const spanEnd = pointsRight ? currentColumnIndex - 1 : sourceColumnIndex
  const spanCount = spanEnd - spanStart + 1
  const sourceCenterFraction = pointsRight ? 0.5 / spanCount : (spanCount - 0.5) / spanCount
  const lineStartPercent = pointsRight ? sourceCenterFraction * 100 : 0
  const lineEndPercent = pointsRight ? 100 : sourceCenterFraction * 100
  const arrowheadLengthPx = 8
  // The card cell reserves 12px (px: 1.5) of padding before its visible border, so nudge the whole
  // arrow that far past the column boundary to land right at the card instead of stopping short of it.
  const cardGutterPx = 12

  return (
    <Box
      aria-hidden="true"
      sx={{
        gridColumn: `${spanStart + 2} / ${spanEnd + 3}`,
        gridRow: rowNumber,
        position: 'relative',
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: pointsRight ? 'flex-start' : 'flex-end',
        transform: `translateX(${pointsRight ? cardGutterPx : -cardGutterPx}px)`,
      }}
    >
      {/* A fixed (non-percentage) svg height keeps the line's y-coordinate a simple 1:1 mapping,
       * flex-centered the same way as the arrowhead below it — percentage-stretching the svg to the
       * row's full (variable) height was landing the line below where the arrowhead pointed. The svg
       * is also shrunk by the arrowhead's own length so the line stops at its base instead of poking
       * out past its (much narrower) tip. */}
      <svg
        width={`calc(100% - ${arrowheadLengthPx}px)`}
        height="4"
        viewBox="0 0 100 4"
        preserveAspectRatio="none"
        style={{ display: 'block', overflow: 'visible' }}
      >
        <line
          x1={lineStartPercent}
          y1={2}
          x2={lineEndPercent}
          y2={2}
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          shapeRendering="crispEdges"
        />
      </svg>
      <Box
        sx={{
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          width: 0,
          height: 0,
          borderTop: '5px solid transparent',
          borderBottom: '5px solid transparent',
          ...(pointsRight
            ? { right: 0, borderLeft: `${arrowheadLengthPx}px solid ${color}` }
            : { left: 0, borderRight: `${arrowheadLengthPx}px solid ${color}` }),
        }}
      />
    </Box>
  )
}

export function SprintSummaryBoard({
  patConfigured,
  isLoading,
  colorScheme,
  workItemsError,
  workItems,
  currentIterationName,
  visitedStatusesByItemId,
  members,
  workItemAssignees,
  changeHighlightsByItemId,
}: SprintSummaryBoardProps) {
  const theme = useTheme()
  const renderStatusColumnBackground = (status: StatusColumn, columnIndex: number) =>
    getStatusColumnBackground(status, columnIndex, theme.palette, colorScheme)

  const reviewItems = useMemo(
    () => workItems.filter((item) => item.kind !== 'pull-request'),
    [workItems],
  )

  const statusItemCounts = useMemo(() => {
    const counts = createEmptyStatusRecord()
    for (const item of reviewItems) {
      counts[item.status] += 1
    }
    return counts
  }, [reviewItems])

  const statusEffortTotals = useMemo(() => {
    const totals = createEmptyStatusRecord()
    for (const item of reviewItems) {
      if (currentIterationName && item.sprintName !== currentIterationName) {
        continue
      }
      if (typeof item.effort !== 'number') {
        continue
      }
      totals[item.status] += item.effort
    }
    return totals
  }, [reviewItems, currentIterationName])

  // A single global row order (grouped by status, then sprint/id) so each card gets its own row
  // and no other card ever sits to its left or right, leaving room for future move-history arrows.
  const orderedItems = useMemo(() => {
    // Dedupe by id defensively: a stray duplicate (e.g. from an in-flight refetch) would otherwise
    // add an extra row whose arrow has no visible card paired with it.
    const uniqueItemsById = new Map<number, WorkItemSummary>()
    for (const item of reviewItems) {
      uniqueItemsById.set(item.id, item)
    }

    return [...uniqueItemsById.values()].sort(sortWorkItemsBySprintStatusAndId)
  }, [reviewItems, currentIterationName])

  if (!patConfigured) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body-sm" color="text.secondary">
          Open Settings and add your Azure DevOps PAT to load board data.
        </Typography>
      </Box>
    )
  }

  if (workItemsError) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body-sm" color="error.main">
          {workItemsError}
        </Typography>
      </Box>
    )
  }

  if (isLoading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body-sm" color="text.secondary">
          Loading sprint review...
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ height: '100%', overflowX: 'auto' }}>
      <Box
        sx={{
          minWidth: 1000,
          height: '100%',
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarGutter: 'stable',
          bgcolor: 'background.default',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            display: 'grid',
            gridTemplateColumns: BOARD_GRID_TEMPLATE,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
          }}
        >
          <Box
            sx={{
              px: 2,
              py: 1.5,
              borderBottom: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.paper',
            }}
          >
            <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
              Sprint
            </Typography>
          </Box>
          {STATUS_COLUMNS.map((status, columnIndex) => (
            <Box
              key={status}
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid',
                borderColor: 'divider',
                backgroundImage: renderStatusColumnBackground(status, columnIndex),
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 1, minWidth: 0 }}>
                <Box
                  sx={{
                    width: 4,
                    minHeight: 34,
                    borderRadius: 999,
                    bgcolor: getStatusColumnColor(status, theme.palette),
                    flex: '0 0 auto',
                    alignSelf: 'stretch',
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.75 }}>
                    <Typography variant="body-sm" sx={{ fontWeight: 700 }}>
                      {status}
                    </Typography>
                    <Box
                      component="span"
                      sx={{
                        color: getStatusColumnColor(status, theme.palette),
                        fontSize: 14,
                        lineHeight: 1.25,
                        fontWeight: 700,
                        textAlign: 'center',
                        flex: '0 0 auto',
                      }}
                    >
                      {statusItemCounts[status]}
                    </Box>
                  </Box>
                  <Typography
                    variant="caption-md"
                    sx={{ mt: 0.25, color: 'text.secondary' }}
                    title={
                      currentIterationName
                        ? `Effort total includes visible items from ${currentIterationName} only.`
                        : 'Effort total includes visible items from the current sprint only.'
                    }
                  >
                    Current sprint effort: {statusEffortTotals[status]}
                  </Typography>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>

        <Box
          sx={{
            position: 'relative',
            flex: '1 0 auto',
          }}
        >
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              gridTemplateColumns: BOARD_GRID_TEMPLATE,
              pointerEvents: 'none',
            }}
          >
            <Box sx={{ bgcolor: 'background.paper' }} />
            {STATUS_COLUMNS.map((status, columnIndex) => (
              <Box
                key={`background-${status}`}
                sx={{ backgroundImage: renderStatusColumnBackground(status, columnIndex) }}
              />
            ))}
          </Box>

          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              display: 'grid',
              gridTemplateColumns: BOARD_GRID_TEMPLATE,
              gridAutoRows: 'max-content',
            }}
          >
            {orderedItems.map((item, itemIndex) => {
              const isFirstItemInSprint = itemIndex === 0 || item.sprintName !== orderedItems[itemIndex - 1]?.sprintName
               const rowNumber = itemIndex + 1 + orderedItems.slice(0, itemIndex).filter((candidate, index) =>
                index === 0 || candidate.sprintName !== orderedItems[index - 1]?.sprintName,
              ).length
              const currentColumnIndex = STATUS_COLUMNS.indexOf(item.status)
              const visitedStatuses = visitedStatusesByItemId[item.id] ?? []
              const sourceColumnIndex = findMoveHistorySourceColumnIndex(visitedStatuses, currentColumnIndex)
              const resolvedAssignee = workItemAssignees[item.id]
              const assignedMember = resolvedAssignee?.kind === 'team-member'
                ? members.find((member) => member.displayName.toLowerCase() === resolvedAssignee.label.toLowerCase())
                : undefined
              const footerPerson: { label: string; identity: IdentityRef } | null = assignedMember
                ? { label: '', identity: assignedMember }
                : null

              return (
                <Box key={item.id} sx={{ display: 'contents' }}>
                  {isFirstItemInSprint && itemIndex > 0 ? (
                    <Box
                      aria-hidden="true"
                      sx={{
                        gridColumn: '1 / -1',
                        gridRow: rowNumber,
                        alignSelf: 'start',
                        borderTop: '1px solid',
                        borderColor: 'divider',
                        pointerEvents: 'none',
                        zIndex: 2,
                      }}
                    />
                  ) : null}
                  {isFirstItemInSprint ? (
                    <Box
                      sx={{
                        gridColumn: 1,
                        gridRow: rowNumber,
                        px: 1.5,
                        py: 1,
                        borderColor: 'divider',
                        bgcolor: 'background.paper',
                      }}
                    >
                      <Typography variant="caption-md" sx={{ fontWeight: 700 }}>
                        {item.sprintName ?? 'No sprint'}
                      </Typography>
                    </Box>
                  ) : null}
                  <Box
                    sx={{
                      gridColumn: currentColumnIndex + 2,
                      gridRow: rowNumber,
                      px: 1.5,
                      py: 1,
                    }}
                  >
                    <WorkItemCard
                      item={item}
                      showState
                      effortPlacement="footer"
                      hideSprint
                      footerPerson={footerPerson}
                      showFooterPersonWithEffort
                      highlightState={changeHighlightsByItemId[item.id] ?? 'none'}
                    />
                  </Box>
                  {sourceColumnIndex !== null ? (
                    <MoveHistoryArrow
                      sourceColumnIndex={sourceColumnIndex}
                      currentColumnIndex={currentColumnIndex}
                      rowNumber={rowNumber}
                      color={getStatusColumnColor(STATUS_COLUMNS[sourceColumnIndex], theme.palette)}
                    />
                  ) : null}
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
