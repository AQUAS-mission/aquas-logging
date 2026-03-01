"use client"

import * as React from "react"
import Map, { Source, Layer } from "react-map-gl/maplibre"
import type { MapRef } from "react-map-gl/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"
import { useSession } from "next-auth/react"
import { COMPARE_COLORS } from "@/stores/robot-store"
import type { VizProps } from "@/components/sensorChartVisualization"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

type MetricKey = "ph" | "temperature" | "dissolved_oxygen" | "electrical_conductivity" | "turbidity_ntu"

const METRICS: { key: MetricKey; label: string; min: number; max: number }[] = [
  { key: "ph",                     label: "pH",                     min: 0,    max: 14   },
  { key: "temperature",            label: "Temperature (°C)",       min: -5,   max: 80   },
  { key: "dissolved_oxygen",       label: "Dissolved Oxygen (mg/L)", min: 0,   max: 20   },
  { key: "electrical_conductivity",label: "EC (µS/cm)",             min: 0,    max: 2000 },
  { key: "turbidity_ntu",          label: "Turbidity (NTU)",        min: 0,    max: 100  },
]

export function HeatmapViz({ compareMode, compareRobotIds, robots, selectedRobotId, hours = 90 * 24 }: VizProps) {
  const { data: session } = useSession()
  const mapRef = React.useRef<MapRef>(null)
  const [geojson, setGeojson] = React.useState<GeoJSON.FeatureCollection>({ type: "FeatureCollection", features: [] })
  const [metric, setMetric] = React.useState<MetricKey>("turbidity_ntu")

  const robotIds = compareMode ? compareRobotIds : selectedRobotId ? [selectedRobotId] : []

  const initialViewState = React.useMemo(() => {
    const active = robots.filter(
      (r) => robotIds.includes(r.robot_id) && r.last_latitude != null && r.last_longitude != null
    )
    if (active.length === 0) return { longitude: -100, latitude: 40, zoom: 3 }
    const avgLng = active.reduce((s, r) => s + r.last_longitude!, 0) / active.length
    const avgLat = active.reduce((s, r) => s + r.last_latitude!, 0) / active.length
    return { longitude: avgLng, latitude: avgLat, zoom: 12 }
  }, [robotIds.join(","), robots])

  React.useEffect(() => {
    if (!session?.user?.accessToken || robotIds.length === 0) {
      setGeojson({ type: "FeatureCollection", features: [] })
      return
    }

    const controller = new AbortController()
    const metricMeta = METRICS.find((m) => m.key === metric)!

    const fetchAll = async () => {
      const results = await Promise.all(
        robotIds.map(async (id, i) => {
          const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
          try {
            const res = await fetch(`${API_BASE}/robots/${id}/data?hours=${hours}`, {
              headers: { Authorization: `Bearer ${session.user.accessToken}` },
              signal: controller.signal,
            })
            if (!res.ok) return []
            const payload = await res.json()
            return (payload.rows ?? [])
              .filter((r: Record<string, unknown>) => r.latitude != null && r.longitude != null && r[metric] != null)
              .map((r: Record<string, unknown>) => {
                const raw = Number(r[metric])
                const weight = Math.max(0, Math.min(1, (raw - metricMeta.min) / (metricMeta.max - metricMeta.min)))
                return {
                  type: "Feature" as const,
                  geometry: { type: "Point" as const, coordinates: [Number(r.longitude), Number(r.latitude)] },
                  properties: { weight, color, robotId: id },
                }
              })
          } catch { return [] }
        })
      )

      if (controller.signal.aborted) return
      const features = results.flat() as GeoJSON.Feature[]
      setGeojson({ type: "FeatureCollection", features })

      if (features.length > 0 && mapRef.current) {
        const coords = features.map((f) => (f.geometry as GeoJSON.Point).coordinates)
        const lngs = coords.map((c) => c[0])
        const lats = coords.map((c) => c[1])
        mapRef.current.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, maxZoom: 16, duration: 800 }
        )
      }
    }

    fetchAll()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, robotIds.join(","), session?.user?.accessToken, hours, metric])

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Metric selector overlay */}
      <div style={{
        position: "absolute", top: 12, right: 12, zIndex: 10,
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) - 4px)", padding: "6px 10px",
        display: "flex", alignItems: "center", gap: 8,
        fontSize: 12, color: "var(--card-foreground)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}>
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Metric</span>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          style={{
            background: "var(--input)", color: "var(--card-foreground)",
            border: "1px solid var(--border)", borderRadius: 6,
            padding: "2px 6px", fontSize: 12, cursor: "pointer",
          }}
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: 32, right: 12, zIndex: 10,
        background: "var(--card)", border: "1px solid var(--border)",
        borderRadius: "calc(var(--radius) - 4px)", padding: "8px 12px",
        fontSize: 11, color: "var(--card-foreground)",
        boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
      }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>
          {METRICS.find((m) => m.key === metric)?.label}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "var(--muted-foreground)" }}>Low</span>
          <div style={{
            width: 80, height: 10, borderRadius: 4,
            background: "linear-gradient(to right, #0000ff44, #00ff00, #ffff00, #ff0000)",
          }} />
          <span style={{ color: "var(--muted-foreground)" }}>High</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted-foreground)", marginTop: 2 }}>
          <span>{METRICS.find((m) => m.key === metric)?.min}</span>
          <span>{METRICS.find((m) => m.key === metric)?.max}</span>
        </div>
      </div>

      <Map
        key={robotIds.join(",")}
        ref={mapRef}
        initialViewState={initialViewState}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      >
        <Source id="heatmap" type="geojson" data={geojson}>
          {/* Heatmap layer — fades out at high zoom */}
          <Layer
            id="heatmap-layer"
            type="heatmap"
            paint={{
              "heatmap-weight": ["get", "weight"],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 16, 3],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 12, 16, 40],
              "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 10, 1, 14, 0.4],
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0,    "rgba(0,0,255,0)",
                0.2,  "#0000ff",
                0.4,  "#00ff88",
                0.6,  "#ffff00",
                0.8,  "#ff8800",
                1,    "#ff0000",
              ],
            }}
          />
          {/* Circle layer appears at high zoom so individual points are visible */}
          <Layer
            id="heatmap-points"
            type="circle"
            minzoom={12}
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 12, 3, 16, 8],
              "circle-color": [
                "interpolate", ["linear"], ["get", "weight"],
                0,   "#0000ff",
                0.4, "#00ff88",
                0.6, "#ffff00",
                0.8, "#ff8800",
                1,   "#ff0000",
              ],
              "circle-opacity": ["interpolate", ["linear"], ["zoom"], 12, 0, 14, 0.8],
              "circle-stroke-width": 1,
              "circle-stroke-color": "#fff",
              "circle-stroke-opacity": 0.5,
            }}
          />
        </Source>
      </Map>
    </div>
  )
}
