"use client"

import { useState, useEffect, useCallback, useTransition } from "react"
import { Search, X, SlidersHorizontal, Calendar, RotateCcw, Loader2, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"

export type PartnerFilterState = {
  search: string
  orderType: string
  status: string
  tracking: string
  dateRange: string
  fromDate: string
  toDate: string
}

const DEFAULT_FILTERS: PartnerFilterState = {
  search: "",
  orderType: "All",
  status: "All",
  tracking: "All",
  dateRange: "All",
  fromDate: "",
  toDate: "",
}

const ORDER_TYPES = [
  { value: "All", label: "All Types" },
  { value: "Normal Orders", label: "Normal Orders" },
  { value: "Replacement Shipments", label: "Replacement Shipments" },
]

const STATUSES = [
  { value: "All", label: "All Statuses" },
  { value: "Pending", label: "Pending" },
  { value: "Paid", label: "Paid" },
  { value: "Packed", label: "Packed" },
  { value: "Sent", label: "Sent" },
  { value: "Shipping", label: "Shipping" },
  { value: "Delivered", label: "Delivered" },
  { value: "Direct", label: "Direct" },
]

const TRACKING_OPTIONS = [
  { value: "All", label: "All Tracking" },
  { value: "With Tracking", label: "With Tracking" },
  { value: "Without Tracking", label: "Without Tracking" },
]

const DATE_RANGES = [
  { value: "All", label: "All Time" },
  { value: "Today", label: "Today" },
  { value: "Yesterday", label: "Yesterday" },
  { value: "Last 7 Days", label: "Last 7 Days" },
  { value: "Last 30 Days", label: "Last 30 Days" },
  { value: "Custom Range", label: "Custom Range" },
]

interface PartnerFilterToolbarProps {
  filters: PartnerFilterState
  onFilterChange: (newFilters: PartnerFilterState) => void
  onReset: () => void
  isLoading?: boolean
  hideOrderTypeFilter?: boolean
}

export function PartnerFilterToolbar({
  filters,
  onFilterChange,
  onReset,
  isLoading = false,
  hideOrderTypeFilter = false,
}: PartnerFilterToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Keep search input synced with prop
  useEffect(() => {
    setSearchInput(filters.search)
  }, [filters.search])

  // Debounced search trigger (250ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.search) {
        onFilterChange({ ...filters, search: searchInput })
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchInput, filters, onFilterChange])

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    onFilterChange({ ...filters, search: searchInput })
  }

  const handleClearSearch = () => {
    setSearchInput("")
    onFilterChange({ ...filters, search: "" })
  }

  const handleSingleFilterChange = (key: keyof PartnerFilterState, value: string) => {
    onFilterChange({ ...filters, [key]: value })
  }

  const countActiveFilters = useCallback(() => {
    let count = 0
    if (filters.search) count++
    if (!hideOrderTypeFilter && filters.orderType !== "All") count++
    if (filters.status !== "All") count++
    if (filters.tracking !== "All") count++
    if (filters.dateRange !== "All") count++
    return count
  }, [filters, hideOrderTypeFilter])

  const activeCount = countActiveFilters()

  return (
    <div className="space-y-3">
      {/* Desktop & Main Toolbar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl shadow-xs border border-gray-200 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Prominent Search Bar */}
          <form onSubmit={handleSearchSubmit} className="relative flex-1 min-w-0">
            <div className="relative flex items-center">
              <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search orders, customer, phone, tracking..."
                className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
              {(isLoading || isPending) && (
                <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-indigo-600" />
              )}
              {!isLoading && !isPending && searchInput && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  className="absolute right-3 h-4 w-4 text-slate-400 hover:text-slate-600 flex items-center justify-center rounded-full hover:bg-slate-200/50"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </form>

          {/* Mobile Filter Drawer Button */}
          <div className="flex md:hidden items-center gap-2">
            <button
              type="button"
              onClick={() => setIsMobileDrawerOpen(true)}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors shadow-2xs"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filters</span>
              {activeCount > 0 && (
                <span className="ml-1 bg-indigo-500 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                  {activeCount}
                </span>
              )}
            </button>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="px-3 py-2 border border-slate-200 text-slate-700 bg-slate-50 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors"
                title="Reset filters"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Desktop Filter Controls Toolbar */}
          <div className="hidden md:flex items-center gap-2 flex-wrap">
            {/* Order Type */}
            {!hideOrderTypeFilter && (
              <select
                value={filters.orderType}
                onChange={(e) => handleSingleFilterChange("orderType", e.target.value)}
                className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                {ORDER_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}

            {/* Status */}
            <select
              value={filters.status}
              onChange={(e) => handleSingleFilterChange("status", e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            {/* Tracking */}
            <select
              value={filters.tracking}
              onChange={(e) => handleSingleFilterChange("tracking", e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {TRACKING_OPTIONS.map((tr) => (
                <option key={tr.value} value={tr.value}>
                  {tr.label}
                </option>
              ))}
            </select>

            {/* Date Range */}
            <select
              value={filters.dateRange}
              onChange={(e) => handleSingleFilterChange("dateRange", e.target.value)}
              className="h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              {DATE_RANGES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>

            {/* Reset Button */}
            {activeCount > 0 && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Range Picker Fields */}
        {filters.dateRange === "Custom Range" && (
          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Calendar className="h-4 w-4 text-slate-400" />
              <span className="font-semibold text-slate-600">From:</span>
              <input
                type="date"
                value={filters.fromDate}
                onChange={(e) => handleSingleFilterChange("fromDate", e.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="font-semibold text-slate-600">To:</span>
              <input
                type="date"
                value={filters.toDate}
                onChange={(e) => handleSingleFilterChange("toDate", e.target.value)}
                className="h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-medium focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-xs px-1">
          <span className="text-slate-400 font-bold uppercase text-[10px] tracking-wider">Active:</span>

          {filters.search && (
            <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-semibold border border-indigo-200">
              Search: "{filters.search}"
              <button
                type="button"
                onClick={handleClearSearch}
                className="hover:text-indigo-900 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {!hideOrderTypeFilter && filters.orderType !== "All" && (
            <span className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold border border-blue-200">
              Type: {filters.orderType}
              <button
                type="button"
                onClick={() => handleSingleFilterChange("orderType", "All")}
                className="hover:text-blue-900 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.status !== "All" && (
            <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-semibold border border-emerald-200">
              Status: {filters.status}
              <button
                type="button"
                onClick={() => handleSingleFilterChange("status", "All")}
                className="hover:text-emerald-900 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.tracking !== "All" && (
            <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full font-semibold border border-purple-200">
              Tracking: {filters.tracking}
              <button
                type="button"
                onClick={() => handleSingleFilterChange("tracking", "All")}
                className="hover:text-purple-900 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          {filters.dateRange !== "All" && (
            <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 px-2.5 py-1 rounded-full font-semibold border border-amber-200">
              Date: {filters.dateRange}
              <button
                type="button"
                onClick={() => handleSingleFilterChange("dateRange", "All")}
                className="hover:text-amber-950 focus:outline-none"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={onReset}
            className="text-xs font-bold text-slate-500 hover:text-indigo-600 underline ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Mobile Filter Modal / Drawer */}
      <Dialog open={isMobileDrawerOpen} onOpenChange={setIsMobileDrawerOpen}>
        <DialogContent className="max-w-md p-5 space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-base font-bold text-slate-900">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-indigo-600" />
                Filter Orders
              </span>
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={onReset}
                  className="text-xs font-bold text-indigo-600 hover:underline"
                >
                  Clear All
                </button>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            {/* Order Type */}
            {!hideOrderTypeFilter && (
              <div>
                <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                  Order Type
                </label>
                <div className="grid grid-cols-1 gap-1.5">
                  {ORDER_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => handleSingleFilterChange("orderType", t.value)}
                      className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${
                        filters.orderType === t.value
                          ? "bg-indigo-50 border border-indigo-200 text-indigo-900"
                          : "bg-slate-50 border border-slate-100 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span>{t.label}</span>
                      {filters.orderType === t.value && <Check className="h-3.5 w-3.5 text-indigo-600" />}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Status */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                Delivery Status
              </label>
              <select
                value={filters.status}
                onChange={(e) => handleSingleFilterChange("status", e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Tracking */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                Tracking Status
              </label>
              <select
                value={filters.tracking}
                onChange={(e) => handleSingleFilterChange("tracking", e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                {TRACKING_OPTIONS.map((tr) => (
                  <option key={tr.value} value={tr.value}>
                    {tr.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range */}
            <div>
              <label className="font-bold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                Date Range
              </label>
              <select
                value={filters.dateRange}
                onChange={(e) => handleSingleFilterChange("dateRange", e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-800"
              >
                {DATE_RANGES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Range Picker */}
            {filters.dateRange === "Custom Range" && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">From Date</label>
                  <input
                    type="date"
                    value={filters.fromDate}
                    onChange={(e) => handleSingleFilterChange("fromDate", e.target.value)}
                    className="w-full h-8 rounded border border-slate-200 px-2 text-xs font-medium"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">To Date</label>
                  <input
                    type="date"
                    value={filters.toDate}
                    onChange={(e) => handleSingleFilterChange("toDate", e.target.value)}
                    className="w-full h-8 rounded border border-slate-200 px-2 text-xs font-medium"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
              onClick={() => setIsMobileDrawerOpen(false)}
            >
              Apply Filters
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
