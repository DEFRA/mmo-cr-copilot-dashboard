import * as echarts from 'echarts/core'
import {
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  EffectScatterChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
  RadarChart
} from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  GraphicComponent,
  RadarComponent
} from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { SVGRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  EffectScatterChart,
  HeatmapChart,
  TreemapChart,
  GaugeChart,
  RadarChart,
  AriaComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  GraphicComponent,
  RadarComponent,
  LabelLayout,
  SVGRenderer
])

export default echarts
