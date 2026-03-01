"use client"

import * as React from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NavUser } from "./nav-user"
import { ShipIcon, RefreshCw } from "lucide-react"
import { useSession } from "next-auth/react"
import { useRobotStore } from "@/stores/robot-store"

const POLL_INTERVAL = 30_000 // 30 seconds

function useSecondsAgo(ts: number | null) {
  const [seconds, setSeconds] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (ts === null) { setSeconds(null); return }
    const update = () => setSeconds(Math.floor((Date.now() - ts) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [ts])
  return seconds
}

export function SiteHeader() {
  const { data: session } = useSession()
  const { autoRefresh, lastUpdated, setAutoRefresh, tick } = useRobotStore()
  const secondsAgo = useSecondsAgo(lastUpdated)
  const [refreshing, setRefreshing] = React.useState(false)

  // Polling interval
  React.useEffect(() => {
    if (!autoRefresh) return
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const id = setInterval(() => {
      tick()
      setRefreshing(true)
      timeoutId = setTimeout(() => setRefreshing(false), 2000)
    }, POLL_INTERVAL)
    return () => {
      clearInterval(id)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [autoRefresh, tick])

  // Set initial lastUpdated on first mount
  React.useEffect(() => {
    tick()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleManualRefresh = () => {
    tick()
    setRefreshing(true)
    setTimeout(() => setRefreshing(false), 2000)
  }

  const lastUpdatedLabel = secondsAgo === null
    ? null
    : secondsAgo < 5
      ? "Just now"
      : secondsAgo < 60
        ? `${secondsAgo}s ago`
        : `${Math.floor(secondsAgo / 60)}m ago`

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <ShipIcon className="!size-5" />
        <span className="text-base font-semibold">AQUAS</span>

        <div className="ml-auto flex items-center gap-3">
          {/* Last updated + manual refresh */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {refreshing && (
              <RefreshCw className="size-3 animate-spin text-primary" />
            )}
            {lastUpdatedLabel && !refreshing && (
              <span>{lastUpdatedLabel}</span>
            )}
            <button
              onClick={handleManualRefresh}
              title="Refresh now"
              className="rounded p-1 hover:bg-accent transition-colors"
            >
              <RefreshCw className="size-3.5" />
            </button>
          </div>

          {/* Auto-refresh toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            title={autoRefresh ? "Auto-refresh on (click to pause)" : "Auto-refresh off (click to enable)"}
            className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
              autoRefresh
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className={`size-1.5 rounded-full ${autoRefresh ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
            {autoRefresh ? "Live" : "Paused"}
          </button>

          <NavUser user={{
            name: session?.user?.name ?? "User",
            email: session?.user?.email ?? "",
            avatar: "",
          }} />
        </div>
      </div>
    </header>
  )
}
