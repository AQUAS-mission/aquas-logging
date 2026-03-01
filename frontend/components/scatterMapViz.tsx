"use client"

import * as React from "react"
import Map, { Source, Layer, Popup } from "react-map-gl/maplibre"
import type { MapRef } from "react-map-gl/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"
import { useSession } from "next-auth/react"
import { COMPARE_COLORS } from "@/stores/robot-store"
import type { VizProps } from "@/components/sensorChartVisualization"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

type MapRow = {
  timestamp: string
  longitude: number
  latitude: number
  ph: number | null
  temperature: number | null
  dissolved_oxygen: number | null
  electrical_conductivity: number | null
  turbidity_ntu: number | null
  robotId: string
  robotName: string
  color: string
}

type PopupInfo = {
  longitude: number
  latitude: number
  row: MapRow
}

export function ScatterMapViz({ compareMode, compareRobotIds, robots, selectedRobotId, hours = 90 * 24 }: VizProps) {
  const { data: session } = useSession()
  const mapRef = React.useRef<MapRef>(null)
  const [rows, setRows] = React.useState<MapRow[]>([])
  const [popupInfo, setPopupInfo] = React.useState<PopupInfo | null>(null)

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
      setRows([])
      return
    }

    const controller = new AbortController()

    const fetchAll = async () => {
      const results = await Promise.all(
        robotIds.map(async (id, i) => {
          const robot = robots.find((r) => r.robot_id === id)
          const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
          try {
            const res = await fetch(`${API_BASE}/robots/${id}/data?hours=${hours}`, {
              headers: { Authorization: `Bearer ${session.user.accessToken}` },
              signal: controller.signal,
            })
            if (!res.ok) return []
            const payload = await res.json()
            return (payload.rows ?? [])
              .filter((r: Record<string, unknown>) => r.latitude != null && r.longitude != null)
              .map((r: Record<string, unknown>) => ({
                timestamp: String(r.timestamp),
                longitude: Number(r.longitude),
                latitude: Number(r.latitude),
                ph: r.ph != null ? Number(r.ph) : null,
                temperature: r.temperature != null ? Number(r.temperature) : null,
                dissolved_oxygen: r.dissolved_oxygen != null ? Number(r.dissolved_oxygen) : null,
                electrical_conductivity: r.electrical_conductivity != null ? Number(r.electrical_conductivity) : null,
                turbidity_ntu: r.turbidity_ntu != null ? Number(r.turbidity_ntu) : null,
                robotId: id,
                robotName: robot?.name ?? id,
                color,
              })) as MapRow[]
          } catch {
            return []
          }
        })
      )

      if (controller.signal.aborted) return
      const flat = results.flat()
      setRows(flat)

      if (flat.length > 0 && mapRef.current) {
        const lngs = flat.map((r) => r.longitude)
        const lats = flat.map((r) => r.latitude)
        mapRef.current.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, maxZoom: 16, duration: 800 }
        )
      }
    }

    fetchAll()
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareMode, robotIds.join(","), session?.user?.accessToken, hours])

  const geojson: GeoJSON.FeatureCollection = React.useMemo(
    () => ({
      type: "FeatureCollection",
      features: rows.map((r, i) => ({
        type: "Feature",
        id: i,
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: {
          robotId: r.robotId,
          robotName: r.robotName,
          color: r.color,
          timestamp: r.timestamp,
          ph: r.ph,
          temperature: r.temperature,
          dissolved_oxygen: r.dissolved_oxygen,
          electrical_conductivity: r.electrical_conductivity,
          turbidity_ntu: r.turbidity_ntu,
        },
      })),
    }),
    [rows]
  )

  const handleMouseMove = React.useCallback(
    (e: { features?: Array<{ geometry: { coordinates: number[] }; properties: Record<string, unknown> }> }) => {
      if (!e.features || e.features.length === 0) {
        setPopupInfo(null)
        return
      }
      const f = e.features[0]
      const [longitude, latitude] = f.geometry.coordinates
      setPopupInfo({
        longitude,
        latitude,
        row: { ...(f.properties as MapRow), longitude, latitude },
      })
    },
    []
  )

  const fmt = (v: number | null, decimals = 2) => (v != null ? v.toFixed(decimals) : "—")

  return (
    <Map
      key={robotIds.join(",")}
      ref={mapRef}
      initialViewState={initialViewState}
      style={{ width: "100%", height: "100%" }}
      mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      interactiveLayerIds={["scatter-points"]}
      onMouseMove={handleMouseMove as never}
      onMouseLeave={() => setPopupInfo(null)}
    >
      <Source id="scatter" type="geojson" data={geojson}>
        <Layer
          id="scatter-points"
          type="circle"
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4, 12, 8],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.85,
            "circle-stroke-width": 1,
            "circle-stroke-color": "#fff",
          }}
        />
      </Source>

      {popupInfo && (
        <Popup
          longitude={popupInfo.longitude}
          latitude={popupInfo.latitude}
          closeButton={false}
          anchor="bottom"
          offset={12}
          className="aquas-popup"
        >
          <div>
            <div style={{ fontWeight: 700, marginBottom: 2 }}>{popupInfo.row.robotName}</div>
            <div style={{ color: "var(--muted-foreground)", marginBottom: 6 }}>
              {new Date(popupInfo.row.timestamp).toLocaleString()}
            </div>
            <div>pH: <strong>{fmt(popupInfo.row.ph)}</strong></div>
            <div>Temp: <strong>{fmt(popupInfo.row.temperature)} °C</strong></div>
            <div>DO: <strong>{fmt(popupInfo.row.dissolved_oxygen)} mg/L</strong></div>
            <div>EC: <strong>{fmt(popupInfo.row.electrical_conductivity)} µS/cm</strong></div>
            <div>Turbidity: <strong>{fmt(popupInfo.row.turbidity_ntu)} NTU</strong></div>
          </div>
        </Popup>
      )}
    </Map>
  )
}
