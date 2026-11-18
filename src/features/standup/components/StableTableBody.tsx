import type { ComponentProps } from 'react'
import { ThemeProvider, type Theme } from '@mui/material/styles'

// StrataKit's table body gives ThemeProvider a new theme function each time it renders, so every render of a table
// re-rendered every MUI component in its bodies, memoized rows included. This one keeps StrataKit's hover default for
// the rows with a function that never changes, so the theme it derives stays the same object.
const withRowHover = (outerTheme: Theme): Theme => ({
  ...outerTheme,
  components: {
    ...outerTheme.components,
    MuiTableRow: {
      ...outerTheme.components?.MuiTableRow,
      defaultProps: { ...outerTheme.components?.MuiTableRow?.defaultProps, hover: true },
    },
  },
})

/** A `component` for MUI's TableBody that lets memoized rows skip the table's re-renders. */
export function StableTableBody(props: ComponentProps<'tbody'>) {
  return (
    <ThemeProvider theme={withRowHover}>
      <tbody {...props} />
    </ThemeProvider>
  )
}
