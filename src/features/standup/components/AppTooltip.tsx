import { Tooltip, type TooltipProps } from '@mui/material'
import { createContext, useContext, type ReactNode } from 'react'

const SuppressedTooltipsContext = createContext(false)

export function SuppressTooltips({ when, children }: { when: boolean; children: ReactNode }) {
  return <SuppressedTooltipsContext.Provider value={when}>{children}</SuppressedTooltipsContext.Provider>
}

export function AppTooltip({ title, children, ...props }: TooltipProps) {
  const suppressed = useContext(SuppressedTooltipsContext)
  if (suppressed || !title) {
    return children
  }

  // A React node prevents MUI's describeChild default from creating a native title attribute.
  return <Tooltip {...props} title={<>{title}</>}>{children}</Tooltip>
}
