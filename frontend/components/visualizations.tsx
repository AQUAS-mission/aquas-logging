"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useRobotStore } from "@/stores/robot-store"
import {
  SensorChartVisualization,
  VISUALIZATION_TYPES,
  type VizTypeId,
} from "@/components/sensorChartVisualization"

const MAP_VIZ_TYPES = new Set<VizTypeId>(["scatter", "path", "heatmap"])

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

type MetricKey = "ph" | "temperature" | "dissolved_oxygen" | "electrical_conductivity" | "turbidity_ntu"

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "ph", label: "pH" },
  { key: "temperature", label: "Temperature (C)" },
  { key: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)" },
  { key: "electrical_conductivity", label: "EC (µS/cm)" },
  { key: "turbidity_ntu", label: "Turbidity (NTU)" },
]

const RANGE_OPTIONS = [
  { value: "7",   label: "1 week"   },
  { value: "30",  label: "1 month"  },
  { value: "90",  label: "3 months" },
  { value: "180", label: "6 months" },
  { value: "365", label: "1 year"   },
]

const formatDate = (ts: number) => new Date(ts * 1000).toLocaleDateString()

const normalizeRows = (rows: any[], metric: MetricKey) =>
  rows
    .map((row) => {
      const ts = typeof row.timestamp === "number" ? row.timestamp : Math.floor(new Date(row.timestamp).getTime() / 1000)
      if (!Number.isFinite(ts)) return null
      const val = typeof row[metric] === "number" ? row[metric] : Number(row[metric])
      if (!Number.isFinite(val)) return null
      return { timestamp: ts, date: formatDate(ts), value: val }
    })
    .filter(Boolean) as { timestamp: number; date: string; value: number }[]

export function SensorVisualizations() {
  const { data: session } = useSession()
  const isMobile = useIsMobile()
  const { selectedRobotId, compareMode, compareRobotIds, robots, refreshTick } = useRobotStore()

  const [vizType, setVizType] = React.useState<VizTypeId>("area")
  const [timeRange, setTimeRange] = React.useState("90")
  const [metric, setMetric] = React.useState<MetricKey>("ph")
  const [data, setData] = React.useState<{ timestamp: number; date: string; value: number }[]>([])
  const [compareData, setCompareData] = React.useState<Record<string, { timestamp: number; date: string; value: number }[]>>({})
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (isMobile) setTimeRange("30")
  }, [isMobile])

  const hours = Number(timeRange) * 24

  // Normal mode fetch
  React.useEffect(() => {
    if (compareMode || !selectedRobotId || !session?.user?.accessToken) {
      setData([])
      return
    }
    const controller = new AbortController()
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`${API_BASE}/robots/${selectedRobotId}/data?hours=${hours}`, {
          headers: { Authorization: `Bearer ${session.user.accessToken}` },
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
        const payload = await res.json()
        setData(normalizeRows(payload.rows ?? [], metric))
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load chart data")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    fetchData()
    return () => controller.abort()
  }, [selectedRobotId, compareMode, session?.user?.accessToken, hours, metric, refreshTick])

  // Compare mode fetch
  React.useEffect(() => {
    if (!compareMode || compareRobotIds.length === 0 || !session?.user?.accessToken) {
      setCompareData({})
      return
    }
    const controller = new AbortController()
    const fetchCompare = async () => {
      setLoading(true)
      setError(null)
      try {
        const results = await Promise.all(
          compareRobotIds.map(async (id) => {
            const res = await fetch(`${API_BASE}/robots/${id}/data?hours=${hours}`, {
              headers: { Authorization: `Bearer ${session.user.accessToken}` },
              signal: controller.signal,
            })
            if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
            const payload = await res.json()
            return { id, rows: normalizeRows(payload.rows ?? [], metric) }
          })
        )
        const byId: Record<string, { timestamp: number; date: string; value: number }[]> = {}
        for (const { id, rows } of results) byId[id] = rows
        setCompareData(byId)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load chart data")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    fetchCompare()
    return () => controller.abort()
  }, [compareMode, compareRobotIds.join(","), session?.user?.accessToken, hours, metric, refreshTick])

  const mergedCompareData = React.useMemo(() => {
    if (!compareMode) return []
    const dateMap: Record<string, Record<string, number>> = {}
    for (const [robotId, rows] of Object.entries(compareData)) {
      for (const row of rows) {
        if (!dateMap[row.date]) dateMap[row.date] = {}
        dateMap[row.date][robotId] = row.value
      }
    }
    return Object.entries(dateMap)
      .map(([date, values]) => ({ date, ...values }))
      .sort((a, b) => (a.date > b.date ? 1 : -1))
  }, [compareData, compareMode])

  const hasData = compareMode ? mergedCompareData.length > 0 : data.length > 0

  return (
    <Card className="@container/card mx-4 lg:mx-6">
      <CardHeader>
        {/* Visualization type selector replaces the static title */}
        <Select value={vizType} onValueChange={(val) => setVizType(val as VizTypeId)}>
          <SelectTrigger className="w-64 text-lg font-semibold border-none shadow-none px-0 focus:ring-0" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {VISUALIZATION_TYPES.map((v) => (
              <SelectItem key={v.id} value={v.id} className="rounded-lg">{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <CardAction>
          <div className="flex flex-wrap gap-2">
            {!MAP_VIZ_TYPES.has(vizType) && (
              <Select value={metric} onValueChange={(val) => setMetric(val as MetricKey)}>
                <SelectTrigger className="w-48" size="sm" aria-label="Select metric">
                  <SelectValue placeholder="Metric" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {METRICS.map((m) => (
                    <SelectItem key={m.key} value={m.key} className="rounded-lg">{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-36" size="sm" aria-label="Select time range">
                <SelectValue placeholder="Time range" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {RANGE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="rounded-lg">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        {!selectedRobotId && !compareMode && (
          <div className="text-sm text-muted-foreground">Select a robot from the sidebar to view data.</div>
        )}
        {compareMode && compareRobotIds.length === 0 && (
          <div className="text-sm text-muted-foreground">Select robots to compare from the sidebar.</div>
        )}
        {!MAP_VIZ_TYPES.has(vizType) && loading && <div className="text-sm text-muted-foreground">Loading chart data…</div>}
        {!MAP_VIZ_TYPES.has(vizType) && error && <div className="text-sm text-destructive">Failed to load chart data: {error}</div>}
        {(MAP_VIZ_TYPES.has(vizType) || (!loading && hasData)) && (
          <SensorChartVisualization
            vizType={vizType}
            compareMode={compareMode}
            data={data}
            mergedCompareData={mergedCompareData}
            compareRobotIds={compareRobotIds}
            robots={robots}
            selectedRobotId={selectedRobotId ?? undefined}
            hours={hours}
          />
        )}
      </CardContent>
    </Card>
  )
}
