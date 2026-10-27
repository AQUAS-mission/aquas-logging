"use client"

import * as React from "react"
import { IconDashboard } from "@tabler/icons-react"

import { NavMain } from "@/components/nav-main"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { ShipIcon } from "lucide-react"

// Only destinations that actually exist. The shadcn template's placeholder
// sections (Lifecycle, Analytics, Projects, Team, Capture, Proposal, Prompts,
// Settings, Get Help, Search) all pointed at "#" and were removed; add entries
// back here as real routes land.
const navMain = [
  {
    title: "Dashboard",
    url: "/",
    icon: IconDashboard,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <a href="/">
                <ShipIcon className="!size-5" />
                <span className="text-base font-semibold">AQUAS</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter></SidebarFooter>
    </Sidebar>
  )
}
