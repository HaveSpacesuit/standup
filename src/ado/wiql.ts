export function buildIterationScopedWiql(
  projectName: string,
  areaPath: string,
  teamIterationPath: string,
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const iterationMacro = `@CurrentIteration(${quote(teamIterationPath)})`

  return [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    `  AND (`,
    `    [System.IterationPath] = ${iterationMacro}`,
    `    OR (`,
    `      [System.IterationPath] = ${iterationMacro} + 1`,
    `      AND [System.AssignedTo] <> ''`,
    `    )`,
    `  )`,
    'ORDER BY [System.ChangedDate] DESC',
  ].join('\n')
}

export function buildQaBucketCandidatesWiql(
  projectName: string,
  areaPath: string,
  lookbackDays = 21,
  excludeWorkItemTypes: string[] = [],
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const startOfWindow = `@StartOfDay('-${lookbackDays}')`

  const clauses = [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    '  AND (',
    `    [System.CreatedDate] >= ${startOfWindow}`,
    `    OR [System.ChangedDate] >= ${startOfWindow}`,
    '  )',
  ]

  if (excludeWorkItemTypes.length > 0) {
    const typeList = excludeWorkItemTypes.map(quote).join(', ')
    clauses.push(`  AND [System.WorkItemType] NOT IN (${typeList})`)
  }

  clauses.push('ORDER BY [System.ChangedDate] DESC')

  return clauses.join('\n')
}
