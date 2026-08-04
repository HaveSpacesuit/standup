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
