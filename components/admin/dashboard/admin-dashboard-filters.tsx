"use client"

import { useState } from "react"
import {
  Calendar as CalendarIcon,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import type {
  DatePreset,
  ComparisonType,
  AdminDashboardQuery,
} from "@/app/actions/admin-dashboard-actions"

interface FilterOptions {
  staff: Array<{ id: number; name: string; role: string }>
  courierServices: string[]
  courierPartners: Array<{ id: number; name: string }>
  paymentMethods: string[]
  statuses: string[]
}

interface AdminDashboardFiltersProps {
  filters: AdminDashboardQuery
  options: FilterOptions | null
  onChange: (updated: Partial<AdminDashboardQuery>) => void
  onReset: () => void
  isLoading?: boolean
}

export default function AdminDashboardFilters({
  filters,
  options,
  onChange,
  onReset,
  isLoading,
}: AdminDashboardFiltersProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false)

  // Count active non-default sales filters
  const activeSalesFilterCount = [
    filters.staffId && filters.staffId !== "all",
    filters.courierPartnerId && filters.courierPartnerId !== "all",
    filters.courierServiceName && filters.courierServiceName !== "all",
    filters.paymentMethod && filters.paymentMethod !== "all",
    filters.status && filters.status !== "all",
  ].filter(Boolean).length

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 shadow-sm">
      {/* Top Row: Date Presets, Custom Dates, Comparison, and Sales Filter Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Date Presets */}
          <div className="flex items-center gap-1.5 bg-gray-50 p-1 rounded-lg border border-gray-200">
            {(
              [
                { id: "today", label: "Today" },
                { id: "last_7_days", label: "7 Days" },
                { id: "this_month", label: "This Month" },
                { id: "last_month", label: "Last Month" },
                { id: "custom", label: "Custom" },
              ] as Array<{ id: DatePreset; label: string }>
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onChange({ datePreset: preset.id })}
                disabled={isLoading}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  filters.datePreset === preset.id
                    ? "bg-white text-violet-700 shadow-sm font-semibold"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Custom Date Pickers (Shown when datePreset === 'custom') */}
          {filters.datePreset === "custom" && (
            <div className="flex items-center gap-1.5 animate-in fade-in-50 duration-200">
              <Input
                type="date"
                value={filters.customFrom || ""}
                onChange={(e) => onChange({ customFrom: e.target.value })}
                className="h-8 w-32 sm:w-36 text-xs bg-white border-gray-300"
              />
              <span className="text-xs text-gray-400">to</span>
              <Input
                type="date"
                value={filters.customTo || ""}
                onChange={(e) => onChange({ customTo: e.target.value })}
                className="h-8 w-32 sm:w-36 text-xs bg-white border-gray-300"
              />
            </div>
          )}

          {/* Comparison Selection */}
          <div className="flex items-center gap-1.5 ml-0 sm:ml-2">
            <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wider hidden lg:inline">
              Compare:
            </span>
            <Select
              value={filters.comparisonType}
              onValueChange={(val: ComparisonType) => onChange({ comparisonType: val })}
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 text-xs w-[140px] sm:w-[155px] bg-gray-50 border-gray-200">
                <SelectValue placeholder="Compare to..." />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 text-xs">
                <SelectItem value="previous_period">Previous Period</SelectItem>
                <SelectItem value="previous_month">Previous Month</SelectItem>
                <SelectItem value="previous_year">Previous Year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Right Action: Toggle Sales Filters & Reset */}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`h-8 text-xs gap-1.5 border-gray-200 ${
              isAdvancedOpen || activeSalesFilterCount > 0
                ? "bg-violet-50 text-violet-700 border-violet-200"
                : "text-gray-700 hover:bg-gray-50"
            }`}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Sales Filters</span>
            {activeSalesFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                {activeSalesFilterCount}
              </span>
            )}
            {isAdvancedOpen ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </Button>

          {(activeSalesFilterCount > 0 || filters.datePreset !== "this_month") && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onReset}
              disabled={isLoading}
              className="h-8 text-xs text-gray-500 hover:text-gray-900 gap-1 px-2"
              title="Reset all filters"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Active Filter Chips Bar */}
      {activeSalesFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-gray-100">
          <span className="text-[11px] font-medium text-gray-400">Active filters:</span>
          {filters.staffId && filters.staffId !== "all" && (
            <Badge
              variant="secondary"
              className="bg-violet-50 text-violet-700 hover:bg-violet-100 text-[11px] gap-1 px-2 py-0.5 font-medium flex items-center"
            >
              <span>
                Staff:{" "}
                {options?.staff.find((s) => String(s.id) === String(filters.staffId))?.name ||
                  filters.staffId}
              </span>
              <button
                type="button"
                onClick={() => onChange({ staffId: "all" })}
                className="hover:text-violet-900 ml-0.5"
                title="Remove staff filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.courierPartnerId && filters.courierPartnerId !== "all" && (
            <Badge
              variant="secondary"
              className="bg-violet-50 text-violet-700 hover:bg-violet-100 text-[11px] gap-1 px-2 py-0.5 font-medium flex items-center"
            >
              <span>
                Partner:{" "}
                {options?.courierPartners.find((p) => String(p.id) === String(filters.courierPartnerId))
                  ?.name || filters.courierPartnerId}
              </span>
              <button
                type="button"
                onClick={() => onChange({ courierPartnerId: "all" })}
                className="hover:text-violet-900 ml-0.5"
                title="Remove partner filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.courierServiceName && filters.courierServiceName !== "all" && (
            <Badge
              variant="secondary"
              className="bg-violet-50 text-violet-700 hover:bg-violet-100 text-[11px] gap-1 px-2 py-0.5 font-medium flex items-center"
            >
              <span>Service: {filters.courierServiceName}</span>
              <button
                type="button"
                onClick={() => onChange({ courierServiceName: "all" })}
                className="hover:text-violet-900 ml-0.5"
                title="Remove courier service filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.paymentMethod && filters.paymentMethod !== "all" && (
            <Badge
              variant="secondary"
              className="bg-violet-50 text-violet-700 hover:bg-violet-100 text-[11px] gap-1 px-2 py-0.5 font-medium flex items-center"
            >
              <span>Payment: {filters.paymentMethod}</span>
              <button
                type="button"
                onClick={() => onChange({ paymentMethod: "all" })}
                className="hover:text-violet-900 ml-0.5"
                title="Remove payment filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          {filters.status && filters.status !== "all" && (
            <Badge
              variant="secondary"
              className="bg-violet-50 text-violet-700 hover:bg-violet-100 text-[11px] gap-1 px-2 py-0.5 font-medium flex items-center"
            >
              <span>Status: {filters.status}</span>
              <button
                type="button"
                onClick={() => onChange({ status: "all" })}
                className="hover:text-violet-900 ml-0.5"
                title="Remove status filter"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}

          <button
            type="button"
            onClick={() =>
              onChange({
                staffId: "all",
                courierPartnerId: "all",
                courierServiceName: "all",
                paymentMethod: "all",
                status: "all",
              })
            }
            className="text-[11px] text-gray-500 hover:text-red-600 underline ml-1 cursor-pointer"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Advanced Sales Filter Panel (Collapsible) */}
      {isAdvancedOpen && (
        <div className="border-t border-gray-100 pt-3 mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 animate-in slide-in-from-top-2 duration-200">
          {/* Staff Filter */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-gray-500">Staff</Label>
            <Select
              value={filters.staffId === undefined ? "all" : String(filters.staffId)}
              onValueChange={(val) =>
                onChange({ staffId: val === "all" ? "all" : Number(val) })
              }
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 text-xs bg-white border-gray-200">
                <SelectValue placeholder="All Staff" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 text-xs">
                <SelectItem value="all">All Staff</SelectItem>
                {options?.staff.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} ({s.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Courier Partner */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-gray-500">Courier Partner</Label>
            <Select
              value={
                filters.courierPartnerId === undefined
                  ? "all"
                  : String(filters.courierPartnerId)
              }
              onValueChange={(val) =>
                onChange({
                  courierPartnerId: val === "all" ? "all" : Number(val),
                })
              }
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 text-xs bg-white border-gray-200">
                <SelectValue placeholder="All Partners" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 text-xs">
                <SelectItem value="all">All Partners</SelectItem>
                {options?.courierPartners.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Courier Service */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-gray-500">Courier Service</Label>
            <Select
              value={filters.courierServiceName || "all"}
              onValueChange={(val) => onChange({ courierServiceName: val })}
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 text-xs bg-white border-gray-200">
                <SelectValue placeholder="All Services" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 text-xs">
                <SelectItem value="all">All Services</SelectItem>
                {options?.courierServices.map((cs) => (
                  <SelectItem key={cs} value={cs}>
                    {cs}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-gray-500">Payment Method</Label>
            <Select
              value={filters.paymentMethod || "all"}
              onValueChange={(val) => onChange({ paymentMethod: val })}
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 text-xs bg-white border-gray-200">
                <SelectValue placeholder="All Payment" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 text-xs">
                <SelectItem value="all">All Methods</SelectItem>
                {options?.paymentMethods.map((pm) => (
                  <SelectItem key={pm} value={pm}>
                    {pm}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sale Status */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-gray-500">Sale Status</Label>
            <Select
              value={filters.status || "all"}
              onValueChange={(val) => onChange({ status: val })}
              disabled={isLoading}
            >
              <SelectTrigger className="h-8 text-xs bg-white border-gray-200">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200 text-xs">
                <SelectItem value="all">All Statuses</SelectItem>
                {options?.statuses.map((st) => (
                  <SelectItem key={st} value={st}>
                    {st}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  )
}
