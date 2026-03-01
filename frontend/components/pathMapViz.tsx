"use client"

import * as React from "react"
import Map, { Source, Layer, Popup } from "react-map-gl/maplibre"
import type { MapRef } from "react-map-gl/maplibre"
import "maplibre-gl/dist/maplibre-gl.css"
import { useSession } from "next-auth/react"
import { COMPARE_COLORS } from "@/stores/robot-store"
import type { VizProps } from "@/components/sensorChartVisualization"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"
const MS_PER_NODE = 1000 // ms to traverse one segment

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
  isStart: boolean
  isEnd: boolean
}

type PopupInfo = {
  longitude: number
  latitude: number
  row: MapRow
}

type RobotTrack = {
  robotId: string
  robotName: string
  color: string
  rows: MapRow[]
}

function interpolatePosition(
  coords: [number, number][],
  t: number
): [number, number] {
  if (coords.length === 0) return [0, 0]
  if (coords.length === 1) return coords[0]
  const totalSegs = coords.length - 1
  const pos = t * totalSegs
  const seg = Math.min(Math.floor(pos), totalSegs - 1)
  const frac = pos - seg
  const [lng1, lat1] = coords[seg]
  const [lng2, lat2] = coords[seg + 1]
  return [lng1 + (lng2 - lng1) * frac, lat1 + (lat2 - lat1) * frac]
}

