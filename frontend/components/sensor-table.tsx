"use client"

import * as React from "react"
import { useSession } from "next-auth/react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core"
import { restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  IconArrowDown,
  IconArrowUp,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
} from "@tabler/icons-react"
import {
  ColumnDef,
  ColumnFiltersState,
  type Column,
  type FilterFn,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type OnChangeFn,
  Row,
  SortingState,
  type Table as TanstackTable,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
import { useRobotStore } from "@/stores/robot-store"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
} from "@/components/ui/tabs"

const formatNumber = (value: number | string | undefined): string => {
  const num = typeof value === "string" ? Number(value) : value
  return Number.isFinite(num) ? Number(num).toFixed(2) : String(value ?? "-")
}

const formatTimestamp = (ts: number) => {
  // ts expected in seconds
  return new Date(ts * 1000).toLocaleString()
}

const toIso = (ts: number) => new Date(ts * 1000).toISOString()

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000"

const SLIDER_CONFIG = [
  { key: "ph",                     label: "pH",                    min: 0,  max: 14,   step: 0.1 },
  { key: "temperature",            label: "Temperature (°C)",      min: -5, max: 80,   step: 0.5 },
  { key: "dissolved_oxygen",       label: "Dissolved Oxygen (mg/L)", min: 0, max: 20,  step: 0.1 },
  { key: "electrical_conductivity",label: "EC (µS/cm)",            min: 0,  max: 2000, step: 1   },
  { key: "turbidity_ntu",          label: "Turbidity (NTU)",       min: 0,  max: 100,  step: 0.5 },
] as const

type SliderKey = typeof SLIDER_CONFIG[number]["key"]
type SliderFilters = Record<SliderKey, [number, number]>

const SLIDER_DEFAULTS: SliderFilters = {
  ph: [0, 14],
  temperature: [-5, 80],
  dissolved_oxygen: [0, 20],
  electrical_conductivity: [0, 2000],
  turbidity_ntu: [0, 100],
}

export const schema = z.object({
  timestamp: z.number(),
  longitude: z.number(),
  latitude: z.number(),
  ph: z.number(),
  temperature: z.number(),
  dissolved_oxygen: z.number(),
  electrical_conductivity: z.number(),
  turbidity_ntu: z.number(),
})

type SensorRow = z.infer<typeof schema>

type BackendRow = {
  timestamp: number | string
  longitude?: number | string
  latitude?: number | string
  ph?: number | string
  temperature?: number | string
  dissolved_oxygen?: number | string
  electrical_conductivity?: number | string
  turbidity_ntu?: number | string
}

type RangeFilterValue = {
  kind: "range"
  min?: number
  max?: number
}

type SinceFilterValue = {
  kind: "sinceHours"
  hours: number
}

type FilterValue = RangeFilterValue | SinceFilterValue

const DATA_COLUMN_IDS = [
  "timestamp",
  "longitude",
  "latitude",
  "ph",
  "temperature",
  "dissolved_oxygen",
  "electrical_conductivity",
  "turbidity_ntu",
] as const satisfies readonly (keyof SensorRow)[]

type DataColumnId = (typeof DATA_COLUMN_IDS)[number]

type ViewFilter = {
  id: DataColumnId
  value: FilterValue
}

type ViewOption = {
  id: string
  label: string
  columns: DataColumnId[]
  sort?: SortingState
  filters?: ViewFilter[]
}

const DEFAULT_TIME_WINDOW_HOURS = 24 * 7
const DEFAULT_LIMIT = 200

