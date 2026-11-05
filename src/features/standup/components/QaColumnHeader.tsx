import { Box, ButtonBase, IconButton, Typography } from '@mui/material'
import { useTheme, type SxProps, type Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgChevronLeftDouble from '@stratakit/icons/chevron-left-double.svg'
import { BOARD_COLUMN_DIVIDER, BOARD_HEADER_HEIGHT } from '../utils/boardLayout'
import { getStatusColumnColor } from '../utils/statusColumnStyles'
import { AppTooltip } from './AppTooltip'
import { ColumnRailMark } from './ColumnRailMark'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'
import { COLUMN_META, type QaColumnId } from './qaBoardModel'

type QaColumnHeaderProps = {
  id: QaColumnId
  count: number
  /** Cards matching the selected Needs attention facet, or null while none is selected. */
  matchCount?: number | null
  /** The column is collapsed to a narrow rail. */
  rail: boolean
  /** Collapses or expands the column; columns without it can't be toggled. */
  onToggle?: () => void
  /** Draws the column divider on the header's left edge. */
  divider?: boolean
  sx?: SxProps<Theme>
}

function CountPill({ count, matchCount }: { count: number; matchCount: number | null }) {
  return (
    <Box
      component="span"
      sx={{
        minWidth: 20,
        height: 18,
        px: 0.75,
        borderRadius: 999,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: 'var(--stratakit-color-bg-glow-on-surface-neutral-pressed)',
        color: 'text.secondary',
        fontSize: 11,
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
        flex: '0 0 auto',
      }}
    >
      {matchCount !== null ? (
        <>
          <Box component="span" aria-hidden="true">
            {matchCount}
            <Box component="span" sx={{ fontWeight: 500, color: TERTIARY_TEXT_COLOR }}>/{count}</Box>
          </Box>
          <Box component="span" sx={visuallyHiddenSx}>{matchCount} of {count} highlighted</Box>
        </>
      ) : count}
    </Box>
  )
}

/** A QA column's header, shared by the Flow and Testers views; a rail shrinks to its color and count. */
export function QaColumnHeader({ id, count, matchCount = null, rail, onToggle, divider = false, sx }: QaColumnHeaderProps) {
  const theme = useTheme()
  const { title, status } = COLUMN_META[id]
  const color = getStatusColumnColor(status, theme.palette)
  const headingId = `qa-column-${id}`
  const extraSx = Array.isArray(sx) ? sx : [sx]

  if (rail) {
    return (
      <Box
        data-qa-column-header={id}
        data-qa-column-rail=""
        sx={[
          {
            height: BOARD_HEADER_HEIGHT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: divider ? BOARD_COLUMN_DIVIDER : undefined,
          },
          ...extraSx,
        ]}
      >
        <Typography render={<h2 />} id={headingId} variant="body-sm" sx={visuallyHiddenSx}>
          {title}
        </Typography>
        <AppTooltip title={`Expand ${title}`} placement="bottom">
          <ButtonBase
            nativeButton
            aria-label={`Expand ${title}, ${count === 0 ? 'no cards' : `${count} ${count === 1 ? 'card' : 'cards'}`}`}
            aria-expanded={false}
            disabled={!onToggle}
            onClick={onToggle}
            sx={{
              p: 0.5,
              borderRadius: 1,
              '&:hover': { bgcolor: 'action.hover' },
              '&:focus-visible': { outline: '2px solid var(--stratakit-color-border-accent-base)', outlineOffset: -2 },
            }}
          >
            <ColumnRailMark color={color} count={count} />
          </ButtonBase>
        </AppTooltip>
      </Box>
    )
  }

  return (
    <Box
      data-qa-column-header={id}
      sx={[
        {
          height: BOARD_HEADER_HEIGHT,
          px: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          minWidth: 0,
          boxShadow: divider ? BOARD_COLUMN_DIVIDER : undefined,
        },
        ...extraSx,
      ]}
    >
      <Box aria-hidden="true" sx={{ width: 4, height: 16, borderRadius: 999, bgcolor: color, flex: '0 0 auto' }} />
      <Typography
        render={<h2 />}
        id={headingId}
        variant="body-sm"
        sx={{ fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {title}
      </Typography>
      <CountPill count={count} matchCount={matchCount} />
      {onToggle ? (
        <IconButton
          size="small"
          label={`Collapse ${title}`}
          aria-expanded
          onClick={onToggle}
          sx={{ ml: 'auto', mr: -0.75, flex: '0 0 auto' }}
        >
          <Icon href={svgChevronLeftDouble} />
        </IconButton>
      ) : null}
    </Box>
  )
}
