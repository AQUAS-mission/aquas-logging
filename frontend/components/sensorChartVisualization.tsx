"use client"

import {
  Area, AreaChart,
  Bar, BarChart,
  Line, LineChart,
  CartesianGrid, XAxis, YAxis,
} from "recharts"
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { COMPARE_COLORS, Robot } from "@/stores/robot-store"
import Map from 'react-map-gl/maplibre'
import 'maplibre-gl/dist/maplibre-gl.css'
const chartConfig = { metric: { label: "Metric" } } satisfies ChartConfig

export type DataPoint = { date: string; value: number; timestamp: number }
export type ComparePoint = Record<string, number | string>

export type VizProps = {
  compareMode: boolean
  data: DataPoint[]
  mergedCompareData: ComparePoint[]
  compareRobotIds: string[]
  robots: Robot[]
}

// ─── Registry — add new chart types here ─────────────────────────────────────

export const VISUALIZATION_TYPES = [
  { id: "area",  label: "Sensor Data Area Chart"  },
  { id: "line",  label: "Sensor Data Line Chart"  },
  { id: "bar",   label: "Sensor Data Bar Chart"   },
  { id: "scatter", label: "Geospatial Map - Scatter" },
  { id: "path", label: "Geospatial Map - Path" }, 
  { id: "heatmap", label: "Geospatial Map - Heatmap" }, 

] as const

export type VizTypeId = typeof VISUALIZATION_TYPES[number]["id"]

// Each function returns a recharts chart element directly so that
// ResponsiveContainer (inside ChartContainer) can clone it with width/height.
const VIZ_MAP: Record<VizTypeId, (props: VizProps) => React.ReactElement> = {
  area: ({ compareMode, data, mergedCompareData, compareRobotIds, robots }) => (
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
        : <Area dataKey="value" type="natural" fill="var(--color-primary)"
            fillOpacity={0.3} stroke="var(--color-primary)" baseValue="dataMin" />
      }
    </AreaChart>
  ),
  line: ({ compareMode, data, mergedCompareData, compareRobotIds, robots }) => (
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
        : <Line dataKey="value" type="natural" stroke="var(--color-primary)" dot={false} strokeWidth={2} />
      }
    </LineChart>
  ),
  bar: ({ compareMode, data, mergedCompareData, compareRobotIds, robots }) => (
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
        : <Bar dataKey="value" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
      }
    </BarChart>
  ),
  scatter: ({ }) => ( 
    
      <Map
        initialViewState={{
          longitude: -122.4,
          latitude: 37.8,
          zoom: 14
        }}
        style={{width: "100%", height: "100%"}}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      />

  ), 
  path: ({ }) => ( 
    
      <Map
        initialViewState={{
          longitude: -122.4,
          latitude: 37.8,
          zoom: 14
        }}
        style={{width: "100%", height: "100%"}}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      />

  ), 
  heatmap: ({ }) => ( 
    
      <Map
        initialViewState={{
          longitude: -122.4,
          latitude: 37.8,
          zoom: 14
        }}
        style={{width: "100%", height: "100%"}}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      />

  ), 
}

// ─── Main switch component ────────────────────────────────────────────────────

export function SensorChartVisualization({ vizType, ...props }: VizProps & { vizType: VizTypeId }) {
  const render = VIZ_MAP[vizType] ?? VIZ_MAP.area
  return (
    <ChartContainer config={chartConfig} className="h-[650px] w-full overflow-hidden rounded-xl">
      {render(props)}
    </ChartContainer>
  )
}
