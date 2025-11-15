import { useEffect, useState } from "react"

export interface TelemetryDataPoint {
  timestamp: number
  value: number
  device_id: string
}

export interface UseTelemetryDataOptions {
  metric: string
  device_id?: string
  limit?: number
  hours?: number
  enabled?: boolean
}

export function useTelemetryData(options: UseTelemetryDataOptions) {
  const {
    metric,
    device_id,
    limit = 500,
    // default to 30 days (720 hours) so dashboard shows recently-imported mock data
    hours = 720,
    enabled = true,
  } = options

  const [data, setData] = useState<TelemetryDataPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
        const params = new URLSearchParams({
          metric,
          limit: limit.toString(),
          hours: hours.toString(),
        })

        if (device_id) {
          params.append("device_id", device_id)
        }

        const response = await fetch(`${apiUrl}/query/metric?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem("auth_token") || ""}`,
          },
        })

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error("Unauthorized. Please login.")
          }
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()
        setData(result.rows || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data")
        setData([])
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [metric, device_id, limit, hours, enabled])

  return { data, loading, error }
}
