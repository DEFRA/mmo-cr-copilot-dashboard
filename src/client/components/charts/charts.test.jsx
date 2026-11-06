import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { chartEventsFor, lastChartOption } from '#/test-helpers/charts.js'
import { reducedMotion } from '#/test-helpers/motion.js'
import { Chart } from './Chart.jsx'
import { StatusGauge } from './StatusGauge.jsx'
import { TrendLine } from './TrendLine.jsx'
import { CategoryBar } from './CategoryBar.jsx'
import { StackedBar } from './StackedBar.jsx'
import { DistributionDonut } from './DistributionDonut.jsx'
import { BreakdownTreemap } from './BreakdownTreemap.jsx'
import { HotspotScatter } from './HotspotScatter.jsx'
import { ActivityHeatmap } from './ActivityHeatmap.jsx'
import { ProfileRadar } from './ProfileRadar.jsx'
import { CycleTimeScatter } from './CycleTimeScatter.jsx'
import { DeliveryTimeBar } from './DeliveryTimeBar.jsx'
import { LiveCommitStream } from './LiveCommitStream.jsx'

const seriesTypes = () =>
  (lastChartOption()?.series ?? []).map((series) => series.type)

const preferReducedMotion = () =>
  vi
    .spyOn(window, 'matchMedia')
    .mockImplementation(reducedMotion(true).matchMedia)

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('#Chart', () => {
  test('Should expose the chart as a labelled image', () => {
    render(<Chart option={{ series: [] }} ariaLabel="Adoption over time" />)

    expect(
      screen.getByRole('img', { name: 'Adoption over time' })
    ).toBeInTheDocument()
  })

  test('Should merge shared animation defaults into the option', () => {
    render(<Chart option={{ series: [{ type: 'bar' }] }} ariaLabel="Bars" />)

    expect(lastChartOption()).toMatchObject({
      animation: true,
      animationDuration: 900,
      textStyle: { fontFamily: 'Arial, Helvetica, sans-serif' },
      series: [{ type: 'bar' }]
    })
  })

  test('Should enable ECharts aria with the label as its description', () => {
    render(<Chart option={{ series: [] }} ariaLabel="Bars by repository" />)

    expect(lastChartOption().aria).toStrictEqual({
      enabled: true,
      label: { description: 'Bars by repository' }
    })
  })

  test('Should switch animation off when the user prefers reduced motion', () => {
    preferReducedMotion()

    render(<Chart option={{ series: [] }} ariaLabel="Bars" />)

    expect(lastChartOption()).toMatchObject({
      animation: false,
      animationDuration: 0,
      animationDurationUpdate: 0
    })
  })

  test('Should let the caller override a default', () => {
    render(<Chart option={{ animation: false }} ariaLabel="Static" />)

    expect(lastChartOption().animation).toBe(false)
  })

  test('Should render a text alternative for screen readers', () => {
    render(
      <Chart
        option={{}}
        ariaLabel="Adoption"
        dataTable={
          <table>
            <tbody>
              <tr>
                <td>75%</td>
              </tr>
            </tbody>
          </table>
        }
      />
    )

    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  test('Should omit the data table when none is supplied', () => {
    render(<Chart option={{}} ariaLabel="Adoption" />)

    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})

describe('#StatusGauge', () => {
  test('Should plot the value on a gauge', () => {
    render(<StatusGauge value={68} title="Adoption" theme="dark" />)

    expect(seriesTypes()).toEqual(['gauge'])
    expect(lastChartOption().series[0].data[0].value).toBe(68)
  })
})

describe('#TrendLine', () => {
  test('Should plot one line series per input series', () => {
    render(
      <TrendLine
        categories={['Jan', 'Feb']}
        series={[
          { name: 'Copilot', data: [10, 20] },
          { name: 'Human', data: [5, 4] }
        ]}
        title="Trend"
        theme="dark"
      />
    )

    expect(seriesTypes()).toEqual(['line', 'line'])
  })

  test('Should use the supplied categories on the x axis', () => {
    render(
      <TrendLine
        categories={['Jan', 'Feb']}
        series={[{ name: 'Copilot', data: [10, 20] }]}
        title="Trend"
        theme="dark"
      />
    )

    expect(lastChartOption().xAxis.data).toEqual(['Jan', 'Feb'])
  })
})

describe('#CategoryBar', () => {
  test('Should plot the values as bars', () => {
    render(
      <CategoryBar
        categories={['repo-a', 'repo-b']}
        values={[80, 40]}
        seriesName="Adoption"
        unit="%"
        title="By repository"
        theme="dark"
      />
    )

    expect(seriesTypes()).toEqual(['bar'])
  })

  test('Should render accessible drill-down buttons when onSelect is provided', async () => {
    const onSelect = vi.fn()
    render(
      <CategoryBar
        categories={['repo-a', 'repo-b']}
        values={[80, 40]}
        seriesName="Adoption"
        unit="%"
        title="By repository"
        onSelect={onSelect}
      />
    )

    const button = screen.getByRole('button', { name: /repo-a/i })
    expect(button).toBeInTheDocument()
    await userEvent.click(button)
    expect(onSelect).toHaveBeenCalledWith(0, 'repo-a')
  })

  const manyBars = (count, props = {}) => {
    const categories = Array.from({ length: count }, (_, i) => `#${i + 1}`)
    render(
      <CategoryBar
        categories={categories}
        values={categories.map((_, i) => i * 10)}
        seriesName="average batch size"
        unit=" lines"
        title="Batch size"
        onSelect={vi.fn()}
        {...props}
      />
    )
    return lastChartOption()
  }

  test('Should label each bar while few enough to fit, without a word unit', () => {
    const option = manyBars(5)

    expect(option.series[0].label).toMatchObject({
      show: true,
      formatter: '{c}'
    })
    expect(option.dataZoom[0].show).toBe(false)
  })

  test('Should leave crowded bars to hover and hide overlapping axis labels', () => {
    const option = manyBars(20)

    expect(option.series[0].label.show).toBe(false)
    expect(option.series[0].emphasis.label.show).toBe(true)
    expect(option.xAxis.axisLabel.hideOverlap).toBe(true)
  })

  test('Should scroll a long axis through a window anchored where asked', () => {
    const option = manyBars(60, { zoomAnchor: 'end' })

    expect(option.dataZoom[0]).toMatchObject({
      show: true,
      xAxisIndex: 0,
      start: 50,
      end: 100
    })
  })

  test('Should fold a long drill-down list behind a disclosure', () => {
    manyBars(20)

    expect(screen.getByText('List all 20 bars')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '#20' })).toBeInTheDocument()
  })
})

describe('#StackedBar', () => {
  test('Should stack every series onto one total', () => {
    render(
      <StackedBar
        categories={['repo-a']}
        series={[
          { name: 'Copilot', data: [60] },
          { name: 'Human', data: [40] }
        ]}
        title="Split"
        theme="dark"
      />
    )

    const stacks = lastChartOption().series.map((series) => series.stack)

    expect(stacks).toHaveLength(2)
    expect(new Set(stacks).size).toBe(1)
  })
})

describe('#DistributionDonut', () => {
  test('Should render a pie with a hole', () => {
    render(
      <DistributionDonut
        data={[
          { name: 'Copilot-assisted', value: 3 },
          { name: 'Human-authored', value: 1 }
        ]}
        title="Split"
        theme="dark"
      />
    )

    expect(seriesTypes()).toEqual(['pie'])
    expect(lastChartOption().series[0].radius[0]).not.toBe('0%')
  })

  test('Should colour Copilot and human segments differently', () => {
    render(
      <DistributionDonut
        data={[
          { name: 'Copilot-assisted', value: 3 },
          { name: 'Human-authored', value: 1 }
        ]}
        title="Split"
        theme="dark"
      />
    )

    const [copilot, human] = lastChartOption().series[0].data

    expect(copilot.itemStyle.color).not.toBe(human.itemStyle.color)
  })
})

describe('#BreakdownTreemap', () => {
  test('Should render the nodes as a treemap', () => {
    render(
      <BreakdownTreemap
        nodes={[{ name: 'repo-a', value: 100 }]}
        title="Breakdown"
        theme="dark"
      />
    )

    expect(seriesTypes()).toEqual(['treemap'])
  })
})

describe('#HotspotScatter', () => {
  test('Should render one scatter series per classification', () => {
    render(
      <HotspotScatter
        points={[
          {
            label: 'abc1234',
            x: 10,
            y: 20,
            size: 5,
            category: 'Copilot-assisted'
          },
          {
            label: 'def5678',
            x: 4,
            y: 2,
            size: 3,
            category: 'Human-authored'
          }
        ]}
        title="Hotspots"
        xName="Lines"
        yName="Commits"
        theme="dark"
      />
    )

    expect(seriesTypes()).toEqual(['scatter', 'scatter'])
  })

  test('Should colour Copilot and manual points differently', () => {
    render(
      <HotspotScatter
        points={[
          {
            label: 'abc1234',
            x: 10,
            y: 20,
            size: 5,
            category: 'Copilot-assisted'
          }
        ]}
        title="Hotspots"
        xName="Lines"
        yName="Commits"
        theme="dark"
      />
    )

    const [copilot, manual] = lastChartOption().series

    expect(copilot.itemStyle.color).not.toBe(manual.itemStyle.color)
  })
})

describe('#ActivityHeatmap', () => {
  test('Should render a heatmap with a visual map legend', () => {
    render(
      <ActivityHeatmap
        xLabels={['Mon', 'Tue']}
        yLabels={['ada']}
        data={[
          [0, 0, 3],
          [1, 0, 5]
        ]}
        title="Activity"
        theme="dark"
      />
    )

    expect(seriesTypes()).toEqual(['heatmap'])
    expect(lastChartOption().visualMap).toBeDefined()
  })

  test('Should report contributor and cell clicks, ignoring empty cells', () => {
    const onSelectContributor = vi.fn()
    const onSelectCell = vi.fn()
    render(
      <ActivityHeatmap
        xLabels={['repo-a', 'repo-b']}
        yLabels={['ada']}
        data={[[0, 0, 50]]}
        title="Activity"
        onSelectContributor={onSelectContributor}
        onSelectCell={onSelectCell}
      />
    )
    const { click } = chartEventsFor('heatmap')

    click({ componentType: 'yAxis', value: 'ada' })
    click({ componentType: 'series', data: { value: [1, 0, '-'] } })
    click({ componentType: 'series', data: { value: [0, 0, 50] } })

    expect(onSelectContributor).toHaveBeenCalledWith('ada')
    expect(onSelectCell).toHaveBeenCalledTimes(1)
    expect(onSelectCell).toHaveBeenCalledWith('repo-a', 'ada')
    expect(screen.queryByRole('button', { name: 'ada' })).toBeNull()
    expect(lastChartOption().yAxis).toMatchObject({
      triggerEvent: true,
      axisLabel: { borderRadius: 999, fontWeight: 600 }
    })
    expect(lastChartOption().xAxis.axisLabel).toMatchObject({
      overflow: 'truncate',
      hideOverlap: true
    })
  })

  test('Should size contributor pills to a short handle and truncate longer ones', () => {
    render(
      <ActivityHeatmap
        xLabels={['repo-a']}
        yLabels={['charlie', 'rhododendron']}
        data={[[0, 1, 80]]}
        title="Activity"
        onSelectContributor={vi.fn()}
      />
    )

    expect(lastChartOption().yAxis.axisLabel).toMatchObject({
      width: 48,
      overflow: 'truncate',
      ellipsis: '…'
    })
    expect(lastChartOption().yAxis.tooltip).toEqual({ show: true })
  })

  test('Should give every contributor its own labelled row', () => {
    const contributors = Array.from({ length: 30 }, (_, i) => `dev-${i}`)
    render(
      <ActivityHeatmap
        xLabels={['repo-a']}
        yLabels={contributors}
        data={[[0, 0, 50]]}
        title="Activity"
      />
    )

    expect(lastChartOption().yAxis.axisLabel.interval).toBe(0)
    expect(screen.getByRole('img').style.height).toBe(`${80 + 30 * 36}px`)
  })
})

describe('#ProfileRadar', () => {
  test('Should render the indicators on a radar', () => {
    render(
      <ProfileRadar
        indicators={[
          { name: 'Adoption', max: 100 },
          { name: 'Rework', max: 100 }
        ]}
        series={[{ key: 'repo-a', name: 'repo-a', values: [80, 20] }]}
        title="Profile"
        subtitle="By repository"
      />
    )

    expect(seriesTypes()).toEqual(['radar'])
    expect(lastChartOption().radar.indicator).toHaveLength(2)
  })

  const twoRepos = [
    { key: 'DEFRA/repo-a', name: 'repo-a', values: [80, 20] },
    { key: 'DEFRA/repo-b', name: 'repo-b', values: [40, 60] }
  ]
  const renderTwo = (props = {}) =>
    render(
      <ProfileRadar
        indicators={[
          { name: 'Adoption', max: 100 },
          { name: 'Rework', max: 100 }
        ]}
        series={twoRepos}
        title="Profile"
        {...props}
      />
    )

  test('Should list every series in an HTML legend', () => {
    renderTwo()

    const legend = screen.getByRole('list', {
      name: 'Repositories in this chart'
    })
    expect(
      within(legend)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['repo-a', 'repo-b'])
    expect(lastChartOption().legend.show).toBe(false)
  })

  test('Should hide a series and keep the colours of the rest', async () => {
    renderTwo()
    const before = lastChartOption().series[0].data[1].itemStyle.color

    const toggle = screen.getByRole('button', { name: 'repo-a' })
    await userEvent.click(toggle)

    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    const data = lastChartOption().series[0].data
    expect(data.map((d) => d.name)).toEqual(['repo-b'])
    expect(data[0].itemStyle.color).toBe(before)
  })

  test('Should drill into a series from a polygon click', () => {
    const onSelect = vi.fn()
    renderTwo({ onSelect })

    chartEventsFor('radar').click({ name: 'repo-b' })

    expect(onSelect).toHaveBeenCalledWith('DEFRA/repo-b')
  })
})

describe('#CycleTimeScatter', () => {
  const points = [
    {
      prNumber: 42,
      repository: 'DEFRA/repo-a',
      mergedAt: '2026-01-15T10:00:00.000Z',
      cycleHours: 12,
      batchSize: 200,
      assistRate: 75,
      contributors: ['ada']
    }
  ]

  test('Should render the pull requests as a scatter', () => {
    render(<CycleTimeScatter points={points} title="Cycle time" />)

    expect(seriesTypes()).toEqual(['scatter'])
  })

  test('Should tolerate an empty set of points', () => {
    render(<CycleTimeScatter points={[]} title="Cycle time" />)

    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})

describe('#DeliveryTimeBar', () => {
  const items = [
    {
      prNumber: 42,
      cycleHours: 12,
      completed: true,
      prMergedAt: '2026-01-15T10:00:00.000Z'
    },
    { prNumber: 43, cycleHours: 30, completed: false }
  ]

  test('Should render completed and in-progress work', () => {
    render(<DeliveryTimeBar items={items} title="Delivery time" />)

    expect(seriesTypes().every((type) => type === 'bar')).toBe(true)
  })

  test('Should tolerate an empty set of items', () => {
    render(<DeliveryTimeBar items={[]} title="Delivery time" />)

    expect(screen.getByRole('img')).toBeInTheDocument()
  })

  test('Should leave zero-hour bars unlabelled', () => {
    render(<DeliveryTimeBar items={items} title="Delivery time" />)

    const { formatter } = lastChartOption().series[0].label
    expect(formatter({ value: 0 })).toBe('')
    expect(formatter({ value: 12 })).toBe('12h')
  })

  test('Should open a long run of pull requests on the newest window', () => {
    const many = Array.from({ length: 90 }, (_, i) => ({
      prNumber: i + 1,
      cycleHours: i,
      completed: true
    }))
    render(<DeliveryTimeBar items={many} title="Delivery time" />)

    const option = lastChartOption()
    expect(option.series[0].label.show).toBe(false)
    expect(option.dataZoom[0]).toMatchObject({
      show: true,
      start: expect.closeTo(66.67, 1),
      end: 100
    })
  })
})

describe('#LiveCommitStream', () => {
  const timeline = [
    {
      commit: 'abc1234',
      author: 'ada',
      subject: 'Add a chart',
      classification: 'Copilot-assisted',
      committedAt: '2026-01-15T09:45:00.000Z',
      repository: 'DEFRA/repo-a',
      repoName: 'repo-a',
      prNumber: 42,
      linesTouched: 120
    }
  ]

  test('Should announce the most recent commit', () => {
    render(<LiveCommitStream timeline={timeline} theme="dark" />)

    expect(screen.getByText(/Latest: repo-a #42 · abc1234/)).toBeInTheDocument()
  })

  test('Should list the commits in the accessible data table', () => {
    render(<LiveCommitStream timeline={timeline} theme="dark" />)

    expect(screen.getByRole('cell', { name: 'abc1234' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '120' })).toBeInTheDocument()
  })

  test('Should report that it is awaiting commits when the timeline is empty', () => {
    render(<LiveCommitStream timeline={[]} theme="dark" />)

    expect(screen.getByText('Awaiting commits…')).toBeInTheDocument()
  })

  const stream = (sizes) =>
    sizes.map((linesTouched, i) => ({
      ...timeline[0],
      commit: `sha${i}`,
      linesTouched
    }))

  test('Should plot only the latest window of commits but table them all', () => {
    preferReducedMotion()
    render(<LiveCommitStream timeline={stream(Array(60).fill(10))} />)

    expect(lastChartOption().xAxis.data).toHaveLength(40)
    expect(lastChartOption().xAxis.data[0]).toBe('sha20')
    expect(screen.getByRole('cell', { name: 'sha0' })).toBeInTheDocument()
  })

  test('Should switch to a log axis when one commit dwarfs the rest', () => {
    preferReducedMotion()
    render(<LiveCommitStream timeline={stream([10, 0, 12, 23000])} />)

    expect(lastChartOption().yAxis).toMatchObject({ type: 'log', min: 1 })
    expect(lastChartOption().series[0].data).toEqual([10, 1, 12, 23000])
  })

  test('Should keep a linear axis for an even spread', () => {
    preferReducedMotion()
    render(<LiveCommitStream timeline={stream([10, 40, 120, 200])} />)

    expect(lastChartOption().yAxis.type).toBe('value')
  })
})

describe('Chart interaction', () => {
  test('Should not require an onSelect handler', async () => {
    render(
      <BreakdownTreemap
        nodes={[{ name: 'repo-a', value: 100 }]}
        title="Breakdown"
        theme="dark"
      />
    )

    await userEvent.click(screen.getByTestId('echart'))

    expect(screen.getByRole('img')).toBeInTheDocument()
  })
})