const VIEW_OPTIONS: ViewOption[] = [
  {
    id: "all",
    label: "All columns",
    columns: [...DATA_COLUMN_IDS],
    sort: [{ id: "timestamp", desc: true }],
  },
  {
    id: "water-quality",
    label: "Water quality focus",
    columns: ["timestamp", "longitude", "latitude", "ph", "temperature", "dissolved_oxygen"],
    sort: [{ id: "timestamp", desc: true }],
    filters: [{ id: "timestamp", value: { kind: "sinceHours", hours: DEFAULT_TIME_WINDOW_HOURS } }],
  },
  {
    id: "conductivity",
    label: "Conductivity & turbidity",
    columns: ["timestamp", "longitude", "latitude", "electrical_conductivity", "turbidity_ntu"],
    sort: [{ id: "timestamp", desc: true }],
    filters: [{ id: "timestamp", value: { kind: "sinceHours", hours: DEFAULT_TIME_WINDOW_HOURS } }],
  },
  {
    id: "ph-neutral",
    label: "pH 7 - 10",
    columns: [...DATA_COLUMN_IDS],
    sort: [{ id: "timestamp", desc: true }],
    filters: [
      { id: "timestamp", value: { kind: "sinceHours", hours: DEFAULT_TIME_WINDOW_HOURS } },
      { id: "ph", value: { kind: "range", min: 7, max: 10 } },
    ],
  },
]

const VIEW_MAP = VIEW_OPTIONS.reduce<Record<string, ViewOption>>((acc, view) => {
  acc[view.id] = view
  return acc
}, {})

const CUSTOM_VIEW_ID = "custom"
const DEFAULT_VIEW = VIEW_OPTIONS[0]?.id ?? "all"
const DEFAULT_SORTING: SortingState =
  VIEW_MAP[DEFAULT_VIEW]?.sort ?? [{ id: "timestamp", desc: true }]
const DEFAULT_VIEW_FILTERS = VIEW_MAP[DEFAULT_VIEW]?.filters

const viewFiltersToState = (filters?: ViewFilter[]): ColumnFiltersState =>
  filters?.map((filter) => ({ id: filter.id, value: filter.value })) ?? []

const TIME_WINDOW_OPTIONS = [
  { value: "24", label: "Last 24 hours" },
  { value: String(DEFAULT_TIME_WINDOW_HOURS), label: "Last 7 days" },
  { value: "720", label: "Last 30 days" },
]

const buildVisibilityState = (viewKey: string): VisibilityState => {
  const view = VIEW_MAP[viewKey] ?? VIEW_MAP[DEFAULT_VIEW]
  if (!view) {
    return {}
  }

  const visibleSet = new Set<DataColumnId>(view.columns)
  const state: VisibilityState = {}
  for (const columnId of DATA_COLUMN_IDS) {
    state[columnId] = visibleSet.has(columnId)
  }
  state.select = true
  return state
}

const isRangeFilterValue = (value: unknown): value is RangeFilterValue =>
  Boolean(value) && typeof value === "object" && (value as RangeFilterValue).kind === "range"

const isSinceFilterValue = (value: unknown): value is SinceFilterValue =>
  Boolean(value) && typeof value === "object" && (value as SinceFilterValue).kind === "sinceHours"

const filterByDescriptor: FilterFn<SensorRow> = (row, columnId, rawValue) => {
  if (!rawValue || typeof rawValue !== "object") {
    return true
  }

  const value = rawValue as FilterValue
  const cellValue = row.getValue(columnId)
  const numericValue =
    typeof cellValue === "number"
      ? cellValue
      : typeof cellValue === "string"
      ? Number(cellValue)
      : Number(cellValue)

  if (!Number.isFinite(numericValue)) {
    return false
  }

  if (isRangeFilterValue(value)) {
    if (typeof value.min === "number" && numericValue < value.min) {
      return false
    }
    if (typeof value.max === "number" && numericValue > value.max) {
      return false
    }
    return true
  }

  if (isSinceFilterValue(value)) {
    if (typeof value.hours !== "number" || value.hours <= 0) {
      return true
    }
    const hoursInMs = value.hours * 60 * 60 * 1000
    const thresholdMs = Date.now() - hoursInMs
    if (numericValue > 1e11) {
      return numericValue >= thresholdMs
    }
    return numericValue * 1000 >= thresholdMs
  }

  return true
}


