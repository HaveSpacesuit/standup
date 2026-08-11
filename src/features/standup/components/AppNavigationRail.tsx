import { Icon } from '@stratakit/mui'
import { unstable_NavigationRail as NavigationRail } from '@stratakit/structures'
import svgUsers from '@stratakit/icons/users.svg'
import svgGitMerge from '@stratakit/icons/git-merge.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import type { AppView } from '../hooks/useAppNavigation'

type AppNavigationRailProps = {
  activeView: AppView
}

export function AppNavigationRail({ activeView }: AppNavigationRailProps) {
  return (
    <NavigationRail.Root>
      <NavigationRail.Header>
        <Icon href={svgCalendar} alt="Standup app" size="large" />
        <NavigationRail.ToggleButton />
      </NavigationRail.Header>

      <NavigationRail.Content>
        <NavigationRail.List>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#team-assignments"
              label="Team assignments"
              icon={svgUsers}
              active={activeView === 'team-assignments'}
            />
          </NavigationRail.ListItem>
          <NavigationRail.ListItem>
            <NavigationRail.Anchor
              href="#pull-requests"
              label="Pull requests"
              icon={svgGitMerge}
              active={activeView === 'pull-requests'}
            />
          </NavigationRail.ListItem>
        </NavigationRail.List>
        <NavigationRail.Footer />
      </NavigationRail.Content>
    </NavigationRail.Root>
  )
}
