"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { getProductsToPurchase } from "@/app/actions/sale-actions"
import {
  Loader2,
  Package,
  Search,
  X,
  RotateCcw,
  Printer,
  Download,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  PackageCheck,
  Truck,
  Clock,
  Ban,
  ListFilter,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import PurchaseManagerKpiCards from "@/components/purchase-manager/purchase-manager-kpi-cards"
import {
  EXCEL_COLUMN_FILTER_POPOVER_ATTR,
  createEmptyColumnFilter,
  isColumnFilterActive,
  passesColumnFilter,
  type ExcelColumnFilterValue,
} from "@/components/sales/excel-column-filter"
import { useAppSelector } from "@/store/hooks"
import { selectDeviceId } from "@/store/slices/deviceSlice"
import { cn } from "@/lib/utils"

interface ProductsToPurchaseTabProps {
  deviceId: number
  globalDateRange?: { from?: string; to?: string }
}

type ColumnKey =
  | "productName"
  | "sku"
  | "status"
  | "requiredQty"
  | "currentStock"

type ColumnFilters = Record<ColumnKey, ExcelColumnFilterValue>

type ItemActionStatus = "redeemed" | "order" | "postponed" | "reject"

const COLUMN_KEYS: ColumnKey[] = [
  "productName",
  "sku",
  "status",
  "requiredQty",
  "currentStock",
]

const getRowKey = (p: any) => `${p.product_id}-${p.product_variant_id || "base"}`

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-200">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="grid grid-cols-8 gap-4 px-5 py-3 items-center">
          <Skeleton className="h-4 w-4 mx-auto" />
          <Skeleton className="h-4 w-6 mx-auto" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-28 mx-auto" />
        </div>
      ))}
    </div>
  )
}

interface ColumnFilterHeaderProps {
  columnLabel: string
  values: string[]
  filter: ExcelColumnFilterValue
  onSelectionChange: (selected: Set<string>) => void
  align?: "left" | "right"
}

