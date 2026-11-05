import { Box } from '@mui/material'

/** Tooltip text on separate lines; the first can be bold, like a sum above the terms it explains. */
export function TipLines({ lines, boldFirst = false }: { lines: readonly string[]; boldFirst?: boolean }) {
  return lines.map((line, index) => (
    <Box key={line} component="span" sx={{ display: 'block', fontWeight: boldFirst && index === 0 ? 700 : undefined }}>
      {line}
    </Box>
  ))
}