const columns: ColumnDef<SensorRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      </div>
    ),
    cell: ({ row }) => (
      <div className="flex items-center justify-center">
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "timestamp",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="Timestamp" />,
    cell: ({ row }) => {
      const ts = row.original.timestamp
      return <TableCellViewer item={row.original} />
    },
    enableHiding: false,
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "longitude",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="Longitude" />,
    cell: ({ row }) => <div>{formatNumber(row.original.longitude)}</div>,
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "latitude",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="Latitude" />,
    cell: ({ row }) => <div>{formatNumber(row.original.latitude)}</div>,
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "ph",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="pH" />,
    cell: ({ row }) => {
      return <div>{formatNumber(row.original.ph)}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "temperature",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="Temperature" />,
    cell: ({ row }) => {
      return <div>{formatNumber(row.original.temperature)}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "dissolved_oxygen",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="Dissolved Oxygen" />,
    cell: ({ row }) => {
      return <div>{formatNumber(row.original.dissolved_oxygen)}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "electrical_conductivity",
    header: ({ column, table }) => (
      <SortableHeader column={column} table={table} title="Electrical Conductivity" />
    ),
    cell: ({ row }) => {
      return <div>{formatNumber(row.original.electrical_conductivity)}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "turbidity_ntu",
    header: ({ column, table }) => <SortableHeader column={column} table={table} title="Turbidity" />,
    cell: ({ row }) => {
      return <div>{formatNumber(row.original.turbidity_ntu)}</div>
    },
    filterFn: filterByDescriptor,
  },
]

function SortableHeader({
  column,
  table,
  title,
}: {
  column: Column<SensorRow, unknown>
  table: TanstackTable<SensorRow>
  title: string
}) {
  const sorted = column.getIsSorted()
  const icon =
    sorted === "desc" ? (
      <IconArrowDown className="h-4 w-4" />
    ) : sorted === "asc" ? (
      <IconArrowUp className="h-4 w-4" />
    ) : (
      <IconArrowDown className="h-4 w-4 opacity-40" />
    )

  const handleClick = React.useCallback(() => {
    if (sorted === "asc") {
      table.setSorting([{ id: column.id, desc: true }])
      return
    }
    if (sorted === "desc") {
      table.setSorting([])
      return
    }
    table.setSorting([{ id: column.id, desc: false }])
  }, [column.id, sorted, table])

  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      className="-ml-2 flex h-8 items-center gap-2 px-2 font-semibold"
      onClick={handleClick}
    >
      <span>{title}</span>
      <span className="text-muted-foreground">{icon}</span>
    </Button>
  )
}

function DraggableRow({ row }: { row: Row<SensorRow> }) {
  const { transform, transition, setNodeRef, isDragging } = useSortable({
    id: row.original.timestamp,
  })

  return (
    <TableRow
      data-state={row.getIsSelected() && "selected"}
      data-dragging={isDragging}
      ref={setNodeRef}
      className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition,
      }}
    >
      {row.getVisibleCells().map((cell) => (
        <TableCell key={cell.id}>
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </TableCell>
      ))}
    </TableRow>
  )
}