function ColumnFilterHeader({
  columnLabel,
  values,
  filter,
  onSelectionChange,
  align = "left",
}: ColumnFilterHeaderProps) {
  const [open, setOpen] = useState(false)
  const [draftSelected, setDraftSelected] = useState<Set<string>>(new Set(filter.selected))

  const active = isColumnFilterActive(filter, values)

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setDraftSelected(new Set(filter.selected))
    }
    setOpen(nextOpen)
  }

  const closeMenu = () => {
    setOpen(false)
  }

  const applyAndClose = () => {
    onSelectionChange(new Set(draftSelected))
    setOpen(false)
  }

  const sortedValues = useMemo(() => {
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [values])

  const toggleValue = (value: string) => {
    setDraftSelected((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  const selectAll = () => {
    setDraftSelected(new Set(sortedValues))
  }

  const clearAll = () => {
    setDraftSelected(new Set())
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
            className={`rounded p-0.5 transition-colors cursor-pointer ${active || open
                ? "bg-violet-100 text-violet-700"
                : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
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
        className="z-[100] w-60 rounded-lg border border-slate-200 bg-white p-3 shadow-lg"
      >
        <p className="mb-2 text-sm font-semibold text-slate-800">{columnLabel}</p>

        <div className="mb-2 flex items-center justify-between text-xs border-b border-slate-100 pb-2">
          <button
            type="button"
            className="font-medium text-violet-600 hover:text-violet-800 hover:underline cursor-pointer"
            onClick={selectAll}
          >
            Select all
          </button>
          <button
            type="button"
            className="font-medium text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
            onClick={clearAll}
          >
            Clear
          </button>
        </div>

        <div className="max-h-48 space-y-1 overflow-y-auto overscroll-contain">
          {sortedValues.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">No values found</p>
          ) : (
            sortedValues.map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-slate-50 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={draftSelected.has(value)}
                  onChange={() => toggleValue(value)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <span className="truncate text-slate-700 font-medium">{value || "(Blank)"}</span>
              </label>
            ))
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 border-slate-200 px-2.5 text-xs text-slate-600 hover:bg-slate-50 cursor-pointer"
            onClick={closeMenu}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 bg-violet-600 px-3 text-xs text-white hover:bg-violet-700 cursor-pointer"
            onClick={applyAndClose}
          >
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function ProductsToPurchaseTab({
  deviceId: propDeviceId,
  globalDateRange,
}: ProductsToPurchaseTabProps) {
  const reduxDeviceId = useAppSelector(selectDeviceId)
  const deviceId = propDeviceId || reduxDeviceId || 0

  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [stockFilter, setStockFilter] = useState<"all" | "out_of_stock" | "in_stock">("all")
  const [page, setPage] = useState(1)
  const pageSize = 25

  // 250ms search debounce matching sales page
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Checkbox selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  // 4 action states per row: redeem stock | ordered | postpone | rejected
  const [itemActions, setItemActions] = useState<Record<string, ItemActionStatus>>({})

  // Track the order in which items were redeemed (most recent at the end of table)
  const [redeemedOrder, setRedeemedOrder] = useState<string[]>([])

  const { toast } = useToast()

  const fetchProducts = useCallback(async () => {
    if (!deviceId) return
    setLoading(true)
    try {
      const res = await getProductsToPurchase(deviceId, {
        dateFrom: globalDateRange?.from,
        dateTo: globalDateRange?.to,
      })
      if (res.success && res.data) {
        setProducts(res.data)
      } else {
        toast({
          title: "Error",
          description: res.message || "Failed to load products to purchase",
          variant: "destructive",
        })
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [deviceId, globalDateRange, toast])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  // Getters for column filters
  const valueGetters = useMemo(
    () => ({
      productName: (p: any) => p.product_name || "—",
      sku: (p: any) => p.variant_sku || "—",
      status: (p: any) => {
        const required = Number(p.required_quantity) || 0
        const current = Number(p.current_stock) || 0
        return current < required || current <= 0 ? "Out of Stock" : "In Stock"
      },
      requiredQty: (p: any) => String(Number(p.required_quantity) || 0),
      currentStock: (p: any) => String(Number(p.current_stock) || 0),
    }),
    [],
  )

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() => {
    const initial = {} as ColumnFilters
    COLUMN_KEYS.forEach((k) => {
      initial[k] = createEmptyColumnFilter()
    })
    return initial
  })

  const uniqueValues = useMemo(() => {
    const values = {} as Record<ColumnKey, string[]>
    COLUMN_KEYS.forEach((k) => {
      values[k] = [...new Set(products.map(valueGetters[k]))]
    })
    return values
  }, [products, valueGetters])

  const activeFilterCount = useMemo(() => {
    return COLUMN_KEYS.filter((k) =>
      isColumnFilterActive(columnFilters[k], uniqueValues[k] || []),
    ).length
  }, [columnFilters, uniqueValues])

  const clearAllFilters = () => {
    const next = {} as ColumnFilters
    COLUMN_KEYS.forEach((k) => {
      next[k] = createEmptyColumnFilter()
    })
    setColumnFilters(next)
    setStockFilter("all")
    setSearchTerm("")
    setPage(1)
  }

  // Summary counts
  const { outOfStockCount, inStockCount } = useMemo(() => {
    let outCount = 0
    let inCount = 0
    for (const p of products) {
      const req = Number(p.required_quantity) || 0
      const cur = Number(p.current_stock) || 0
      if (cur < req || cur <= 0) {
        outCount++
      } else {
        inCount++
      }
    }
    return { outOfStockCount: outCount, inStockCount: inCount }
  }, [products])

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const required = Number(p.required_quantity) || 0
      const current = Number(p.current_stock) || 0
      const isOutOfStock = current < required || current <= 0

      // Stock status quick filter
      if (stockFilter === "out_of_stock" && !isOutOfStock) return false
      if (stockFilter === "in_stock" && isOutOfStock) return false

      // Global search term with debounce
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.toLowerCase().trim()
        const matchesSearch =
          (p.product_name || "").toLowerCase().includes(s) ||
          (p.variant_sku || "").toLowerCase().includes(s) ||
          (p.variant_name || "").toLowerCase().includes(s) ||
          String(p.product_id || "").includes(s)
        if (!matchesSearch) return false
      }

      // Column filters
      for (const key of COLUMN_KEYS) {
        const filter = columnFilters[key]
        const allVals = uniqueValues[key] || []
        const cellVal = valueGetters[key](p)
        if (!passesColumnFilter(cellVal, filter, allVals)) {
          return false
        }
      }

      return true
    })
  }, [products, stockFilter, debouncedSearch, columnFilters, uniqueValues, valueGetters])

  // Sort products: unredeemed first (out of stock first, then alphabetically),
  // then redeemed products at the very bottom in the order they were redeemed.
  const sortedProducts = useMemo(() => {
    const unredeemed: any[] = []
    const redeemed: any[] = []

    for (const p of filteredProducts) {
      const key = getRowKey(p)
      if (itemActions[key] === "redeemed") {
        redeemed.push(p)
      } else {
        unredeemed.push(p)
      }
    }

    unredeemed.sort((a, b) => {
      const aReq = Number(a.required_quantity) || 0
      const aCur = Number(a.current_stock) || 0
      const aOut = aCur < aReq || aCur <= 0

      const bReq = Number(b.required_quantity) || 0
      const bCur = Number(b.current_stock) || 0
      const bOut = bCur < bReq || bCur <= 0

      if (aOut && !bOut) return -1
      if (!aOut && bOut) return 1
      return (a.product_name || "").localeCompare(b.product_name || "")
    })

    redeemed.sort((a, b) => {
      const aKey = getRowKey(a)
      const bKey = getRowKey(b)
      const aIdx = redeemedOrder.indexOf(aKey)
      const bIdx = redeemedOrder.indexOf(bKey)
      const safeAIdx = aIdx === -1 ? 0 : aIdx
      const safeBIdx = bIdx === -1 ? 0 : bIdx
      return safeAIdx - safeBIdx
    })

    return [...unredeemed, ...redeemed]
  }, [filteredProducts, itemActions, redeemedOrder])

  // Paginated products
  const displayProducts = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedProducts.slice(start, start + pageSize)
  }, [sortedProducts, page, pageSize])

  const totalPages = Math.ceil(sortedProducts.length / pageSize)

  // Row selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const keysOnPage = displayProducts.map(getRowKey)
      setSelectedRowKeys(keysOnPage)
    } else {
      setSelectedRowKeys([])
    }
  }

  const handleToggleSelectRow = (key: string) => {
    setSelectedRowKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    )
  }

  // Handle row actions (Redeem stock, Ordered, Postpone, Rejected)
  const handleAction = (
    rowKey: string,
    action: ItemActionStatus,
    productName: string,
    isOutOfStock?: boolean,
  ) => {
    if (action === "redeemed" && isOutOfStock) {
      toast({
        title: "Cannot Redeem",
        description: `${productName} is out of stock. Stock must be ordered.`,
        variant: "destructive",
      })
      return
    }

    const current = itemActions[rowKey]
    const next = current === action ? undefined : action

    setItemActions((prev) => {
      const updated = { ...prev }
      if (next) {
        updated[rowKey] = next
      } else {
        delete updated[rowKey]
      }
      return updated
    })

    if (next === "redeemed") {
      setRedeemedOrder((prev) => [...prev.filter((k) => k !== rowKey), rowKey])
    } else {
      setRedeemedOrder((prev) => prev.filter((k) => k !== rowKey))
    }

    const actionLabels: Record<ItemActionStatus, string> = {
      redeemed: "Redeemed Stock",
      order: "Order",
      postponed: "Postponed",
      reject: "Reject",
    }

    if (next) {
      toast({
        title: actionLabels[next],
        description: `${productName}: ${actionLabels[next]}`,
      })
    } else {
      toast({
        title: "Action Cleared",
        description: `${productName}: Action cleared`,
      })
    }
  }

  // Handle bulk action
  const handleBulkAction = (action: ItemActionStatus) => {
    if (selectedRowKeys.length === 0) return
    let skippedOutOfStock = 0
    const newlyRedeemed: string[] = []

    setItemActions((prev) => {
      const updated = { ...prev }
      selectedRowKeys.forEach((key) => {
        if (action === "redeemed") {
          const prod = products.find((p) => getRowKey(p) === key)
          if (prod) {
            const req = Number(prod.required_quantity) || 0
            const cur = Number(prod.current_stock) || 0
            if (cur < req || cur <= 0) {
              skippedOutOfStock++
              return
            }
          }
          newlyRedeemed.push(key)
        }
        updated[key] = action
      })
      return updated
    })

    if (action === "redeemed") {
      setRedeemedOrder((prev) => {
        const remaining = prev.filter((k) => !newlyRedeemed.includes(k))
        return [...remaining, ...newlyRedeemed]
      })
    } else {
      setRedeemedOrder((prev) => prev.filter((k) => !selectedRowKeys.includes(k)))
    }

    const actionLabels: Record<ItemActionStatus, string> = {
      redeemed: "Redeemed Stock",
      order: "Order",
      postponed: "Postponed",
      reject: "Reject",
    }

    if (action === "redeemed" && skippedOutOfStock > 0) {
      toast({
        title: "Bulk Action Applied",
        description: `${selectedRowKeys.length - skippedOutOfStock} items redeemed (${skippedOutOfStock} out of stock items skipped)`,
      })
    } else {
      toast({
        title: "Bulk Action Applied",
        description: `${selectedRowKeys.length} items: ${actionLabels[action]}`,
      })
    }
  }

  const handleExportExcel = () => {
    if (filteredProducts.length === 0) {
      toast({ title: "No data", description: "No products to export" })
      return
    }
    const headers = [
      "Product Name",
      "Variant",
      "SKU",
      "Status",
      "Required Qty",
      "Current Stock",
      "Action Status",
    ]
    const rows = filteredProducts.map((p, idx) => {
      const required = Number(p.required_quantity) || 0
      const current = Number(p.current_stock) || 0
      const isOutOfStock = current < required || current <= 0
      const statusText = isOutOfStock ? "Out of Stock" : "In Stock"
      const rowKey = getRowKey(p)
      const actionStatus = itemActions[rowKey] || "Pending"

      return [
        `"${(p.product_name || "").replace(/"/g, '""')}"`,
        `"${(p.variant_name || "").replace(/"/g, '""')}"`,
        `"${(p.variant_sku || "").replace(/"/g, '""')}"`,
        `"${statusText}"`,
        required,
        current,
        `"${actionStatus}"`,
      ].join(",")
    })
    const csvContent = [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.setAttribute("href", url)
    link.setAttribute(
      "download",
      `Products_To_Purchase_${new Date().toISOString().split("T")[0]}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    toast({
      title: "Exported",
      description: "Products list downloaded successfully as CSV",
    })
  }

  const handlePrint = () => {
    window.print()
  }

  const headerCell = (
    key: ColumnKey,
    label: string,
    align: "left" | "right" = "left",
    className: string = "",
  ) => (
    <th
      className={`whitespace-nowrap px-5 py-3 ${align === "right" ? "text-right" : "text-left"
        } ${className}`}
    >
      <ColumnFilterHeader
        columnLabel={label}
        values={uniqueValues[key] || []}
        filter={columnFilters[key] ?? createEmptyColumnFilter()}
        onSelectionChange={(selected) => {
          setColumnFilters((prev) => ({
            ...prev,
            [key]: { ...prev[key], selected },
          }))
          setPage(1)
        }}
        align={align}
      />
    </th>
  )

  const isAllPageSelected =
    displayProducts.length > 0 &&
    displayProducts.every((p) => selectedRowKeys.includes(getRowKey(p)))

  return (
    <div className="space-y-4">
      {/* TOP HEADER TITLE */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Products to Purchase</h2>
      </div>

      {/* KPI CARDS */}
      <PurchaseManagerKpiCards
        deviceId={deviceId}
        globalDateRange={globalDateRange}
      />

      {/* QUICK STATUS FILTER TABS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setStockFilter("all")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0",
              stockFilter === "all"
                ? "bg-white text-slate-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            All Products ({products.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setStockFilter("out_of_stock")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5",
              stockFilter === "out_of_stock"
                ? "bg-white text-rose-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
            Out of Stock ({outOfStockCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setStockFilter("in_stock")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0",
              stockFilter === "in_stock"
                ? "bg-white text-emerald-900 shadow-2xs font-extrabold"
                : "text-slate-600 hover:text-slate-900",
            )}
          >
            In Stock ({inStockCount})
          </button>
        </div>

        <div className="text-xs font-medium text-slate-500 hidden sm:block">
          Order Shortage & Stock Replenishment
        </div>
      </div>

      {/* BULK SELECTION TOOLBAR */}
      {selectedRowKeys.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-300 bg-violet-50 p-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-violet-900">
              {selectedRowKeys.length}{" "}
              {selectedRowKeys.length === 1 ? "product" : "products"} selected
            </span>
            <button
              type="button"
              onClick={() => setSelectedRowKeys([])}
              className="text-xs font-semibold text-violet-700 hover:text-violet-950 underline ml-1 cursor-pointer"
            >
              Clear selection
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 bg-white border-emerald-300 hover:bg-emerald-50 text-emerald-800"
              onClick={() => handleBulkAction("redeemed")}
            >
              <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
              Redeem Stock
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 bg-white border-blue-300 hover:bg-blue-50 text-blue-800"
              onClick={() => handleBulkAction("order")}
            >
              <Truck className="h-3.5 w-3.5 text-blue-600" />
              Order
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 bg-white border-amber-300 hover:bg-amber-50 text-amber-800"
              onClick={() => handleBulkAction("postponed")}
            >
              <Clock className="h-3.5 w-3.5 text-amber-600" />
              Postpone
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 bg-white border-rose-300 hover:bg-rose-50 text-rose-800"
              onClick={() => handleBulkAction("reject")}
            >
              <Ban className="h-3.5 w-3.5 text-rose-600" />
              Reject
            </Button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT CONTAINER */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
        {/* HEADER CONTROLS BAR */}
        <div className="flex flex-col gap-2.5 border-b border-slate-200 bg-[#F1F4F9] p-3 sm:px-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            {/* SEARCH INPUT */}
            <div className="relative w-full sm:w-72 min-w-0">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
                placeholder="Search products, SKU, variant..."
                aria-label="Global product search"
                className="h-8 w-full rounded-lg border border-slate-200 bg-white py-1 pl-8 pr-7 text-xs outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm("")
                    setPage(1)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>

            {outOfStockCount > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800">
                <span className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                {outOfStockCount} Out of Stock Item{outOfStockCount === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {/* ACTION BUTTONS ROW */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/60">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">
                Showing {displayProducts.length > 0 ? (page - 1) * pageSize + 1 : 0}–
                {Math.min(page * pageSize, sortedProducts.length)} of {sortedProducts.length}{" "}
                {sortedProducts.length === 1 ? "product" : "products"}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={fetchProducts}
                disabled={loading}
                title="Refresh products list"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={handlePrint}
                disabled={loading || sortedProducts.length === 0}
                title="Print Products to Purchase List"
              >
                <Printer className="h-3.5 w-3.5 text-slate-600" />
                <span>Print</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 px-2.5 text-xs font-medium bg-white hover:bg-slate-50 border-slate-200 text-slate-700 shadow-2xs"
                onClick={handleExportExcel}
                disabled={loading || sortedProducts.length === 0}
                title="Export to CSV / Excel"
              >
                <Download className="h-3.5 w-3.5 text-emerald-600" />
                <span>Excel</span>
              </Button>

              {activeFilterCount > 0 || stockFilter !== "all" ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800"
                >
                  Clear Filters
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* DATA CONTAINER: DESKTOP TABLE & MOBILE CARDS */}
        <div className="relative min-w-0">
          {loading && (
            <div className="absolute inset-0 bg-white/60 z-30 flex items-center justify-center backdrop-blur-[1px]">
              <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg border border-slate-200 shadow-md text-xs font-semibold text-slate-700">
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" /> Loading products...
              </div>
            </div>
          )}

          {/* DESKTOP TABLE VIEW (>= 1024px) */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-[#F1F4F9] text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  {/* 1. CHECKBOX */}
                  <th className="whitespace-nowrap px-3 py-3 text-center w-12">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-600 cursor-pointer"
                      checked={isAllPageSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      title="Select all products on this page"
                    />
                  </th>

                  {/* 2. NUMBER */}
                  <th className="whitespace-nowrap px-3 py-3 text-xs font-bold text-slate-600 text-center w-14">
                    #
                  </th>

                  {/* 3. PRODUCT NAME */}
                  {headerCell("productName", "Product Name", "left", "w-[26%] min-w-[200px] max-w-[320px]")}

                  {/* 4. SKU/CODE */}
                  {headerCell("sku", "SKU / Code", "left", "w-[14%] min-w-[130px] whitespace-nowrap")}

                  {/* 5. STATUS */}
                  {headerCell("status", "Status", "left", "w-[15%] min-w-[130px] whitespace-nowrap")}

                  {/* 6. REQUIRED QUANTITY */}
                  {headerCell("requiredQty", "Required Quantity", "left", "w-[15%] min-w-[140px] whitespace-nowrap")}

                  {/* 7. CURRENT STOCK */}
                  {headerCell("currentStock", "Current Stock", "left", "w-[14%] min-w-[130px] whitespace-nowrap")}

                  {/* 8. ACTIONS */}
                  <th className="whitespace-nowrap px-5 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600 w-[16%] min-w-[170px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
                {loading && products.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <TableSkeleton />
                    </td>
                  </tr>
                ) : sortedProducts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300 mb-2" />
                        {searchTerm || stockFilter !== "all" || activeFilterCount > 0
                          ? "No products match the selected filters"
                          : "No products found for the selected period"}
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayProducts.map((p, index) => {
                    const required = Number(p.required_quantity) || 0
                    const current = Number(p.current_stock) || 0
                    const isOutOfStock = current < required || current <= 0
                    const rowKey = getRowKey(p)
                    const isSelected = selectedRowKeys.includes(rowKey)
                    const activeAction = itemActions[rowKey]

                    let baseBgClass =
                      index % 2 === 0
                        ? "bg-white hover:bg-violet-50 text-slate-800"
                        : "bg-slate-50 hover:bg-violet-50 text-slate-800"
                    let borderLeftClass = ""

                    if (activeAction === "redeemed") {
                      baseBgClass = "bg-emerald-100 text-emerald-950 hover:bg-emerald-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-emerald-500"
                    } else if (isOutOfStock) {
                      baseBgClass = "bg-rose-100 text-rose-950 hover:bg-rose-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-rose-500"
                    }

                    return (
                      <tr
                        key={rowKey}
                        onClick={() => handleToggleSelectRow(rowKey)}
                        className={`group cursor-pointer border-b border-slate-200 transition-colors ${baseBgClass} ${borderLeftClass} ${isSelected ? "bg-violet-100/80" : ""
                          }`}
                      >
                        {/* 1. CHECKBOX */}
                        <td
                          className="whitespace-nowrap px-3 py-3 text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-600 cursor-pointer"
                            checked={isSelected}
                            onChange={() => handleToggleSelectRow(rowKey)}
                          />
                        </td>

                        {/* 2. NUMBER */}
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground text-center">
                          {(page - 1) * pageSize + index + 1}
                        </td>

                        {/* 3. PRODUCT NAME */}
                        <td className="px-5 py-3 font-semibold text-slate-800 max-w-[320px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-900 leading-snug">
                              {p.product_name}
                            </span>
                            {p.variant_name && p.variant_name.toLowerCase() !== "default" && (
                              <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 border border-slate-200 w-fit">
                                Variant: {p.variant_name}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 4. SKU/CODE */}
                        <td className="whitespace-nowrap px-5 py-3">
                          {p.variant_sku ? (
                            <span className="font-mono text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {p.variant_sku}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-xs">—</span>
                          )}
                        </td>

                        {/* 5. STATUS (ONLY IN STOCK OR OUT OF STOCK, NO QUANTITY) */}
                        <td className="whitespace-nowrap px-5 py-3">
                          {isOutOfStock ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-300 bg-rose-100 px-2.5 py-0.5 text-[11px] font-semibold text-rose-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                              Out of Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              In Stock
                            </span>
                          )}
                        </td>

                        {/* 6. REQUIRED QUANTITY */}
                        <td className="whitespace-nowrap px-5 py-3 text-left font-bold text-rose-600">
                          {required}
                        </td>

                        {/* 7. CURRENT STOCK */}
                        <td className="whitespace-nowrap px-5 py-3 text-left font-medium text-slate-700">
                          {current}
                        </td>

                        {/* 8. ACTIONS: 4 ICONS (1. Redeem stock, 2. Order, 3. Postpone, 4. Reject) */}
                        <td
                          className="whitespace-nowrap px-5 py-3 text-center bg-inherit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            {/* 1. Redeem Stock */}
                            <button
                              type="button"
                              disabled={isOutOfStock}
                              onClick={() => handleAction(rowKey, "redeemed", p.product_name, isOutOfStock)}
                              title={isOutOfStock ? "Cannot redeem: Out of stock" : "Redeem Stock"}
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center transition-all border",
                                activeAction === "redeemed"
                                  ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-300 shadow-xs"
                                  : "bg-white text-emerald-700 border-slate-200 hover:bg-emerald-50 hover:border-emerald-300",
                                isOutOfStock
                                  ? "opacity-40 cursor-not-allowed hover:bg-white hover:border-slate-200"
                                  : "cursor-pointer",
                              )}
                            >
                              <PackageCheck className="h-3.5 w-3.5" />
                            </button>

                            {/* 2. Order */}
                            <button
                              type="button"
                              onClick={() => handleAction(rowKey, "order", p.product_name)}
                              title="Order"
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                                activeAction === "order"
                                  ? "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 shadow-xs"
                                  : "bg-white text-blue-700 border-slate-200 hover:bg-blue-50 hover:border-blue-300",
                              )}
                            >
                              <Truck className="h-3.5 w-3.5" />
                            </button>

                            {/* 3. Postpone */}
                            <button
                              type="button"
                              onClick={() => handleAction(rowKey, "postponed", p.product_name)}
                              title="Postpone"
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                                activeAction === "postponed"
                                  ? "bg-amber-600 text-white border-amber-700 ring-2 ring-amber-300 shadow-xs"
                                  : "bg-white text-amber-700 border-slate-200 hover:bg-amber-50 hover:border-amber-300",
                              )}
                            >
                              <Clock className="h-3.5 w-3.5" />
                            </button>

                            {/* 4. Reject */}
                            <button
                              type="button"
                              onClick={() => handleAction(rowKey, "reject", p.product_name)}
                              title="Reject"
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                                activeAction === "reject"
                                  ? "bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300 shadow-xs"
                                  : "bg-white text-rose-700 border-slate-200 hover:bg-rose-50 hover:border-rose-300",
                              )}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* MOBILE CARDS VIEW (< 1024px) */}
          <div className="block lg:hidden divide-y divide-slate-200 bg-slate-50/50">
            {loading && products.length === 0 ? (
              <div className="p-4">
                <TableSkeleton />
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 bg-white">
                <Package className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                No products found
              </div>
            ) : (
              displayProducts.map((p, index) => {
                const required = Number(p.required_quantity) || 0
                const current = Number(p.current_stock) || 0
                const isOutOfStock = current < required || current <= 0
                const rowKey = getRowKey(p)
                const isSelected = selectedRowKeys.includes(rowKey)
                const activeAction = itemActions[rowKey]
                const isEven = index % 2 === 0

                let cardAccentClass = ""
                if (activeAction === "redeemed") {
                  cardAccentClass = "border-l-4 border-l-emerald-500 bg-emerald-100 text-emerald-950"
                } else if (isOutOfStock) {
                  cardAccentClass = "border-l-4 border-l-rose-500 bg-rose-100 text-rose-950"
                }

                return (
                  <div
                    key={rowKey}
                    className={`p-3.5 bg-white transition-colors space-y-2.5 ${
                      isEven ? "" : "bg-slate-50/60"
                    } ${cardAccentClass} ${isSelected ? "bg-violet-100/70" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 min-w-0">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-600 cursor-pointer"
                          checked={isSelected}
                          onChange={() => handleToggleSelectRow(rowKey)}
                        />
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-sm truncate">
                            {p.product_name}
                          </h4>
                          {p.variant_name && p.variant_name.toLowerCase() !== "default" && (
                            <span className="text-xs text-slate-500 block">
                              Variant: {p.variant_name}
                            </span>
                          )}
                          {p.variant_sku && (
                            <span className="text-[11px] font-mono text-slate-400 block mt-0.5">
                              SKU: {p.variant_sku}
                            </span>
                          )}
                        </div>
                      </div>
                      {isOutOfStock ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-800 shrink-0">
                          Out of Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-800 shrink-0">
                          In Stock
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200 text-center text-xs">
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">
                          Required Qty
                        </span>
                        <span className="font-bold text-rose-600">{required}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block uppercase">
                          Current Stock
                        </span>
                        <span className="font-bold text-slate-800">{current}</span>
                      </div>
                    </div>

                    {/* 4 Action Icons in mobile */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                      <span className="text-[11px] text-slate-400 font-medium">
                        Actions:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={isOutOfStock}
                          onClick={() => handleAction(rowKey, "redeemed", p.product_name, isOutOfStock)}
                          title={isOutOfStock ? "Cannot redeem: Out of stock" : "Redeem Stock"}
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center transition-all border",
                            activeAction === "redeemed"
                              ? "bg-emerald-600 text-white border-emerald-700"
                              : "bg-white text-emerald-700 border-slate-200 hover:bg-emerald-50",
                            isOutOfStock
                              ? "opacity-40 cursor-not-allowed hover:bg-white hover:border-slate-200"
                              : "cursor-pointer",
                          )}
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(rowKey, "order", p.product_name)}
                          title="Order"
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                            activeAction === "order"
                              ? "bg-blue-600 text-white border-blue-700"
                              : "bg-white text-blue-700 border-slate-200 hover:bg-blue-50",
                          )}
                        >
                          <Truck className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(rowKey, "postponed", p.product_name)}
                          title="Postpone"
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                            activeAction === "postponed"
                              ? "bg-amber-600 text-white border-amber-700"
                              : "bg-white text-amber-700 border-slate-200 hover:bg-amber-50",
                          )}
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(rowKey, "reject", p.product_name)}
                          title="Reject"
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                            activeAction === "reject"
                              ? "bg-rose-600 text-white border-rose-700"
                              : "bg-white text-rose-700 border-slate-200 hover:bg-rose-50",
                          )}
                        >
                          <Ban className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-[#F1F4F9] px-4 py-3 text-xs font-medium text-slate-600">
          <div>
            Showing {displayProducts.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
            {Math.min(page * pageSize, sortedProducts.length)} of {sortedProducts.length} products
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs bg-white border-slate-200"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5 mr-1" />
              Previous
            </Button>
            <span className="px-2 text-slate-700 font-semibold">
              Page {page} of {totalPages || 1}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs bg-white border-slate-200"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
