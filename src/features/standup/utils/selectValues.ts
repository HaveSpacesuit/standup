export function readStringSelectValue(value: unknown): string {
  if (typeof value !== 'string') {
    throw new TypeError('Expected a string Select value.')
  }

  return value
}

export function readStringArraySelectValue(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(',')
  }

  if (Array.isArray(value)) {
    const stringValues = value.filter((item: unknown): item is string => typeof item === 'string')
    if (stringValues.length === value.length) {
      return stringValues
    }
  }

  throw new TypeError('Expected a string array Select value.')
}
