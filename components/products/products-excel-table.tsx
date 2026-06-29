"use client"

import { useEffect, useMemo, useState, memo } from "react"
import {
  ExcelColumnFilterHeader,
  createEmptyColumnFilter,
  isColumnFilterActive,
  passesColumnFilter,
  type ExcelColumnFilterValue,
} from "@/components/sales/excel-column-filter"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function StatusBadge({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-xs font-medium text-rose-700">
        OOS
      </span>
    )
  }
  if (stock <= 5) {
    return (
      <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        LOW
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
      OK
    </span>
  )
}

type ColumnKey =
  | "name"
  | "company"
  | "category"
  | "retail"
  | "cost"
  | "stock"
  | "other"
  | "status"

type ColumnFilters = Record<ColumnKey, ExcelColumnFilterValue>

function buildInitialFilters(products: any[], getters: Record<ColumnKey, (p: any) => string>): ColumnFilters {
  const filters = {} as ColumnFilters
  ;(Object.keys(getters) as ColumnKey[]).forEach((key) => {
    filters[key] = createEmptyColumnFilter([...new Set(products.map(getters[key]))])
  })
  return filters
}

interface ProductsExcelTableProps {
  products: any[]
  isLoading: boolean
  hasLoaded: boolean
  hideCogs: boolean
  hideStockCount: boolean
  currency: string
  onViewProduct: (product: any) => void
  onEditProduct: (product: any) => void
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="divide-y divide-slate-200">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="grid gap-3 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {[...Array(cols)].map((__, j) => (
            <Skeleton key={j} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  )
}

