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

export function buildQaNewItemsWiql(
  projectName: string,
  areaPath: string,
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`

  return [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    `  AND [System.CreatedDate] >= @StartOfDay('-7')`,
    `  AND (`,
    `    [System.State] = 'New'`,
    `    OR [System.State] = 'Approved'`,
    `    OR [System.Tags] CONTAINS WORDS 'Triage'`,
    `  )`,
    'ORDER BY [System.CreatedDate] DESC',
  ].join('\n')
}

export function buildQaBucketCandidatesWiql(
  projectName: string,
  areaPath: string,
  lookbackDays = 21,
): string {
  const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
  const startOfWindow = `@StartOfDay('-${lookbackDays}')`

  return [
    'SELECT [System.Id]',
    'FROM WorkItems',
    `WHERE [System.TeamProject] = ${quote(projectName)}`,
    `  AND [System.AreaPath] UNDER ${quote(areaPath)}`,
    '  AND (',
    `    [System.CreatedDate] >= ${startOfWindow}`,
    `    OR [System.ChangedDate] >= ${startOfWindow}`,
    '  )',
    'ORDER BY [System.ChangedDate] DESC',
  ].join('\n')
}
