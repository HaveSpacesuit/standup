export type TeamProfile = {
  id: string
  orgName: string
  projectName: string
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
    orgName: 'bentleycs',
    projectName: 'beconnect',
    displayName: 'ProjectWise Web',
    areaPath: 'beconnect\\Document Management\\ProjectWise Web Connections (3060)',
    iterationPath: '[beconnect]\\ProjectWise Web',
    teamName: 'ProjectWise Web',
    repoName: 'SharePortal',
  },
  {
    id: 'pw-explorer',
    orgName: 'bentleycs',
    projectName: 'ProjectWise',
    displayName: 'ProjectWise Explorer',
    areaPath: 'ProjectWise\\DI\\Unified Experience',
    iterationPath: '[ProjectWise]\\Unified Experience',
    teamName: 'ProjectWise Explorer',
    repoName: 'PW Theseus',
  },
]