export function SensorTable({
  data: initialData,
}: {
  data: SensorRow[]
}) {
  const { data: session } = useSession()
  const { selectedRobotId, robots, refreshTick } = useRobotStore()
  const robotsRef = React.useRef(robots)
  robotsRef.current = robots
  const [tableRobotId, setTableRobotId] = React.useState<string>("all")

  // Sync table robot selector when sidebar selection changes
  React.useEffect(() => {
    setTableRobotId(selectedRobotId ?? "all")
  }, [selectedRobotId])
  const [data, setData] = React.useState(() => initialData)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    buildVisibilityState(DEFAULT_VIEW)
  )
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(() =>
    viewFiltersToState(DEFAULT_VIEW_FILTERS)
  )
  const [sorting, setSorting] = React.useState<SortingState>(DEFAULT_SORTING)
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })
  const [activeView, setActiveView] = React.useState<string>(DEFAULT_VIEW)
  const [selectedFilterColumn, setSelectedFilterColumn] =
    React.useState<DataColumnId | "">("timestamp")
  const [rangeMin, setRangeMin] = React.useState<string>("")
  const [rangeMax, setRangeMax] = React.useState<string>("")
  const [timeWindow, setTimeWindow] = React.useState<string>(
    String(DEFAULT_TIME_WINDOW_HOURS)
  )
  const [recordLimit, setRecordLimit] = React.useState<number>(DEFAULT_LIMIT)
  const [recordLimitInput, setRecordLimitInput] = React.useState<string>(
    String(DEFAULT_LIMIT)
  )
  const dataRef = React.useRef<SensorRow[]>(data)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [dateFrom, setDateFrom] = React.useState("")
  const [dateTo, setDateTo] = React.useState("")
  const [sliderFilters, setSliderFilters] = React.useState<SliderFilters>(SLIDER_DEFAULTS)
  const [appliedDateFrom, setAppliedDateFrom] = React.useState("")
  const [appliedDateTo, setAppliedDateTo] = React.useState("")
  const [appliedSliderFilters, setAppliedSliderFilters] = React.useState<SliderFilters>(SLIDER_DEFAULTS)
  const sortableId = React.useId()
  const sensors = useSensors(
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {})
  )

  const dataIds = React.useMemo<UniqueIdentifier[]>(
    () => data?.map(({ timestamp }) => timestamp) || [],
    [data]
  )

  const handleColumnVisibilityChange = React.useCallback<
    OnChangeFn<VisibilityState>
  >(
    (updater) => {
      setActiveView(CUSTOM_VIEW_ID)
      setColumnVisibility((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      )
    },
    []
  )

  const handleColumnFiltersChange = React.useCallback<
    OnChangeFn<ColumnFiltersState>
  >(
    (updater) => {
      setActiveView(CUSTOM_VIEW_ID)
      setColumnFilters((prev) =>
        typeof updater === "function" ? updater(prev) : updater
      )
    },
    []
  )

  const handleViewChange = React.useCallback(
    (value: string) => {
      if (value === CUSTOM_VIEW_ID) {
        setActiveView(CUSTOM_VIEW_ID)
        setColumnFilters([])
        setSelectedFilterColumn("")
        setRangeMin("")
        setRangeMax("")
        setTimeWindow(String(DEFAULT_TIME_WINDOW_HOURS))
        return
      }
      const view = VIEW_MAP[value]
      if (!view) {
        return
      }
      setActiveView(value)
      setColumnVisibility(buildVisibilityState(value))
      const newFilters = viewFiltersToState(view.filters)
      setColumnFilters(newFilters)
      // Reset filter UI state when changing views
      setSelectedFilterColumn("")
      setRangeMin("")
      setRangeMax("")
      const timestampFilter = newFilters.find((f) => f.id === "timestamp")
      if (timestampFilter && isSinceFilterValue(timestampFilter.value)) {
        setTimeWindow(String(timestampFilter.value.hours))
      } else {
        setTimeWindow(String(DEFAULT_TIME_WINDOW_HOURS))
      }
      setSorting(view.sort ?? DEFAULT_SORTING)
    },
    []
  )

  const updateColumnFilter = React.useCallback(
    (columnId: DataColumnId, value?: FilterValue) => {
      setActiveView(CUSTOM_VIEW_ID)
      setColumnFilters((prev) => {
        const without = prev.filter((filter) => filter.id !== columnId)
        if (!value) {
          return without
        }
        return [...without, { id: columnId, value }]
      })
    },
    []
  )

  const clearColumnFilter = React.useCallback(
    (columnId: DataColumnId) => {
      updateColumnFilter(columnId)
    },
    [updateColumnFilter]
  )

  const handleFilterColumnChange = React.useCallback(
    (value: string) => {
      if (value === "none") {
        if (selectedFilterColumn) {
          clearColumnFilter(selectedFilterColumn)
        }
        setSelectedFilterColumn("")
        return
      }
      setSelectedFilterColumn(value as DataColumnId)
    },
    [clearColumnFilter, selectedFilterColumn]
  )

  const handleTimeWindowChange = React.useCallback(
    (value: string) => {
      setTimeWindow(value)
      const hours = Number(value)
      if (!Number.isFinite(hours) || hours <= 0) {
        updateColumnFilter("timestamp")
        return
      }
      updateColumnFilter("timestamp", { kind: "sinceHours", hours })
    },
    [updateColumnFilter]
  )

  const applyRangeFilter = React.useCallback(() => {
    if (!selectedFilterColumn || selectedFilterColumn === "timestamp") {
      return
    }
    const trimmedMin = rangeMin.trim()
    const trimmedMax = rangeMax.trim()
    const min = trimmedMin === "" ? undefined : Number(trimmedMin)
    const max = trimmedMax === "" ? undefined : Number(trimmedMax)

    if (
      (min !== undefined && Number.isNaN(min)) ||
      (max !== undefined && Number.isNaN(max))
    ) {
      return
    }

    let resolvedMin = min
    let resolvedMax = max
    if (
      resolvedMin !== undefined &&
      resolvedMax !== undefined &&
      resolvedMin > resolvedMax
    ) {
      const temp = resolvedMin
      resolvedMin = resolvedMax
      resolvedMax = temp
    }

    if (resolvedMin === undefined && resolvedMax === undefined) {
      updateColumnFilter(selectedFilterColumn)
      return
    }

    updateColumnFilter(selectedFilterColumn, {
      kind: "range",
      min: resolvedMin,
      max: resolvedMax,
    })
  }, [rangeMax, rangeMin, selectedFilterColumn, updateColumnFilter])

  const clearSelectedFilter = React.useCallback(() => {
    if (!selectedFilterColumn) {
      return
    }
    clearColumnFilter(selectedFilterColumn)
    if (selectedFilterColumn === "timestamp") {
      setTimeWindow(String(DEFAULT_TIME_WINDOW_HOURS))
    } else {
      setRangeMin("")
      setRangeMax("")
    }
  }, [clearColumnFilter, selectedFilterColumn])

  const applyRecordLimit = React.useCallback(() => {
    const parsed = Number(recordLimitInput)
    if (Number.isFinite(parsed) && parsed > 0) {
      setRecordLimit(parsed)
      setRecordLimitInput(String(parsed))
      return
    }
    setRecordLimit(DEFAULT_LIMIT)
    setRecordLimitInput(String(DEFAULT_LIMIT))
  }, [recordLimitInput])

  const updateSlider = React.useCallback(
    (key: SliderKey, index: 0 | 1, value: number) => {
      setSliderFilters((prev) => {
        const next = [...prev[key]] as [number, number]
        if (index === 0) next[0] = Math.min(value, prev[key][1])
        if (index === 1) next[1] = Math.max(value, prev[key][0])
        return { ...prev, [key]: next }
      })
    },
    []
  )

  const handleApplyFilters = React.useCallback(() => {
    setAppliedDateFrom(dateFrom)
    setAppliedDateTo(dateTo)
    setAppliedSliderFilters(sliderFilters)
  }, [dateFrom, dateTo, sliderFilters])

  const handleResetFilters = React.useCallback(() => {
    setDateFrom("")
    setDateTo("")
    setSliderFilters(SLIDER_DEFAULTS)
    setAppliedDateFrom("")
    setAppliedDateTo("")
    setAppliedSliderFilters(SLIDER_DEFAULTS)
  }, [])

  const downloadData = React.useCallback(
    (format: "csv" | "json") => {
      const rows = dataRef.current
      if (!rows || rows.length === 0) {
        setError("No data to download")
        return
      }

      const exportRows = rows.map((row) => ({
        timestamp: row.timestamp,
        timestamp_iso: toIso(row.timestamp),
        longitude: row.longitude,
        latitude: row.latitude,
        ph: row.ph,
        temperature: row.temperature,
        dissolved_oxygen: row.dissolved_oxygen,
        electrical_conductivity: row.electrical_conductivity,
        turbidity_ntu: row.turbidity_ntu,
      }))

      let blob: Blob
      let filename: string
      if (format === "json") {
        blob = new Blob([JSON.stringify(exportRows, null, 2)], {
          type: "application/json",
        })
        filename = "sensor-data.json"
      } else {
        const headers = Object.keys(exportRows[0])
        const csvLines = [
          headers.join(","),
          ...exportRows.map((row) =>
            headers
              .map((key) => {
                const value = (row as Record<string, unknown>)[key]
                if (value === null || value === undefined) return ""
                if (typeof value === "string") {
                  const escaped = value.replace(/"/g, '""')
                  return `"${escaped}"`
                }
                return String(value)
              })
              .join(",")
          ),
        ]
        blob = new Blob([csvLines.join("\n")], { type: "text/csv" })
        filename = "sensor-data.csv"
      }

      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    },
    []
  )

  React.useEffect(() => {
    if (selectedFilterColumn === "") {
      setRangeMin("")
      setRangeMax("")
      return
    }

    if (selectedFilterColumn === "timestamp") {
      const entry = columnFilters.find((filter) => filter.id === "timestamp")
      if (entry && isSinceFilterValue(entry.value)) {
        setTimeWindow(String(entry.value.hours))
      }
      return
    }

    const entry = columnFilters.find(
      (filter) => filter.id === selectedFilterColumn
    )
    if (entry && isRangeFilterValue(entry.value)) {
      setRangeMin(
        typeof entry.value.min === "number" ? String(entry.value.min) : ""
      )
      setRangeMax(
        typeof entry.value.max === "number" ? String(entry.value.max) : ""
      )
    } else {
      setRangeMin("")
      setRangeMax("")
    }
  }, [columnFilters, selectedFilterColumn])

  const normalizeBackendRow = React.useCallback((row: BackendRow): SensorRow | null => {
    const toNumber = (value: unknown): number | undefined => {
      if (typeof value === "number") return value
      if (typeof value === "string") {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : undefined
      }
      return undefined
    }

    const timestampValue = (() => {
      if (typeof row.timestamp === "number") return row.timestamp
      if (typeof row.timestamp === "string") {
        const parsed = Number(row.timestamp)
        if (Number.isFinite(parsed)) return parsed
        const dateParsed = Date.parse(row.timestamp)
        return Number.isFinite(dateParsed) ? Math.floor(dateParsed / 1000) : undefined
      }
      return undefined
    })()

    const ph = toNumber(row.ph)
    const longitude = toNumber(row.longitude)
    const latitude = toNumber(row.latitude)
    const temperature = toNumber(row.temperature)
    const dissolved_oxygen = toNumber(row.dissolved_oxygen)
    const electrical_conductivity = toNumber(row.electrical_conductivity)
    const turbidity_ntu = toNumber(row.turbidity_ntu)

    if (
      timestampValue === undefined ||
      longitude === undefined ||
      latitude === undefined ||
      ph === undefined ||
      temperature === undefined ||
      dissolved_oxygen === undefined ||
      electrical_conductivity === undefined ||
      turbidity_ntu === undefined
    ) {
      return null
    }

    return {
      timestamp: timestampValue,
      longitude,
      latitude,
      ph,
      temperature,
      dissolved_oxygen,
      electrical_conductivity,
      turbidity_ntu,
    }
  }, [])

  const viewToBackendId: Record<string, string> = React.useMemo(
    () => ({
      all: "all",
      "water-quality": "water-quality",
      conductivity: "conductivity",
      "ph-neutral": "ph-neutral",
      [CUSTOM_VIEW_ID]: "all",
    }),
    []
  )

  React.useEffect(() => {
    const controller = new AbortController()
    const fetchData = async () => {
      setLoading(true)
      setError(null)
      const backendView = viewToBackendId[activeView] ?? "all"
      const hours = backendView === "water-quality"
        ? (Number(timeWindow) || DEFAULT_TIME_WINDOW_HOURS)
        : 8760

      // Build query string — prefer explicit date range over hours window
      let queryString: string
      if (appliedDateFrom || appliedDateTo) {
        const params = new URLSearchParams()
        if (appliedDateFrom) params.set("start_time", new Date(appliedDateFrom).toISOString())
        if (appliedDateTo) {
          const end = new Date(appliedDateTo)
          end.setHours(23, 59, 59, 999)
          params.set("end_time", end.toISOString())
        }
        queryString = params.toString()
      } else {
        queryString = `hours=${hours}`
      }

      try {
        const robotIdList = tableRobotId === "all"
          ? robotsRef.current.map((r) => r.robot_id)
          : [tableRobotId]

        if (robotIdList.length === 0) { setLoading(false); return }

        const responses = await Promise.all(
          robotIdList.map((id) =>
            fetch(`${API_BASE}/robots/${id}/data?${queryString}`, {
              headers: { "Authorization": `Bearer ${session?.user?.accessToken}` },
              signal: controller.signal,
            })
          )
        )

        const allRows: BackendRow[] = []
        for (const response of responses) {
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`)
          const payload = (await response.json()) as { robot_id?: string; rows?: BackendRow[] }
          allRows.push(...(payload.rows ?? []))
        }

        const normalized = allRows
          .map(normalizeBackendRow)
          .filter((row): row is SensorRow => row !== null)

        // Apply metric slider filters client-side
        const filtered = normalized.filter((row) =>
          SLIDER_CONFIG.every(({ key }) => {
            const [min, max] = appliedSliderFilters[key]
            const [defMin, defMax] = SLIDER_DEFAULTS[key]
            if (min === defMin && max === defMax) return true
            const val = row[key as keyof SensorRow]
            return typeof val === "number" && val >= min && val <= max
          })
        )

        setData(filtered)
        dataRef.current = filtered
      } catch (err) {
        if (controller.signal.aborted) return
        setError(err instanceof Error ? err.message : "Failed to fetch data")
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      controller.abort()
    }
  }, [activeView, normalizeBackendRow, timeWindow, viewToBackendId, recordLimit, session, tableRobotId, appliedDateFrom, appliedDateTo, appliedSliderFilters, refreshTick])

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.timestamp.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnVisibilityChange: handleColumnVisibilityChange,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (active && over && active.id !== over.id) {
      setData((data) => {
        const oldIndex = dataIds.indexOf(active.id)
        const newIndex = dataIds.indexOf(over.id)
        return arrayMove(data, oldIndex, newIndex)
      })
    }
  }

  return (
    <Tabs
      defaultValue="outline"
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex flex-col gap-3 px-4 lg:flex-row lg:items-center lg:justify-between lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="robot-selector" className="sr-only">
            Robot
          </Label>
          <Select value={tableRobotId} onValueChange={setTableRobotId}>
            <SelectTrigger id="robot-selector" className="w-[12rem]">
              <SelectValue placeholder="Select robot" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all">All Robots</SelectItem>
              {robots.map((r) => (
                <SelectItem key={r.robot_id} value={r.robot_id}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <Button
            variant={filterOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setFilterOpen((o) => !o)}
          >
            Filters
            <IconChevronDown className={`ml-1 size-3.5 transition-transform ${filterOpen ? "rotate-180" : ""}`} />
          </Button>
          <div className="hidden h-6 w-px bg-border sm:block" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[96px]">
                Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadData("csv")}>
                CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadData("json")}>
                JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {filterOpen && (
        <div className="border-t border-border px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-5">
            {/* Date range */}
            <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">From</Label>
                <Input
                  type="date"
                  className="w-40"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs font-medium text-muted-foreground">To</Label>
                <Input
                  type="date"
                  className="w-40"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
            </div>

            {/* Metric sliders */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {SLIDER_CONFIG.map((cfg) => {
                const [curMin, curMax] = sliderFilters[cfg.key]
                return (
                  <div key={cfg.key} className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">{cfg.label}</Label>
                      <span className="text-xs text-muted-foreground">
                        {curMin} – {curMax}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <input
                        type="range"
                        min={cfg.min}
                        max={cfg.max}
                        step={cfg.step}
                        value={curMin}
                        onChange={(e) => updateSlider(cfg.key, 0, Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <input
                        type="range"
                        min={cfg.min}
                        max={cfg.max}
                        step={cfg.step}
                        value={curMax}
                        onChange={(e) => updateSlider(cfg.key, 1, Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleApplyFilters}>
                Apply Filters
              </Button>
              <Button size="sm" variant="ghost" onClick={handleResetFilters}>
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}

      <TabsContent
        value="outline"
        className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
      >
        {loading ? (
          <div className="text-sm text-muted-foreground px-2">Loading view data…</div>
        ) : null}
        {error ? (
          <div className="text-sm text-red-600 px-2">Failed to load data: {error}</div>
        ) : null}
        <div className="overflow-hidden rounded-lg border">
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
            sensors={sensors}
            id={sortableId}
          >
            <Table>
              <TableHeader className="bg-muted sticky top-0 z-10">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const ariaSort =
                        sorted === "desc"
                          ? "descending"
                          : sorted === "asc"
                          ? "ascending"
                          : undefined
                      return (
                        <TableHead
                          key={header.id}
                          colSpan={header.colSpan}
                          aria-sort={ariaSort}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                            )}
                        </TableHead>
                      )
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody className="**:data-[slot=table-cell]:first:w-8">
                {table.getRowModel().rows?.length ? (
                  <SortableContext
                    items={dataIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow key={row.id} row={row} />
                    ))}
                  </SortableContext>
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length}
                      className="h-24 text-center"
                    >
                      No results.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </DndContext>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="flex w-full items-center gap-8 lg:w-fit">
            <div className="hidden items-center gap-2 lg:flex">
              <Label htmlFor="rows-per-page" className="text-sm font-medium">
                Rows per page
              </Label>
              <Select
                value={`${table.getState().pagination.pageSize}`}
                onValueChange={(value) => {
                  table.setPageSize(Number(value))
                }}
              >
                <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                  <SelectValue
                    placeholder={table.getState().pagination.pageSize}
                  />
                </SelectTrigger>
                <SelectContent side="top">
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex w-fit items-center justify-center text-sm font-medium">
              Page {table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </div>
            <div className="ml-auto flex items-center gap-2 lg:ml-0">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => table.setPageIndex(0)}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to first page</span>
                <IconChevronsLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                <span className="sr-only">Go to previous page</span>
                <IconChevronLeft />
              </Button>
              <Button
                variant="outline"
                className="size-8"
                size="icon"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to next page</span>
                <IconChevronRight />
              </Button>
              <Button
                variant="outline"
                className="hidden size-8 lg:flex"
                size="icon"
                onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                disabled={!table.getCanNextPage()}
              >
                <span className="sr-only">Go to last page</span>
                <IconChevronsRight />
              </Button>
            </div>
          </div>
        </div>
      </TabsContent>
      <TabsContent
        value="past-performance"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent value="key-personnel" className="flex flex-col px-4 lg:px-6">
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
      <TabsContent
        value="focus-documents"
        className="flex flex-col px-4 lg:px-6"
      >
        <div className="aspect-video w-full flex-1 rounded-lg border border-dashed"></div>
      </TabsContent>
    </Tabs>
  )
}

function TableCellViewer({ item }: { item: SensorRow }) {
  const isMobile = useIsMobile()
  const entries = React.useMemo(
    () => [
      ["timestamp", formatTimestamp(item.timestamp)],
      ["longitude", formatNumber(item.longitude)],
      ["latitude", formatNumber(item.latitude)],
      ["ph", formatNumber(item.ph)],
      ["temperature", formatNumber(item.temperature)],
      ["dissolved_oxygen", formatNumber(item.dissolved_oxygen)],
      ["electrical_conductivity", formatNumber(item.electrical_conductivity)],
      ["turbidity_ntu", formatNumber(item.turbidity_ntu)],
    ],
    [item]
  )

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">
          {formatTimestamp(item.timestamp)}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{formatTimestamp(item.timestamp)}</DrawerTitle>
          <DrawerDescription>
            Sensor data for timestamp: {formatTimestamp(item.timestamp)}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            {entries.map(([key, value]) => (
              <div key={key} className="flex flex-col gap-3">
                <Label htmlFor={key}>{key.replace(/_/g, " ")}</Label>
                <div id={key}>{value}</div>
              </div>
            ))}
            
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
