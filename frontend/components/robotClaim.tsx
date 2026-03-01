"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import { useRobotStore } from "@/stores/robot-store"

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

type ClaimState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; robotName: string }
  | { status: "error"; message: string }

export function RobotClaim({ onClose = () => {} }: { onClose?: () => void }) {
  const { data: session } = useSession()
  const { setRobots } = useRobotStore()

  const [serialNumber, setSerialNumber] = React.useState("")
  const [claimState, setClaimState] = React.useState<ClaimState>({ status: "idle" })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serialNumber.trim()) return

    setClaimState({ status: "loading" })

    try {
      const res = await fetch(`${API_BASE}/robots/claim`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.user?.accessToken}`,
        },
        body: JSON.stringify({ serial_number: serialNumber.trim() }),
      })

      if (res.status === 404) {
        setClaimState({ status: "error", message: "Robot not found — check the serial number." })
        return
      }
      if (res.status === 409) {
        setClaimState({ status: "error", message: "This robot is already claimed." })
        return
      }
      if (!res.ok) {
        setClaimState({ status: "error", message: "Something went wrong. Please try again." })
        return
      }

      const robot = await res.json()

      // Refresh robot list in the store
      const listRes = await fetch(`${API_BASE}/robots/me`, {
        headers: { Authorization: `Bearer ${session?.user?.accessToken}` },
      })
      if (listRes.ok) {
        const robots = await listRes.json()
        setRobots(robots)
      }

      setClaimState({ status: "success", robotName: robot.name })
    } catch {
      setClaimState({ status: "error", message: "Network error. Please try again." })
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Claim a Robot</h2>
        <p className="text-sm text-muted-foreground">
          Enter the serial number printed on your AQUAS robot.
        </p>
      </div>

      {claimState.status === "success" ? (
        <div className="space-y-3">
          <div className="rounded-md border border-green-800 bg-green-950/40 px-4 py-3 text-sm text-green-400">
            <strong>{claimState.robotName}</strong> has been successfully claimed.
          </div>
          <button
            onClick={onClose}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
          <button
            onClick={() => { setClaimState({ status: "idle" }); setSerialNumber("") }}
            className="w-full rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Claim Another Robot
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="serial" className="text-sm font-medium">
              Serial Number
            </label>
            <input
              id="serial"
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. AQS-001-XXXX"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              disabled={claimState.status === "loading"}
              autoFocus
            />
          </div>

          {claimState.status === "error" && (
            <p className="text-sm text-destructive">{claimState.message}</p>
          )}

          <button
            type="submit"
            disabled={claimState.status === "loading" || !serialNumber.trim()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {claimState.status === "loading" ? "Claiming…" : "Claim Robot"}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </form>
      )}
    </div>
  )
}

export default RobotClaim
