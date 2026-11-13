import { useId } from 'react'

import { downloadCsv, toCsv } from '../../lib/csv.js'
import { InChartFigureContext } from '../charts/chart-context.js'
import { Details } from '../govuk/Details.jsx'
import { Table } from '../govuk/Table.jsx'
import { cx } from '../govuk/utils.js'
import { Panel } from './Panel.jsx'
import { PanelState } from './PanelState.jsx'
import { PERIOD_CHIP, PeriodChip } from './PeriodChip.jsx'
import { titleCase } from './KpiCard.jsx'

const formatCell = (value) =>
  typeof value === 'number' ? value.toLocaleString('en-GB') : value

/**
 * Chart figure: a one-line generic title, the chart, and a collapsed "Data and
 * description" holding the caption, description, data table and CSV download.
 * `number` comes from the view; a global counter breaks under StrictMode.
 */
export function ChartFigure({
  number,
  title,
  subtitle,
  description,
  columns,
  rows,
  family = 'speed',
  icon = 'bars',
  chip,
  actions,
  legend,
  headingLevel = 3,
  state = 'populated',
  onRetry,
  className,
  children
}) {
  const tableId = useId()
  const heading = titleCase(title)
  const filename = `figure-${number}.csv`
  const hasData = state === 'populated' && rows.length > 0

  const download = (event) => {
    event.preventDefault()
    downloadCsv(
      filename,
      toCsv(
        columns.map((column) => column.label),
        rows
      )
    )
  }

  return (
    <Panel
      as="figure"
      title={heading}
      family={family}
      icon={icon}
      aside={
        chip &&
        (chip === PERIOD_CHIP ? (
          <PeriodChip />
        ) : (
          <span className="app-mini-tag">{chip}</span>
        ))
      }
      actions={actions}
      headingLevel={headingLevel}
      busy={state === 'loading'}
      className={cx('app-figure', className)}
    >
      <PanelState
        state={state === 'populated' && rows.length === 0 ? 'empty' : state}
        title={title}
        onRetry={onRetry}
      >
        {legend}
        <div className="app-figure__chart">
          <InChartFigureContext value>{children}</InChartFigureContext>
        </div>
      </PanelState>
      {hasData && (
        <Details
          className="app-panel__details"
          summary={
            <>
              {'Data and description'}
              <span className="govuk-visually-hidden">
                {' '}
                for figure {number}
              </span>
            </>
          }
        >
          <p className="govuk-body-s govuk-!-margin-bottom-1">
            <strong>Figure {number}:</strong> {subtitle}
          </p>
          {description && <p className="govuk-body-s">{description}</p>}
          <Table
            id={tableId}
            className="govuk-!-margin-bottom-3"
            caption={`Figure ${number}: ${heading}`}
            captionSize="s"
            head={columns}
            rows={rows.map((cells, index) => ({
              id: index,
              cells: cells.map(formatCell)
            }))}
          />
          <p className="govuk-body-s govuk-!-margin-bottom-0">
            <a
              className="govuk-link"
              href={`#${tableId}`}
              download={filename}
              onClick={download}
            >
              Download the data for figure {number} (CSV)
            </a>
          </p>
        </Details>
      )}
    </Panel>
  )
}
