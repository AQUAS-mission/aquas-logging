"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

export const description = "Sensor trends"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

type SensorRow = {
  timestamp: number
  ph: number
  temperature: number
  dissolved_oxygen: number
  electrical_conductivity: number
  turbidity_ntu: number
}

type MetricKey = keyof Pick<
  SensorRow,
  "ph" | "temperature" | "dissolved_oxygen" | "electrical_conductivity" | "turbidity_ntu"
>

type MetricMeta = {
  label: string
  shortLabel: string
  unit: string
  description: string
  colorVar: string
}

const METRICS: Record<MetricKey, MetricMeta> = {
  ph: {
    label: "pH",
    shortLabel: "pH",
    unit: "pH",
    description: "Acidity / alkalinity",
    colorVar: "var(--chart-1)",
  },
  temperature: {
    label: "Temperature",
    shortLabel: "Temp",
    unit: "°C",
    description: "Water temperature",
    colorVar: "var(--chart-2)",
  },
  dissolved_oxygen: {
    label: "Dissolved Oxygen",
    shortLabel: "DO",
    unit: "mg/L",
    description: "Dissolved oxygen levels",
    colorVar: "var(--chart-3)",
  },
  electrical_conductivity: {
    label: "Electrical Conductivity",
    shortLabel: "EC",
    unit: "µS/cm",
    description: "Salinity / mineral load",
    colorVar: "var(--chart-4)",
  },
  turbidity_ntu: {
    label: "Turbidity",
    shortLabel: "Turbidity",
    unit: "NTU",
    description: "Water clarity",
    colorVar: "var(--chart-5)",
  },
}

const METRIC_OPTIONS = Object.keys(METRICS) as MetricKey[]

