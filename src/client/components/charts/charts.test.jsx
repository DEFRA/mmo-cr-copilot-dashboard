import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { lastChartOption } from '#/test-helpers/charts.js'
import { Chart } from './Chart.jsx'
import { KpiCard } from './KpiCard.jsx'
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
      animationEasing: 'cubicOut',
      series: [{ type: 'bar' }]
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

describe('#KpiCard', () => {
  test('Should render the label, value and unit', () => {
    render(<KpiCard label="Adoption" value={75} unit="%" />)

    expect(screen.getByText('Adoption')).toBeInTheDocument()
    expect(screen.getByText(/75/)).toBeInTheDocument()
    expect(screen.getByText('%')).toBeInTheDocument()
  })

  test('Should hide a decorative icon from assistive technology', () => {
    const { container } = render(
      <KpiCard label="Adoption" value={75} icon="✦" />
    )

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
  })

  test('Should render a delta when one is supplied', () => {
    render(
      <KpiCard
        label="Adoption"
        value={75}
        delta={{ text: '+12 pts', icon: '▲', color: 'var(--color-success)' }}
      />
    )

    expect(screen.getByText('+12 pts')).toBeInTheDocument()
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
