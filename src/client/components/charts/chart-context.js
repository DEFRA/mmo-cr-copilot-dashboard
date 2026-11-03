import { createContext } from 'react'

// True inside a ChartFigure, whose "Data and description" already holds the data table.
export const InChartFigureContext = createContext(false)
