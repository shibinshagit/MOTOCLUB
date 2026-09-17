"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Lock,
  Unlock,
  RefreshCw,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import PinUnlockDialog from "./pin-unlock-dialog"
import AdminDashboardSummaryCards from "./admin-dashboard-summary-cards"
import AdminDashboardChart from "./admin-dashboard-chart"
import AdminDashboardFilters from "./admin-dashboard-filters"
import AdminDashboardStaffSection from "./admin-dashboard-staff-section"
import {
  getAdminDashboardLockStatus,
  unlockAdminDashboard,
  lockAdminDashboard,
  getAdminDashboardFilterOptions,
  getAdminDashboardData,
  type AdminDashboardQuery,
  type AdminDashboardData,
  type DashboardMetric,
} from "@/app/actions/admin-dashboard-actions"
import { useAppSelector } from "@/store/hooks"
import { selectDateRange } from "@/store/slices/dateRangeSlice"

import { SalesBreakdownModal } from "@/components/shared/sales-breakdown-modal"
import ProfitBreakdownModal from "@/components/shared/profit-breakdown-modal"
import ExpenseBreakdownModal from "@/components/shared/expense-breakdown-modal"

interface AdminDashboardViewProps {
  deviceId?: number
  companyId?: number
  title?: string
}

export default function AdminDashboardView({
  deviceId = 0,
  companyId = 1,
  title = "Admin Financial Dashboard",
}: AdminDashboardViewProps) {
  const { toast } = useToast()
  const globalDateRange = useAppSelector(selectDateRange)

  const [isUnlocked, setIsUnlocked] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [pinModalOpen, setPinModalOpen] = useState(false)
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false)
  const [isProfitModalOpen, setIsProfitModalOpen] = useState(false)
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false)
  const [activeMetric, setActiveMetric] = useState<DashboardMetric>("sales")

  const [filters, setFilters] = useState<AdminDashboardQuery>(() => ({
    deviceId,
    datePreset: globalDateRange?.from && globalDateRange?.to ? "custom" : "this_month",
    customFrom: globalDateRange?.from,
    customTo: globalDateRange?.to,
    comparisonType: "previous_period",
    staffId: "all",
    courierPartnerId: "all",
    courierServiceName: "all",
    paymentMethod: "all",
    status: "all",
  }))

  useEffect(() => {
    if (globalDateRange?.from && globalDateRange?.to) {
      setFilters((prev) => ({
        ...prev,
        datePreset: "custom",
        customFrom: globalDateRange.from,
        customTo: globalDateRange.to,
      }))
    }
  }, [globalDateRange?.from, globalDateRange?.to])

  const [filterOptions, setFilterOptions] = useState<any>(null)
  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Step 1: Check initial lock status on server
  const checkLockState = useCallback(async () => {
    setIsCheckingAuth(true)
    try {
      const status = await getAdminDashboardLockStatus()
      if (!status.isAdmin) {
        setErrorMessage(status.message || "Unauthorized access")
        setIsUnlocked(false)
        setPinModalOpen(false)
        return
      }

      if (status.unlocked) {
        setIsUnlocked(true)
        setPinModalOpen(false)
      } else {
        setIsUnlocked(false)
        setPinModalOpen(true)
      }
    } catch {
      setIsUnlocked(false)
      setPinModalOpen(true)
    } finally {
      setIsCheckingAuth(false)
    }
  }, [])

  useEffect(() => {
    checkLockState()
  }, [checkLockState])

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      deviceId,
      staffId: "all",
      courierPartnerId: "all",
      courierServiceName: "all",
      paymentMethod: "all",
      status: "all",
    }))
  }, [deviceId])

  // Step 2: Load filter options once unlocked
  const loadOptions = useCallback(async () => {
    const res = await getAdminDashboardFilterOptions(deviceId)
    if (res.success && res.data) {
      setFilterOptions(res.data)
    }
  }, [deviceId])

  // Step 3: Fetch aggregated metrics once unlocked
  const loadDashboardData = useCallback(async () => {
    if (!isUnlocked) return

    setIsLoading(true)
    setErrorMessage(null)

    try {
      const res = await getAdminDashboardData({ ...filters, deviceId })
      if (res.success && res.data) {
        setDashboardData(res.data)
      } else if (res.locked) {
        // Locked on server -> transition to locked
        setIsUnlocked(false)
        setDashboardData(null)
        setPinModalOpen(true)
      } else {
        setErrorMessage(res.message || "Failed to load dashboard metrics")
      }
    } catch (err) {
      setErrorMessage("An unexpected error occurred while loading data.")
    } finally {
      setIsLoading(false)
    }
  }, [isUnlocked, filters, deviceId])

  useEffect(() => {
    if (isUnlocked) {
      loadOptions()
      loadDashboardData()
    }
  }, [isUnlocked, loadOptions, loadDashboardData])

  // Unlock Handler
  const handleUnlock = async (pin: string) => {
    const res = await unlockAdminDashboard(pin)
    if (res.success) {
      setIsUnlocked(true)
      setPinModalOpen(false)
      notifySuccess(toast, "Dashboard unlocked successfully.", "Security verified")
      return { success: true }
    }
    return { success: false, message: res.message }
  }

  // Lock Handler
  const handleLock = async () => {
    await lockAdminDashboard()
    setIsUnlocked(false)
    setDashboardData(null)
    setPinModalOpen(true)
    notifySuccess(toast, "Dashboard locked. Financial data secured.", "Locked")
  }

  // Filter change handlers
  const handleFilterChange = (updated: Partial<AdminDashboardQuery>) => {
    setFilters((prev) => ({ ...prev, ...updated }))
  }

  const handleResetFilters = () => {
    setFilters({
      deviceId,
      datePreset: "this_month",
      comparisonType: "previous_period",
      staffId: "all",
      courierPartnerId: "all",
      courierServiceName: "all",
      paymentMethod: "all",
      status: "all",
    })
  }

  if (isCheckingAuth) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto" />
          <p className="text-xs text-gray-500 font-medium">Verifying admin credentials...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative space-y-5 pb-12">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-gray-200 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
              {title}
            </h1>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 border border-violet-200">
              <ShieldCheck className="h-3.5 w-3.5" />
              Admin Only
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1">
            Real-time financial performance, COGS, margins, comparison charts, and staff activity.
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {isUnlocked ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={loadDashboardData}
                disabled={isLoading}
                className="h-9 text-xs gap-1.5 border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleLock}
                className="h-9 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Lock Dashboard</span>
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setPinModalOpen(true)}
              className="h-9 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white font-medium shadow-sm"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>Unlock with PIN</span>
            </Button>
          )}
        </div>
      </div>

      {/* Error notification if any */}
      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* LOCKED STATE: Visual blur + overlay placeholder */}
      {!isUnlocked ? (
        <div className="relative">
          {/* Blurred Placeholder Skeleton (NO actual numbers sent to browser) */}
          <div className="space-y-5 filter blur-md opacity-30 select-none pointer-events-none">
            {/* Mock Filters */}
            <div className="h-12 rounded-xl border border-gray-200 bg-gray-100" />

            {/* Mock Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-28 rounded-xl border border-gray-200 bg-gray-100" />
              ))}
            </div>

            {/* Mock Chart */}
            <div className="h-80 rounded-xl border border-gray-200 bg-gray-100" />

            {/* Mock Staff Section */}
            <div className="h-48 rounded-xl border border-gray-200 bg-gray-100" />
          </div>

          {/* Central Unlock Lock Card Overlay */}
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <Card className="max-w-md w-full border-gray-200 bg-white/95 p-6 shadow-xl backdrop-blur-sm text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-gray-900">Dashboard is Locked</h3>
              <p className="text-xs text-gray-500 mt-1 mb-4">
                Financial numbers, COGS, profit comparisons, and staff logs are encrypted behind the Admin PIN.
              </p>
              <Button
                onClick={() => setPinModalOpen(true)}
                className="w-full h-10 bg-violet-600 hover:bg-violet-700 text-white font-medium text-xs gap-2"
              >
                <Unlock className="h-4 w-4" />
                Enter PIN to View Financials
              </Button>
            </Card>
          </div>

          <PinUnlockDialog
            open={pinModalOpen}
            onOpenChange={setPinModalOpen}
            onSuccess={() => {
              setIsUnlocked(true)
            }}
            onUnlock={handleUnlock}
          />
        </div>
      ) : (
        /* UNLOCKED STATE: Full Interactive Dashboard */
        <div className="space-y-5 animate-in fade-in-50 duration-300">
          {/* Filters Bar */}
          <AdminDashboardFilters
            filters={filters}
            options={filterOptions}
            onChange={handleFilterChange}
            onReset={handleResetFilters}
            isLoading={isLoading}
          />

          {/* Zero matching sales alert if filters are active */}
          {dashboardData &&
            dashboardData.cards.totalOrders.current === 0 &&
            (filters.staffId !== "all" ||
              filters.courierPartnerId !== "all" ||
              filters.courierServiceName !== "all" ||
              filters.paymentMethod !== "all" ||
              filters.status !== "all") && (
              <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    No sales matched the active filters for this date range. Cards are displaying 0.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="font-semibold underline hover:text-amber-950 ml-2 cursor-pointer"
                >
                  Reset Filters
                </button>
              </div>
            )}

          {isLoading && !dashboardData ? (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center space-y-2">
                <Loader2 className="h-8 w-8 animate-spin text-violet-600 mx-auto" />
                <p className="text-xs text-gray-500 font-medium">Aggregating financial data...</p>
              </div>
            </div>
          ) : dashboardData ? (
            <>
              {/* Summary Cards */}
              <AdminDashboardSummaryCards
                cards={dashboardData.cards}
                currency={dashboardData.currency}
                activeMetric={activeMetric}
                onSelectMetric={setActiveMetric}
                onOpenBreakdown={() => setIsBreakdownModalOpen(true)}
                onOpenProfitBreakdown={() => setIsProfitModalOpen(true)}
                onOpenExpenseBreakdown={() => setIsExpenseModalOpen(true)}
              />

              {/* Main Dual-Series Comparison Graph */}
              <AdminDashboardChart
                data={dashboardData.chartData[activeMetric] || []}
                metric={activeMetric}
                currency={dashboardData.currency}
                periodLabel={dashboardData.periodLabel}
                comparisonLabel={dashboardData.comparisonLabel}
              />

              {/* Staff Activity Section */}
              <AdminDashboardStaffSection data={dashboardData.staffSummary} />

              {/* Sales Breakdown Modal */}
              <SalesBreakdownModal
                isOpen={isBreakdownModalOpen}
                onClose={() => setIsBreakdownModalOpen(false)}
                deviceId={deviceId}
                dateRange={{ from: filters.customFrom, to: filters.customTo }}
                periodLabel={dashboardData.periodLabel}
                currency={dashboardData.currency}
                filters={{
                  staffId: filters.staffId,
                  courierPartnerId: filters.courierPartnerId,
                  courierServiceName: filters.courierServiceName,
                  paymentMethod: filters.paymentMethod,
                  statusFilter: filters.status,
                }}
              />

              {/* Profit Breakdown Modal */}
              <ProfitBreakdownModal
                isOpen={isProfitModalOpen}
                onClose={() => setIsProfitModalOpen(false)}
                deviceId={deviceId}
                dateRange={{ from: filters.customFrom, to: filters.customTo }}
                periodLabel={dashboardData.periodLabel}
                currency={dashboardData.currency}
                filters={{
                  staffId: filters.staffId,
                  courierPartnerId: filters.courierPartnerId,
                  courierServiceName: filters.courierServiceName,
                  paymentMethod: filters.paymentMethod,
                  statusFilter: filters.status,
                }}
              />

              {/* Expense Breakdown Modal */}
              <ExpenseBreakdownModal
                isOpen={isExpenseModalOpen}
                onClose={() => setIsExpenseModalOpen(false)}
                deviceId={deviceId}
                dateRange={{ from: filters.customFrom, to: filters.customTo }}
                periodLabel={dashboardData.periodLabel}
                currency={dashboardData.currency}
                filters={{
                  staffId: filters.staffId,
                  courierPartnerId: filters.courierPartnerId,
                  courierServiceName: filters.courierServiceName,
                  paymentMethod: filters.paymentMethod,
                  statusFilter: filters.status,
                }}
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}