export function PathMapViz({ compareMode, compareRobotIds, robots, selectedRobotId, hours = 90 * 24 }: VizProps) {
  const { data: session } = useSession()
  const mapRef = React.useRef<MapRef>(null)
  const animFrameRef = React.useRef<number | null>(null)
  const [tracks, setTracks] = React.useState<RobotTrack[]>([])
  const [popupInfo, setPopupInfo] = React.useState<PopupInfo | null>(null)
  const [mapLoaded, setMapLoaded] = React.useState(false)

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

  // ─── Fetch tracks ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!session?.user?.accessToken || robotIds.length === 0) { setTracks([]); return }

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
            if (!res.ok) return null
            const payload = await res.json()
            const sorted = (payload.rows ?? [])
              .filter((r: Record<string, unknown>) => r.latitude != null && r.longitude != null)
              .reverse() // backend returns DESC; reverse for chronological order
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
                isStart: false,
                isEnd: false,
              })) as MapRow[]

            if (sorted.length > 0) {
              sorted[0].isStart = true
              sorted[sorted.length - 1].isEnd = true
            }

            return { robotId: id, robotName: robot?.name ?? id, color, rows: sorted } as RobotTrack
          } catch { return null }
        })
      )

      if (controller.signal.aborted) return
      const valid = results.filter(Boolean) as RobotTrack[]
      setTracks(valid)

      const allRows = valid.flatMap((t) => t.rows)
      if (allRows.length > 0 && mapRef.current) {
        const lngs = allRows.map((r) => r.longitude)
        const lats = allRows.map((r) => r.latitude)
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

  // ─── Animated dot ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!mapLoaded || !mapRef.current || tracks.length === 0) return

    const map = mapRef.current.getMap()
    if (!map) return

    const ANIM_SOURCE = "anim-dot"
    const ANIM_OUTER  = "anim-dot-outer"
    const ANIM_INNER  = "anim-dot-inner"

    // Clean up any previous instance
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    if (map.getLayer(ANIM_INNER))  map.removeLayer(ANIM_INNER)
    if (map.getLayer(ANIM_OUTER))  map.removeLayer(ANIM_OUTER)
    if (map.getSource(ANIM_SOURCE)) map.removeSource(ANIM_SOURCE)

    map.addSource(ANIM_SOURCE, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    })
    // Add layers, then move to top after react-map-gl has rendered its declarative layers
    map.addLayer({
      id: ANIM_OUTER,
      type: "circle",
      source: ANIM_SOURCE,
      paint: {
        "circle-radius": 14,
        "circle-color": ["get", "color"],
        "circle-opacity": 0.25,
      },
    })
    map.addLayer({
      id: ANIM_INNER,
      type: "circle",
      source: ANIM_SOURCE,
      paint: {
        "circle-radius": 7,
        "circle-color": ["get", "color"],
        "circle-opacity": 1,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    })
    // moveLayer without beforeId pushes to the very top of the stack
    setTimeout(() => {
      try {
        if (map.getLayer(ANIM_OUTER)) map.moveLayer(ANIM_OUTER)
        if (map.getLayer(ANIM_INNER)) map.moveLayer(ANIM_INNER)
      } catch { /* ignore */ }
    }, 0)

    const tracksData = tracks
      .filter((t) => t.rows.length >= 2)
      .map((t) => ({
        color: t.color,
        coords: t.rows.map((r) => [r.longitude, r.latitude] as [number, number]),
        duration: (t.rows.length - 1) * MS_PER_NODE,
      }))

    const start = performance.now()

    const animate = () => {
      const elapsed = performance.now() - start
      const features: GeoJSON.Feature[] = tracksData.map((track) => {
        const t = (elapsed % track.duration) / track.duration
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: interpolatePosition(track.coords, t) },
          properties: { color: track.color },
        }
      })
      try {
        const src = map.getSource(ANIM_SOURCE) as any
        src?.setData({ type: "FeatureCollection", features })
      } catch { /* map destroyed between frames */ }
      animFrameRef.current = requestAnimationFrame(animate)
    }

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      if (!map.getLayer) return
      try {
        if (map.getLayer(ANIM_INNER))   map.removeLayer(ANIM_INNER)
        if (map.getLayer(ANIM_OUTER))   map.removeLayer(ANIM_OUTER)
        if (map.getSource(ANIM_SOURCE)) map.removeSource(ANIM_SOURCE)
      } catch { /* map already destroyed */ }
    }
  }, [tracks, mapLoaded])

  // ─── GeoJSON for static layers ───────────────────────────────────────────
  const linesGeojson: GeoJSON.FeatureCollection = React.useMemo(() => ({
    type: "FeatureCollection",
    features: tracks
      .filter((t) => t.rows.length >= 2)
      .map((t) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: t.rows.map((r) => [r.longitude, r.latitude]) },
        properties: { color: t.color },
      })),
  }), [tracks])

  const pointsGeojson: GeoJSON.FeatureCollection = React.useMemo(() => ({
    type: "FeatureCollection",
    features: tracks.flatMap((t) =>
      t.rows.map((r, i) => ({
        type: "Feature" as const,
        id: `${t.robotId}-${i}`,
        geometry: { type: "Point" as const, coordinates: [r.longitude, r.latitude] },
        properties: {
          color: r.color,
          robotId: r.robotId,
          robotName: r.robotName,
          timestamp: r.timestamp,
          ph: r.ph,
          temperature: r.temperature,
          dissolved_oxygen: r.dissolved_oxygen,
          electrical_conductivity: r.electrical_conductivity,
          turbidity_ntu: r.turbidity_ntu,
          isStart: r.isStart,
          isEnd: r.isEnd,
        },
      }))
    ),
  }), [tracks])

  const handleMouseMove = React.useCallback(
    (e: { features?: Array<{ geometry: { coordinates: number[] }; properties: Record<string, unknown> }> }) => {
      if (!e.features || e.features.length === 0) { setPopupInfo(null); return }
      const f = e.features[0]
      const [longitude, latitude] = f.geometry.coordinates
      setPopupInfo({ longitude, latitude, row: { ...(f.properties as MapRow), longitude, latitude } })
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
      interactiveLayerIds={["path-waypoints"]}
      onLoad={() => setMapLoaded(true)}
      onMouseMove={handleMouseMove as never}
      onMouseLeave={() => setPopupInfo(null)}
    >
      {/* Path lines */}
      <Source id="path-lines" type="geojson" data={linesGeojson}>
        <Layer
          id="path-line"
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={{
            "line-color": ["get", "color"],
            "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1.5, 12, 3],
            "line-opacity": 0.9,
          }}
        />
      </Source>

      {/* Waypoints + start/end markers */}
      <Source id="path-points" type="geojson" data={pointsGeojson}>
        <Layer
          id="path-waypoints"
          type="circle"
          filter={["all", ["!=", ["get", "isStart"], true], ["!=", ["get", "isEnd"], true]]}
          paint={{
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 2, 12, 4],
            "circle-color": ["get", "color"],
            "circle-opacity": 0.6,
          }}
        />
        {/* Start — hollow ring */}
        <Layer
          id="path-start"
          type="circle"
          filter={["==", ["get", "isStart"], true]}
          paint={{
            "circle-radius": 7,
            "circle-color": "#ffffff",
            "circle-stroke-width": 3,
            "circle-stroke-color": ["get", "color"],
          }}
        />
        {/* End — solid */}
        <Layer
          id="path-end"
          type="circle"
          filter={["==", ["get", "isEnd"], true]}
          paint={{
            "circle-radius": 7,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
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
            <div style={{ fontWeight: 700, marginBottom: 2 }}>
              {popupInfo.row.robotName}
              {popupInfo.row.isStart && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--muted-foreground)" }}>START</span>}
              {popupInfo.row.isEnd && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--muted-foreground)" }}>LATEST</span>}
            </div>
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
