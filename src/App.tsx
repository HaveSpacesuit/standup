import {
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Toolbar,
  Typography,
} from '@mui/material'
import { Icon } from '@stratakit/mui'
import svgAdd from '@stratakit/icons/add.svg'
import svgCheckmark from '@stratakit/icons/checkmark.svg'
import svgClock from '@stratakit/icons/clock.svg'
import svgChat from '@stratakit/icons/chat.svg'
import svgCalendar from '@stratakit/icons/calendar.svg'
import svgAiSparkle from '@stratakit/icons/ai-sparkle.svg'

const standupSections = [
  {
    title: 'Yesterday',
    icon: svgCheckmark,
    placeholder: 'What did you accomplish yesterday?',
  },
  {
    title: 'Today',
    icon: svgClock,
    placeholder: 'What will you work on today?',
  },
  {
    title: 'Blockers',
    icon: svgChat,
    placeholder: 'Any impediments or blockers?',
  },
]

function App() {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar sx={{ gap: 1 }}>
          <Icon href={svgCalendar} />
          <Typography variant="body-lg" sx={{ flexGrow: 1, fontWeight: 700 }}>
            Daily Standup
          </Typography>
          <Icon href={svgAiSparkle} />
        </Toolbar>
      </AppBar>

      <Box component="main" sx={{ p: 3, maxWidth: 800, mx: 'auto' }}>
        <Box
          sx={{
            mb: 3,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="body-lg" sx={{ fontWeight: 700 }}>
            Today's Standup
          </Typography>
          <Button variant="contained" startIcon={<Icon href={svgAdd} />}>
            New Entry
          </Button>
        </Box>

        <Box sx={{ display: 'grid', gap: 2 }}>
          {standupSections.map(({ title, icon, placeholder }) => (
            <Card key={title}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Icon href={icon} />
                  <Typography variant="body-md" sx={{ fontWeight: 700 }}>
                    {title}
                  </Typography>
                </Box>
                <Typography variant="body-sm" color="text.secondary">
                  {placeholder}
                </Typography>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

export default App
