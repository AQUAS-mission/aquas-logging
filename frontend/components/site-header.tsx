"use client"

import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { NavUser } from "./nav-user"
import { ShipIcon } from "lucide-react"
import { useSession } from "next-auth/react"

export function SiteHeader() {
  const { data: session } = useSession()
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mx-2 data-[orientation=vertical]:h-4"
        />
        <ShipIcon className="!size-5" />
        <span className="text-base font-
         -semibold">AQUAS</span>    
        <div className="ml-auto flex items-center gap-2">
          <NavUser user={{
            name: session?.user?.name ?? "User",
            email: session?.user?.email ?? "",
            avatar: "",
          }}/>
        </div>
      </div>
    </header>
  )
}
