import { useEffect, useMemo, useState } from 'react'
import type { AdoQueryEngine } from '../../../ado/queryEngine'

type UseTeamManagementUrlArgs = {
  adoQueryEngine: AdoQueryEngine | null
  patConfigured: boolean
  selectedTeam: {
    orgName: string
    projectName: string
    teamName: string
  }
}

function buildTeamManagementUrl(
  orgName: string,
  projectName: string,
  teamName: string,
  subjectDescriptor?: string | null,
): string {
  const baseUrl = `https://dev.azure.com/${encodeURIComponent(orgName)}/${encodeURIComponent(projectName)}/_settings/teams`
  const params = new URLSearchParams(
    subjectDescriptor ? { subjectDescriptor } : { team: teamName },
  )
  return `${baseUrl}?${params.toString()}`
}

export function useTeamManagementUrl({
  adoQueryEngine,
  patConfigured,
  selectedTeam,
}: UseTeamManagementUrlArgs): string {
  const [teamSubjectDescriptor, setTeamSubjectDescriptor] = useState<string | null>(null)

  useEffect(() => {
    let isDisposed = false
    const abortController = new AbortController()

    setTeamSubjectDescriptor(null)

    if (!adoQueryEngine || !patConfigured) {
      return () => {
        isDisposed = true
        abortController.abort()
      }
    }

    adoQueryEngine
      .getTeamSubjectDescriptor(
        {
          orgName: selectedTeam.orgName,
          projectName: selectedTeam.projectName,
          teamName: selectedTeam.teamName,
        },
        abortController.signal,
      )
      .then((descriptor) => {
        if (!isDisposed) {
          setTeamSubjectDescriptor(descriptor)
        }
      })
      .catch(() => {
        if (!isDisposed) {
          setTeamSubjectDescriptor(null)
        }
      })

    return () => {
      isDisposed = true
      abortController.abort()
    }
  }, [adoQueryEngine, patConfigured, selectedTeam.orgName, selectedTeam.projectName, selectedTeam.teamName])

  return useMemo(
    () =>
      buildTeamManagementUrl(
        selectedTeam.orgName,
        selectedTeam.projectName,
        selectedTeam.teamName,
        teamSubjectDescriptor,
      ),
    [selectedTeam.orgName, selectedTeam.projectName, selectedTeam.teamName, teamSubjectDescriptor],
  )
}
