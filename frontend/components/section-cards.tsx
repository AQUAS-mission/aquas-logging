"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { IconTrendingDown, IconTrendingUp } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useRobotStore } from "@/stores/robot-store"

type SensorRow = {
  timestamp: number
  ph: number
  temperature: number
  dissolved_oxygen: number
  electrical_conductivity: number
  turbidity_ntu: number
}

type MetricKey = keyof Omit<SensorRow, "timestamp">

type MetricMeta = {
  key: MetricKey
  label: string
  unit?: string
}

const METRICS: MetricMeta[] = [
  { key: "ph", label: "pH" },
  { key: "temperature", label: "Temperature", unit: "°C" },
  { key: "dissolved_oxygen", label: "Dissolved Oxygen", unit: "mg/L" },
  { key: "electrical_conductivity", label: "Electrical Conductivity", unit: "µS/cm" },
  { key: "turbidity_ntu", label: "Turbidity", unit: "NTU" },
]

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

const formatValue = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "-"
  return Number(value).toFixed(2)
}

const percentChange = (current: number | null | undefined, prev: number | null | undefined) => {
  if (current == null || prev == null || prev === 0) return null
  return ((current - prev) / prev) * 100
}

const computeAverages = (rows: any[]) => {
  if (rows.length === 0) return null

  const maxTimestampSec = rows.reduce((max, row) => {
    const ts = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp)
    return Number.isFinite(ts) && ts > max ? ts : max
  }, 0)

  const nowMs = (maxTimestampSec || Date.now() / 1000) * 1000
  const dayMs = 24 * 60 * 60 * 1000
  const currentStart = nowMs - 30 * dayMs
  const previousStart = nowMs - 60 * dayMs

  const buckets: Record<
    MetricKey,
    { currentSum: number; currentCount: number; prevSum: number; prevCount: number }
  > = {
    ph: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
    temperature: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
    dissolved_oxygen: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
    electrical_conductivity: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
    turbidity_ntu: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
  }

  rows.forEach((row) => {
    const ts = typeof row.timestamp === "number" ? row.timestamp * 1000 : new Date(row.timestamp).getTime()
    if (!Number.isFinite(ts)) return
    const isCurrent = ts >= currentStart
    const isPrev = ts >= previousStart && ts < currentStart
    const toNumber = (v: unknown) => (typeof v === "number" ? v : Number(v));

    (Object.keys(buckets) as MetricKey[]).forEach((key) => {
      const val = toNumber(row[key])
      if (!Number.isFinite(val)) return
      if (isCurrent) { buckets[key].currentSum += val; buckets[key].currentCount += 1 }
      else if (isPrev) { buckets[key].prevSum += val; buckets[key].prevCount += 1 }
    })
  })

  const result: Record<MetricKey, { current: number | null; previous: number | null }> = {} as any
  ;(Object.keys(buckets) as MetricKey[]).forEach((key) => {
    const b = buckets[key]
    result[key] = {
      current: b.currentCount > 0 ? b.currentSum / b.currentCount : null,
      previous: b.prevCount > 0 ? b.prevSum / b.prevCount : null,
    }
  })
  return result
}

export function SectionCards() {
  const { data: session } = useSession()
  const { compareMode, compareRobotIds, robots } = useRobotStore()
  const [averages, setAverages] = React.useState<Record<
    MetricKey,
    { current: number | null; previous: number | null }
  > | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // In compare mode use selected compare robots; otherwise aggregate all account robots
  const robotIds = compareMode ? compareRobotIds : robots.map((r) => r.robot_id)

  React.useEffect(() => {
    if (robotIds.length === 0 || !session?.user?.accessToken) {
      setAverages(null)
      return
    }

    const controller = new AbortController()
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const responses = await Promise.all(
          robotIds.map((id) =>
            fetch(`${API_BASE}/robots/${id}/data?hours=1440`, {
              headers: { Authorization: `Bearer ${session.user.accessToken}` },
              signal: controller.signal,
            })
          )
        )
        const allRows: any[] = []
        for (const res of responses) {
          if (!res.ok) throw new Error(`Request failed with status ${res.status}`)
          const payload = await res.json()
          allRows.push(...(payload.rows ?? []))
        }
        setAverages(computeAverages(allRows))
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load summary")
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    fetchData()
    return () => controller.abort()
  }, [compareMode, compareRobotIds.join(","), robots.map((r) => r.robot_id).join(","), session?.user?.accessToken])

  const renderBadge = (current: number | null, prev: number | null) => {
    const change = percentChange(current, prev)
    if (change === null) return <Badge variant="outline">N/A</Badge>
    return (
      <Badge variant="outline">
        {change >= 0 ? <IconTrendingUp /> : <IconTrendingDown />}
        {change >= 0 ? "+" : ""}{change.toFixed(1)}%
      </Badge>
    )
  }

  const renderSubtitle = (current: number | null, prev: number | null) => {
    const change = percentChange(current, prev)
    if (change === null) return "No data for the comparison period"
    return change >= 0 ? "Up vs. last month" : "Down vs. last month"
  }

  if (robots.length === 0) {
    return (
      <div className="px-4 lg:px-6 text-sm text-muted-foreground">
        No robots claimed yet.
      </div>
    )
  }

  if (error) {
    return <div className="px-4 lg:px-6 text-sm text-destructive">Failed to load summary: {error}</div>
  }

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
      {loading && (
        <div className="col-span-full text-sm text-muted-foreground">Loading summary…</div>
      )}
      {METRICS.map((metric) => {
        const current = averages?.[metric.key]?.current ?? null
        const prev = averages?.[metric.key]?.previous ?? null
        return (
          <Card key={metric.key} className="@container/card">
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
                {formatValue(current)}{metric.unit ? ` ${metric.unit}` : ""}
              </CardTitle>
              <CardAction>{renderBadge(current, prev)}</CardAction>
            </CardHeader>
            <CardFooter className="flex-col items-start gap-1.5 text-sm">
              <div className="line-clamp-1 flex gap-2 font-medium">
                {renderSubtitle(current, prev)}{" "}
                {percentChange(current, prev) != null && (
                  percentChange(current, prev)! >= 0
                    ? <IconTrendingUp className="size-4" />
                    : <IconTrendingDown className="size-4" />
                )}
              </div>
              <div className="text-muted-foreground">
                Average over last 30 days vs. previous 30 days
              </div>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