function ProductsExcelTable({
  products,
  isLoading,
  hasLoaded,
  hideCogs,
  hideStockCount,
  currency,
  onViewProduct,
  onEditProduct,
}: ProductsExcelTableProps) {
  const formatMoney = (amount: number | string) => {
    const num = typeof amount === "number" ? amount : Number.parseFloat(String(amount || 0))
    return `${currency} ${(Number.isNaN(num) ? 0 : num).toFixed(2)}`
  }

  const valueGetters = useMemo(
    () => ({
      name: (p: any) => p.name || "",
      company: (p: any) => p.company_name || "No Company",
      category: (p: any) => p.category || "Uncategorized",
      retail: (p: any) => formatMoney(p.price),
      cost: (p: any) => formatMoney(p.wholesale_price || 0),
      stock: (p: any) => String(Number(p.stock || 0)),
      other: (p: any) => String(Number(p.other_devices_stock || 0)),
      status: (p: any) => {
        const stock = Number(p.stock || 0)
        if (stock === 0) return "OOS"
        if (stock <= 5) return "LOW"
        return "OK"
      },
    }),
    [currency],
  )

  const uniqueValues = useMemo(() => {
    const values = {} as Record<ColumnKey, string[]>
    ;(Object.keys(valueGetters) as ColumnKey[]).forEach((key) => {
      values[key] = [...new Set(products.map(valueGetters[key]))]
    })
    return values
  }, [products, valueGetters])

  const [columnFilters, setColumnFilters] = useState<ColumnFilters>(() =>
    buildInitialFilters(products, valueGetters),
  )
  const [columnFilterOpen, setColumnFilterOpen] = useState(false)

  useEffect(() => {
    if (!hasLoaded) return
    setColumnFilters(buildInitialFilters(products, valueGetters))
  }, [hasLoaded, products, valueGetters])

  const displayProducts = useMemo(() => {
    if (!hasLoaded) return products
    return products.filter((p) =>
      (Object.keys(valueGetters) as ColumnKey[]).every((key) =>
        passesColumnFilter(valueGetters[key](p), columnFilters[key], uniqueValues[key]),
      ),
    )
  }, [products, columnFilters, uniqueValues, valueGetters, hasLoaded])

  const activeFilterCount = hasLoaded
    ? (Object.keys(columnFilters) as ColumnKey[]).filter((key) =>
        isColumnFilterActive(columnFilters[key], uniqueValues[key]),
      ).length
    : 0

  const updateColumnContains = (key: ColumnKey, contains: string) => {
    setColumnFilters((prev) => {
      const current = prev[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])
      return { ...prev, [key]: { contains, selected: new Set(current.selected) } }
    })
  }

  const updateColumnSelection = (key: ColumnKey, selected: Set<string>) => {
    setColumnFilters((prev) => {
      const current = prev[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])
      return { ...prev, [key]: { contains: current.contains, selected: new Set(selected) } }
    })
  }

  const clearAllFilters = () => setColumnFilters(buildInitialFilters(products, valueGetters))

  const headerCell = (key: ColumnKey, label: string, align: "left" | "right" = "left") => (
    <th className={`whitespace-nowrap px-4 py-2.5 ${align === "right" ? "text-right" : "text-left"}`}>
      <ExcelColumnFilterHeader
        columnLabel={label}
        values={uniqueValues[key]}
        filter={columnFilters[key] ?? createEmptyColumnFilter(uniqueValues[key] ?? [])}
        onContainsChange={(contains) => updateColumnContains(key, contains)}
        onSelectionChange={(selected) => updateColumnSelection(key, selected)}
        align={align}
        onOpenChange={setColumnFilterOpen}
      />
    </th>
  )

  const stickyActionHeaderClass =
    "sticky right-0 z-20 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 bg-[#F1F4F9] px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)]"
  const stickyActionCellClass = (rowBg: string) =>
    `sticky right-0 z-10 min-w-[5.5rem] whitespace-nowrap border-l border-slate-200 px-4 py-2.5 text-right shadow-[-8px_0_12px_-8px_rgba(15,23,42,0.12)] group-hover:bg-violet-50/50 ${rowBg}`

  const colCount = 1 + 3 + (hideCogs ? 0 : 1) + (hideStockCount ? 0 : 3) + 1

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
        <span className="text-xs font-medium text-slate-600">
          {displayProducts.length} of {products.length} products
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {activeFilterCount > 0 ? (
            <>
              <span className="text-xs font-medium text-violet-700">
                {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-medium text-brand-blue hover:underline"
              >
                Clear all
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-auto", columnFilterOpen && "overflow-hidden")}>
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-30">
            <tr className="border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600">
              <th className="w-12 whitespace-nowrap px-4 py-2.5 text-left">#</th>
              {headerCell("name", "Product")}
              {headerCell("company", "Company")}
              {headerCell("category", "Category")}
              {headerCell("retail", "Retail", "right")}
              {!hideCogs && headerCell("cost", "Cost", "right")}
              {!hideStockCount && headerCell("stock", "Stock", "right")}
              {!hideStockCount && headerCell("other", "Other", "right")}
              {!hideStockCount && headerCell("status", "Status")}
              <th className={stickyActionHeaderClass}>Action</th>
            </tr>
          </thead>
          <tbody className={columnFilterOpen ? "pointer-events-none" : undefined}>
            {isLoading && !hasLoaded ? (
              <tr>
                <td colSpan={colCount}>
                  <TableSkeleton cols={colCount} />
                </td>
              </tr>
            ) : displayProducts.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">
                  No products match the current filters
                </td>
              </tr>
            ) : (
              displayProducts.map((product, index) => {
                const stock = Number(product.stock || 0)
                return (
                  <tr
                    key={product.id}
                    onClick={() => {
                      if (columnFilterOpen) return
                      onViewProduct(product)
                    }}
                    className={cn(
                      "group cursor-pointer border-b border-slate-200 transition-colors hover:bg-violet-50/50",
                      index % 2 === 0 ? "bg-white" : "bg-slate-50/60",
                    )}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 font-medium text-slate-800">{product.name}</td>
                    <td className="max-w-[140px] truncate px-4 py-2.5 text-slate-700">
                      {product.company_name || "No Company"}
                    </td>
                    <td className="max-w-[120px] truncate px-4 py-2.5 text-slate-600">
                      {product.category || "Uncategorized"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-slate-800">
                      {formatMoney(product.price)}
                    </td>
                    {!hideCogs && (
                      <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-600">
                        <span className="group/cost relative inline-block">
                          <span className="group-hover/cost:hidden">****</span>
                          <span className="hidden group-hover/cost:inline">{formatMoney(product.wholesale_price || 0)}</span>
                        </span>
                      </td>
                    )}
                    {!hideStockCount && (
                      <>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-slate-800">{stock}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right text-violet-700">
                          {Number(product.other_devices_stock || 0)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <StatusBadge stock={stock} />
                        </td>
                      </>
                    )}
                    <td className={stickyActionCellClass(index % 2 === 0 ? "bg-white" : "bg-slate-50/60")}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          onEditProduct(product)
                        }}
                        className="text-sm font-medium text-brand-blue hover:underline"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default memo(ProductsExcelTable)
