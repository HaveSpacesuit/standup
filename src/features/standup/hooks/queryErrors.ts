import { ADO_AUTH_ERROR_MESSAGE } from '../../../ado/httpClient'

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

export function isAdoAuthErrorMessage(message: string): boolean {
  return message === ADO_AUTH_ERROR_MESSAGE
}

export function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
