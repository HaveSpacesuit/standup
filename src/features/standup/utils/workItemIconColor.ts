import type { Theme } from '@mui/material/styles'

function normalizeType(value: string): string {
  return value.trim().toLowerCase()
}

function toHexWithoutPound(colorValue: string): string | undefined {
  const trimmed = colorValue.trim()
  const hexMatch = /^#([0-9a-fA-F]{6})$/.exec(trimmed)
  return hexMatch?.[1]
}

function rgbChannelToHex(channel: number): string {
  return channel.toString(16).padStart(2, '0')
}

function clampUnit(value: number): number {
  if (Number.isNaN(value)) {
    return 0
  }

  if (value < 0) {
    return 0
  }

  if (value > 1) {
    return 1
  }

  return value
}

function linearToSrgb(value: number): number {
  const clamped = clampUnit(value)
  if (clamped <= 0.0031308) {
    return 12.92 * clamped
  }

  return 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055
}

function parseLComponent(value: string): number | undefined {
  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const parsed = Number.parseFloat(trimmed.slice(0, -1))
    return Number.isNaN(parsed) ? undefined : parsed / 100
  }

  const parsed = Number.parseFloat(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseAlpha(value: string | undefined): number {
  if (!value) {
    return 1
  }

  const trimmed = value.trim()
  if (trimmed.endsWith('%')) {
    const parsed = Number.parseFloat(trimmed.slice(0, -1))
    return Number.isNaN(parsed) ? 1 : clampUnit(parsed / 100)
  }

  const parsed = Number.parseFloat(trimmed)
  return Number.isNaN(parsed) ? 1 : clampUnit(parsed)
}

function oklchToHexWithoutPound(colorValue: string): string | undefined {
  const match = /^oklch\(\s*([^\s]+)\s+([^\s]+)\s+([^\s/)]+)(?:\s*\/\s*([^\s)]+))?\s*\)$/i.exec(
    colorValue.trim(),
  )

  if (!match) {
    return undefined
  }

  const l = parseLComponent(match[1])
  const c = Number.parseFloat(match[2])
  const hDegrees = Number.parseFloat(match[3])
  const alpha = parseAlpha(match[4])

  if (l === undefined || Number.isNaN(c) || Number.isNaN(hDegrees) || alpha <= 0) {
    return undefined
  }

  const hRadians = (hDegrees * Math.PI) / 180
  const a = c * Math.cos(hRadians)
  const b = c * Math.sin(hRadians)

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b

  const lCube = lPrime * lPrime * lPrime
  const mCube = mPrime * mPrime * mPrime
  const sCube = sPrime * sPrime * sPrime

  const rLinear = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube
  const gLinear = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube
  const bLinear = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube

  const r = Math.round(linearToSrgb(rLinear) * 255)
  const g = Math.round(linearToSrgb(gLinear) * 255)
  const bOut = Math.round(linearToSrgb(bLinear) * 255)

  return `${rgbChannelToHex(r)}${rgbChannelToHex(g)}${rgbChannelToHex(bOut)}`
}

function rgbStringToHexWithoutPound(colorValue: string): string | undefined {
  const rgbMatch = /^rgba?\(([^)]+)\)$/.exec(colorValue.trim())
  if (!rgbMatch) {
    return undefined
  }

  const [r, g, b] = rgbMatch[1]
    .split(',')
    .slice(0, 3)
    .map((part) => Number.parseInt(part.trim(), 10))

  if ([r, g, b].some((value) => Number.isNaN(value) || value < 0 || value > 255)) {
    return undefined
  }

  return `${rgbChannelToHex(r)}${rgbChannelToHex(g)}${rgbChannelToHex(b)}`
}

function resolveCssVarValue(cssVarName: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(cssVarName)
    .trim()

  return resolved || undefined
}

function normalizeCssColorToRgbString(colorValue: string): string | undefined {
  if (typeof window === 'undefined') {
    return undefined
  }

  const probe = document.createElement('span')
  probe.style.color = ''
  probe.style.color = colorValue

  if (!probe.style.color) {
    return undefined
  }

  probe.style.position = 'absolute'
  probe.style.pointerEvents = 'none'
  probe.style.opacity = '0'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()

  return resolved || undefined
}

function resolveColorValueToHexWithoutPound(colorValue: string): string | undefined {
  const directHex = toHexWithoutPound(colorValue)
  if (directHex) {
    return directHex
  }

  const directOklch = oklchToHexWithoutPound(colorValue)
  if (directOklch) {
    return directOklch
  }

  const directRgb = rgbStringToHexWithoutPound(colorValue)
  if (directRgb) {
    return directRgb
  }

  const normalizedRgb = normalizeCssColorToRgbString(colorValue)
  if (normalizedRgb) {
    const normalizedHex = rgbStringToHexWithoutPound(normalizedRgb)
    if (normalizedHex) {
      return normalizedHex
    }

    const normalizedOklch = oklchToHexWithoutPound(normalizedRgb)
    if (normalizedOklch) {
      return normalizedOklch
    }
  }

  const cssVarMatch = /^var\((--[^)]+)\)$/.exec(colorValue.trim())
  if (!cssVarMatch) {
    return undefined
  }

  const cssVarValue = resolveCssVarValue(cssVarMatch[1])
  if (!cssVarValue) {
    return undefined
  }

  return resolveColorValueToHexWithoutPound(cssVarValue)
}

function getWorkItemTypeColorHex(
  workItemType: string | undefined,
  palette: Theme['palette'],
): string | undefined {
  if (!workItemType) {
    return resolveColorValueToHexWithoutPound(palette.text.secondary)
  }

  const type = normalizeType(workItemType)

  if (type === 'bug' || type === 'issue') {
    return resolveColorValueToHexWithoutPound(palette.error.main)
  }

  if (type === 'task' || type === 'product backlog item') {
    return resolveColorValueToHexWithoutPound(palette.info.main)
  }

  if (type === 'story' || type === 'user story') {
    return resolveColorValueToHexWithoutPound(palette.primary.main)
  }

  if (type === 'feature' || type === 'epic') {
    return resolveColorValueToHexWithoutPound(palette.warning.main)
  }

  if (type === 'test case') {
    return resolveColorValueToHexWithoutPound(palette.success.main)
  }

  return resolveColorValueToHexWithoutPound(palette.text.secondary)
}

function withIconColor(url: string, colorHex?: string): string {
  if (!colorHex) {
    return url
  }

  try {
    const parsed = new URL(url)
    parsed.searchParams.set('color', colorHex)
    return parsed.toString()
  } catch {
    return `${url}${url.includes('?') ? '&' : '?'}color=${colorHex}`
  }
}

export function getWorkItemIconUrlWithThemeColor(
  workItemIconUrl: string,
  workItemType: string | undefined,
  palette: Theme['palette'],
): string {
  return withIconColor(workItemIconUrl, getWorkItemTypeColorHex(workItemType, palette))
}
