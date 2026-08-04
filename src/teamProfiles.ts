export type TeamProfile = {
  id: string
  displayName: string
  areaPath: string
  iterationPath: string
  teamName: string
  repoName: string
  extra?: Record<string, string>
}

export const teamProfiles: TeamProfile[] = [
  {
    id: 'pw-web',
    displayName: 'ProjectWise Web',
    areaPath: 'beconnect\\Document Management\\ProjectWise Web Connections (3060)',
    iterationPath: '[beconnect]\\ProjectWise Web',
    teamName: 'ProjectWise Web',
    repoName: 'SharePortal',
  },
  {
    id: 'pw-explorer',
    displayName: 'ProjectWise Explorer',
    areaPath: 'ProjectWise\\DI\\Unified Experience',
    iterationPath: '[ProjectWise]\\Unified Experience',
    teamName: 'ProjectWise Explorer',
    repoName: 'PW Theseus',
  },
]
