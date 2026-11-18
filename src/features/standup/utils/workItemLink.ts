export type WorkItemLinkSource = { id: number; title: string; workItemUrl?: string; workItemType?: string }
export type PullRequestLinkSource = { id: number; title: string; url?: string }

/** The same content in two forms: rich editors paste the HTML, plain-text ones the text. */
export type ClipboardContent = { text: string; html: string }

const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char])

/** How Azure DevOps names an item in a link, such as "Bug 1786129". */
export function getWorkItemLinkLabel(item: Pick<WorkItemLinkSource, 'id' | 'workItemType'>) {
  return `${item.workItemType?.trim() || 'Work item'} ${item.id}`
}

/** Formats an item the way Azure DevOps copies it: "Bug 123: Title", with the label linked to the item. */
export function formatWorkItemLink(item: WorkItemLinkSource): ClipboardContent {
  const url = item.workItemUrl && !item.workItemUrl.endsWith('/') ? `${item.workItemUrl}/` : item.workItemUrl
  return formatLink(getWorkItemLinkLabel(item), item.title, url)
}

/** How a link names a pull request, such as "Pull request 456". */
export const getPullRequestLinkLabel = (pullRequest: Pick<PullRequestLinkSource, 'id'>) => `Pull request ${pullRequest.id}`

/** Formats a pull request the same way: "Pull request 456: Title", with the label linked to the pull request. */
export function formatPullRequestLink(pullRequest: PullRequestLinkSource): ClipboardContent {
  return formatLink(getPullRequestLinkLabel(pullRequest), pullRequest.title, pullRequest.url)
}

function formatLink(label: string, rawTitle: string, url: string | undefined): ClipboardContent {
  const title = rawTitle.trim()
  const link = url ? `<a href="${escapeHtml(url)}">${escapeHtml(label)}</a>` : escapeHtml(label)
  return {
    text: title ? `${label}: ${title}` : label,
    html: title ? `${link}: ${escapeHtml(title)}` : link,
  }
}

function copyWithCopyEvent(content: ClipboardContent) {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  let handled = false
  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return
    event.clipboardData.setData('text/html', content.html)
    event.clipboardData.setData('text/plain', content.text)
    event.preventDefault()
    handled = true
  }
  // Browsers fire the copy event only when something is selected, so a hidden copy of the text is selected meanwhile.
  const selection = document.getSelection()
  const previous = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index)) : []
  const standIn = document.createElement('span')
  standIn.textContent = content.text
  standIn.setAttribute('aria-hidden', 'true')
  standIn.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;user-select:text;white-space:pre'
  document.body.append(standIn)
  const range = document.createRange()
  range.selectNodeContents(standIn)
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.addEventListener('copy', onCopy, true)
  try {
    return document.execCommand('copy') && handled
  } catch {
    return false
  } finally {
    document.removeEventListener('copy', onCopy, true)
    selection?.removeAllRanges()
    previous.forEach((saved) => selection?.addRange(saved))
    standIn.remove()
  }
}

/**
 * Copies both forms of the content. Call it straight from the click or key press, since browsers allow
 * clipboard writes only during one. Rejects when the browser refuses every way of copying.
 */
export async function copyRichText(content: ClipboardContent): Promise<void> {
  const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
  if (typeof ClipboardItem === 'function' && typeof clipboard?.write === 'function') {
    try {
      await clipboard.write([new ClipboardItem({
        'text/html': new Blob([content.html], { type: 'text/html' }),
        'text/plain': new Blob([content.text], { type: 'text/plain' }),
      })])
      return
    } catch {
      // Older browsers refuse HTML here; the copy event below still carries both forms.
    }
  }
  if (copyWithCopyEvent(content)) return
  if (typeof clipboard?.writeText !== 'function') throw new Error('The browser does not allow copying to the clipboard.')
  await clipboard.writeText(content.text)
}
