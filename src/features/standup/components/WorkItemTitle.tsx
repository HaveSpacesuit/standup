import { Fragment } from 'react'
import { Badge, Box, Link } from '@mui/material'
import type { SxProps, Theme } from '@mui/material/styles'
import { Icon } from '@stratakit/mui'
import svgWindowPopout from '@stratakit/icons/window-popout.svg'
import { AppTooltip as Tooltip } from './AppTooltip'
import { TERTIARY_TEXT_COLOR, visuallyHiddenSx } from './developmentCardDisplay'

type WorkItemTitleItem = { id: number; title: string; workItemUrl: string; tags?: string[] }

// Compact rows keep the item to one line. Only the title text gives way, ending in an ellipsis with the full title in the
// link's tooltip, so the id, the new-tab icon, and the tags stay whole. In a flex row the text spaces between them
// collapse, so the gap spaces them instead.
const compactTitleSx: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.5,
  maxWidth: 520,
  whiteSpace: 'nowrap',
  '& > a': { display: 'inline-flex', alignItems: 'center', minWidth: 0 },
  '& .work-item-title': { overflow: 'hidden', textOverflow: 'ellipsis' },
  '& > ul': { flex: 'none' },
}

// Tags flow like words after the title, so many or long tags wrap with the title instead of widening the column. The
// items are styled from the list because there can be thousands of them and a Box with its own sx costs on every mount.
const tagListSx: SxProps<Theme> = {
  display: 'inline',
  m: 0,
  p: 0,
  listStyle: 'none',
  '& > li': { display: 'inline', whiteSpace: 'nowrap' },
}

const mutedSx: SxProps<Theme> = { color: TERTIARY_TEXT_COLOR }

function WorkItemTags({ tags, compact }: { tags: string[] | undefined; compact: boolean }) {
  if (!tags || tags.length === 0) {
    return null
  }

  const shownTags = compact ? tags.slice(0, 1) : tags
  const moreTags = tags.slice(shownTags.length)

  // Text spaces separate the title and tags rather than margins: a space drops at a line break, so a wrapped tag stays
  // flush left, and copied text keeps the tags apart.
  return (
    <>
      {' '}
      <Box component="ul" role="list" aria-label="Tags" sx={tagListSx}>
        {shownTags.map((tag, index) => (
          <Fragment key={tag}>
            {index > 0 && ' '}
            <li>
              {/* MUI shows a badge whose content is a number above max as "99+", and that includes a tag like 2026. */}
              <Badge variant="inline" type="outlined" size="small" max={Infinity} badgeContent={tag} />
            </li>
          </Fragment>
        ))}
        {moreTags.length > 0 ? (
          <>
            {' '}
            <li>
              <Tooltip title={moreTags.join(', ')} describeChild>
                <Box component="span" sx={mutedSx}>
                  <span aria-hidden="true">+{moreTags.length}</span>
                  <Box component="span" sx={visuallyHiddenSx}>{`and ${moreTags.join(', ')}`}</Box>
                </Box>
              </Tooltip>
            </li>
          </>
        ) : null}
      </Box>
    </>
  )
}

/** The id, then the title linking to the work item, then the tags. Render inside a cell styled with workItemTitleCellSx. */
export function WorkItemTitle({ item, compact = false }: { item: WorkItemTitleItem; compact?: boolean }) {
  const link = (
    <Link href={item.workItemUrl} target="_blank" rel="noreferrer noopener">
      <span className="work-item-title">{item.title}</span>
      <Box component="span" sx={{ display: 'inline-flex', verticalAlign: 'text-bottom', ml: 0.5 }}>
        <Icon href={svgWindowPopout} alt="" />
      </Box>
      <Box component="span" sx={visuallyHiddenSx}> (opens in a new tab)</Box>
    </Link>
  )

  return (
    <Box sx={compact ? compactTitleSx : undefined}>
      <span className="work-item-id">{item.id}</span>{' '}
      {compact ? <Tooltip title={item.title} describeChild>{link}</Tooltip> : link}
      <WorkItemTags tags={item.tags} compact={compact} />
    </Box>
  )
}
