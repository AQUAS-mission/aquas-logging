import { create } from "zustand"

export type Robot = {
  robot_id: string
  name: string
  serial_number: string
  is_active: boolean
  last_seen_at: string | null
  last_latitude: number | null
  last_longitude: number | null
}

export const COMPARE_COLORS = [
  "#006B95",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
]

type RobotStore = {
  robots: Robot[]
  selectedRobotId: string | null
  compareMode: boolean
  compareRobotIds: string[]
  autoRefresh: boolean
  refreshTick: number
  lastUpdated: number | null
  setRobots: (robots: Robot[]) => void
  setSelectedRobotId: (id: string) => void
  setCompareMode: (on: boolean) => void
  toggleCompareRobot: (id: string) => void
  setAutoRefresh: (on: boolean) => void
  tick: () => void
}

export const useRobotStore = create<RobotStore>((set) => ({
  robots: [],
  selectedRobotId: null,
  compareMode: false,
  compareRobotIds: [],
  autoRefresh: true,
  refreshTick: 0,
  lastUpdated: null,
  setRobots: (robots) => set({ robots, selectedRobotId: robots[0]?.robot_id ?? null }),
  setSelectedRobotId: (id) => set({ selectedRobotId: id }),
  setCompareMode: (on) => set({ compareMode: on, compareRobotIds: [] }),
  toggleCompareRobot: (id) =>
    set((state) => ({
      compareRobotIds: state.compareRobotIds.includes(id)
        ? state.compareRobotIds.filter((r) => r !== id)
        : [...state.compareRobotIds, id],
    })),
  setAutoRefresh: (on) => set({ autoRefresh: on }),
  tick: () => set((state) => ({ refreshTick: state.refreshTick + 1, lastUpdated: Date.now() })),
}))
