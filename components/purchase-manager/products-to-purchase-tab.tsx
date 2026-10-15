"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
  getProductsToPurchase,
  saveProductPurchaseAction,
  saveProductPurchaseActionsBulk,
} from "@/app/actions/sale-actions"
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
  ArrowLeft,
  ArrowRight,
  Save,
  FileText,
  ShoppingCart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/use-toast"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import PurchaseManagerKpiCards from "@/components/purchase-manager/purchase-manager-kpi-cards"
import {
  EXCEL_COLUMN_FILTER_POPOVER_ATTR,
  createEmptyColumnFilter,
  isColumnFilterActive,
  passesColumnFilter,
  type ExcelColumnFilterValue,
} from "@/components/sales/excel-column-filter"
import { useAppSelector } from "@/store/hooks"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import { selectCurrency } from "@/store/slices/purchaseSlice"
import { selectActiveStaff } from "@/store/slices/staffSlice"
import { createPurchaseActionNotification } from "@/app/actions/notification-actions"
import { getCurrencySymbol } from "@/lib/currency-utils"
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
  const reduxCurrency = useAppSelector(selectCurrency) || useAppSelector(selectDeviceCurrency) || "INR"
  const currency = getCurrencySymbol(reduxCurrency)
  const activeStaff = useAppSelector(selectActiveStaff)

  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [activeTab, setActiveTab] = useState<"all" | "redeemed" | "order" | "postponed" | "reject">("all")
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

  const router = useRouter()
  const pathname = usePathname()

  // Checkbox selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([])

  // Instant hydration from localStorage on page load / refresh
  const [itemActions, setItemActions] = useState<Record<string, ItemActionStatus>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const raw = localStorage.getItem(`products_to_purchase_actions_${deviceId}`)
      if (raw) return JSON.parse(raw).itemActions || {}
    } catch (_) {}
    return {}
  })

  // Track the order in which items were ordered (placed just before / above redeemed products)
  const [orderedOrder, setOrderedOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(`products_to_purchase_actions_${deviceId}`)
      if (raw) return JSON.parse(raw).orderedOrder || []
    } catch (_) {}
    return []
  })

  // Track the order in which items were postponed (placed above ordered products)
  const [postponedOrder, setPostponedOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(`products_to_purchase_actions_${deviceId}`)
      if (raw) return JSON.parse(raw).postponedOrder || []
    } catch (_) {}
    return []
  })

  // Track the order in which items were rejected (placed below ordered products, above redeemed)
  const [rejectedOrder, setRejectedOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(`products_to_purchase_actions_${deviceId}`)
      if (raw) return JSON.parse(raw).rejectedOrder || []
    } catch (_) {}
    return []
  })

  // Track the order in which items were redeemed (most recent at the end of table)
  const [redeemedOrder, setRedeemedOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return []
    try {
      const raw = localStorage.getItem(`products_to_purchase_actions_${deviceId}`)
      if (raw) return JSON.parse(raw).redeemedOrder || []
    } catch (_) {}
    return []
  })

  // Store internal notes per row
  const [itemNotes, setItemNotes] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {}
    try {
      const raw = localStorage.getItem(`products_to_purchase_actions_${deviceId}`)
      if (raw) return JSON.parse(raw).itemNotes || {}
    } catch (_) {}
    return {}
  })

  // Synchronize state to localStorage on every update
  useEffect(() => {
    if (!deviceId || typeof window === "undefined") return
    try {
      localStorage.setItem(
        `products_to_purchase_actions_${deviceId}`,
        JSON.stringify({ itemActions, postponedOrder, orderedOrder, rejectedOrder, redeemedOrder, itemNotes }),
      )
    } catch (_) {}
  }, [deviceId, itemActions, postponedOrder, orderedOrder, rejectedOrder, redeemedOrder, itemNotes])

  // Internal note modal state for currently ordered product
  const [orderModalProduct, setOrderModalProduct] = useState<{
    product: any
    rowKey: string
  } | null>(null)
  const [internalNote, setInternalNote] = useState<string>("")

  // Reject modal state for currently rejected product
  const [rejectModalProduct, setRejectModalProduct] = useState<{
    product: any
    rowKey: string
    previousAction?: ItemActionStatus | null
  } | null>(null)
  const [rejectNote, setRejectNote] = useState<string>("")

  // Postpone modal state for currently postponed product
  const [postponeModalProduct, setPostponeModalProduct] = useState<{
    product: any
    rowKey: string
    previousAction?: ItemActionStatus | null
  } | null>(null)
  const [postponeNote, setPostponeNote] = useState<string>("")

  // Dedicated note viewer modal for clicking the note icon
  const [viewNoteModal, setViewNoteModal] = useState<{
    product: any
    rowKey: string
    note: string
  } | null>(null)

  // Bulk Proceed to Purchase modal state
  const [bulkOrderModalOpen, setBulkOrderModalOpen] = useState<boolean>(false)
  const [bulkInternalNote, setBulkInternalNote] = useState<string>("")

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

        // Restore saved actions from database so refresh / logout / login persists across sessions
        const dbActions: Record<string, ItemActionStatus> = {}
        const dbPostponed: { key: string; order: number }[] = []
        const dbOrdered: { key: string; order: number }[] = []
        const dbRejected: { key: string; order: number }[] = []
        const dbRedeemed: { key: string; order: number }[] = []
        const dbNotes: Record<string, string> = {}

        for (const p of res.data) {
          const key = getRowKey(p)
          if (p.saved_action) {
            dbActions[key] = p.saved_action as ItemActionStatus
            if (p.saved_action === "postponed") {
              dbPostponed.push({ key, order: Number(p.saved_action_order) || 0 })
            } else if (p.saved_action === "order") {
              dbOrdered.push({ key, order: Number(p.saved_action_order) || 0 })
            } else if (p.saved_action === "reject") {
              dbRejected.push({ key, order: Number(p.saved_action_order) || 0 })
            } else if (p.saved_action === "redeemed") {
              dbRedeemed.push({ key, order: Number(p.saved_action_order) || 0 })
            }
            if (p.saved_note) {
              dbNotes[key] = p.saved_note
            }
          }
        }

        dbPostponed.sort((a, b) => a.order - b.order)
        dbOrdered.sort((a, b) => a.order - b.order)
        dbRejected.sort((a, b) => a.order - b.order)
        dbRedeemed.sort((a, b) => a.order - b.order)

        setItemActions((prev) => ({ ...dbActions, ...prev }))
        setPostponedOrder((prev) => {
          const dbKeys = dbPostponed.map((o) => o.key)
          return [...new Set([...dbKeys, ...prev])]
        })
        setOrderedOrder((prev) => {
          const dbKeys = dbOrdered.map((o) => o.key)
          return [...new Set([...dbKeys, ...prev])]
        })
        setRejectedOrder((prev) => {
          const dbKeys = dbRejected.map((r) => r.key)
          return [...new Set([...dbKeys, ...prev])]
        })
        setRedeemedOrder((prev) => {
          const dbKeys = dbRedeemed.map((r) => r.key)
          return [...new Set([...dbKeys, ...prev])]
        })
        setItemNotes((prev) => ({ ...dbNotes, ...prev }))
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
    setActiveTab("all")
    setSearchTerm("")
    setPage(1)
  }

  // Summary counts for out of stock badge
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

  // Action tab counts
  const tabCounts = useMemo(() => {
    let redeemed = 0
    let order = 0
    let postponed = 0
    let reject = 0
    for (const p of products) {
      const key = getRowKey(p)
      const action = itemActions[key]
      if (action === "redeemed") redeemed++
      else if (action === "order") order++
      else if (action === "postponed") postponed++
      else if (action === "reject") reject++
    }
    return { redeemed, order, postponed, reject }
  }, [products, itemActions])

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const required = Number(p.required_quantity) || 0
      const current = Number(p.current_stock) || 0
      const isOutOfStock = current < required || current <= 0

      // Quick action tab filter: all, redeemed, order, postponed, reject
      if (activeTab !== "all") {
        const rowKey = getRowKey(p)
        const action = itemActions[rowKey]
        if (action !== activeTab) return false
      }

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
  }, [products, activeTab, itemActions, debouncedSearch, columnFilters, uniqueValues, valueGetters])

  // Sort products:
  // 1. Regular unhandled products (out of stock items first, then alphabetically)
  // 2. Postponed products (placed above ordered products)
  // 3. Ordered products (placed down the table, right before rejected products)
  // 4. Rejected products (placed below ordered products, above redeemed stock products)
  // 5. Redeemed stock products (at the very bottom of the table)
  const sortedProducts = useMemo(() => {
    const unhandled: any[] = []
    const postponed: any[] = []
    const ordered: any[] = []
    const rejected: any[] = []
    const redeemed: any[] = []

    for (const p of filteredProducts) {
      const key = getRowKey(p)
      const action = itemActions[key]
      if (action === "redeemed") {
        redeemed.push(p)
      } else if (action === "reject") {
        rejected.push(p)
      } else if (action === "order") {
        ordered.push(p)
      } else if (action === "postponed") {
        postponed.push(p)
      } else {
        unhandled.push(p)
      }
    }

    unhandled.sort((a, b) => {
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

    postponed.sort((a, b) => {
      const aKey = getRowKey(a)
      const bKey = getRowKey(b)
      const aIdx = postponedOrder.indexOf(aKey)
      const bIdx = postponedOrder.indexOf(bKey)
      const safeAIdx = aIdx === -1 ? 0 : aIdx
      const safeBIdx = bIdx === -1 ? 0 : bIdx
      return safeAIdx - safeBIdx
    })

    ordered.sort((a, b) => {
      const aKey = getRowKey(a)
      const bKey = getRowKey(b)
      const aIdx = orderedOrder.indexOf(aKey)
      const bIdx = orderedOrder.indexOf(bKey)
      const safeAIdx = aIdx === -1 ? 0 : aIdx
      const safeBIdx = bIdx === -1 ? 0 : bIdx
      return safeAIdx - safeBIdx
    })

    rejected.sort((a, b) => {
      const aKey = getRowKey(a)
      const bKey = getRowKey(b)
      const aIdx = rejectedOrder.indexOf(aKey)
      const bIdx = rejectedOrder.indexOf(bKey)
      const safeAIdx = aIdx === -1 ? 0 : aIdx
      const safeBIdx = bIdx === -1 ? 0 : bIdx
      return safeAIdx - safeBIdx
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

    return [...unhandled, ...postponed, ...ordered, ...rejected, ...redeemed]
  }, [filteredProducts, itemActions, postponedOrder, orderedOrder, rejectedOrder, redeemedOrder])

  // Paginated products
  const displayProducts = useMemo(() => {
    const start = (page - 1) * pageSize
    return sortedProducts.slice(start, start + pageSize)
  }, [sortedProducts, page, pageSize])

  const totalPages = Math.ceil(sortedProducts.length / pageSize)

  // All row keys across all pages matching the active filter & search
  const allFilteredKeys = useMemo(
    () => sortedProducts.map(getRowKey),
    [sortedProducts],
  )

  // Multi-page selection status: checked if every item across all pages is selected
  const isAllSelected =
    allFilteredKeys.length > 0 &&
    allFilteredKeys.every((k) => selectedRowKeys.includes(k))

  // Some selected but not all (for checkbox indeterminate visual indicator)
  const isSomeSelected =
    selectedRowKeys.length > 0 && !isAllSelected

  // Selected products full object list across all pages
  const selectedProducts = useMemo(() => {
    if (selectedRowKeys.length === 0) return []
    const keySet = new Set(selectedRowKeys)
    return sortedProducts.filter((p) => keySet.has(getRowKey(p)))
  }, [sortedProducts, selectedRowKeys])

  // Total required quantity for all selected products
  const bulkTotalQty = useMemo(() => {
    return selectedProducts.reduce(
      (sum, p) => sum + Math.max(1, Number(p.required_quantity) || 1),
      0,
    )
  }, [selectedProducts])

  // Estimated total cost for all selected products
  const bulkTotalEstCost = useMemo(() => {
    return selectedProducts.reduce((sum, p) => {
      const qty = Math.max(1, Number(p.required_quantity) || 1)
      const price = Number(
        (Number(p.unit_price) > 0 ? p.unit_price : null) ??
        (Number(p.variant_cost_price) > 0 ? p.variant_cost_price : null) ??
        (Number(p.variant_wholesale_price) > 0 ? p.variant_wholesale_price : null) ??
        (Number(p.product_wholesale_price) > 0 ? p.product_wholesale_price : null) ??
        (Number(p.variant_price) > 0 ? p.variant_price : null) ??
        (Number(p.product_price) > 0 ? p.product_price : null) ??
        0,
      )
      const tax = Math.max(0, Math.min(100, Number(p.tax_percentage) || 0))
      const base = qty * price
      return sum + base + base * (tax / 100)
    }, 0)
  }, [selectedProducts])

  // Row selection handlers: Select All selects all products across ALL pages
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRowKeys(allFilteredKeys)
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

    // Special handling for "order" action:
    if (action === "order") {
      if (current === "order") {
        // Toggle off order action
        setItemActions((prev) => {
          const updated = { ...prev }
          delete updated[rowKey]
          return updated
        })
        setOrderedOrder((prev) => prev.filter((k) => k !== rowKey))
        setItemNotes((prev) => {
          const updated = { ...prev }
          delete updated[rowKey]
          return updated
        })
        if (orderModalProduct?.rowKey === rowKey) {
          setOrderModalProduct(null)
          setInternalNote("")
        }
        if (deviceId) {
          saveProductPurchaseAction(deviceId, rowKey, null).catch(console.error)
        }
        toast({
          title: "Action Cleared",
          description: `${productName}: Order action cleared`,
        })
        return
      }

      // Mark as ordered, move down before redeemed products, and open internal note modal
      setItemActions((prev) => ({
        ...prev,
        [rowKey]: "order",
      }))
      setOrderedOrder((prev) => [...prev.filter((k) => k !== rowKey), rowKey])
      setPostponedOrder((prev) => prev.filter((k) => k !== rowKey))
      setRejectedOrder((prev) => prev.filter((k) => k !== rowKey))
      setRedeemedOrder((prev) => prev.filter((k) => k !== rowKey))

      if (deviceId) {
        saveProductPurchaseAction(deviceId, rowKey, "order", orderedOrder.length + 1, itemNotes[rowKey] || null).catch(console.error)
      }

      const prod = products.find((p) => getRowKey(p) === rowKey)
      if (prod) {
        setOrderModalProduct({ product: prod, rowKey })
        setInternalNote(itemNotes[rowKey] || "")
      }
      return
    }

    // Special handling for "reject" action:
    if (action === "reject") {
      if (current === "reject") {
        // Toggle off reject action
        setItemActions((prev) => {
          const updated = { ...prev }
          delete updated[rowKey]
          return updated
        })
        setRejectedOrder((prev) => prev.filter((k) => k !== rowKey))
        setItemNotes((prev) => {
          const updated = { ...prev }
          delete updated[rowKey]
          return updated
        })
        if (rejectModalProduct?.rowKey === rowKey) {
          setRejectModalProduct(null)
          setRejectNote("")
        }
        if (deviceId) {
          saveProductPurchaseAction(deviceId, rowKey, null).catch(console.error)
        }
        toast({
          title: "Action Cleared",
          description: `${productName}: Reject action cleared`,
        })
        return
      }

      // Open reject modal with internal note
      const prod = products.find((p) => getRowKey(p) === rowKey)
      if (prod) {
        setRejectModalProduct({ product: prod, rowKey, previousAction: current || null })
        setRejectNote(itemNotes[rowKey] || "")
      }
      return
    }

    // Special handling for "postponed" action:
    if (action === "postponed") {
      if (current === "postponed") {
        // Toggle off postpone action
        setItemActions((prev) => {
          const updated = { ...prev }
          delete updated[rowKey]
          return updated
        })
        setPostponedOrder((prev) => prev.filter((k) => k !== rowKey))
        setItemNotes((prev) => {
          const updated = { ...prev }
          delete updated[rowKey]
          return updated
        })
        if (postponeModalProduct?.rowKey === rowKey) {
          setPostponeModalProduct(null)
          setPostponeNote("")
        }
        if (deviceId) {
          saveProductPurchaseAction(deviceId, rowKey, null).catch(console.error)
        }
        toast({
          title: "Action Cleared",
          description: `${productName}: Postpone action cleared`,
        })
        return
      }

      // Open postpone modal with internal note
      const prod = products.find((p) => getRowKey(p) === rowKey)
      if (prod) {
        setPostponeModalProduct({ product: prod, rowKey, previousAction: current || null })
        setPostponeNote(itemNotes[rowKey] || "")
      }
      return
    }

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

    // If changing away from order, clean up order state
    setOrderedOrder((prev) => prev.filter((k) => k !== rowKey))
    if (orderModalProduct?.rowKey === rowKey) {
      setOrderModalProduct(null)
      setInternalNote("")
    }

    // Clean up reject state
    setRejectedOrder((prev) => prev.filter((k) => k !== rowKey))
    if (rejectModalProduct?.rowKey === rowKey) {
      setRejectModalProduct(null)
      setRejectNote("")
    }

    // Clean up postpone state
    setPostponedOrder((prev) => prev.filter((k) => k !== rowKey))
    if (postponeModalProduct?.rowKey === rowKey) {
      setPostponeModalProduct(null)
      setPostponeNote("")
    }

    if (next === "redeemed") {
      setRedeemedOrder((prev) => [...prev.filter((k) => k !== rowKey), rowKey])
    } else {
      setRedeemedOrder((prev) => prev.filter((k) => k !== rowKey))
    }

    if (deviceId) {
      const actionOrder = next === "redeemed" ? redeemedOrder.length + 1 : 0
      saveProductPurchaseAction(deviceId, rowKey, next || null, actionOrder, null).catch(console.error)
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

  // Revert reject action when clicking Back or clicking outside of reject modal
  const handleRejectModalBack = () => {
    if (!rejectModalProduct) return
    const { rowKey, product, previousAction } = rejectModalProduct

    // Revert the action so the product returns to its previous state (or unhandled)
    setItemActions((prev) => {
      const updated = { ...prev }
      if (previousAction) {
        updated[rowKey] = previousAction
      } else {
        delete updated[rowKey]
      }
      return updated
    })
    setRejectedOrder((prev) => prev.filter((k) => k !== rowKey))

    setRejectModalProduct(null)
    setRejectNote("")

    toast({
      title: "Action Cancelled",
      description: `${product.product_name || "Product"}: Rejection cancelled`,
    })
  }

  // Handle Save in reject modal:
  // Saves internal note, marks as rejected, places row below ordered products, above redeemed.
  const handleRejectModalSave = () => {
    if (!rejectModalProduct) return
    const { rowKey, product } = rejectModalProduct
    const trimmed = rejectNote.trim()
    if (!trimmed) return

    // Save as internal note
    setItemNotes((prev) => ({
      ...prev,
      [rowKey]: trimmed,
    }))

    // Update item action
    setItemActions((prev) => ({
      ...prev,
      [rowKey]: "reject",
    }))

    // Place below ordered products, above redeemed
    setRejectedOrder((prev) => [...prev.filter((k) => k !== rowKey), rowKey])
    setPostponedOrder((prev) => prev.filter((k) => k !== rowKey))
    setOrderedOrder((prev) => prev.filter((k) => k !== rowKey))
    setRedeemedOrder((prev) => prev.filter((k) => k !== rowKey))

    if (deviceId) {
      const nextOrder = rejectedOrder.includes(rowKey)
        ? rejectedOrder.indexOf(rowKey) + 1
        : rejectedOrder.length + 1
      saveProductPurchaseAction(deviceId, rowKey, "reject", nextOrder, trimmed).catch(console.error)

      createPurchaseActionNotification({
        deviceId,
        actionType: "reject",
        products: [
          {
            productId: Number(product.product_id),
            productName: product.product_name || "",
            variantName: product.variant_name,
            sku: product.variant_sku || product.product_barcode,
            requiredQty: Number(product.required_quantity) || 1,
            currentStock: Number(product.current_stock) || 0,
            price: Number(product.unit_price) || 0,
          },
        ],
        internalNote: trimmed || null,
        staffId: activeStaff?.id,
        staffName: activeStaff?.name,
      }).catch(console.error)
    }

    toast({
      title: "Product Rejected",
      description: `${product.product_name || "Product"}: Rejected and moved below ordered products`,
    })

    setRejectModalProduct(null)
    setRejectNote("")
  }

  // Revert postpone action when clicking Back or clicking outside of postpone modal
  const handlePostponeModalBack = () => {
    if (!postponeModalProduct) return
    const { rowKey, product, previousAction } = postponeModalProduct

    // Revert the action so the product returns to its previous state (or unhandled)
    setItemActions((prev) => {
      const updated = { ...prev }
      if (previousAction) {
        updated[rowKey] = previousAction
      } else {
        delete updated[rowKey]
      }
      return updated
    })
    setPostponedOrder((prev) => prev.filter((k) => k !== rowKey))

    setPostponeModalProduct(null)
    setPostponeNote("")

    toast({
      title: "Action Cancelled",
      description: `${product.product_name || "Product"}: Postpone cancelled`,
    })
  }

  // Handle Save in postpone modal:
  // Saves internal note, marks as postponed, places row above ordered products.
  const handlePostponeModalSave = () => {
    if (!postponeModalProduct) return
    const { rowKey, product } = postponeModalProduct
    const trimmed = postponeNote.trim()
    if (!trimmed) return

    // Save as internal note
    setItemNotes((prev) => ({
      ...prev,
      [rowKey]: trimmed,
    }))

    // Update item action
    setItemActions((prev) => ({
      ...prev,
      [rowKey]: "postponed",
    }))

    // Place above ordered products
    setPostponedOrder((prev) => [...prev.filter((k) => k !== rowKey), rowKey])
    setOrderedOrder((prev) => prev.filter((k) => k !== rowKey))
    setRejectedOrder((prev) => prev.filter((k) => k !== rowKey))
    setRedeemedOrder((prev) => prev.filter((k) => k !== rowKey))

    if (deviceId) {
      const nextOrder = postponedOrder.includes(rowKey)
        ? postponedOrder.indexOf(rowKey) + 1
        : postponedOrder.length + 1
      saveProductPurchaseAction(deviceId, rowKey, "postponed", nextOrder, trimmed).catch(console.error)

      createPurchaseActionNotification({
        deviceId,
        actionType: "postponed",
        products: [
          {
            productId: Number(product.product_id),
            productName: product.product_name || "",
            variantName: product.variant_name,
            sku: product.variant_sku || product.product_barcode,
            requiredQty: Number(product.required_quantity) || 1,
            currentStock: Number(product.current_stock) || 0,
            price: Number(product.unit_price) || 0,
          },
        ],
        internalNote: trimmed || null,
        staffId: activeStaff?.id,
        staffName: activeStaff?.name,
      }).catch(console.error)
    }

    toast({
      title: "Product Postponed",
      description: `${product.product_name || "Product"}: Postponed and moved above ordered products`,
    })

    setPostponeModalProduct(null)
    setPostponeNote("")
  }

  // Revert order action when clicking Back in internal note modal
  const handleOrderModalBack = () => {
    if (!orderModalProduct) return
    const { rowKey, product } = orderModalProduct

    // Revert the action so the product returns to its original unhandled place and color
    setItemActions((prev) => {
      const updated = { ...prev }
      delete updated[rowKey]
      return updated
    })
    setOrderedOrder((prev) => prev.filter((k) => k !== rowKey))
    setItemNotes((prev) => {
      const updated = { ...prev }
      delete updated[rowKey]
      return updated
    })

    setOrderModalProduct(null)
    setInternalNote("")

    if (deviceId) {
      saveProductPurchaseAction(deviceId, rowKey, null).catch(console.error)
    }

    toast({
      title: "Action Reverted",
      description: `${product.product_name || "Product"}: Returned to original list`,
    })
  }

  // Open the view/edit note modal when clicking the note icon
  const handleOpenViewNoteModal = (rowKey: string, product: any) => {
    setViewNoteModal({
      product,
      rowKey,
      note: itemNotes[rowKey] || "",
    })
  }

  // Save changes from the view/edit note modal
  const handleSaveViewNote = () => {
    if (!viewNoteModal) return
    const { rowKey, note } = viewNoteModal
    const trimmed = note.trim()

    setItemNotes((prev) => {
      const updated = { ...prev }
      if (trimmed) {
        updated[rowKey] = trimmed
      } else {
        delete updated[rowKey]
      }
      return updated
    })

    if (deviceId) {
      const action = itemActions[rowKey] || null
      const orderIndex = orderedOrder.indexOf(rowKey)
      const actionOrder = action === "order" && orderIndex !== -1 ? orderIndex + 1 : 0
      saveProductPurchaseAction(deviceId, rowKey, action, actionOrder, trimmed || null).catch(console.error)
    }

    toast({
      title: "Note Saved",
      description: trimmed ? "Internal note updated successfully" : "Internal note cleared",
    })

    setViewNoteModal(null)
  }

  // Handle Skip or Save button in internal note modal:
  // Directly moves to the new purchase page with the product details and internal notes.
  const handleOrderModalSkipOrSave = async () => {
    if (!orderModalProduct) return
    const { rowKey, product } = orderModalProduct
    const noteText = internalNote.trim()

    // Persist internal note if entered
    if (noteText) {
      setItemNotes((prev) => ({
        ...prev,
        [rowKey]: noteText,
      }))
    }

    const requiredQty = Math.max(1, Number(product.required_quantity) || 1)
    const resolvedPrice = Number(
      (Number(product.unit_price) > 0 ? product.unit_price : null) ??
      (Number(product.variant_cost_price) > 0 ? product.variant_cost_price : null) ??
      (Number(product.variant_wholesale_price) > 0 ? product.variant_wholesale_price : null) ??
      (Number(product.product_wholesale_price) > 0 ? product.product_wholesale_price : null) ??
      (Number(product.variant_price) > 0 ? product.variant_price : null) ??
      (Number(product.product_price) > 0 ? product.product_price : null) ??
      0
    )
    const taxPercentage = Math.max(0, Math.min(100, Number(product.tax_percentage) || 0))
    const baseTotal = requiredQty * resolvedPrice
    const taxAmount = baseTotal * (taxPercentage / 100)
    const lineTotal = baseTotal + taxAmount

    const hasVariantName =
      product.variant_name &&
      product.variant_name.trim().toLowerCase() !== "default" &&
      product.variant_name.trim().toLowerCase() !== "default variant"
    const displayName =
      hasVariantName && !product.product_name.toLowerCase().includes(product.variant_name.toLowerCase())
        ? `${product.product_name} (${product.variant_name})`
        : (product.product_name || "")

    const variantId = product.product_variant_id ? Number(product.product_variant_id) : null
    const variantSku = product.variant_sku || product.product_barcode || null
    const variantBarcode = product.variant_barcode || product.product_barcode || null
    const variantShelf = product.variant_shelf || product.product_shelf || null
    const currentStock = Number(product.current_stock) || 0
    const msp = product.variant_msp != null ? Number(product.variant_msp) : (product.product_msp != null ? Number(product.product_msp) : null)
    const mrp = product.variant_mrp != null ? Number(product.variant_mrp) : (product.product_mrp != null ? Number(product.product_mrp) : null)

    const newDraftId = crypto.randomUUID()
    const draftItem = {
      id: crypto.randomUUID(),
      productId: Number(product.product_id),
      productName: displayName,
      quantity: requiredQty,
      quantityInput: String(requiredQty),
      price: resolvedPrice,
      priceInput: String(resolvedPrice),
      total: baseTotal,
      wholesalePrice: resolvedPrice,
      taxPercentage,
      taxPercentageInput: String(taxPercentage),
      taxAmount,
      lineTotal,
      variant_id: variantId,
      sku: variantSku,
      barcode: variantBarcode,
      shelf: variantShelf,
      msp,
      mrp,
      stock: currentStock,
      variants: variantId
        ? [
            {
              id: variantId,
              name: product.variant_name || "Default",
              quantity: requiredQty,
              sku: variantSku,
              barcode: variantBarcode,
              shelf: variantShelf,
              stock: currentStock,
              cost_price: resolvedPrice,
              wholesale_price: resolvedPrice,
              price: resolvedPrice,
              msp,
              mrp,
            },
          ]
        : [],
      variantEntries: variantId
        ? [
            {
              id: variantId,
              name: product.variant_name || "Default",
              quantity: requiredQty,
              quantityInput: String(requiredQty),
              price: resolvedPrice,
              priceInput: String(resolvedPrice),
              msp,
              mrp,
              sku: variantSku,
              barcode: variantBarcode,
              shelf: variantShelf,
              stock: currentStock,
              taxPercentage,
              taxPercentageInput: String(taxPercentage),
              total: baseTotal,
              taxAmount,
              lineTotal,
            },
          ]
        : [],
    }

    const newDraft = {
      id: newDraftId,
      name: `Order: ${displayName || "New Purchase"}`,
      updatedAt: Date.now(),
      date: new Date().toISOString(),
      supplier: "",
      status: "Credit",
      purchaseStatus: "Delivered",
      paymentMethod: "Cash",
      receivedAmount: 0,
      discountAmount: 0,
      products: [draftItem],
      isEditMode: false,
      editingPurchaseId: null,
      notes: noteText || undefined,
    }

    // Persist draft in localStorage
    const storageKey = `purchase_entry_drafts_${deviceId || "default"}`
    let parsedExisting: any[] = []
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) parsedExisting = JSON.parse(raw)
    } catch (_) {}

    const updatedDrafts = [
      newDraft,
      ...(Array.isArray(parsedExisting) ? parsedExisting.filter((d: any) => d.id !== newDraftId) : []),
    ]
    localStorage.setItem(storageKey, JSON.stringify(updatedDrafts))
    localStorage.setItem(`${storageKey}_active`, newDraftId)

    // Fallback key
    localStorage.setItem(`purchase_entry_drafts_default`, JSON.stringify(updatedDrafts))
    localStorage.setItem(`purchase_entry_drafts_default_active`, newDraftId)

    // Store in sessionStorage for instant active prefill hydration
    sessionStorage.setItem("pending_purchase_prefill", JSON.stringify(newDraft))

    if (deviceId) {
      try {
        await Promise.all([
          saveProductPurchaseAction(deviceId, rowKey, "order", orderedOrder.indexOf(rowKey) + 1, noteText || null),
          createPurchaseActionNotification({
            deviceId,
            actionType: "order",
            products: [
              {
                productId: Number(product.product_id),
                productName: displayName,
                variantName: product.variant_name,
                sku: variantSku,
                requiredQty,
                currentStock,
                price: resolvedPrice,
              },
            ],
            internalNote: noteText || null,
            staffId: activeStaff?.id,
            staffName: activeStaff?.name,
          }),
        ])
      } catch (err) {
        console.error("Order action/notification failed:", err)
      }
    }

    setOrderModalProduct(null)
    setInternalNote("")

    // Directly move to the new purchase page
    const targetUrl = `${pathname}?tab=purchase&purchaseView=entry`
    router.push(targetUrl)
  }

  // Handle bulk Proceed to Purchase (Skip or Save)
  // Directs to the new purchase page with all selected products and their notes
  const handleBulkOrderSkipOrSave = async () => {
    if (selectedProducts.length === 0) return

    const noteText = bulkInternalNote.trim()
    const newlyOrderedKeys = selectedProducts.map(getRowKey)

    // Build draft item objects with full pricing, quantity, and variant details
    const draftItems = selectedProducts.map((product) => {
      const requiredQty = Math.max(1, Number(product.required_quantity) || 1)
      const resolvedPrice = Number(
        (Number(product.unit_price) > 0 ? product.unit_price : null) ??
        (Number(product.variant_cost_price) > 0 ? product.variant_cost_price : null) ??
        (Number(product.variant_wholesale_price) > 0 ? product.variant_wholesale_price : null) ??
        (Number(product.product_wholesale_price) > 0 ? product.product_wholesale_price : null) ??
        (Number(product.variant_price) > 0 ? product.variant_price : null) ??
        (Number(product.product_price) > 0 ? product.product_price : null) ??
        0,
      )
      const taxPercentage = Math.max(0, Math.min(100, Number(product.tax_percentage) || 0))
      const baseTotal = requiredQty * resolvedPrice
      const taxAmount = baseTotal * (taxPercentage / 100)
      const lineTotal = baseTotal + taxAmount

      const hasVariantName =
        product.variant_name &&
        product.variant_name.trim().toLowerCase() !== "default" &&
        product.variant_name.trim().toLowerCase() !== "default variant"
      const displayName =
        hasVariantName && !product.product_name.toLowerCase().includes(product.variant_name.toLowerCase())
          ? `${product.product_name} (${product.variant_name})`
          : (product.product_name || "")

      const variantId = product.product_variant_id ? Number(product.product_variant_id) : null
      const variantSku = product.variant_sku || product.product_barcode || null
      const variantBarcode = product.variant_barcode || product.product_barcode || null
      const variantShelf = product.variant_shelf || product.product_shelf || null
      const currentStock = Number(product.current_stock) || 0
      const msp =
        product.variant_msp != null
          ? Number(product.variant_msp)
          : product.product_msp != null
          ? Number(product.product_msp)
          : null
      const mrp =
        product.variant_mrp != null
          ? Number(product.variant_mrp)
          : product.product_mrp != null
          ? Number(product.product_mrp)
          : null

      return {
        id: crypto.randomUUID(),
        productId: Number(product.product_id),
        productName: displayName,
        quantity: requiredQty,
        quantityInput: String(requiredQty),
        price: resolvedPrice,
        priceInput: String(resolvedPrice),
        total: baseTotal,
        wholesalePrice: resolvedPrice,
        taxPercentage,
        taxPercentageInput: String(taxPercentage),
        taxAmount,
        lineTotal,
        variant_id: variantId,
        sku: variantSku,
        barcode: variantBarcode,
        shelf: variantShelf,
        msp,
        mrp,
        stock: currentStock,
        variants: variantId
          ? [
              {
                id: variantId,
                name: product.variant_name || "Default",
                quantity: requiredQty,
                sku: variantSku,
                barcode: variantBarcode,
                shelf: variantShelf,
                stock: currentStock,
                cost_price: resolvedPrice,
                wholesale_price: resolvedPrice,
                price: resolvedPrice,
                msp,
                mrp,
              },
            ]
          : [],
        variantEntries: variantId
          ? [
              {
                id: variantId,
                name: product.variant_name || "Default",
                quantity: requiredQty,
                quantityInput: String(requiredQty),
                price: resolvedPrice,
                priceInput: String(resolvedPrice),
                msp,
                mrp,
                sku: variantSku,
                barcode: variantBarcode,
                shelf: variantShelf,
                stock: currentStock,
                taxPercentage,
                taxPercentageInput: String(taxPercentage),
                total: baseTotal,
                taxAmount,
                lineTotal,
              },
            ]
          : [],
      }
    })

    const newDraftId = crypto.randomUUID()
    const draftName =
      selectedProducts.length === 1
        ? `Order: ${draftItems[0]?.productName || "New Purchase"}`
        : `Bulk Order (${draftItems.length} items)`

    const newDraft = {
      id: newDraftId,
      name: draftName,
      updatedAt: Date.now(),
      date: new Date().toISOString(),
      supplier: "",
      status: "Credit",
      purchaseStatus: "Delivered",
      paymentMethod: "Cash",
      receivedAmount: 0,
      discountAmount: 0,
      products: draftItems,
      isEditMode: false,
      editingPurchaseId: null,
      notes: noteText || undefined,
    }

    // Persist draft in localStorage
    const storageKey = `purchase_entry_drafts_${deviceId || "default"}`
    let parsedExisting: any[] = []
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) parsedExisting = JSON.parse(raw)
    } catch (_) {}

    const updatedDrafts = [
      newDraft,
      ...(Array.isArray(parsedExisting) ? parsedExisting.filter((d: any) => d.id !== newDraftId) : []),
    ]
    localStorage.setItem(storageKey, JSON.stringify(updatedDrafts))
    localStorage.setItem(`${storageKey}_active`, newDraftId)

    // Fallback key
    localStorage.setItem(`purchase_entry_drafts_default`, JSON.stringify(updatedDrafts))
    localStorage.setItem(`purchase_entry_drafts_default_active`, newDraftId)

    // Store in sessionStorage for instant active prefill hydration
    sessionStorage.setItem("pending_purchase_prefill", JSON.stringify(newDraft))

    // Update state
    setItemActions((prev) => {
      const updated = { ...prev }
      newlyOrderedKeys.forEach((k) => {
        updated[k] = "order"
      })
      return updated
    })

    setOrderedOrder((prev) => {
      const remaining = prev.filter((k) => !newlyOrderedKeys.includes(k))
      return [...remaining, ...newlyOrderedKeys]
    })
    setRedeemedOrder((prev) => prev.filter((k) => !newlyOrderedKeys.includes(k)))

    if (noteText) {
      setItemNotes((prev) => {
        const updated = { ...prev }
        newlyOrderedKeys.forEach((k) => {
          updated[k] = noteText
        })
        return updated
      })
    }

    // Save to database
    if (deviceId) {
      try {
        const bulkProductsPayload = selectedProducts.map((p) => {
          const prodName = p.product_name || p.name || "Product"
          const vName = p.variant_name || null
          const hasVariant =
            vName &&
            vName.trim().toLowerCase() !== "default" &&
            vName.trim().toLowerCase() !== "default variant"
          const displayName =
            hasVariant && prodName && !prodName.toLowerCase().includes(vName.toLowerCase())
              ? `${prodName} (${vName})`
              : prodName

          return {
            productId: Number(p.product_id || p.id || 0),
            productName: displayName,
            variantName: vName,
            sku: p.variant_sku || p.product_barcode || p.sku || null,
            requiredQty: Math.max(1, Number(p.required_quantity) || 1),
            currentStock: Number(p.current_stock) || 0,
            price: Number(p.unit_price) || 0,
          }
        })

        await Promise.all([
          saveProductPurchaseActionsBulk(
            deviceId,
            newlyOrderedKeys.map((key, idx) => ({
              rowKey: key,
              action: "order",
              actionOrder: idx + 1,
              note: noteText || null,
            })),
          ),
          createPurchaseActionNotification({
            deviceId,
            actionType: "bulk_order",
            products: bulkProductsPayload,
            internalNote: noteText || null,
            staffId: activeStaff?.id,
            staffName: activeStaff?.name,
          }),
        ])
      } catch (err) {
        console.error("Bulk order action/notification failed:", err)
      }
    }

    setBulkOrderModalOpen(false)
    setBulkInternalNote("")
    setSelectedRowKeys([])

    toast({
      title: "Proceeding to Purchase",
      description: `${draftItems.length} products loaded into new purchase entry`,
    })

    // Directly move to the new purchase page
    const targetUrl = `${pathname}?tab=purchase&purchaseView=entry`
    router.push(targetUrl)
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

    if (action === "order") {
      setOrderedOrder((prev) => {
        const remaining = prev.filter((k) => !selectedRowKeys.includes(k))
        return [...remaining, ...selectedRowKeys]
      })
      setRedeemedOrder((prev) => prev.filter((k) => !selectedRowKeys.includes(k)))
      if (deviceId) {
        saveProductPurchaseActionsBulk(
          deviceId,
          selectedRowKeys.map((key, idx) => ({ rowKey: key, action: "order", actionOrder: idx + 1 })),
        ).catch(console.error)

        const bulkProducts = selectedRowKeys.map((key) => {
          const p = products.find((prod) => getRowKey(prod) === key) || {}
          return {
            productId: Number(p.product_id || 0),
            productName: p.product_name || "Product",
            variantName: p.variant_name,
            sku: p.variant_sku || p.product_barcode,
            requiredQty: Math.max(1, Number(p.required_quantity) || 1),
            currentStock: Number(p.current_stock) || 0,
            price: Number(p.unit_price) || 0,
          }
        })

        createPurchaseActionNotification({
          deviceId,
          actionType: "bulk_order",
          products: bulkProducts,
          internalNote: null,
          staffId: activeStaff?.id,
          staffName: activeStaff?.name,
        }).catch(console.error)
      }
    } else if (action === "redeemed") {
      setOrderedOrder((prev) => prev.filter((k) => !selectedRowKeys.includes(k)))
      setRedeemedOrder((prev) => {
        const remaining = prev.filter((k) => !newlyRedeemed.includes(k))
        return [...remaining, ...newlyRedeemed]
      })
      if (deviceId) {
        saveProductPurchaseActionsBulk(
          deviceId,
          newlyRedeemed.map((key, idx) => ({ rowKey: key, action: "redeemed", actionOrder: idx + 1 })),
        ).catch(console.error)
      }
    } else {
      setOrderedOrder((prev) => prev.filter((k) => !selectedRowKeys.includes(k)))
      setRedeemedOrder((prev) => prev.filter((k) => !selectedRowKeys.includes(k)))
      if (deviceId) {
        saveProductPurchaseActionsBulk(
          deviceId,
          selectedRowKeys.map((key) => ({ rowKey: key, action })),
        ).catch(console.error)
      }
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

  // Export to Excel / CSV: exports all selected items across all pages, or all sorted items if none selected
  const handleExportExcel = () => {
    const targetProducts =
      selectedRowKeys.length > 0
        ? sortedProducts.filter((p) => selectedRowKeys.includes(getRowKey(p)))
        : sortedProducts

    if (targetProducts.length === 0) {
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
      "Unit Price",
      "Estimated Total",
      "Action Status",
      "Internal Note",
    ]
    const rows = targetProducts.map((p) => {
      const required = Number(p.required_quantity) || 0
      const current = Number(p.current_stock) || 0
      const isOutOfStock = current < required || current <= 0
      const statusText = isOutOfStock ? "Out of Stock" : "In Stock"
      const rowKey = getRowKey(p)
      const actionStatus = itemActions[rowKey] || "Pending"
      const note = itemNotes[rowKey] || ""
      const price = Number(
        (Number(p.unit_price) > 0 ? p.unit_price : null) ??
        (Number(p.variant_cost_price) > 0 ? p.variant_cost_price : null) ??
        (Number(p.variant_wholesale_price) > 0 ? p.variant_wholesale_price : null) ??
        (Number(p.product_wholesale_price) > 0 ? p.product_wholesale_price : null) ??
        (Number(p.variant_price) > 0 ? p.variant_price : null) ??
        (Number(p.product_price) > 0 ? p.product_price : null) ??
        0,
      )
      const estTotal = required * price

      return [
        `"${(p.product_name || "").replace(/"/g, '""')}"`,
        `"${(p.variant_name || "").replace(/"/g, '""')}"`,
        `"${(p.variant_sku || "").replace(/"/g, '""')}"`,
        `"${statusText}"`,
        required,
        current,
        price.toFixed(2),
        estTotal.toFixed(2),
        `"${actionStatus}"`,
        `"${note.replace(/"/g, '""')}"`,
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
      description:
        selectedRowKeys.length > 0
          ? `${targetProducts.length} selected products exported successfully`
          : "Products list downloaded successfully as CSV",
    })
  }

  // Printable table escaping helper
  const escapePrintHtml = (str: any) => {
    if (str == null) return ""
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;")
  }

  // Print Products: prints all selected items across all pages, or all sorted items if none selected
  const handlePrint = () => {
    const targetProducts =
      selectedRowKeys.length > 0
        ? sortedProducts.filter((p) => selectedRowKeys.includes(getRowKey(p)))
        : sortedProducts

    if (targetProducts.length === 0) {
      toast({ title: "No data", description: "No products to print" })
      return
    }

    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      window.print()
      return
    }

    const todayDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })

    const rowsHtml = targetProducts
      .map((p, idx) => {
        const required = Number(p.required_quantity) || 0
        const current = Number(p.current_stock) || 0
        const isOutOfStock = current < required || current <= 0
        const statusText = isOutOfStock ? "Out of Stock" : "In Stock"
        const rowKey = getRowKey(p)
        const actionStatus = itemActions[rowKey]
          ? itemActions[rowKey].toUpperCase()
          : "PENDING"
        const note = itemNotes[rowKey] || ""

        return `
          <tr>
            <td style="text-align: center; color: #64748b;">${idx + 1}</td>
            <td style="font-weight: 600;">
              ${escapePrintHtml(p.product_name || "—")}
              ${note ? `<div style="font-size: 10px; color: #2563eb; font-style: italic;">Note: ${escapePrintHtml(note)}</div>` : ""}
            </td>
            <td>${escapePrintHtml(p.variant_name && p.variant_name.toLowerCase() !== "default" ? p.variant_name : "—")}</td>
            <td style="font-family: monospace;">${escapePrintHtml(p.variant_sku || "—")}</td>
            <td>
              <span style="font-weight: 600; color: ${isOutOfStock ? "#dc2626" : "#16a34a"};">
                ${escapePrintHtml(statusText)}
              </span>
            </td>
            <td style="text-align: right; font-weight: 700; color: #dc2626;">${required}</td>
            <td style="text-align: right;">${current}</td>
            <td style="text-align: center; font-size: 10px; font-weight: 600;">${escapePrintHtml(actionStatus)}</td>
          </tr>
        `
      })
      .join("")

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Products to Purchase - ${todayDate}</title>
  <style>
    @media print {
      @page {
        size: A4 portrait;
        margin: 12mm;
      }
      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 20px;
      font-size: 11px;
      line-height: 1.4;
    }
    .print-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 12px;
      margin-bottom: 16px;
      border-bottom: 2px solid #0f172a;
    }
    .print-title {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
      text-transform: uppercase;
    }
    .print-subtitle {
      font-size: 11px;
      color: #475569;
      font-weight: 500;
      margin: 0;
    }
    .print-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .print-table th {
      background-color: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 7px 9px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    .print-table td {
      padding: 6px 9px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .print-table tr:nth-child(even) td {
      background-color: #f8fafc;
    }
  </style>
</head>
<body>
  <div class="print-header">
    <div>
      <h1 class="print-title">Products to Purchase</h1>
      <p class="print-subtitle">Date: ${todayDate} &bull; Total Products: ${targetProducts.length}</p>
    </div>
  </div>
  <table class="print-table">
    <thead>
      <tr>
        <th style="width: 35px; text-align: center;">#</th>
        <th>Product Name</th>
        <th style="width: 15%;">Variant</th>
        <th style="width: 14%;">SKU / Code</th>
        <th style="width: 12%;">Status</th>
        <th style="width: 10%; text-align: right;">Req Qty</th>
        <th style="width: 10%; text-align: right;">Current Stock</th>
        <th style="width: 12%; text-align: center;">Action</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 200);
    };
  </script>
</body>
</html>`

    printWindow.document.write(html)
    printWindow.document.close()
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

      {/* ACTION STATUS FILTER TABS */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
          {/* 1. All Products */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("all")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5",
              activeTab === "all"
                ? "bg-white text-slate-900 shadow-2xs font-bold border border-slate-200/80"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50",
            )}
          >
            <span>All Products</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                activeTab === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-200 text-slate-700",
              )}
            >
              {products.length}
            </span>
          </button>

          {/* 2. Redeem */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("redeemed")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5",
              activeTab === "redeemed"
                ? "bg-emerald-50 text-emerald-900 border border-emerald-300 shadow-2xs font-bold"
                : "text-slate-600 hover:text-emerald-800 hover:bg-emerald-50/60",
            )}
          >
            <PackageCheck className="h-3.5 w-3.5 text-emerald-600" />
            <span>Redeem</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                activeTab === "redeemed"
                  ? "bg-emerald-600 text-white"
                  : "bg-emerald-100 text-emerald-800",
              )}
            >
              {tabCounts.redeemed}
            </span>
          </button>

          {/* 3. Ordered */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("order")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5",
              activeTab === "order"
                ? "bg-blue-50 text-blue-900 border border-blue-300 shadow-2xs font-bold"
                : "text-slate-600 hover:text-blue-800 hover:bg-blue-50/60",
            )}
          >
            <Truck className="h-3.5 w-3.5 text-blue-600" />
            <span>Ordered</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                activeTab === "order"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-100 text-blue-800",
              )}
            >
              {tabCounts.order}
            </span>
          </button>

          {/* 4. Postpone */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("postponed")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5",
              activeTab === "postponed"
                ? "bg-amber-50 text-amber-900 border border-amber-300 shadow-2xs font-bold"
                : "text-slate-600 hover:text-amber-800 hover:bg-amber-50/60",
            )}
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>Postpone</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                activeTab === "postponed"
                  ? "bg-amber-600 text-white"
                  : "bg-amber-100 text-amber-800",
              )}
            >
              {tabCounts.postponed}
            </span>
          </button>

          {/* 5. Rejected */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("reject")
              setPage(1)
            }}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1.5",
              activeTab === "reject"
                ? "bg-rose-50 text-rose-900 border border-rose-300 shadow-2xs font-bold"
                : "text-slate-600 hover:text-rose-800 hover:bg-rose-50/60",
            )}
          >
            <Ban className="h-3.5 w-3.5 text-rose-600" />
            <span>Rejected</span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none",
                activeTab === "reject"
                  ? "bg-rose-600 text-white"
                  : "bg-rose-100 text-rose-800",
              )}
            >
              {tabCounts.reject}
            </span>
          </button>
        </div>

        <div className="text-xs font-medium text-slate-500 hidden sm:block">
          Order Shortage & Stock Replenishment
        </div>
      </div>

      {/* BULK SELECTION TOOLBAR - PROCEED TO PURCHASE */}
      {selectedRowKeys.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/80 p-3 shadow-xs transition-all">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-600 text-white shadow-2xs">
              <ShoppingCart className="h-3.5 w-3.5" />
              {selectedRowKeys.length}{" "}
              {selectedRowKeys.length === 1 ? "product" : "products"} selected
            </span>
            {selectedRowKeys.length < sortedProducts.length && (
              <button
                type="button"
                onClick={() => setSelectedRowKeys(allFilteredKeys)}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline cursor-pointer"
              >
                Select all {sortedProducts.length} products across all pages
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelectedRowKeys([])}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 underline ml-1 cursor-pointer"
            >
              Clear selection
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-8 px-4 text-xs font-bold gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm cursor-pointer transition-all"
              onClick={() => {
                setBulkInternalNote("")
                setBulkOrderModalOpen(true)
              }}
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              <span>Proceed to Purchase</span>
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

              {activeFilterCount > 0 || activeTab !== "all" || searchTerm ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearAllFilters}
                  className="h-7 px-2 text-xs text-rose-600 hover:text-rose-800 cursor-pointer"
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
                      checked={isAllSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeSelected
                      }}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      title={
                        isAllSelected
                          ? "Deselect all products across all pages"
                          : `Select all ${sortedProducts.length} products across all pages`
                      }
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
                  <th className="whitespace-nowrap px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600 w-[16%] min-w-[185px]">
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
                        {searchTerm || activeTab !== "all" || activeFilterCount > 0
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
                    const hasNote = Boolean(itemNotes[rowKey]?.trim())

                    let baseBgClass =
                      index % 2 === 0
                        ? "bg-white hover:bg-violet-50 text-slate-800"
                        : "bg-slate-50 hover:bg-violet-50 text-slate-800"
                    let borderLeftClass = ""

                    if (activeAction === "redeemed") {
                      baseBgClass = "bg-emerald-100 text-emerald-950 hover:bg-emerald-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-emerald-500"
                    } else if (activeAction === "postponed") {
                      baseBgClass = "bg-amber-100/90 text-amber-950 hover:bg-amber-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-amber-600"
                    } else if (activeAction === "order") {
                      baseBgClass = "bg-blue-100 text-blue-950 hover:bg-blue-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-blue-500"
                    } else if (activeAction === "reject") {
                      baseBgClass = "bg-rose-100/90 text-rose-950 hover:bg-rose-200 font-medium"
                      borderLeftClass = "border-l-4 border-l-rose-600"
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

                            {/* 5. Internal Note (visible in every row: active if note exists, deactive otherwise) */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenViewNoteModal(rowKey, p)
                              }}
                              title="Internal Note"
                              className={cn(
                                "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                                hasNote
                                  ? "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 shadow-xs hover:bg-blue-700"
                                  : "bg-white text-slate-400 border-slate-200 hover:text-slate-700 hover:bg-slate-50 hover:border-slate-300",
                              )}
                            >
                              <FileText className="h-3.5 w-3.5" />
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
                const hasNote = Boolean(itemNotes[rowKey]?.trim())

                let cardAccentClass = ""
                if (activeAction === "redeemed") {
                  cardAccentClass = "border-l-4 border-l-emerald-500 bg-emerald-100 text-emerald-950"
                } else if (activeAction === "postponed") {
                  cardAccentClass = "border-l-4 border-l-amber-600 bg-amber-100 text-amber-950"
                } else if (activeAction === "order") {
                  cardAccentClass = "border-l-4 border-l-blue-500 bg-blue-100 text-blue-950"
                } else if (activeAction === "reject") {
                  cardAccentClass = "border-l-4 border-l-rose-600 bg-rose-100 text-rose-950"
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
                        {/* 2. Order */}
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

                        {/* 3. Postpone */}
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

                        {/* 4. Reject */}
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

                        {/* 5. Internal Note (visible in every row: active if note exists, deactive otherwise) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenViewNoteModal(rowKey, p)
                          }}
                          title="Internal Note"
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center transition-all cursor-pointer border",
                            hasNote
                              ? "bg-blue-600 text-white border-blue-700 ring-2 ring-blue-300 shadow-xs hover:bg-blue-700"
                              : "bg-white text-slate-400 border-slate-200 hover:text-slate-700 hover:bg-slate-50 hover:border-slate-300",
                          )}
                        >
                          <FileText className="h-3.5 w-3.5" />
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

      {/* Internal Note Modal */}
      <Dialog
        open={Boolean(orderModalProduct)}
        onOpenChange={(open) => {
          if (!open) handleOrderModalBack()
        }}
      >
        <DialogContent className="sm:max-w-md bg-white border border-slate-200 shadow-xl p-5">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Internal Note
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Add internal notes or instructions for ordering this product
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {orderModalProduct && (
            <div className="space-y-3.5 py-1">
              {/* Product summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                <div className="font-semibold text-xs text-slate-900">
                  {orderModalProduct.product.product_name}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  {orderModalProduct.product.variant_name &&
                    orderModalProduct.product.variant_name.toLowerCase() !== "default" && (
                      <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium">
                        Variant: {orderModalProduct.product.variant_name}
                      </span>
                    )}
                  {orderModalProduct.product.variant_sku && (
                    <span className="font-mono text-slate-500">
                      SKU: {orderModalProduct.product.variant_sku}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                  <span className="text-slate-500">
                    Required:{" "}
                    <strong className="text-rose-600">
                      {Number(orderModalProduct.product.required_quantity) || 0}
                    </strong>
                  </span>
                  {Number(orderModalProduct.product.unit_price) > 0 && (
                    <span className="text-slate-500">
                      Unit Price:{" "}
                      <strong className="text-slate-800">
                        {currency} {Number(orderModalProduct.product.unit_price).toFixed(2)}
                      </strong>
                    </span>
                  )}
                  <span className="text-slate-500">
                    Current Stock:{" "}
                    <strong className="text-slate-700">
                      {Number(orderModalProduct.product.current_stock) || 0}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Internal Note field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="internal-note-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Internal Note
                </Label>
                <Textarea
                  id="internal-note-input"
                  placeholder="Add internal note or order instructions..."
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  className="min-h-[90px] text-xs resize-none bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400">
                  {internalNote.trim().length > 0
                    ? "Click Save to proceed to the new purchase page with this note."
                    : "Click Skip to proceed to the new purchase page without a note."}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleOrderModalBack}
              className="h-8 px-3 text-xs gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>

            <Button
              type="button"
              onClick={handleOrderModalSkipOrSave}
              className={cn(
                "h-8 px-4 text-xs font-semibold gap-1.5 cursor-pointer transition-colors shadow-2xs",
                internalNote.trim().length > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-slate-800 hover:bg-slate-900 text-white",
              )}
            >
              {internalNote.trim().length > 0 ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save</span>
                </>
              ) : (
                <>
                  <span>Skip</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Product Modal */}
      <Dialog
        open={Boolean(rejectModalProduct)}
        onOpenChange={(open) => {
          if (!open) handleRejectModalBack()
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-white border border-slate-200 shadow-xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Ban className="h-4 w-4" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Reject Product
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Add an internal note explaining the rejection reason
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {rejectModalProduct && (
            <div className="space-y-3.5 py-1">
              {/* Product summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                <div className="font-semibold text-xs text-slate-900">
                  {rejectModalProduct.product.product_name}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  {rejectModalProduct.product.variant_name &&
                    rejectModalProduct.product.variant_name.toLowerCase() !== "default" && (
                      <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium">
                        Variant: {rejectModalProduct.product.variant_name}
                      </span>
                    )}
                  {rejectModalProduct.product.variant_sku && (
                    <span className="font-mono text-slate-500">
                      SKU: {rejectModalProduct.product.variant_sku}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                  <span className="text-slate-500">
                    Required:{" "}
                    <strong className="text-rose-600">
                      {Number(rejectModalProduct.product.required_quantity) || 0}
                    </strong>
                  </span>
                  {Number(rejectModalProduct.product.unit_price) > 0 && (
                    <span className="text-slate-500">
                      Unit Price:{" "}
                      <strong className="text-slate-800">
                        {currency} {Number(rejectModalProduct.product.unit_price).toFixed(2)}
                      </strong>
                    </span>
                  )}
                  <span className="text-slate-500">
                    Current Stock:{" "}
                    <strong className="text-slate-700">
                      {Number(rejectModalProduct.product.current_stock) || 0}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Internal Note field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="reject-internal-note-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Internal Note <span className="text-rose-500">*</span>
                </Label>
                <Textarea
                  id="reject-internal-note-input"
                  placeholder="Enter internal note or reason for rejection..."
                  value={rejectNote}
                  onChange={(e) => setRejectNote(e.target.value)}
                  className="min-h-[90px] text-xs resize-none bg-white border-slate-300 focus:border-rose-500 focus:ring-rose-500"
                  autoFocus
                />
                <p className="text-[11px]">
                  {rejectNote.trim().length > 0 ? (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Note provided. Click Save to reject this product.
                    </span>
                  ) : (
                    <span className="text-rose-500 font-medium">
                      Internal note is required to activate the Save button.
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handleRejectModalBack}
              className="h-8 px-3 text-xs gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>

            <Button
              type="button"
              disabled={!rejectNote.trim()}
              onClick={handleRejectModalSave}
              className={cn(
                "h-8 px-4 text-xs font-semibold gap-1.5 transition-all shadow-2xs",
                rejectNote.trim().length > 0
                  ? "bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-sm"
                  : "bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60",
              )}
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Postpone Product Modal */}
      <Dialog
        open={Boolean(postponeModalProduct)}
        onOpenChange={(open) => {
          if (!open) handlePostponeModalBack()
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-white border border-slate-200 shadow-xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                <Clock className="h-4 w-4" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Postpone Product
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Add an internal note explaining the reason for postponement
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {postponeModalProduct && (
            <div className="space-y-3.5 py-1">
              {/* Product summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                <div className="font-semibold text-xs text-slate-900">
                  {postponeModalProduct.product.product_name}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  {postponeModalProduct.product.variant_name &&
                    postponeModalProduct.product.variant_name.toLowerCase() !== "default" && (
                      <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium">
                        Variant: {postponeModalProduct.product.variant_name}
                      </span>
                    )}
                  {postponeModalProduct.product.variant_sku && (
                    <span className="font-mono text-slate-500">
                      SKU: {postponeModalProduct.product.variant_sku}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                  <span className="text-slate-500">
                    Required:{" "}
                    <strong className="text-rose-600">
                      {Number(postponeModalProduct.product.required_quantity) || 0}
                    </strong>
                  </span>
                  {Number(postponeModalProduct.product.unit_price) > 0 && (
                    <span className="text-slate-500">
                      Unit Price:{" "}
                      <strong className="text-slate-800">
                        {currency} {Number(postponeModalProduct.product.unit_price).toFixed(2)}
                      </strong>
                    </span>
                  )}
                  <span className="text-slate-500">
                    Current Stock:{" "}
                    <strong className="text-slate-700">
                      {Number(postponeModalProduct.product.current_stock) || 0}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Internal Note field */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="postpone-internal-note-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Internal Note <span className="text-amber-500">*</span>
                </Label>
                <Textarea
                  id="postpone-internal-note-input"
                  placeholder="Enter internal note or reason for postponement..."
                  value={postponeNote}
                  onChange={(e) => setPostponeNote(e.target.value)}
                  className="min-h-[90px] text-xs resize-none bg-white border-slate-300 focus:border-amber-500 focus:ring-amber-500"
                  autoFocus
                />
                <p className="text-[11px]">
                  {postponeNote.trim().length > 0 ? (
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Note provided. Click Save to postpone this product.
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium">
                      Internal note is required to activate the Save button.
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={handlePostponeModalBack}
              className="h-8 px-3 text-xs gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>

            <Button
              type="button"
              disabled={!postponeNote.trim()}
              onClick={handlePostponeModalSave}
              className={cn(
                "h-8 px-4 text-xs font-semibold gap-1.5 transition-all shadow-2xs",
                postponeNote.trim().length > 0
                  ? "bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-sm"
                  : "bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60",
              )}
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / Edit Note Modal */}
      <Dialog
        open={Boolean(viewNoteModal)}
        onOpenChange={(open) => {
          if (!open) setViewNoteModal(null)
        }}
      >
        <DialogContent
          className="sm:max-w-md bg-white border border-slate-200 shadow-xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Internal Note
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  View and update internal notes for this product order
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {viewNoteModal && (
            <div className="space-y-3.5 py-1">
              {/* Product summary */}
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-1.5">
                <div className="font-semibold text-xs text-slate-900">
                  {viewNoteModal.product.product_name}
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                  {viewNoteModal.product.variant_name &&
                    viewNoteModal.product.variant_name.toLowerCase() !== "default" && (
                      <span className="rounded bg-white px-1.5 py-0.5 border border-slate-200 font-medium">
                        Variant: {viewNoteModal.product.variant_name}
                      </span>
                    )}
                  {viewNoteModal.product.variant_sku && (
                    <span className="font-mono text-slate-500">
                      SKU: {viewNoteModal.product.variant_sku}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs">
                  <span className="text-slate-500">
                    Required:{" "}
                    <strong className="text-rose-600">
                      {Number(viewNoteModal.product.required_quantity) || 0}
                    </strong>
                  </span>
                  {Number(viewNoteModal.product.unit_price) > 0 && (
                    <span className="text-slate-500">
                      Unit Price:{" "}
                      <strong className="text-slate-800">
                        {currency} {Number(viewNoteModal.product.unit_price).toFixed(2)}
                      </strong>
                    </span>
                  )}
                  <span className="text-slate-500">
                    Current Stock:{" "}
                    <strong className="text-slate-700">
                      {Number(viewNoteModal.product.current_stock) || 0}
                    </strong>
                  </span>
                </div>
              </div>

              {/* Note Content */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="view-internal-note-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Internal Note Content
                </Label>
                <Textarea
                  id="view-internal-note-input"
                  placeholder="No note entered yet. Add notes here..."
                  value={viewNoteModal.note}
                  onChange={(e) =>
                    setViewNoteModal((prev) =>
                      prev ? { ...prev, note: e.target.value } : null
                    )
                  }
                  className="min-h-[100px] text-xs resize-none bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setViewNoteModal(null)}
              className="h-8 px-3 text-xs border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              Close
            </Button>

            <Button
              type="button"
              onClick={handleSaveViewNote}
              className="h-8 px-3 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium cursor-pointer shadow-xs"
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BULK ORDER / PROCEED TO PURCHASE MODAL */}
      <Dialog
        open={bulkOrderModalOpen}
        onOpenChange={(open) => {
          if (!open) setBulkOrderModalOpen(false)
        }}
      >
        <DialogContent
          className="sm:max-w-lg bg-white border border-slate-200 shadow-xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div className="text-left">
                <DialogTitle className="text-base font-bold text-slate-900">
                  Proceed to Purchase
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Review selected products and add internal order note before proceeding to purchase entry
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-3.5 py-1">
            {/* Products summary card */}
            <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-900">
                <span className="flex items-center gap-1.5">
                  <span className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">
                    {selectedProducts.length}
                  </span>
                  <span>Products Selected</span>
                </span>
                <span className="text-slate-600">
                  Total Units: <strong className="text-slate-900">{bulkTotalQty}</strong>
                </span>
              </div>

              {/* Scrollable list preview of selected products */}
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 divide-y divide-slate-100">
                {selectedProducts.map((p) => {
                  const rKey = getRowKey(p)
                  const req = Math.max(1, Number(p.required_quantity) || 1)
                  const unitP = Number(
                    (Number(p.unit_price) > 0 ? p.unit_price : null) ??
                    (Number(p.variant_cost_price) > 0 ? p.variant_cost_price : null) ??
                    (Number(p.variant_wholesale_price) > 0 ? p.variant_wholesale_price : null) ??
                    (Number(p.product_wholesale_price) > 0 ? p.product_wholesale_price : null) ??
                    (Number(p.variant_price) > 0 ? p.variant_price : null) ??
                    (Number(p.product_price) > 0 ? p.product_price : null) ??
                    0,
                  )
                  return (
                    <div key={rKey} className="flex items-center justify-between text-[11px] py-1 text-slate-700">
                      <div className="truncate pr-2">
                        <span className="font-medium text-slate-900">{p.product_name}</span>
                        {p.variant_name && p.variant_name.toLowerCase() !== "default" && (
                          <span className="text-slate-500 ml-1">({p.variant_name})</span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2 text-slate-600 font-mono">
                        <span className="text-rose-600 font-semibold">{req} qty</span>
                        {unitP > 0 && (
                          <span className="text-slate-500">
                            @{currency} {unitP.toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {bulkTotalEstCost > 0 && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-xs">
                  <span className="text-slate-500 font-medium">Estimated Purchase Total:</span>
                  <strong className="text-blue-700 font-bold">
                    {currency} {bulkTotalEstCost.toFixed(2)}
                  </strong>
                </div>
              )}
            </div>

            {/* Internal Note input */}
            <div className="space-y-1.5">
              <Label
                htmlFor="bulk-internal-note-input"
                className="text-xs font-semibold text-slate-700"
              >
                Internal Note (Optional)
              </Label>
              <Textarea
                id="bulk-internal-note-input"
                placeholder="Add internal note or order instructions for these products..."
                value={bulkInternalNote}
                onChange={(e) => setBulkInternalNote(e.target.value)}
                className="min-h-[90px] text-xs resize-none bg-white border-slate-300 focus:border-blue-500 focus:ring-blue-500"
                autoFocus
              />
              <p className="text-[11px] text-slate-400">
                {bulkInternalNote.trim().length > 0
                  ? "Click Save to proceed to the new purchase page with this note."
                  : "Click Skip to proceed to the new purchase page without a note."}
              </p>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkOrderModalOpen(false)}
              className="h-8 px-3 text-xs gap-1.5 border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back</span>
            </Button>

            <Button
              type="button"
              onClick={handleBulkOrderSkipOrSave}
              className={cn(
                "h-8 px-4 text-xs font-semibold gap-1.5 cursor-pointer transition-colors shadow-2xs",
                bulkInternalNote.trim().length > 0
                  ? "bg-blue-600 hover:bg-blue-700 text-white"
                  : "bg-slate-800 hover:bg-slate-900 text-white",
              )}
            >
              {bulkInternalNote.trim().length > 0 ? (
                <>
                  <Save className="h-3.5 w-3.5" />
                  <span>Save</span>
                </>
              ) : (
                <>
                  <span>Skip</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
