"use client"

import * as React from "react"
import {
  Area, AreaChart,
  Bar, BarChart,
  Line, LineChart,
  CartesianGrid, XAxis, YAxis,
} from "recharts"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { COMPARE_COLORS, type Robot } from "@/stores/robot-store"
import dynamic from "next/dynamic"

const ScatterMapViz = dynamic(
  () => import("@/components/scatterMapViz").then((m) => m.ScatterMapViz),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div> }
)

const PathMapViz = dynamic(
  () => import("@/components/pathMapViz").then((m) => m.PathMapViz),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div> }
)

const HeatmapViz = dynamic(
  () => import("@/components/heatmapViz").then((m) => m.HeatmapViz),
  { ssr: false, loading: () => <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">Loading map…</div> }
)

const chartConfig = { metric: { label: "Metric" } } satisfies ChartConfig

export type DataPoint = { date: string; value: number; timestamp: number }
export type ComparePoint = Record<string, number | string>

export type MetricKey = "ph" | "temperature" | "dissolved_oxygen" | "electrical_conductivity" | "turbidity_ntu"

// Map metrics to CSS custom property colors (OKLCH color space)
const METRIC_COLORS: Record<MetricKey, string> = {
  turbidity_ntu: "var(--chart-1)",            // Dark purple
  ph: "var(--chart-5)",                       // Red
  dissolved_oxygen: "var(--chart-2)",         // Teal/blue
  electrical_conductivity: "var(--chart-4)",  // Yellow/orange
  temperature: "var(--chart-3)",              // Dark blue
}

export type VizProps = {
  compareMode: boolean
  data: DataPoint[]
  mergedCompareData: ComparePoint[]
  compareRobotIds: string[]
  robots: Robot[]
  selectedRobotId?: string
  hours?: number
  metric?: MetricKey
}

// ─── Registry — add new chart types here ─────────────────────────────────────

export const VISUALIZATION_TYPES = [
  { id: "area",     label: "Sensor Data Area Chart"     },
  { id: "line",     label: "Sensor Data Line Chart"     },
  { id: "bar",      label: "Sensor Data Bar Chart"      },
  { id: "scatter",  label: "Geospatial Map - Scatter"   },
  { id: "path",     label: "Geospatial Map - Path"      },
  { id: "heatmap",  label: "Geospatial Map - Heatmap"   },
] as const

export type VizTypeId = typeof VISUALIZATION_TYPES[number]["id"]

const MAP_TYPES = new Set<VizTypeId>(["scatter", "path", "heatmap"])

// Each function returns a recharts chart element directly so that
// ResponsiveContainer (inside ChartContainer) can clone it with width/height.
const VIZ_MAP: Partial<Record<VizTypeId, (props: VizProps) => React.ReactElement>> = {
  area: ({ compareMode, data, mergedCompareData, compareRobotIds, robots, metric }) => {
    const metricColor = metric ? METRIC_COLORS[metric] : "var(--color-primary)"
    return (
      <AreaChart data={compareMode ? mergedCompareData : data} margin={{ left: 12, right: 12, top: 10, bottom: 10 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis domain={["auto", "auto"]} hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        {compareMode
          ? compareRobotIds.map((id, i) => {
              const robot = robots.find((r) => r.robot_id === id)
              const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
              return (
                <Area key={id} dataKey={id} name={robot?.name ?? id} type="natural"
                  fill={color} fillOpacity={0.2} stroke={color} baseValue="dataMin" />
              )
            })
          : <Area dataKey="value" type="natural" fill={metricColor}
              fillOpacity={0.3} stroke={metricColor} baseValue="dataMin" />
        }
      </AreaChart>
    )
  },
  line: ({ compareMode, data, mergedCompareData, compareRobotIds, robots, metric }) => {
    const metricColor = metric ? METRIC_COLORS[metric] : "var(--color-primary)"
    return (
      <LineChart data={compareMode ? mergedCompareData : data} margin={{ left: 12, right: 12, top: 10, bottom: 10 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
        <YAxis domain={["auto", "auto"]} hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        {compareMode
          ? compareRobotIds.map((id, i) => {
              const robot = robots.find((r) => r.robot_id === id)
              const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
              return (
                <Line key={id} dataKey={id} name={robot?.name ?? id} type="natural"
                  stroke={color} dot={false} strokeWidth={2} />
              )
            })
          : <Line dataKey="value" type="natural" stroke={metricColor} dot={false} strokeWidth={2} />
        }
      </LineChart>
    )
  },
  bar: ({ compareMode, data, mergedCompareData, compareRobotIds, robots, metric }) => {
    const metricColor = metric ? METRIC_COLORS[metric] : "var(--color-primary)"
    return (
      <BarChart data={compareMode ? mergedCompareData : data} margin={{ left: 12, right: 12, top: 10, bottom: 10 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32} />
        <YAxis domain={["auto", "auto"]} hide />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
        {compareMode
          ? compareRobotIds.map((id, i) => {
              const robot = robots.find((r) => r.robot_id === id)
              const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
              return (
                <Bar key={id} dataKey={id} name={robot?.name ?? id} fill={color} radius={[2, 2, 0, 0]} />
              )
            })
          : <Bar dataKey="value" fill={metricColor} radius={[2, 2, 0, 0]} />
        }
      </BarChart>
    )
  },
}

// ─── Main switch component ────────────────────────────────────────────────────

export function SensorChartVisualization({ vizType, ...props }: VizProps & { vizType: VizTypeId }) {
  // Map-based visualizations render outside ChartContainer/ResponsiveContainer
  if (MAP_TYPES.has(vizType)) {
    const MapComponent = vizType === "path" ? PathMapViz : vizType === "heatmap" ? HeatmapViz : ScatterMapViz
    return (
      <div className="h-[650px] w-full overflow-hidden rounded-xl">
        <MapComponent {...props} />
      </div>
    )
  }

  const render = VIZ_MAP[vizType] ?? VIZ_MAP.area!
  return (
    <ChartContainer config={chartConfig} className="h-[650px] w-full overflow-hidden rounded-xl">
      {render(props)}
    </ChartContainer>
  )
}
