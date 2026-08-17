import { useState } from 'react'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Switch,
  Typography,
  Button,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import { unstable_NavigationRail as NavigationRail } from '@stratakit/structures'
import svgUsers from '@stratakit/icons/users.svg'
import svgClipboard from '@stratakit/icons/clipboard.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgConfiguration from '@stratakit/icons/configuration.svg'
import type { AppView } from '../hooks/useAppNavigation'

type AppNavigationRailProps = {
  activeView: AppView
  colorScheme: 'light' | 'dark'
  onToggleColorScheme: () => void
}

export function AppNavigationRail({ activeView, colorScheme, onToggleColorScheme }: AppNavigationRailProps) {
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)

  return (
    <NavigationRail.Root>
      <NavigationRail.Header>
        <Icon href={`${svgCalendar}#icon-large`} alt="Standup app" size="large" />
        <NavigationRail.ToggleButton />
      </NavigationRail.Header>

      <NavigationRail.Content>
        <NavigationRail.List>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#team-assignments"
              label="Team assignments"
              icon={`${svgUsers}#icon-large`}
              active={activeView === 'team-assignments'}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#qa-activity"
              label="Quality assurance"
              icon={`${svgClipboard}#icon-large`}
              active={activeView === 'qa-activity'}
            />
          </NavigationRail.ListItem>
        </NavigationRail.List>
        <NavigationRail.Footer>
          <NavigationRail.ListItem>
            <NavigationRail.Button
              icon={`${svgConfiguration}#icon-large`}
              label="Settings"
              onClick={() => setIsSettingsDialogOpen(true)}
            />
          </NavigationRail.ListItem>
        </NavigationRail.Footer>
      </NavigationRail.Content>

      <Dialog open={isSettingsDialogOpen} onClose={() => setIsSettingsDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <FormControlLabel
            sx={{ m: 0 }}
            control={
              <Switch
                size="small"
                checked={colorScheme === 'dark'}
                onChange={onToggleColorScheme}
              />
            }
            label={<Typography variant="body-sm">Dark mode</Typography>}
          />
        </DialogContent>
        <DialogActions>
          <Button size="small" onClick={() => setIsSettingsDialogOpen(false)}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </NavigationRail.Root>
  )
}
