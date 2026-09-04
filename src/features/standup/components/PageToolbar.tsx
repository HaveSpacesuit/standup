import { AppBar, Box, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Icon } from '@stratakit/mui'

type PageToolbarProps = {
  iconHref: string
  title: string
  children?: ReactNode
}

export function PageToolbar({ iconHref, title, children }: PageToolbarProps) {
  return (
    <AppBar position="static" sx={{ containerType: 'inline-size' }}>
      <Toolbar sx={{ gap: 1.5, minWidth: 0 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            flexShrink: 0,
            '@container (max-width: 900px)': {
              '& .MuiTypography-root': {
                display: 'none',
              },
            },
          }}
        >
          <Icon href={`${iconHref}#icon-large`} size="large" />
          <Typography variant="body-lg" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {title}
          </Typography>
        </Box>
        {children}
      </Toolbar>
    </AppBar>
  )
}
