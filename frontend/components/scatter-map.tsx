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
  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{ longitude: -73.96, latitude: 40.81, zoom: 13 }}
      style={{ width: "100%", height: "100%" }}
      mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
    ></Map>
  );
}
