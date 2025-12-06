"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

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

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "ph", label: "pH" },
  { key: "temperature", label: "Temperature (C)" },
  { key: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)" },
  { key: "electrical_conductivity", label: "EC (µS/cm)" },
  { key: "turbidity_ntu", label: "Turbidity (NTU)" },
]

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
} satisfies ChartConfig

const formatDate = (ts: number) => new Date(ts * 1000).toLocaleDateString()

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
        date: formatDate(item.timestamp),
        value: item[metric],
      }))
      .sort((a, b) => (a.date > b.date ? 1 : -1))
  }, [data, metric, timeRange])

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Sensor Trend</CardTitle>
        <CardDescription>
          <span className="hidden @[540px]/card:block">
            Pick a metric and time window to explore trends
          </span>
        </CardDescription>
        <CardAction>
          <div className="flex flex-wrap gap-2">
            <Select value={metric} onValueChange={(val) => setMetric(val as MetricKey)}>
              <SelectTrigger className="w-48" size="sm" aria-label="Select metric">
                <SelectValue placeholder="Metric" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {METRICS.map((m) => (
                  <SelectItem key={m.key} value={m.key} className="rounded-lg">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
        {loading ? <div className="text-sm text-muted-foreground">Loading chart data…</div> : null}
        {error ? <div className="text-sm text-red-600">Failed to load chart data: {error}</div> : null}
        {!loading && filteredData.length === 0 ? (
          <div className="text-sm text-muted-foreground">No data for this range.</div>
        ) : null}
        <ChartContainer config={chartConfig} className="h-[250px] w-full">
          <AreaChart
            accessibilityLayer
            data={filteredData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={16} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
            <Area dataKey="value" type="natural" fill="var(--primary)" fillOpacity={0.3} stroke="var(--primary)" />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
