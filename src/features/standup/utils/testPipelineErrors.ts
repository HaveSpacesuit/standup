import { AdoAuthError } from '../../../ado/httpClient'
import { TestResultsNetworkError } from '../../../ado/testPipelinesApi'

export function testPipelineErrorMessage(error: unknown): string {
  if (error instanceof AdoAuthError && error.status === 401) {
    if (error.host === 'vstmr.dev.azure.com') {
      return 'Could not load test results. Ensure your PAT has Test Management (Read) access in Settings > ADO.'
    }
    return 'Azure DevOps returned 401. Your PAT may be expired or missing Build (Read) or Release (Read) access. Update your PAT in Settings > ADO and try again.'
  }
  if (error instanceof TestResultsNetworkError) {
    return 'Could not load test results. Ensure your PAT has Test Management (Read) access in Settings > ADO. If it does, check your network connection and try again.'
  }
  return error instanceof Error ? error.message : String(error)
}
