type AppConfig = {
  azdoPat: string
  azdoApiVersion: string
}

const PLACEHOLDER_VALUES = new Set(['', 'paste-your-pat-here'])

function readEnv(name: string): string {
  const env = import.meta.env as Record<string, string | undefined>
  return env[name]?.trim() ?? ''
}

function readRequiredEnv(name: string): string {
  const value = readEnv(name)

  if (PLACEHOLDER_VALUES.has(value)) {
    throw new Error(
      `Missing required environment variable ${name}. Update your .env.local file and restart the dev server.`,
    )
  }

  return value
}

export function getAppConfig(): AppConfig {
  const env = import.meta.env as Record<string, string | undefined>

  return {
    azdoPat: readRequiredEnv('AZDO_PAT'),
    azdoApiVersion: env.AZDO_API_VERSION?.trim() || '7.1',
  }
}

export function isPatConfigured(): boolean {
  const pat = readEnv('AZDO_PAT')
  return !PLACEHOLDER_VALUES.has(pat)
}

export function validateAppConfig(): void {
  getAppConfig()
}
