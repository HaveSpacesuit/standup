import { useEffect, useState } from 'react'
import { loadLastView, saveLastView, type RememberedViewPage } from '../utils/lastViews'

/**
 * A page's board view. It opens on `views[0]`, or on the view saved by an earlier visit when
 * `rememberLastView` is on. The view is saved whenever it changes, even with the setting off, so
 * turning the setting on reopens the view used most recently.
 */
export function useRememberedView<View extends string>(
  page: RememberedViewPage,
  views: readonly [View, ...View[]],
  rememberLastView: boolean,
) {
  const [view, setView] = useState<View>(() => (rememberLastView ? loadLastView(page, views) : null) ?? views[0])

  useEffect(() => {
    saveLastView(page, view)
  }, [page, view])

  return [view, setView] as const
}
