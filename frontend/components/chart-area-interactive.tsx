"use client"

import * as React from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts"
import { Loader2, AlertCircle } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { useTelemetryData } from "@/hooks/useTelemetryData"
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"

import aquasData from "./../mocks/sensor-data.json"

export const description = "An interactive area chart with tabs for different metrics"

const METRICS = {
  ph: {
    label: "pH",
    unit: "pH",
    color: "#8b5cf6",
    description: "Acidity/Alkalinity",
    min: 0,
    max: 14,
    normal: { min: 6.5, max: 8.5 },
  },
  temperature: {
    label: "Temperature",
    unit: "°C",
    color: "#f97316",
    description: "Water Temperature",
    min: 0,
    max: 40,
    normal: { min: 10, max: 30 },
  },
  dissolved_oxygen: {
    label: "Dissolved Oxygen",
    unit: "mg/L",
    color: "#06b6d4",
    description: "Oxygen Levels",
    min: 0,
    max: 20,
    normal: { min: 5, max: 15 },
  },
  electrical_conductivity: {
    label: "Electrical Conductivity",
    unit: "µS/cm",
    color: "#ec4899",
    description: "Salinity/Minerals",
    min: 0,
    max: 2000,
    normal: { min: 100, max: 1500 },
  },
  turbidity_ntu: {
    label: "Turbidity",
    unit: "NTU",
    color: "#14b8a6",
    description: "Water Clarity",
    min: 0,
    max: 100,
    normal: { min: 0, max: 50 },
  },
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload
    const formattedTime = new Date(data.timestamp * 1000).toLocaleString()
    return (
      <div className="rounded-lg border border-border bg-background p-2 shadow-md">
        <p className="text-xs text-muted-foreground">{formattedTime}</p>
        <p className="font-semibold text-foreground">{payload[0].value.toFixed(2)}</p>
      </div>
    )
  }
  return null
}

const MetricChart = ({ metric, data, loading, error }: any) => {
  const metricConfig = METRICS[metric as keyof typeof METRICS]
  
  if (!metricConfig) return null

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Latest Value</p>
          <p className="text-2xl font-bold">
            {data.length > 0 ? data[data.length - 1].value.toFixed(2) : "—"}
            <span className="text-xs text-muted-foreground ml-1">{metricConfig.unit}</span>
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Average</p>
          <p className="text-2xl font-bold">
            {data.length > 0 
              ? (data.reduce((sum: number, d: any) => sum + d.value, 0) / data.length).toFixed(2)
              : "—"}
            <span className="text-xs text-muted-foreground ml-1">{metricConfig.unit}</span>
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Min</p>
          <p className="text-2xl font-bold">
            {data.length > 0 
              ? Math.min(...data.map((d: any) => d.value)).toFixed(2)
              : "—"}
            <span className="text-xs text-muted-foreground ml-1">{metricConfig.unit}</span>
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Max</p>
          <p className="text-2xl font-bold">
            {data.length > 0 
              ? Math.max(...data.map((d: any) => d.value)).toFixed(2)
              : "—"}
            <span className="text-xs text-muted-foreground ml-1">{metricConfig.unit}</span>
          </p>
        </div>
      </div>

      <div className="h-[300px] w-full rounded-lg border border-border bg-card p-4">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-destructive" />
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">No data available</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metricConfig.color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={metricConfig.color} stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => {
                  const date = new Date(value * 1000)
                  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                }}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <YAxis
                label={{
                  value: metricConfig.unit,
                  angle: -90,
                  position: "insideLeft",
                  style: { fill: "var(--muted-foreground)", fontSize: 12 },
                }}
                tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
              />
              <RechartsTooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                fill={`url(#gradient-${metric})`}
                stroke={metricConfig.color}
                strokeWidth={2}
                isAnimationActive={true}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

export function ChartAreaInteractive() {
  const isMobile = useIsMobile()
  const [selectedMetric, setSelectedMetric] = React.useState("ph")
  // default to 30 days so inserted mock data from Oct/2025 is included
  const [timeRange, setTimeRange] = React.useState("30d")

  const hoursMap: Record<string, number> = {
    "24h": 24,
    "7d": 168,
    "30d": 720,
  }

  const { data: phData, loading: phLoading, error: phError } = useTelemetryData({
    metric: "ph",
    hours: hoursMap[timeRange],
  })

  const { data: tempData, loading: tempLoading, error: tempError } = useTelemetryData({
    metric: "temperature",
    hours: hoursMap[timeRange],
  })

  const { data: doData, loading: doLoading, error: doError } = useTelemetryData({
    metric: "dissolved_oxygen",
    hours: hoursMap[timeRange],
  })

  const { data: ecData, loading: ecLoading, error: ecError } = useTelemetryData({
    metric: "electrical_conductivity",
    hours: hoursMap[timeRange],
  })

  const { data: turbidityData, loading: turbidityLoading, error: turbidityError } =
    useTelemetryData({
      metric: "turbidity_ntu",
      hours: hoursMap[timeRange],
    })

  const metricDataMap: Record<string, any> = {
    ph: { data: phData, loading: phLoading, error: phError },
    temperature: { data: tempData, loading: tempLoading, error: tempError },
    dissolved_oxygen: { data: doData, loading: doLoading, error: doError },
    electrical_conductivity: { data: ecData, loading: ecLoading, error: ecError },
    turbidity_ntu: { data: turbidityData, loading: turbidityLoading, error: turbidityError },
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl">Water Quality Metrics</CardTitle>
              <CardDescription>Real-time sensor data visualization</CardDescription>
            </div>
            <Select value={timeRange} onValueChange={setTimeRange}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Select time range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="24h">Last 24 hours</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Tabs for metric selection */}
          <Tabs
            value={selectedMetric}
            onValueChange={setSelectedMetric}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-5 gap-1 h-auto p-1 bg-muted rounded-lg">
              {Object.entries(METRICS).map(([key, metric]) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="rounded px-2 py-2 text-xs sm:text-sm flex flex-col items-center justify-center gap-1"
                >
                  <span>{metric.label}</span>
                  <span className="text-xs text-muted-foreground">{metric.unit}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={selectedMetric} onValueChange={setSelectedMetric} className="w-full">
          {Object.entries(METRICS).map(([key, metric]) => {
            const { data, loading, error } = metricDataMap[key]
            return (
              <TabsContent key={key} value={key} className="space-y-4">
                <MetricChart
                  metric={key}
                  data={data}
                  loading={loading}
                  error={error}
                />
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}
