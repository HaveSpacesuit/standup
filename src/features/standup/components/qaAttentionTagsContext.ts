import { createContext } from 'react'
import type { ProjectWorkItemTypeInfo } from '../../../ado/workItemTypesApi'

export const QaAttentionTagsContext = createContext<{
  tags: readonly string[]
  statesByType: ProjectWorkItemTypeInfo['statesByType']
}>({ tags: [], statesByType: {} })
