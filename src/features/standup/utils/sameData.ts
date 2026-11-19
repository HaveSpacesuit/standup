/**
 * Whether two values hold the same plain data: identical values, or arrays and plain objects whose entries hold the same
 * data, compared `depth` levels deep and by identity below that. Other objects, such as dates and maps, compare by
 * identity.
 */
export function isSameData(left: unknown, right: unknown, depth: number): boolean {
  if (Object.is(left, right)) return true
  if (depth <= 0 || !isPlainData(left) || !isPlainData(right) || Array.isArray(left) !== Array.isArray(right)) return false
  const keys = Object.keys(left)
  return keys.length === Object.keys(right).length
    && keys.every((key) => Object.hasOwn(right, key) && isSameData(left[key], right[key], depth - 1))
}

function isPlainData(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === Array.prototype || prototype === null
}

/**
 * A memo comparison for components whose props are plain data. The board's hooks rebuild equal items, details and
 * journeys whenever any of their inputs change, such as a tag rule, so comparing identities alone re-renders every card.
 */
export function haveSameDataProps<Props extends object>(previous: Props, next: Props): boolean {
  // Props, then an item, then its pull requests, then their fields.
  return isSameData(previous, next, 4)
}
