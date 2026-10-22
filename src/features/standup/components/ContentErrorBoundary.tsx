import { Component, type ReactNode } from 'react'
import { Alert, AlertTitle, Box, Button } from '@mui/material'

export class ContentErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box component="main" sx={{ p: 2, overflow: 'auto' }}>
          <Alert severity="error" role="alert">
            <AlertTitle>This view could not be displayed</AlertTitle>
            Reload the page to fetch fresh data, or use navigation to open another view.
          </Alert>
          <Button onClick={() => window.location.reload()} sx={{ mt: 2 }}>
            Reload page
          </Button>
        </Box>
      )
    }

    return this.props.children
  }
}
