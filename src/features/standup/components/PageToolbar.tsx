import { AppBar, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Icon } from '@stratakit/mui'

type PageToolbarProps = {
  iconHref: string
  title: string
  children?: ReactNode
}

export function PageToolbar({ iconHref, title, children }: PageToolbarProps) {
  return (
    <AppBar position="static">
      <Toolbar sx={{ gap: 1.5 }}>
        <Icon href={`${iconHref}#icon-large`} size="large" />
        <Typography variant="body-lg" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        {children}
      </Toolbar>
    </AppBar>
  )
}
