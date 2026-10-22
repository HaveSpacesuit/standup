import { AppBar, Box, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Icon } from '@stratakit/mui'

type PageToolbarProps = {
  iconHref: string
  title: string
  isPageTitle?: boolean
  children?: ReactNode
}

export function PageToolbar({ iconHref, title, isPageTitle = false, children }: PageToolbarProps) {
  return (
    <AppBar position="static" sx={{ containerType: 'inline-size', flexShrink: 0 }}>
      <Toolbar sx={{ gap: 1, px: 1.5, minWidth: 0, overflow: 'hidden' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexShrink: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              display: 'flex',
              '@container (max-width: 420px)': { display: 'none' },
            }}
          >
            <Icon href={`${iconHref}#icon-large`} size="large" />
          </Box>
          <Typography
            render={isPageTitle ? <h1 /> : undefined}
            variant="body-lg"
            sx={{
              fontWeight: 700,
              whiteSpace: 'nowrap',
              '@container (max-width: 800px)': {
                position: 'absolute',
                width: 1,
                height: 1,
                p: 0,
                m: -1,
                overflow: 'hidden',
                clipPath: 'inset(50%)',
                whiteSpace: 'nowrap',
                border: 0,
              },
            }}
          >
            {title}
          </Typography>
        </Box>
        {children}
      </Toolbar>
    </AppBar>
  )
}
