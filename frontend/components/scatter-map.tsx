"use client";

import * as React from "react";
import Map, { Source, Layer, Popup } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

type SensorRow = {
  timestamp: number;
  longitude: number;
  latitude: number;
  ph: number;

  temperature: number;
  dissolved_oxygen: number;
  electrical_conductivity: number;
  turbidity_ntu: number;
};

type MetricKey =
  | "ph"
  | "temperature"
  | "dissolved_oxygen"
  | "electrical_conductivity"
  | "turbidity_ntu";

const METRICS: { key: MetricKey; label: string }[] = [
  { key: "ph", label: "pH" },
  { key: "temperature", label: "Temperature (C)" },
  { key: "dissolved_oxygen", label: "Dissolved Oxygen (mg/L)" },
  { key: "electrical_conductivity", label: "EC (µS/cm)" },
  { key: "turbidity_ntu", label: "Turbidity (NTU)" },
];

export function ScatterMap() {
  //three state variables for data, loading, and error
  const [data, setData] = React.useState<SensorRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/views/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ view: "all", params: { limit: 5000 } }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const payload = await res.json();
        console.log(payload); //temp
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Failed to load map data",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, []);
  return (
    <div style={{ width: "100%", height: "400px" }}>
      <Map
        mapLib={maplibregl}
        initialViewState={{ longitude: -73.96, latitude: 40.81, zoom: 13 }}
        style={{ width: "100%", height: "100%" }}
        mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
      ></Map>
    </div>
  );
}
