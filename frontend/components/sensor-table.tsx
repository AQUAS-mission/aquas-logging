"use client"

import * as React from "react"
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
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table"
import { z } from "zod"

import { useIsMobile } from "@/hooks/use-mobile"
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

export const schema = z.object({
  timestamp: z.number(),
  ph: z.number(),
  temperature: z.number(),
  dissolved_oxygen: z.number(),
  electrical_conductivity: z.number(),
  turbidity_ntu: z.number(),
})

type SensorRow = z.infer<typeof schema>

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

const VIEW_OPTIONS: ViewOption[] = [
  {
    id: "all",
    label: "All columns",
    columns: [...DATA_COLUMN_IDS],
    sort: [{ id: "timestamp", desc: true }],
    filters: [{ id: "timestamp", value: { kind: "sinceHours", hours: DEFAULT_TIME_WINDOW_HOURS } }],
  },
  {
    id: "water-quality",
    label: "Water quality focus",
    columns: ["timestamp", "ph", "temperature", "dissolved_oxygen"],
    sort: [{ id: "timestamp", desc: true }],
    filters: [{ id: "timestamp", value: { kind: "sinceHours", hours: DEFAULT_TIME_WINDOW_HOURS } }],
  },
  {
    id: "conductivity",
    label: "Conductivity & turbidity",
    columns: ["timestamp", "electrical_conductivity", "turbidity_ntu"],
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
    header: ({ column }) => <SortableHeader column={column} title="Timestamp" />,
    cell: ({ row }) => {
      return <TableCellViewer item={row.original} />
    },
    enableHiding: false,
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "ph",
    header: ({ column }) => <SortableHeader column={column} title="pH" />,
    cell: ({ row }) => {
      return <div>{row.original.ph}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "temperature",
    header: ({ column }) => <SortableHeader column={column} title="Temperature" />,
    cell: ({ row }) => {
      return <div>{row.original.temperature}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "dissolved_oxygen",
    header: ({ column }) => <SortableHeader column={column} title="Dissolved Oxygen" />,
    cell: ({ row }) => {
      return <div>{row.original.dissolved_oxygen}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "electrical_conductivity",
    header: ({ column }) => (
      <SortableHeader column={column} title="Electrical Conductivity" />
    ),
    cell: ({ row }) => {
      return <div>{row.original.electrical_conductivity}</div>
    },
    filterFn: filterByDescriptor,
  },
  {
    accessorKey: "turbidity_ntu",
    header: ({ column }) => <SortableHeader column={column} title="Turbidity" />,
    cell: ({ row }) => {
      return <div>{row.original.turbidity_ntu}</div>
    },
    filterFn: filterByDescriptor,
  },
]

function SortableHeader({
  column,
  title,
}: {
  column: Column<SensorRow, unknown>
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
    const nextSorting: SortingState =
      sorted === "desc"
        ? [{ id: column.id, desc: false }]
        : [{ id: column.id, desc: true }]
    column.getTable().setSorting(nextSorting)
  }, [column, sorted])

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
        return
      }
      const view = VIEW_MAP[value]
      if (!view) {
        return
      }
      setActiveView(value)
      setColumnVisibility(buildVisibilityState(value))
      setColumnFilters(viewFiltersToState(view.filters))
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
          <Label htmlFor="view-selector" className="sr-only">
            View
          </Label>
          <Select value={activeView} onValueChange={handleViewChange}>
            <SelectTrigger id="view-selector" className="w-[12rem]">
              <SelectValue placeholder="Select a view" />
            </SelectTrigger>
            <SelectContent align="start">
              {VIEW_OPTIONS.map((view) => (
                <SelectItem key={view.id} value={view.id}>
                  {view.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM_VIEW_ID}>Custom view</SelectItem>
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
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
          <Label htmlFor="filter-column" className="sr-only">
            Filter column
          </Label>
          <Select
            value={selectedFilterColumn || "none"}
            onValueChange={handleFilterColumnChange}
          >
            <SelectTrigger id="filter-column" className="w-[11rem]">
              <SelectValue placeholder="Choose filter" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="none">No filter</SelectItem>
              {DATA_COLUMN_IDS.map((columnId) => (
                <SelectItem key={columnId} value={columnId}>
                  {columnId.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedFilterColumn === "timestamp" ? (
            <>
              <Select value={timeWindow} onValueChange={handleTimeWindowChange}>
                <SelectTrigger className="w-[11rem]">
                  <SelectValue placeholder="Time window" />
                </SelectTrigger>
                <SelectContent align="start">
                  {TIME_WINDOW_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="0">All time</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelectedFilter}
                disabled={
                  !columnFilters.some((filter) => filter.id === "timestamp")
                }
              >
                Clear
              </Button>
            </>
          ) : null}
          {selectedFilterColumn &&
          selectedFilterColumn !== "" &&
          selectedFilterColumn !== "timestamp" ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Min"
                className="w-24"
                value={rangeMin}
                onChange={(event) => setRangeMin(event.target.value)}
              />
              <Input
                type="number"
                inputMode="decimal"
                placeholder="Max"
                className="w-24"
                value={rangeMax}
                onChange={(event) => setRangeMax(event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={applyRangeFilter}
                disabled={
                  rangeMin.trim() === "" && rangeMax.trim() === ""
                }
              >
                Apply
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearSelectedFilter}
                disabled={
                  !columnFilters.some(
                    (filter) => filter.id === selectedFilterColumn
                  )
                }
              >
                Clear
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      <TabsContent
        value="outline"
        className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
      >
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

  return (
    <Drawer direction={isMobile ? "bottom" : "right"}>
      <DrawerTrigger asChild>
        <Button variant="link" className="text-foreground w-fit px-0 text-left">
          {item.timestamp}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="gap-1">
          <DrawerTitle>{item.timestamp}</DrawerTitle>
          <DrawerDescription>
            Sensor data for timestamp: {item.timestamp}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            {
              Object.entries(item).map(([key, value]) =>
                <div className="flex flex-col gap-3">
                  <Label htmlFor={key}>{key}</Label>
                  <div id={key}>{value}</div>
                </div>
              )
            }
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
