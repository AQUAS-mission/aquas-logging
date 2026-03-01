"use client"

import * as React from "react"
import { IconRobot } from "@tabler/icons-react"
import { useSession } from "next-auth/react"
import { RobotClaim } from "@/components/robotClaim"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ShipIcon } from "lucide-react"
import { useRobotStore, COMPARE_COLORS } from "@/stores/robot-store"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"


export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: session } = useSession()
  const [claimOpen, setClaimOpen] = React.useState(false)
  const {
    robots, setRobots,
    selectedRobotId, setSelectedRobotId,
    compareMode, setCompareMode,
    compareRobotIds, toggleCompareRobot,
  } = useRobotStore()
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    if (!session?.user?.accessToken) return
    const controller = new AbortController()

    const fetchRobots = async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API_BASE}/robots/me`, {
          headers: { Authorization: `Bearer ${session.user.accessToken}` },
          signal: controller.signal,
        })
        if (!res.ok) return
        const data = await res.json()
        setRobots(data)
      } catch {
        // aborted or failed silently
      } finally {
        setLoading(false)
      }
    }

    fetchRobots()
    return () => controller.abort()
  }, [session?.user?.accessToken])

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className="data-[slot=sidebar-menu-button]:!p-1.5">
              <a href="#">
                <ShipIcon className="!size-5" />
                <span className="text-base font-semibold">AQUAS</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between pr-2">
            <SidebarGroupLabel>My Robots</SidebarGroupLabel>
            {robots.length > 1 && (
              <button
                onClick={() => setCompareMode(!compareMode)}
                className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                  compareMode
                    ? "bg-primary text-primary-foreground border-primary"
                    : "text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                Compare
              </button>
            )}
          </div>
          <SidebarMenu>
            {loading && (
              <p className="px-2 text-xs text-muted-foreground">Loading robots…</p>
            )}
            {!loading && robots.length === 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setClaimOpen(true)}>
                  <IconRobot className="size-4" />
                  <span>Claim a Robot</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            {robots.map((robot, i) => {
              const color = COMPARE_COLORS[i % COMPARE_COLORS.length]
              const isChecked = compareRobotIds.includes(robot.robot_id)
              return (
                <SidebarMenuItem key={robot.robot_id}>
                  {compareMode ? (
                    <SidebarMenuButton
                      isActive={isChecked}
                      onClick={() => toggleCompareRobot(robot.robot_id)}
                    >
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span>{robot.name}</span>
                      {!robot.is_active && (
                        <span className="ml-auto text-xs text-muted-foreground">offline</span>
                      )}
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      isActive={selectedRobotId === robot.robot_id}
                      onClick={() => setSelectedRobotId(robot.robot_id)}
                    >
                      <IconRobot className="size-4" />
                      <span>{robot.name}</span>
                      {!robot.is_active && (
                        <span className="ml-auto text-xs text-muted-foreground">offline</span>
                      )}
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              )
            })}
            {!loading && robots.length > 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setClaimOpen(true)} className="text-muted-foreground">
                  <span className="text-lg leading-none">+</span>
                  <span>Claim a Robot</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter />

      {claimOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setClaimOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <RobotClaim onClose={() => setClaimOpen(false)} />
          </div>
        </div>
      )}
    </Sidebar>
  )
}