const RANGE_OPTIONS = [
  { value: "30", label: "1 month" },
  { value: "90", label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year" },
]

const chartConfig = {
  metric: {
    label: "Metric",
  },
  ph: { label: "pH", color: "var(--chart-1)" },
  temperature: { label: "Temperature", color: "var(--chart-2)" },
  dissolved_oxygen: { label: "Dissolved Oxygen", color: "var(--chart-3)" },
  electrical_conductivity: { label: "Electrical Conductivity", color: "var(--chart-4)" },
  turbidity_ntu: { label: "Turbidity", color: "var(--chart-5)" },
} satisfies ChartConfig

const formatDate = (ts: number) => new Date(ts * 1000).toLocaleDateString()
const formatNumber = (value: number) => value.toFixed(2)
const AREA_TOP_OPACITY = 0.82
const AREA_BOTTOM_OPACITY = 0.18

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [timeRange, setTimeRange] = React.useState("90")
  const [metric, setMetric] = React.useState<MetricKey>("ph")
  const [data, setData] = React.useState<SensorRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("30")
    }
  }, [isMobile])

  React.useEffect(() => {
    const controller = new AbortController()
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_BASE}/views/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ view: "all", params: { limit: 5000 } }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        const payload = (await response.json()) as { rows?: any[] }
        const rows = payload.rows ?? []
        const normalized = rows
          .map((row) => {
            const ts = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp)
            if (!Number.isFinite(ts)) return null
            const toNumber = (v: unknown) => (typeof v === "number" ? v : Number(v))
            const ph = toNumber(row.ph)
            const temperature = toNumber(row.temperature)
            const dissolved_oxygen = toNumber(row.dissolved_oxygen)
            const electrical_conductivity = toNumber(row.electrical_conductivity)
            const turbidity_ntu = toNumber(row.turbidity_ntu)
            if (
              [ph, temperature, dissolved_oxygen, electrical_conductivity, turbidity_ntu].some(
                (v) => !Number.isFinite(v)
              )
            ) {
              return null
            }
            return {
              timestamp: ts,
              ph,
              temperature,
              dissolved_oxygen,
              electrical_conductivity,
              turbidity_ntu,
            } satisfies SensorRow
          })
          .filter((row): row is SensorRow => row !== null)

        setData(normalized)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load chart data")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }
    fetchData()
    return () => controller.abort()
  }, [])

  const filteredData = React.useMemo(() => {
    const days = Number(timeRange) || 90
    const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000
    return data
      .filter((item) => item.timestamp * 1000 >= cutoffMs)
      .map((item) => ({
        timestamp: item.timestamp,
        date: formatDate(item.timestamp),
        value: item[metric],
      }))
      .sort((a, b) => (a.date > b.date ? 1 : -1))
  }, [data, metric, timeRange])

  const metricMeta = METRICS[metric]

  const summary = React.useMemo(() => {
    if (!filteredData.length) {
      return { latest: null, average: null, min: null, max: null }
    }
    const values = filteredData.map((item) => item.value)
    const latest = values[values.length - 1] ?? null
    const average = values.reduce((acc, value) => acc + value, 0) / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)
    return { latest, average, min, max }
  }, [filteredData])

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{metricMeta.label} Trend</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            {metricMeta.description} over the selected time window
          </span>
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36" size="sm" aria-label="Select time range">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="rounded-lg">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Tabs value={metric} onValueChange={(value) => setMetric(value as MetricKey)} className="mb-4 w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-5">
            {METRIC_OPTIONS.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="rounded-md px-2 py-2 text-xs sm:text-sm flex items-center gap-1.5"
              >
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: METRICS[key].colorVar }}
                />
                {METRICS[key].shortLabel}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mb-4 grid gap-2 grid-cols-2 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Latest</div>
            <div className="text-base font-semibold">
              {summary.latest === null ? "—" : formatNumber(summary.latest)} {metricMeta.unit}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Average</div>
            <div className="text-base font-semibold">
              {summary.average === null ? "—" : formatNumber(summary.average)} {metricMeta.unit}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Min</div>
            <div className="text-base font-semibold">
              {summary.min === null ? "—" : formatNumber(summary.min)} {metricMeta.unit}
            </div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Max</div>
            <div className="text-base font-semibold">
              {summary.max === null ? "—" : formatNumber(summary.max)} {metricMeta.unit}
            </div>
          </div>
        </div>

        {loading ? <div className="text-sm text-muted-foreground">Loading chart data…</div> : null}
        {error ? <div className="text-sm text-red-600">Failed to load chart data: {error}</div> : null}
        {!loading && filteredData.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data for this range.</div>
        ) : null}
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <AreaChart
            accessibilityLayer
            data={filteredData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <defs>
              <linearGradient id={`metricGradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={metricMeta.colorVar} stopOpacity={AREA_TOP_OPACITY} />
                <stop offset="95%" stopColor={metricMeta.colorVar} stopOpacity={AREA_BOTTOM_OPACITY} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="4 4" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} width={44} />
            <ChartTooltip
              cursor={{ stroke: metricMeta.colorVar, strokeOpacity: 0.3 }}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  color={metricMeta.colorVar}
                  labelFormatter={(_, payload) => {
                    const ts = payload?.[0]?.payload?.timestamp
                    return typeof ts === "number" ? new Date(ts * 1000).toLocaleString() : ""
                  }}
                  formatter={(value) => (
                    <>
                      <span className="text-muted-foreground">{metricMeta.label}</span>
                      <span className="text-foreground font-mono font-medium tabular-nums">
                        {Number(value).toFixed(2)} {metricMeta.unit}
                      </span>
                    </>
                  )}
                />
              }
            />
            <Area
              dataKey="value"
              type="natural"
              fill={`url(#metricGradient-${metric})`}
              stroke={metricMeta.colorVar}
              strokeWidth={2.5}
              isAnimationActive
              activeDot={{ r: 4.5, fill: metricMeta.colorVar, stroke: "var(--background)", strokeWidth: 2 }}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
