import { useLayoutEffect, useMemo, useState } from 'react'
import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { Chart as ChartJS, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend, type Scale, type TooltipItem } from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { TestPoint } from '../../../ado/testPipelinesApi'
import { PASS_RATE_TICKS as passRateTicks, passRatePosition, testStageLabel, type TestPipeline } from '../utils/testPipelines'

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Legend)

export type TestSeries = { pipeline: TestPipeline; points: TestPoint[] }
export type TestChartRange = { start: number; end: number }

const X_TICK_COUNT = 7

function testRunUrl(pipeline: TestPipeline, runId: number): string {
  const base = `https://dev.azure.com/${encodeURIComponent(pipeline.orgName)}/${encodeURIComponent(pipeline.projectName)}`
  return pipeline.kind === 'build'
    ? `${base}/_build/results?buildId=${runId}&view=ms.vss-test-web.build-test-results-tab`
    : `${base}/_releaseProgress?releaseId=${runId}&_a=release-pipeline-progress`
}

export function TestPassChart({ series, range }: { series: TestSeries[]; range: TestChartRange }) {
  const theme = useTheme()
  const [colors, setColors] = useState<string[]>([])

  useLayoutEffect(() => {
    const probe = document.createElement('span')
    document.body.appendChild(probe)
    const next = [
      theme.palette.primary.main,
      theme.palette.secondary.main,
      theme.palette.info.main,
      theme.palette.success.main,
      theme.palette.warning.main,
      theme.palette.error.main,
    ].map((color) => {
      probe.style.color = color
      return getComputedStyle(probe).color
    })
    probe.remove()
    setColors(next)
  }, [theme])

  const data = useMemo(() => {
    return {
      datasets: series.map(({ pipeline, points }, index) => {
        return {
          label: `${pipeline.name} · ${testStageLabel(pipeline.stageName)}`,
          data: points.map((point) => ({
            x: new Date(point.date).getTime(),
            y: passRatePosition((point.passed / point.total) * 100),
          })),
          borderColor: colors[index % colors.length] ?? theme.palette.primary.main,
          backgroundColor: colors[index % colors.length] ?? theme.palette.primary.main,
          pointRadius: 3,
          tension: 0.15,
        }
      }),
    }
  }, [series, colors, theme.palette.primary.main])

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    onClick: (_event: unknown, elements: Array<{ datasetIndex: number; index: number }>) => {
      const hit = elements[0]
      if (!hit) return
      const selected = series[hit.datasetIndex]
      const point = selected?.points[hit.index]
      if (point) window.open(testRunUrl(selected.pipeline, point.runId), '_blank', 'noopener,noreferrer')
    },
    onHover: (_event: unknown, elements: Array<unknown>, chart: ChartJS) => {
      chart.canvas.style.cursor = elements.length ? 'pointer' : 'default'
    },
    interaction: { mode: 'nearest' as const, intersect: true },
    scales: {
      y: {
        min: 0,
        max: passRatePosition(0),
        reverse: true,
        title: { display: true, text: 'Passed (%) · log-scaled failures' },
        afterBuildTicks: (scale: Scale) => {
          scale.ticks = passRateTicks.map((percent) => ({ value: passRatePosition(percent) }))
        },
        ticks: {
          autoSkip: false,
          callback: (value: number | string) =>
            `${passRateTicks.find((percent) => Math.abs(passRatePosition(percent) - Number(value)) < 1e-10) ?? ''}%`,
        },
      },
      x: {
        type: 'linear' as const,
        min: range.start,
        max: range.end,
        afterBuildTicks: (scale: Scale) => {
          const step = (range.end - range.start) / (X_TICK_COUNT - 1)
          scale.ticks = Array.from({ length: X_TICK_COUNT }, (_, index) => ({ value: range.start + step * index }))
        },
        ticks: {
          callback: (value: number | string) => new Date(Number(value)).toLocaleString(undefined, {
            month: 'numeric', day: 'numeric', year: 'numeric',
          }),
        },
      },
    },
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: {
        callbacks: {
          title: (items: TooltipItem<'line'>[]) =>
            items[0]?.parsed.x != null ? new Date(items[0].parsed.x).toLocaleString() : '',
          label: (context: TooltipItem<'line'>) => {
            const point = series[context.datasetIndex]?.points[context.dataIndex]
            return point ? `${context.dataset.label}: ${((point.passed / point.total) * 100).toFixed(2)}% passed` : ''
          },
          afterLabel: (context: { datasetIndex: number; dataIndex: number }) => {
            const point = series[context.datasetIndex]?.points[context.dataIndex]
            return point ? `${point.passed} / ${point.total} passed · run ${point.runId} · click to open in Azure DevOps` : ''
          },
        },
      },
    },
  }

  return (
    <Box role="img" aria-label="E2E test pass percentage by pipeline over time" sx={{ width: '100%', height: '100%', minHeight: 280 }}>
      <Line data={data} options={options} />
    </Box>
  )
}
