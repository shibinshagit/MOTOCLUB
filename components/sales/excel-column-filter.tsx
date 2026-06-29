"use client"

import { useMemo, useRef, useState } from "react"
import { ListFilter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export type ExcelColumnFilterValue = {
  contains: string
  selected: Set<string>
}

export const EXCEL_COLUMN_FILTER_POPOVER_ATTR = "data-excel-column-filter-popover"

export function createEmptyColumnFilter(allValues: string[]): ExcelColumnFilterValue {
  return { contains: "", selected: new Set(allValues) }
}

export function isColumnFilterActive(filter: ExcelColumnFilterValue, allValues: string[]): boolean {
  if (filter.contains.trim()) return true
  return filter.selected.size < allValues.length
}

export function passesColumnFilter(cellValue: string, filter: ExcelColumnFilterValue, allValues: string[]): boolean {
  const value = cellValue ?? ""
  if (filter.contains.trim() && !value.toLowerCase().includes(filter.contains.trim().toLowerCase())) {
    return false
  }
  if (filter.selected.size < allValues.length && !filter.selected.has(value)) {
    return false
  }
  return true
}

interface ExcelColumnFilterProps {
  columnLabel: string
  values: string[]
  filter: ExcelColumnFilterValue
  onContainsChange: (contains: string) => void
  onSelectionChange: (selected: Set<string>) => void
  align?: "left" | "right"
  onOpenChange?: (open: boolean) => void
}

export function ExcelColumnFilterHeader({
  columnLabel,
  values,
  filter,
  onContainsChange,
  onSelectionChange,
  align = "left",
  onOpenChange,
}: ExcelColumnFilterProps) {
  const [open, setOpen] = useState(false)
  const [localContains, setLocalContains] = useState(filter.contains)
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set(filter.selected))
  const [findValues, setFindValues] = useState("")
  const initialContainsRef = useRef(filter.contains)
  const committedRef = useRef(false)

  const active = isColumnFilterActive(filter, values)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      committedRef.current = false
      initialContainsRef.current = filter.contains
      setLocalContains(filter.contains)
      setDraftSelected(new Set(filter.selected))
      setFindValues("")
    } else if (!committedRef.current) {
      onContainsChange(initialContainsRef.current)
    }
    committedRef.current = false
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const closeMenu = () => {
    handleOpenChange(false)
  }

  const applyAndClose = () => {
    onContainsChange(localContains)
    onSelectionChange(new Set(draftSelected))
    committedRef.current = true
    setOpen(false)
    onOpenChange?.(false)
  }

  const handleContainsChange = (value: string) => {
    setLocalContains(value)
    onContainsChange(value)
  }

  const visibleValues = useMemo(() => {
    const findQuery = findValues.trim().toLowerCase()
    const sorted = [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    if (!findQuery) return sorted
    return sorted.filter((value) => value.toLowerCase().includes(findQuery))
  }, [values, findValues])

  const toggleValue = (value: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const selectAllVisible = () => {
    setDraftSelected((prev) => {
      const next = new Set(prev)
      visibleValues.forEach((value) => next.add(value))
      return next
    })
  }

  const clearVisible = () => {
    setDraftSelected((prev) => {
      const next = new Set(prev)
      visibleValues.forEach((value) => next.delete(value))
      return next
    })
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange} modal>
      <div className={`relative inline-flex items-center gap-1 ${align === "right" ? "justify-end" : ""}`}>
        <span>{columnLabel}</span>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Filter ${columnLabel}`}
            aria-expanded={open}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={`rounded p-0.5 transition-colors ${
              active || open ? "bg-violet-100 text-violet-700" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            }`}
          >
            <ListFilter className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        {...{ [EXCEL_COLUMN_FILTER_POPOVER_ATTR]: "true" }}
        align={align === "right" ? "end" : "start"}
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="z-[100] w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      >
        <p className="mb-3 text-sm font-semibold text-slate-800">{columnLabel}</p>

        <Input
          value={localContains}
          onChange={(e) => handleContainsChange(e.target.value)}
          placeholder="Contains..."
          className="mb-3 h-8 text-sm"
        />

        <Input
          value={findValues}
          onChange={(e) => setFindValues(e.target.value)}
          placeholder="Find values..."
          className="mb-2 h-8 text-sm"
        />

        <div className="mb-2 flex items-center justify-between text-xs">
          <button type="button" className="font-medium text-brand-blue hover:underline" onClick={selectAllVisible}>
            Select all
          </button>
          <button type="button" className="font-medium text-brand-blue hover:underline" onClick={clearVisible}>
            Clear
          </button>
        </div>

        <div className="max-h-44 space-y-1 overflow-y-auto overscroll-contain border-t border-slate-100 pt-2">
          {visibleValues.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No values found</p>
          ) : (
            visibleValues.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={draftSelected.has(value)}
                  onChange={() => toggleValue(value)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                <span className="truncate text-slate-700">{value || "(Blank)"}</span>
              </label>
            ))
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 border-slate-200 px-3 text-xs"
            onClick={closeMenu}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" className="h-8 bg-slate-900 px-4 text-white hover:bg-slate-800" onClick={applyAndClose}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
