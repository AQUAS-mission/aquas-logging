"use client"

import * as React from "react"

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

type MetricAverages = Record<MetricKey, { current: number | null; previous: number | null }>

const metricKeys = METRICS.map((metric) => metric.key) as MetricKey[]

const toNumeric = (value: unknown) => {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const buildEmptyBuckets = () => ({
  ph: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
  temperature: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
  dissolved_oxygen: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
  electrical_conductivity: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
  turbidity_ntu: { currentSum: 0, currentCount: 0, prevSum: 0, prevCount: 0 },
})

const bucketsToAverages = (
  buckets: ReturnType<typeof buildEmptyBuckets>
): MetricAverages => {
  const result = {} as MetricAverages
  metricKeys.forEach((key) => {
    const bucket = buckets[key]
    const current = bucket.currentCount > 0 ? bucket.currentSum / bucket.currentCount : null
    const previous = bucket.prevCount > 0 ? bucket.prevSum / bucket.prevCount : null
    result[key] = { current, previous }
  })
  return result
}

const hasAnyCurrentValues = (averages: MetricAverages) =>
  metricKeys.some((key) => averages[key].current !== null)

const computeHalfSplitAverages = (rows: any[]): MetricAverages => {
  const normalized = rows
    .map((row) => ({
      ...row,
      _ts: toNumeric(row.timestamp),
    }))
    .filter((row) => row._ts !== null)
    .sort((a, b) => (b._ts as number) - (a._ts as number))

  const midpoint = Math.floor(normalized.length / 2)
  const currentRows = normalized.slice(0, midpoint || normalized.length)
  const previousRows = normalized.slice(midpoint || normalized.length)
  const buckets = buildEmptyBuckets()

  currentRows.forEach((row) => {
    metricKeys.forEach((key) => {
      const value = toNumeric(row[key])
      if (value === null) return
      buckets[key].currentSum += value
      buckets[key].currentCount += 1
    })
  })

  previousRows.forEach((row) => {
    metricKeys.forEach((key) => {
      const value = toNumeric(row[key])
      if (value === null) return
      buckets[key].prevSum += value
      buckets[key].prevCount += 1
    })
  })

  return bucketsToAverages(buckets)
}

const formatValue = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "-"
  return Number(value).toFixed(2)
}

const percentChange = (current: number | null | undefined, prev: number | null | undefined) => {
  if (
    current === null ||
    current === undefined ||
    prev === null ||
    prev === undefined ||
    prev === 0
  ) {
    return null
  }
  return ((current - prev) / prev) * 100
}

export function SectionCards() {
  const [averages, setAverages] = React.useState<Record<
    MetricKey,
    { current: number | null; previous: number | null }
  > | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`${API_BASE}/views/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ view: "all", params: { limit: 10000 } }),
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`)
        }
        const payload = (await response.json()) as { rows?: any[] }
        const rows = (payload.rows ?? []) as any[]
        if (rows.length === 0) {
          setAverages(null)
          return
        }

        // Use the latest timestamp in the data as the reference point.
        const maxTimestampSec = rows.reduce((max, row) => {
          const ts = typeof row.timestamp === "number" ? row.timestamp : Number(row.timestamp)
          return Number.isFinite(ts) && ts > max ? ts : max
        }, 0)

        const nowMs = (maxTimestampSec || Date.now() / 1000) * 1000
        const dayMs = 24 * 60 * 60 * 1000
        const currentStart = nowMs - 30 * dayMs
        const previousStart = nowMs - 60 * dayMs

        const buckets = buildEmptyBuckets()

        rows.forEach((row) => {
          const ts = typeof row.timestamp === "number" ? row.timestamp * 1000 : Number(row.timestamp) * 1000
          if (!Number.isFinite(ts)) return
          const isCurrent = ts >= currentStart
          const isPrev = ts >= previousStart && ts < currentStart
          metricKeys.forEach((key) => {
            const val = toNumeric(row[key])
            if (val === null) return
            if (isCurrent) {
              buckets[key].currentSum += val
              buckets[key].currentCount += 1
            } else if (isPrev) {
              buckets[key].prevSum += val
              buckets[key].prevCount += 1
            }
          })
        })

        let result = bucketsToAverages(buckets)
        if (!hasAnyCurrentValues(result)) {
          result = computeHalfSplitAverages(rows)
        }

        setAverages(result)
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to load summary")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchData()
    return () => controller.abort()
  }, [])

  const renderBadge = (current: number | null, prev: number | null) => {
    const change = percentChange(current, prev)
    if (change === null) {
      return <Badge variant="outline">N/A</Badge>
    }
    const isUp = change >= 0
    return (
      <Badge variant="outline">
        {isUp ? <IconTrendingUp /> : <IconTrendingDown />}
        {change >= 0 ? "+" : ""}
        {change.toFixed(1)}%
      </Badge>
    )
  }

  const renderSubtitle = (current: number | null, prev: number | null) => {
    const change = percentChange(current, prev)
    if (change === null) return "No data for the comparison period"
    return change >= 0 ? "Up vs. last month" : "Down vs. last month"
  }

  const renderCards = () =>
    METRICS.map((metric) => {
      const current = averages?.[metric.key]?.current ?? null
      const prev = averages?.[metric.key]?.previous ?? null
      return (
        <Card key={metric.key} className="@container/card">
          <CardHeader>
            <CardDescription>{metric.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {formatValue(current)}
              {metric.unit ? ` ${metric.unit}` : ""}
            </CardTitle>
            <CardAction>{renderBadge(current, prev)}</CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              {renderSubtitle(current, prev)}{" "}
              {percentChange(current, prev) === null ? null : percentChange(current, prev)! >= 0 ? (
                <IconTrendingUp className="size-4" />
              ) : (
                <IconTrendingDown className="size-4" />
              )}
            </div>
            <div className="text-muted-foreground">
              Average over last 30 days vs. previous 30 days
            </div>
          </CardFooter>
        </Card>
      )
    })

  if (error) {
    return (
      <div className="px-4 lg:px-6 text-sm text-red-600">
        Failed to load summary: {error}
      </div>
    )
  }

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-5">
      {loading && (
        <div className="col-span-full text-sm text-muted-foreground">Loading summary…</div>
      )}
      {renderCards()}
    </div>
  )
}
