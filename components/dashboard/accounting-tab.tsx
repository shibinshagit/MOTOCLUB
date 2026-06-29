"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  BarChart3,
  Calendar,
  Clock,
  Download,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Package,
  ArrowDownCircle,
  CreditCard,
  Users,
  Building,
  TrendingUp,
  ArrowUpCircle,
  Loader2,
} from "lucide-react"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"
import { selectDevice, selectCompany } from "@/store/slices/deviceSlice"
import {
  selectFinancialData,
  selectLastUpdated,
  selectDateRange,
  selectIsLoading,
  selectIsBackgroundLoading,
  setFinancialData,
  setDateRange,
  setLoading,
  setBackgroundLoading,
  selectBalances,
  setBalances,
} from "@/store/slices/accountingSlice"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { useConfirm } from "@/hooks/use-confirm"
import {
  getFinancialSummary,
  recordManualTransaction,
  getAccountingBalances,
} from "@/app/actions/simplified-accounting"
import { deletePurchase } from "@/app/actions/purchase-actions"
import { deleteSale } from "@/app/actions/sale-actions"
import { SimpleDateInput } from "@/components/ui/date-picker"
import { format, startOfWeek, subWeeks, parseISO, isValid } from "date-fns"
import React from "react"
import ViewSaleModal from "@/components/sales/view-sale-modal"
import ViewPurchaseModal from "@/components/purchases/view-purchase-modal"
import EditPurchaseModal from "../purchases/edit-purchase-modal"
import EditSaleModal from "../sales/edit-sale-modal"
import ViewManualTransactionModal from "../manual/ViewManualTransactionModal"
import EditManualTransactionModal from "../manual/EditManualTransactionModal"
import ViewSupplierPaymentModal from "../suppliers/View-supplier-payment-model"
import EditSupplierPaymentModal from "../suppliers/View-suplier-payment-edit"

interface AccountingTabProps {
  userId: number
  companyId: number
  deviceId: number
}

// Skeleton Components (keep the same)
const SummaryCardSkeleton = () => (
  <Card>
    <CardContent className="p-3">
      <div className="flex items-center gap-1 mb-1">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-6 w-20" />
    </CardContent>
  </Card>
)

const TransactionSkeleton = () => (
  <div className="rounded-lg border border-l-4 border-l-border p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Skeleton className="h-4 w-4" />
        <div>
          <Skeleton className="h-4 w-48 mb-2" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="grid grid-cols-5 gap-4">
          <div className="text-right">
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="text-right">
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="text-right">
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="text-right">
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="text-right">
            <Skeleton className="h-3 w-12 mb-1" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <div className="min-w-[120px] text-right">
          <Skeleton className="h-3 w-16 mb-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
    </div>
  </div>
)

const TableSkeleton = () => (
  <div className="border rounded-lg overflow-hidden">
    <div className="bg-muted/50 px-6 py-3">
      <div className="grid grid-cols-7 gap-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-16" />
        ))}
      </div>
    </div>
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="px-6 py-4">
          <div className="grid grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, j) => (
              <Skeleton key={j} className="h-4 w-full" />
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
)

export default function AccountingTab({ userId, companyId, deviceId }: AccountingTabProps) {
  // Redux state
  const dispatch = useAppDispatch()
  const financialData = useAppSelector(selectFinancialData)
  const lastUpdated = useAppSelector(selectLastUpdated)
  const storedDateRange = useAppSelector(selectDateRange)
  const isLoading = useAppSelector(selectIsLoading)
  const isBackgroundLoading = useAppSelector(selectIsBackgroundLoading)
  const balances = useAppSelector(selectBalances)
  const { isValueHidden } = useStaffRestrictions()
  const hideCogs = isValueHidden("cogs")
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()

  // Local state
  const [searchTerm, setSearchTerm] = useState("")
  const [filterType, setFilterType] = useState("all")
  const [activeTab, setActiveTab] = useState("transactions")

  // Date range modal state
  const [isDateModalOpen, setIsDateModalOpen] = useState(false)
  const [tempDateFrom, setTempDateFrom] = useState<Date>(new Date())
  const [tempDateTo, setTempDateTo] = useState<Date>(new Date())

  // Calculate proper last week's date range
  const today = new Date()
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 })
  const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })
  const todayEnd = new Date(today)
  todayEnd.setHours(23, 59, 59, 999)

  // Helper function to safely parse dates
  const safeParseDateString = (dateValue: string | Date | undefined): Date | null => {
    if (!dateValue) return null

    if (dateValue instanceof Date) {
      return isValid(dateValue) ? dateValue : null
    }

    if (typeof dateValue === "string") {
      const parsed = parseISO(dateValue)
      return isValid(parsed) ? parsed : null
    }

    return null
  }

  // Initialize date range to today
  const [dateFrom, setDateFrom] = useState<Date>(() => {
    if (storedDateRange.dateFrom) {
      const storedFrom = safeParseDateString(storedDateRange.dateFrom)
      if (storedFrom) return storedFrom
    }
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
    return todayStart
  })

  const [dateTo, setDateTo] = useState<Date>(() => {
    if (storedDateRange.dateTo) {
      const storedTo = safeParseDateString(storedDateRange.dateTo)
      if (storedTo) return storedTo
    }
    return todayEnd
  })

  // Manual transaction dialog states
  const [isManualDialogOpen, setIsManualDialogOpen] = useState(false)
  const [manualAmount, setManualAmount] = useState("")
  const [manualType, setManualType] = useState<"debit" | "credit">("debit")
  const [manualDescription, setManualDescription] = useState("")
  const [manualCategory, setManualCategory] = useState("")
  const [manualPaymentMethod, setManualPaymentMethod] = useState("Cash")
  const [manualDate, setManualDate] = useState<Date>(new Date())
  const [isAddingManual, setIsAddingManual] = useState(false)

  const device = useAppSelector(selectDevice)
  const company = useAppSelector(selectCompany)
  const currency = device?.currency || "AED"

  // View modal states
  const [viewSaleId, setViewSaleId] = useState<number | null>(null)
  const [viewPurchaseId, setViewPurchaseId] = useState<number | null>(null)
  const [viewManualTransactionId, setViewManualTransactionId] = useState<number | null>(null)
  const [viewSupplierPaymentId, setViewSupplierPaymentId] = useState<number | null>(null)

  // Edit modal states
  const [editSaleId, setEditSaleId] = useState<number | null>(null)
  const [editPurchaseId, setEditPurchaseId] = useState<number | null>(null)
  const [editManualTransactionId, setEditManualTransactionId] = useState<number | null>(null)
  const [editSupplierPaymentId, setEditSupplierPaymentId] = useState<number | null>(null)

  // Loading states for delete operations
  const [deletingSaleId, setDeletingSaleId] = useState<number | null>(null)
  const [deletingPurchaseId, setDeletingPurchaseId] = useState<number | null>(null)

  // Handle date changes and update Redux
  const handleDateFromChange = (date: Date | undefined) => {
    if (!date) return

    const newDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0)
    setDateFrom(newDate)
    dispatch(
      setDateRange({
        dateFrom: newDate.toISOString(),
        dateTo: dateTo.toISOString(),
      }),
    )
  }

  const handleDateToChange = (date: Date | undefined) => {
    if (!date) return

    const newDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
    setDateTo(newDate)
    dispatch(
      setDateRange({
        dateFrom: dateFrom.toISOString(),
        dateTo: newDate.toISOString(),
      }),
    )
  }

  // Handle date range modal
  const openDateModal = () => {
    setTempDateFrom(dateFrom)
    setTempDateTo(dateTo)
    setIsDateModalOpen(true)
  }

  const applyDateRange = () => {
    handleDateFromChange(tempDateFrom)
    handleDateToChange(tempDateTo)
    setIsDateModalOpen(false)
  }

  // Load financial data with caching strategy
  const loadFinancialData = async (background = false) => {
    try {
      if (background) {
        dispatch(setBackgroundLoading(true))
      } else {
        dispatch(setLoading(true))
      }

      if (!deviceId) {
        console.error("No device ID provided to accounting tab")
        notifyError(toast,"Device ID not found")
        return
      }

      const fromDateStr = format(dateFrom, "yyyy-MM-dd")
      const toDateStr = format(dateTo, "yyyy-MM-dd")

      const cacheBuster = Date.now()
      const data = await getFinancialSummary(deviceId, fromDateStr, toDateStr, cacheBuster)

      dispatch(setFinancialData(data))
    } catch (error) {
      console.error("Error loading financial data:", error)
      if (!background || error.message?.includes("critical")) {
        notifyError(toast,"Failed to load financial data: " + (error.message || "Unknown error"))
      }
    } finally {
      if (background) {
        dispatch(setBackgroundLoading(false))
      } else {
        dispatch(setLoading(false))
      }
    }
  }

  // Load accounting balances based on our date range
  const loadAccountingBalances = async (fromDate: Date, toDate: Date) => {
    try {
      if (!deviceId) {
        console.error("No device ID provided for balance calculation")
        return
      }

      const fromDateStr = format(fromDate, "yyyy-MM-dd")
      const toDateStr = format(toDate, "yyyy-MM-dd")

      const balanceData = await getAccountingBalances(deviceId, fromDateStr, toDateStr)
      dispatch(setBalances(balanceData))
    } catch (error) {
      console.error("Error loading accounting balances:", error)
      notifyError(toast,"Failed to load account balances")
    }
  }

  // Force refresh all data
  const forceRefreshData = async () => {
    try {
      dispatch(setLoading(true))
      dispatch(setFinancialData(null))
      dispatch(setBalances(null))
      
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Load financial data and balances
      await loadFinancialData(false)
      await loadAccountingBalances(dateFrom, dateTo)
      
      notifySuccess(toast,"Data refreshed successfully")
    } catch (error) {
      console.error("Error force refreshing data:", error)
      notifyError(toast,"Failed to refresh data")
    } finally {
      dispatch(setLoading(false))
    }
  }

  // Initial load and date change effect
  useEffect(() => {
    if (deviceId) {
      // Load balances with actual date range
      loadAccountingBalances(dateFrom, dateTo)

      // Check if we need to refresh financial data
      if (
        financialData &&
        lastUpdated &&
        storedDateRange.dateFrom === dateFrom.toISOString() &&
        storedDateRange.dateTo === dateTo.toISOString()
      ) {
        const lastUpdatedTime = new Date(lastUpdated).getTime()
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000

        if (lastUpdatedTime < fiveMinutesAgo) {
          loadFinancialData(true)
        }
      } else {
        loadFinancialData(false)
      }
    }
  }, [deviceId, dateFrom, dateTo])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 2,
      currencyDisplay: "narrowSymbol",
    })
      .format(amount)
      .replace(/[A-Z]{3}\s?/, `${currency} `)
  }

  // Updated formatDateTime function
  const formatDateTime = (dateInput: string | Date) => {
    let date: Date

    if (dateInput instanceof Date) {
      date = dateInput
    } else if (typeof dateInput === "string") {
      date = parseISO(dateInput)
    } else {
      return { date: "Invalid Date", time: "00:00" }
    }

    if (!isValid(date)) {
      return { date: "Invalid Date", time: "00:00" }
    }

    return {
      date: format(date, "MMM d, yyyy"),
      time: format(date, "HH:mm"),
    }
  }

  // Updated formatDate function
  const formatDateOnly = (dateInput: string | Date) => {
    let date: Date

    if (dateInput instanceof Date) {
      date = dateInput
    } else if (typeof dateInput === "string") {
      date = parseISO(dateInput)
    } else {
      return "Invalid Date"
    }

    if (!isValid(date)) {
      return "Invalid Date"
    }

    return format(date, "MMM d, yyyy")
  }

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase()
    if (statusLower === "completed") {
      return (
        <Badge className="border-emerald-200 bg-emerald-100 text-xs text-emerald-800">
          Completed
        </Badge>
      )
    } else if (statusLower === "credit") {
      return (
        <Badge className="border-amber-200 bg-amber-100 text-xs text-amber-800">
          Credit
        </Badge>
      )
    } else if (statusLower === "cancelled") {
      return (
        <Badge className="border-rose-200 bg-rose-100 text-xs text-rose-800">
          Cancelled
        </Badge>
      )
    } else if (statusLower === "adjustment") {
      return (
        <Badge className="border-violet-200 bg-violet-100 text-xs text-violet-800">
          Adjustment
        </Badge>
      )
    } else if (statusLower === "manual entry") {
      return (
        <Badge className="border-violet-200 bg-violet-100 text-xs text-violet-800">
          Manual
        </Badge>
      )
    } else {
      return (
        <Badge variant="outline" className="text-xs">
          {status}
        </Badge>
      )
    }
  }

  const handleAddManualTransaction = async () => {
    if (!manualAmount || !manualCategory) {
      notifyError(toast,"Please fill in all required fields")
      return
    }

    setIsAddingManual(true)

    try {
      const result = await recordManualTransaction({
        amount: Number(manualAmount),
        type: manualType,
        description: manualDescription || `${manualType === 'credit' ? 'Income' : 'Expense'}: ${manualCategory}`,
        category: manualCategory,
        paymentMethod: manualPaymentMethod,
        deviceId,
        userId,
        transactionDate: manualDate,
      })

      if (result.success) {
        notifySuccess(toast,"Manual transaction added successfully")
        setIsManualDialogOpen(false)
        setManualAmount("")
        setManualDescription("")
        setManualCategory("")
        setManualPaymentMethod("Cash")
        setManualDate(new Date())
        await forceRefreshData()
      } else {
        notifyError(toast,"Failed to add manual transaction")
      }
    } catch (error) {
      console.error("Error adding manual transaction:", error)
      notifyError(toast,"An error occurred while adding the transaction")
    } finally {
      setIsAddingManual(false)
    }
  }

  // Enhanced sale handlers for ViewSaleModal
  const handleEditSale = (saleId: number) => {
    setViewSaleId(null)
    setEditSaleId(saleId)
  }

  const handleDeleteSale = async (saleId: number) => {
    if (!(await confirm("Are you sure you want to delete this sale? This action cannot be undone and will affect your financial records."))) {
      return
    }

    try {
      setDeletingSaleId(saleId)
      
      const response = await deleteSale(saleId, deviceId)
      
      if (response.success) {
        notifySuccess(toast,response.message || "Sale deleted successfully")
        await forceRefreshData()
        setViewSaleId(null)
      } else {
        throw new Error(response.message || "Failed to delete sale")
      }
    } catch (error) {
      console.error("Error deleting sale:", error)
      notifyError(toast,error instanceof Error ? error.message : "An unexpected error occurred. Please try again later.")
    } finally {
      setDeletingSaleId(null)
    }
  }

  // Enhanced purchase handlers for ViewPurchaseModal
  const handleEditPurchase = (purchaseId: number) => {
    setViewPurchaseId(null)
    setEditPurchaseId(purchaseId)
  }

  const handleDeletePurchase = async (purchaseId: number) => {
    if (!(await confirm("Are you sure you want to delete this purchase? This action cannot be undone and will affect your financial records."))) {
      return
    }

    try {
      setDeletingPurchaseId(purchaseId)
      
      const response = await deletePurchase(purchaseId, deviceId)
      
      if (response.success) {
        notifySuccess(toast,response.message || "Purchase deleted successfully")
        await forceRefreshData()
        setViewPurchaseId(null)
      } else {
        throw new Error(response.message || "Failed to delete purchase")
      }
    } catch (error) {
      console.error("Error deleting purchase:", error)
      notifyError(toast,error instanceof Error ? error.message : "An unexpected error occurred. Please try again later.")
    } finally {
      setDeletingPurchaseId(null)
    }
  }

  // Supplier payment handlers
  const handleEditSupplierPayment = (paymentId: number) => {
    setViewSupplierPaymentId(null)
    setEditSupplierPaymentId(paymentId)
  }

  // Handle successful edits with force refresh
  const handleSaleUpdated = async () => {
    setEditSaleId(null)
    await forceRefreshData()
    notifySuccess(toast,"Sale updated successfully")
  }

  const handlePurchaseUpdated = async () => {
    setEditPurchaseId(null)
    await forceRefreshData()
    notifySuccess(toast,"Purchase updated successfully")
  }

  const handleSupplierPaymentUpdated = async () => {
    setEditSupplierPaymentId(null)
    await forceRefreshData()
    notifySuccess(toast,"Supplier payment updated successfully")
  }

  const handlePrintReport = () => {
    if (!financialData) {
      notifyError(toast,"No data available to print")
      return
    }

    try {
      const printWindow = window.open("", "_blank")
      if (!printWindow) {
        throw new Error("Could not open print window. Please check your popup blocker settings.")
      }

      const htmlContent = `
        <html>
          <head>
            <title>Financial Report - ${company?.name || "Company"}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; }
              .company-name { font-size: 24px; font-weight: bold; color: #3b82f6; }
              .report-title { font-size: 18px; margin: 10px 0; }
              .date-range { font-size: 14px; color: #666; }
              .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 30px 0; }
              .summary-card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; }
              .summary-card h3 { margin: 0 0 10px 0; font-size: 14px; color: #666; text-transform: uppercase; }
              .summary-card .value { font-size: 20px; font-weight: bold; color: #1f2937; }
              .transactions-table { width: 100%; border-collapse: collapse; margin-top: 30px; }
              .transactions-table th, .transactions-table td { border: 1px solid #e5e7eb; padding: 8px; text-align: left; }
              .transactions-table th { background-color: #f9fafb; font-weight: bold; }
              .transactions-table tr:nth-child(even) { background-color: #f9fafb; }
              .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #e5e7eb; padding-top: 20px; }
              @media print { button { display: none; } }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="company-name">${company?.name || "Company"}</div>
              <div class="report-title">Financial Report</div>
              <div class="date-range">
                Period: ${format(dateFrom, "MMM d, yyyy")} - ${format(dateTo, "MMM d, yyyy")}
              </div>
              <div class="date-range">
                Generated on: ${format(new Date(), "MMM d, yyyy 'at' HH:mm")}
              </div>
            </div>

            <div class="summary-grid">
              <div class="summary-card">
                <h3>Opening Balance</h3>
                <div class="value">${currency} ${getOpeningBalance().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Total Sales</h3>
                <div class="value">${currency} ${getSalesTotal().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Total Purchases</h3>
                <div class="value">${currency} ${getPurchasesTotal().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Gross Profit</h3>
                <div class="value">${currency} ${getTotalProfit().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Money In</h3>
                <div class="value">${currency} ${getAmountReceived().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Money Out</h3>
                <div class="value">${currency} ${getSpends().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Closing Balance</h3>
                <div class="value">${currency} ${getClosingBalance().toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Receivables</h3>
                <div class="value">${currency} ${(financialData.accountsReceivable || 0).toFixed(2)}</div>
              </div>
              <div class="summary-card">
                <h3>Payables</h3>
                <div class="value">${currency} ${(financialData.accountsPayable || 0).toFixed(2)}</div>
              </div>
            </div>

            <table class="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Transaction Amount</th>
                  <th>Money Flow</th>
                  ${hideCogs ? "" : "<th>Product Cost (COGS)</th>"}
                  <th>Cash Impact</th>
                </tr>
              </thead>
              <tbody>
                ${filteredTransactions
                  .map((t) => {
                    const dateTime = formatDateTime(t.date)
                    const netImpact = getCashImpact(t)
                    const cashImpact = getCashImpact(t)
                    const moneyFlow = getMoneyFlowDisplay(t)
                    return `
                    <tr>
                      <td>${dateTime.date}</td>
                      <td>${t.description || "No description"}</td>
                      <td>${t.type || "Unknown"}</td>
                      <td>${t.status}</td>
                      <td>${currency} ${t.amount.toFixed(2)}</td>
                      <td style="color: ${moneyFlow.color.includes('green') ? "#059669" : moneyFlow.color.includes('red') ? "#dc2626" : "#6b7280"}">
                        ${moneyFlow.showAmount ? (netImpact >= 0 ? "+" : "-") + currency + " " + moneyFlow.value.toFixed(2) : moneyFlow.text}
                      </td>
                      ${hideCogs ? "" : `<td>${currency} ${t.cost.toFixed(2)}</td>`}
                      <td style="color: ${cashImpact > 0 ? "#059669" : cashImpact < 0 ? "#dc2626" : "#6b7280"}; font-weight: bold;">
                        ${cashImpact > 0 ? "+" : cashImpact < 0 ? "-" : ""}${currency} ${Math.abs(cashImpact).toFixed(2)}
                      </td>
                    </tr>
                  `
                  })
                  .join("")}
              </tbody>
            </table>

            <div class="footer">
              <p>Total Transactions: ${filteredTransactions.length}</p>
              <p>This report was generated on ${format(new Date(), "MMM d, yyyy 'at' HH:mm")}</p>
            </div>

            <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">
              Print Report
            </button>
          </body>
        </html>
      `

      printWindow.document.write(htmlContent)
      printWindow.document.close()

      notifySuccess(toast,"Print preview opened. Use your browser's print function to save as PDF.")
    } catch (error) {
      console.error("Error opening print preview:", error)
      notifyError(toast,"Failed to open print preview")
    }
  }

const extractIdFromDescription = (desc: string) => {
  if (!desc) return null
  const match = desc.match(/#(\d+)/)
  return match ? parseInt(match[1]) : null
}

const n = (v: any) => Number(v) || 0

// Define filteredTransactions first with proper null checks
const filteredTransactions =
  financialData?.transactions?.filter((transaction) => {
    if (!transaction) return false
    
    const description = transaction.description || ""
    const account = transaction.account || ""

    const matchesSearch =
      description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (transaction.status && transaction.status.toLowerCase().includes(searchTerm.toLowerCase()))

    let matchesType = true
    const type = transaction.type?.toLowerCase()
    const received = n(transaction.received)
    
    if (filterType === "income") {
      matchesType = (type === 'sale' && received > 0) || (type === 'adjustment' && received > 0)
    } else if (filterType === "expense") {
      matchesType = (type === 'purchase' && received > 0) || 
                   (type === 'supplier_payment') ||
                   (type === 'adjustment' && description.includes('Purchase') && received > 0)
    } else if (filterType === "sale") {
      matchesType = type === "sale" || description.toLowerCase().startsWith("sale")
    } else if (filterType === "purchase") {
      matchesType = type === "purchase" || 
                   description.toLowerCase().startsWith("purchase") ||
                   (type === 'adjustment' && description.includes('Purchase'))
    } else if (filterType !== "all") {
      matchesType = transaction.type === filterType
    }

    let transactionDate: Date

    if (transaction.date instanceof Date) {
      transactionDate = transaction.date
    } else if (typeof transaction.date === "string") {
      transactionDate = parseISO(transaction.date)
    } else {
      return false
    }

    if (!isValid(transactionDate)) {
      return false
    }

    const transactionDateOnly = new Date(
      transactionDate.getFullYear(),
      transactionDate.getMonth(),
      transactionDate.getDate(),
    )
    const fromDateOnly = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), dateFrom.getDate())
    const toDateOnly = new Date(dateTo.getFullYear(), dateTo.getMonth(), dateTo.getDate())

    const isWithinDateRange = transactionDateOnly >= fromDateOnly && transactionDateOnly <= toDateOnly

    return matchesSearch && matchesType && isWithinDateRange
  }) || []


const isDataLoading = isLoading && !financialData

const isSaleAdjustment = (transaction: any) =>
  transaction?.type?.toLowerCase() === "adjustment" &&
  (transaction.description || "").includes("Sale")

const getSaleAdjustmentNetCash = (transaction: any) => {
  const credit = n(transaction.credit)
  const debit = n(transaction.debit)
  const received = n(transaction.received)
  if (credit !== 0 || debit !== 0) return credit - debit
  return received
}

const isSaleRefundOrDiscount = (transaction: any) => {
  if (!isSaleAdjustment(transaction)) return false
  const description = transaction.description || ""
  if (description.includes("Discount change")) return true
  return getSaleAdjustmentNetCash(transaction) < 0
}

// FIXED: Profit calculation with proportional cost for partial payments
// FIXED: Profit calculation - ONLY includes sales profit, excludes purchases
// FIXED: Profit calculation - purchase adjustments should not affect profit
const getProfit = (transaction: any) => {
  if (!transaction) return 0
  
  const type = transaction.type?.toLowerCase()
  const description = transaction.description || ""
  const received = n(transaction.received)
  const cost = n(transaction.cost)
  const credit = n(transaction.credit)
  const debit = n(transaction.debit)
  
  // For sales - profit = product revenue received - cost (excludes courier charge on separate lines)
  if (type === 'sale') {
    const saleReceived = credit > 0 ? credit : received
    return saleReceived - cost
  }
  
  // For sale adjustments (additional payments, discounts, refunds)
  if (isSaleAdjustment(transaction)) {
    if (isSaleRefundOrDiscount(transaction)) {
      return getSaleAdjustmentNetCash(transaction)
    }

    const additionalMoneyIn = getSaleAdjustmentNetCash(transaction)
    const saleId = extractIdFromDescription(description)
    
    if (saleId) {
      // Find the original sale
      const originalSale = financialData?.transactions?.find(
        st => st && st.sale_id === saleId && st.type?.toLowerCase() === 'sale'
      )
      
      if (originalSale) {
        const totalBill = n(originalSale.amount)
        const alreadyReceived = n(originalSale.received)
        const originalCost = n(originalSale.cost)
        
        // EXTRACT COGS from description if available
        let extractedCost = 0
        const costMatch = description.match(/COGS recognized:?\s*([\d.]+)/i)
        if (costMatch) {
          extractedCost = n(costMatch[1])
        }
        
        // If we have extracted COGS from description, use that
        if (extractedCost > 0) {
          return additionalMoneyIn - extractedCost
        }
        
        // If original sale has cost, use proportional calculation
        if (originalCost > 0 && alreadyReceived > 0) {
          const costPerMoneyUnit = originalCost / alreadyReceived
          const costForThisPayment = additionalMoneyIn * costPerMoneyUnit
          return additionalMoneyIn - costForThisPayment
        }
        
        // If no cost data available, assume 50% profit margin
        return additionalMoneyIn * 0.5
      }
    }
    
    // If no original sale found, try to extract COGS from description
    const costMatch = description.match(/COGS recognized:?\s*([\d.]+)/i)
    if (costMatch) {
      const extractedCost = n(costMatch[1])
      return additionalMoneyIn - extractedCost
    }
    
    // Final fallback: assume 50% profit margin
    return additionalMoneyIn * 0.5
  }
  
  // For purchases - NO PROFIT IMPACT (purchases don't affect profit, only cash)
  if (type === 'purchase') {
    return 0
  }
  
  // For purchase adjustments - NO PROFIT IMPACT (only cash impact)
  if (type === 'adjustment' && description.includes('Purchase')) {
    return 0 // Purchase adjustments don't affect profit
  }
  
  // For supplier payments - NO PROFIT IMPACT
  if (type === 'supplier_payment' || description.toLowerCase().includes('supplier payment')) {
    return 0
  }
  
  // Default for other transactions
  return credit - debit
}

// FIXED: Cash Impact - includes both sales profit AND purchase outflows
// FIXED: Cash Impact for purchase adjustments - handle backend data structure
const getCashImpact = (transaction: any) => {
  if (!transaction) return 0
  
  const type = transaction.type?.toLowerCase()
  const description = transaction.description || ""
  const received = n(transaction.received)
  const credit = n(transaction.credit)
  const debit = n(transaction.debit)
  const cost = n(transaction.cost)
  
  // For sales - cash impact = profit only (product credit - cost)
  if (type === 'sale') {
    const saleReceived = credit > 0 ? credit : received
    return saleReceived - cost
  }
  
  // For sale adjustments - cash impact from payments, discounts, or refunds
  if (isSaleAdjustment(transaction)) {
    if (isSaleRefundOrDiscount(transaction)) {
      return getSaleAdjustmentNetCash(transaction)
    }

    const additionalMoneyIn = getSaleAdjustmentNetCash(transaction)
    const saleId = extractIdFromDescription(description)
    
    if (saleId) {
      // Find the original sale
      const originalSale = financialData?.transactions?.find(
        st => st && st.sale_id === saleId && st.type?.toLowerCase() === 'sale'
      )
      
      if (originalSale) {
        const totalBill = n(originalSale.amount)
        const alreadyReceived = n(originalSale.received)
        const originalCost = n(originalSale.cost)
        
        // EXTRACT COGS from description if available
        let extractedCost = 0
        const costMatch = description.match(/COGS recognized:?\s*([\d.]+)/i)
        if (costMatch) {
          extractedCost = n(costMatch[1])
        }
        
        // If we have extracted COGS from description, use that
        if (extractedCost > 0) {
          return additionalMoneyIn - extractedCost
        }
        
        // If original sale has cost, use proportional calculation
        if (originalCost > 0 && alreadyReceived > 0) {
          const costPerMoneyUnit = originalCost / alreadyReceived
          const costForThisPayment = additionalMoneyIn * costPerMoneyUnit
          return additionalMoneyIn - costForThisPayment
        }
        
        // If no cost data available, assume 50% profit margin
        return additionalMoneyIn * 0.5
      }
    }
    
    // If no original sale found, try to extract COGS from description
    const costMatch = description.match(/COGS recognized:?\s*([\d.]+)/i)
    if (costMatch) {
      const extractedCost = n(costMatch[1])
      return additionalMoneyIn - extractedCost
    }
    
    // Final fallback: assume 50% profit margin
    return additionalMoneyIn * 0.5
  }
  
  // For purchases - cash impact is full amount spent (negative)
  if (type === 'purchase') {
    return -received
  }
  
  // For purchase adjustments - cash impact is money paid out (negative)
  if (type === 'adjustment' && description.includes('Purchase')) {
    // If debit amount is available, use it (money going out)
    if (debit > 0) {
      return -debit
    }
    // If received amount is available, use it
    else if (received > 0) {
      return -received
    }
    // Extract payment amount from description as fallback
    else {
      const paymentMatch = description.match(/Payment increased by\s*([\d.]+)/i) || 
                          description.match(/paid.*?([\d.]+)/i)
      if (paymentMatch) {
        const paymentAmount = n(paymentMatch[1])
        return -paymentAmount
      }
    }
    return 0
  }
  
  // For purchase adjustments with "Edited" in description - extract payment amount
  if (type === 'adjustment' && description.includes('Edited') && description.includes('Payment increased by')) {
    const paymentMatch = description.match(/Payment increased by\s*([\d.]+)/i)
    if (paymentMatch) {
      const paymentAmount = n(paymentMatch[1])
      return -paymentAmount // Negative because it's money going out
    }
  }
  
  // For supplier payments - cash impact is full amount paid out (negative)
  if (type === 'supplier_payment' || description.toLowerCase().includes('supplier payment')) {
    return -Math.abs(debit)
  }
  
  // For manual/other transactions - cash impact = actual net money movement
  return credit - debit
}

// FIXED: Total Cash Impact
const getTotalCashImpact = () => {
  if (!filteredTransactions) return 0

  let totalCashImpact = 0

  filteredTransactions.forEach((t) => {
    if (t) {
      totalCashImpact += getCashImpact(t)
    }
  })

  return totalCashImpact
}

// NEW: Get actual money in/out amounts (not profit)
const getMoneyFlowAmount = (transaction: any) => {
  if (!transaction) return 0
  
  const type = transaction.type?.toLowerCase()
  const description = transaction.description || ""
  const received = n(transaction.received)
  const credit = n(transaction.credit)
  const debit = n(transaction.debit)
  
  // For sales - money in is product revenue (courier charge is on sale_shipping lines)
  if (type === 'sale') {
    return credit > 0 ? credit : received
  }

  if (type === 'sale_shipping') {
    return credit > 0 ? credit : -debit
  }
  
  // For sale adjustments - net money movement from ledger
  if (isSaleAdjustment(transaction)) {
    return getSaleAdjustmentNetCash(transaction)
  }
  
  // For purchases - money out is the actual paid amount
  if (type === 'purchase') {
    return received
  }
  
  // For purchase adjustments - money out is the additional payment made
  if (type === 'adjustment' && description.includes('Purchase')) {
    return received || debit
  }
  
  // For supplier payments - money out is the payment amount
  if (type === 'supplier_payment' || description.toLowerCase().includes('supplier payment')) {
    return Math.abs(debit)
  }
  
  // For manual transactions - money in/out based on type
  if (type === 'manual') {
    return credit > 0 ? credit : -debit
  }
  
  // Default for other transactions
  return credit > 0 ? credit : -debit
}

// NEW: Get money flow type (in/out) and display text
const getMoneyFlowInfo = (transaction: any) => {
  if (!transaction) {
    return {
      type: 'none',
      text: 'No Cash Flow',
      color: 'text-muted-foreground',
      amount: 0
    }
  }
  
  const type = transaction.type?.toLowerCase()
  const description = transaction.description || ""
  const amount = getMoneyFlowAmount(transaction)
  const received = n(transaction.received)
  const totalAmount = n(transaction.amount)
  
  // Sales - Money In
  if (type === 'sale') {
    if (received === 0) {
      return {
        type: 'none',
        text: 'Credit Sale',
        color: 'text-brand-blue',
        amount: 0
      }
    }
    if (received < totalAmount) {
      return {
        type: 'in',
        text: 'Partial Payment',
        color: 'text-emerald-600',
        amount: amount
      }
    }
    return {
      type: 'in',
      text: 'Full Payment',
      color: 'text-emerald-600',
      amount: amount
    }
  }
  
  // Sale adjustments - payment in, discount/refund out, or bill-only update
  if (isSaleAdjustment(transaction)) {
    const flowAmount = getMoneyFlowAmount(transaction)

    if (flowAmount < 0 || isSaleRefundOrDiscount(transaction)) {
      return {
        type: "out",
        text: description.includes("Discount change") ? "Discount Applied" : "Refund",
        color: "text-rose-600",
        amount: Math.abs(flowAmount),
      }
    }

    if (flowAmount > 0) {
      return {
        type: "in",
        text: "Additional Payment",
        color: "text-emerald-600",
        amount: flowAmount,
      }
    }

    return {
      type: "none",
      text: "Bill Updated",
      color: "text-muted-foreground",
      amount: 0,
    }
  }
  
  // Purchases - Money Out
  if (type === 'purchase') {
    if (received === 0) {
      return {
        type: 'none',
        text: 'Credit Purchase',
        color: 'text-brand-blue',
        amount: 0
      }
    }
    if (received < totalAmount) {
      return {
        type: 'out',
        text: 'Partial Payment',
        color: 'text-rose-600',
        amount: amount
      }
    }
    return {
      type: 'out',
      text: 'Full Payment',
      color: 'text-rose-600',
      amount: amount
    }
  }
  
  // Purchase adjustments - Money Out
  if (type === 'adjustment' && description.includes('Purchase')) {
    return {
      type: 'out',
      text: 'Additional Payment',
      color: 'text-rose-600',
      amount: amount
    }
  }
  
  // Supplier payments - Money Out
  if (type === 'supplier_payment' || description.toLowerCase().includes('supplier payment')) {
    return {
      type: 'out',
      text: 'Supplier Payment',
      color: 'text-rose-600',
      amount: amount
    }
  }
  
  // Manual transactions
  if (type === 'manual') {
    const credit = n(transaction.credit)
    const debit = n(transaction.debit)
    
    if (credit > 0) {
      return {
        type: 'in',
        text: 'Money In',
        color: 'text-emerald-600',
        amount: amount
      }
    } else if (debit > 0) {
      return {
        type: 'out',
        text: 'Money Out',
        color: 'text-rose-600',
        amount: amount
      }
    }
  }
  
  // Default cases
  const cashImpact = getCashImpact(transaction)
  if (cashImpact > 0) {
    return {
      type: 'in',
      text: 'Money In',
      color: 'text-emerald-600',
      amount: Math.abs(cashImpact)
    }
  } else if (cashImpact < 0) {
    return {
      type: 'out',
      text: 'Money Out',
      color: 'text-rose-600',
      amount: Math.abs(cashImpact)
    }
  }
  
  return {
    type: 'none',
    text: 'No Cash Flow',
    color: 'text-muted-foreground',
    amount: 0
  }
}

// ADDED: Get filtered COGS (Cost of Goods Sold)
const getFilteredCogs = () => {
  if (!filteredTransactions) return 0

  const cogsMap = new Map()
  let totalCogs = 0

  filteredTransactions.forEach((t) => {
    if (!t) return
    
    const type = t.type?.toLowerCase()
    const saleId = t.sale_id
    const description = t.description || ""
    
    // For sales, only count cost once per sale_id to avoid double counting
    if (type === 'sale' && saleId) {
      if (!cogsMap.has(saleId)) {
        cogsMap.set(saleId, n(t.cost))
        totalCogs += n(t.cost)
      }
    }
    // For adjustments, extract COGS from description if available
    else if (type === 'adjustment' && description.includes('Sale')) {
      const costMatch = description.match(/COGS recognized:?\s*([\d.]+)/i)
      if (costMatch) {
        const extractedCost = n(costMatch[1])
        totalCogs += extractedCost
      }
    }
    // For other transaction types, add their cost
    else {
      totalCogs += n(t.cost)
    }
  })

  return totalCogs
}

// Calculate remaining amount for credit sales and purchases
// FIXED: Calculate remaining amount for credit sales and purchases including adjustments
const getRemainingAmount = (transaction: any) => {
  if (!transaction) return 0
  
  const status = transaction.status?.toLowerCase()
  const type = transaction.type?.toLowerCase()
  const description = transaction.description || ""
  const totalAmount = n(transaction.amount)
  const receivedAmount = n(transaction.received)
  
  // For sale adjustments - use effective totals after all adjustments
  if (isSaleAdjustment(transaction)) {
    const saleId = extractIdFromDescription(description)

    if (saleId) {
      const originalSale = financialData?.transactions?.find(
        (st) => st && st.sale_id === saleId && st.type?.toLowerCase() === "sale",
      )

      if (originalSale) {
        const saleAdjustments =
          financialData?.transactions?.filter(
            (t) =>
              t &&
              t.type?.toLowerCase() === "adjustment" &&
              t.description?.includes(`#${saleId}`),
          ) || []

        let effectiveTotal = n(originalSale.amount)
        let effectiveReceived = n(originalSale.received)

        saleAdjustments.forEach((adj) => {
          effectiveTotal += n(adj.amount)
          effectiveReceived += n(adj.received)
        })

        return Math.max(0, effectiveTotal - effectiveReceived)
      }
    }
    return 0
  }
  
  // For purchase adjustments - calculate remaining based on original purchase
  if (type === 'adjustment' && description.includes('Purchase')) {
    const purchaseId = extractIdFromDescription(description)
    
    if (purchaseId) {
      // Find the original purchase
      const originalPurchase = financialData?.transactions?.find(
        st => st && st.purchase_id === purchaseId && st.type?.toLowerCase() === 'purchase'
      )
      
      if (originalPurchase) {
        const originalTotal = n(originalPurchase.amount)
        const originalPaid = n(originalPurchase.received)
        
        // Find all adjustments for this purchase to calculate total paid so far
        const purchaseAdjustments = financialData?.transactions?.filter(
          t => t && t.type?.toLowerCase() === 'adjustment' && 
               t.description?.includes(`#${purchaseId}`) &&
               t !== transaction // Exclude current transaction
        ) || []
        
        let totalPaidSoFar = originalPaid
        purchaseAdjustments.forEach(adj => {
          totalPaidSoFar += n(adj.received) || n(adj.debit)
        })
        
        // Add current transaction amount
        const currentAmount = n(transaction.received) || n(transaction.debit)
        totalPaidSoFar += currentAmount
        
        const remaining = Math.max(0, originalTotal - totalPaidSoFar)
        
        return remaining
      }
    }
    return 0
  }
  
  // For regular credit sales, remaining = total amount - received amount
  if (status === 'credit' && type === 'sale') {
    return Math.max(0, totalAmount - receivedAmount)
  }
  
  // For credit purchases, remaining = total amount - received amount
  if (status === 'credit' && type === 'purchase') {
    return Math.max(0, totalAmount - receivedAmount)
  }
  
  // For completed sales with partial payment
  if (status === 'completed' && receivedAmount < totalAmount) {
    return Math.max(0, totalAmount - receivedAmount)
  }
  
  // For paid purchases with partial payment
  if (status === 'paid' && receivedAmount < totalAmount) {
    return Math.max(0, totalAmount - receivedAmount)
  }
  
  return 0
}

const getAmountReceived = () => {
  if (!filteredTransactions) return 0
  
  let totalReceived = 0

  filteredTransactions.forEach((t) => {
    if (!t) return
    
    const type = t.type?.toLowerCase()
    const description = t.description || ""
    const received = n(t.received)
    const credit = n(t.credit)
    
    // For sales - count full received amount
    if (type === 'sale') {
      totalReceived += received
    }
    // For sale adjustments - count full additional money received
    else if (type === 'adjustment' && description.includes('Sale')) {
      totalReceived += (received > 0 ? received : credit)
    }
    // For purchase refunds - count full refund amount
    else if (type === 'adjustment' && description.includes('Purchase') && credit > 0) {
      totalReceived += credit
    }
    // For other transactions - count credit amounts (money coming in)
    else if (credit > 0) {
      totalReceived += credit
    }
  })

  return totalReceived
}

const getTotalReceived = () => {
  return getAmountReceived()
}

// FIXED: Get spends (money out) - consistent with getAmountReceived logic
const getSpends = () => {
  if (!filteredTransactions) return 0
  
  let totalSpends = 0

  filteredTransactions.forEach((t) => {
    if (!t) return
    
    const type = t.type?.toLowerCase()
    const description = t.description || ""
    const received = n(t.received)
    const debit = n(t.debit)
    
    // For purchases - count full amount spent
    if (type === 'purchase') {
      totalSpends += received
    }
    // For purchase adjustments (payments) - count additional payment
    else if (type === 'adjustment' && description.includes('Purchase') && debit > 0) {
      totalSpends += debit
    }
    // For supplier payments - count full amount paid
    else if (type === 'supplier_payment' || description.toLowerCase().includes('supplier payment')) {
      totalSpends += Math.abs(debit)
    }
    // For other transactions - count debit amounts (money going out)
    else if (debit > 0) {
      totalSpends += debit
    }
  })

  return totalSpends
}

const getTotalSpends = () => {
  return getSpends()
}

// FIXED: Calculate sales total including adjustments
const getSalesTotal = () => {
  if (!filteredTransactions) return 0
  
  const saleAmounts = new Map()
  
  // First pass: collect all sale IDs and their base amounts
  filteredTransactions.forEach((t) => {
    if (!t) return
    
    const type = t.type?.toLowerCase()
    
    if (type === 'sale' && t.sale_id) {
      // Store the original sale amount
      saleAmounts.set(t.sale_id, n(t.amount))
    }
  })
  
  // Second pass: process adjustments to update the total amounts
  filteredTransactions.forEach((t) => {
    if (!t) return
    
    const type = t.type?.toLowerCase()
    const description = t.description || ""
    
    if (type === 'adjustment' && description.includes('Sale')) {
      const saleId = extractIdFromDescription(description)
      
      if (saleId && saleAmounts.has(saleId)) {
        // Extract the new total amount from adjustment description
        const toMatch = description.match(/(?:increased|changed)\s+(?:from\s+[\d.]+\s+)?to\s+([\d.]+)/i)
        const increasedByMatch = description.match(/amount increased by\s+([\d.]+)/i)
        
        if (toMatch) {
          // If we find "to X", that's the new total
          const newTotal = n(toMatch[1])
          saleAmounts.set(saleId, newTotal)
        } else if (increasedByMatch) {
          // If we find "increased by X", add it to current
          const currentAmount = saleAmounts.get(saleId) || 0
          const increaseAmount = n(increasedByMatch[1])
          saleAmounts.set(saleId, currentAmount + increaseAmount)
        } else if (n(t.amount) !== 0) {
          const currentAmount = saleAmounts.get(saleId) || 0
          saleAmounts.set(saleId, currentAmount + n(t.amount))
        }
      }
    }
  })
  
  // Sum up all final amounts
  let total = 0
  saleAmounts.forEach((amount) => {
    total += amount
  })
  
  return total
}

// FIXED: Calculate purchases total from filtered transactions including adjustments
const getPurchasesTotal = () => {
  if (!filteredTransactions) return 0
  
  const purchaseMap = new Map()
  
  filteredTransactions.forEach((t) => {
    if (!t) return
    
    const type = t.type?.toLowerCase()
    const description = t.description || ""
    
    if (type === 'purchase' && t.purchase_id) {
      purchaseMap.set(t.purchase_id, n(t.amount))
    }
    else if (type === 'adjustment' && description.includes('Purchase')) {
      const purchaseId = extractIdFromDescription(description)
      if (purchaseId) {
        const currentAmount = purchaseMap.get(purchaseId) || 0
        let adjustmentAmount = 0
        
        // Extract from description
        const paymentMatch = description.match(/Payment increased by\s*([\d.]+)/i)
        if (paymentMatch) {
          adjustmentAmount = n(paymentMatch[1])
        }
        
        purchaseMap.set(purchaseId, currentAmount + adjustmentAmount)
      }
    }
  })
  
  let total = 0
  purchaseMap.forEach((amount, purchaseId) => {
    total += amount
  })
  
  return total
}

const getTotalProfit = () => {
  if (!filteredTransactions) return 0

  let totalProfit = 0

  filteredTransactions.forEach((t) => {
    if (t) {
      totalProfit += getProfit(t)
    }
  })

  return totalProfit
}

// Balance calculations
const getOpeningBalance = () => {
  return balances?.openingBalance || 0
}

const getClosingBalance = () => {
  return balances?.closingBalance ?? 0
}

const getTransactionTypeIcon = (type: string) => {
  switch (type?.toLowerCase()) {
    case "sale":
      return <ShoppingCart className="h-4 w-4" />
    case "purchase":
      return <Package className="h-4 w-4" />
    case "supplier_payment":
      return <CreditCard className="h-4 w-4" />
    case "manual":
      return <Plus className="h-4 w-4" />
    case "adjustment":
      return <RefreshCw className="h-4 w-4" />
    default:
      return <Clock className="h-4 w-4" />
  }
}

const formatDate = (date: Date) => {
  return format(date, "M/d/yyyy")
}

const setToday = () => {
  const today = new Date()
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  handleDateFromChange(todayStart)
  handleDateToChange(todayEnd)
}

const setLastWeek = () => {
  const today = new Date()
  const lastWeekStart = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 })
  const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999)

  handleDateFromChange(lastWeekStart)
  handleDateToChange(todayEnd)
}

// Parse raw adjustment descriptions into short, readable labels
const formatSaleAdjustmentDescription = (description: string) => {
  const saleId = extractIdFromDescription(description)
  const prefix = `Sale #${saleId || "N/A"}`

  if (description.includes("RETURNED") || description.includes("RETURN")) {
    return `${prefix} · Returned`
  }
  if (description.includes("Credit Payment Received")) {
    const paymentMatch = description.match(/Payment:\s*([\d.]+)/i)
    return paymentMatch
      ? `${prefix} · Credit payment ${currency} ${paymentMatch[1]}`
      : `${prefix} · Credit payment received`
  }

  const details: string[] = []
  const discountMatch = description.match(/Discount change:\s*([+-]?[\d.]+)/i)
  if (discountMatch) {
    details.push(`Discount ${discountMatch[1]}`)
  }

  const statusMatch = description.match(/Status:\s*(.+?)(?:\s*\||$)/i)
  if (statusMatch) {
    details.push(statusMatch[1].trim())
  }

  const paymentIncreasedMatch = description.match(/Payment increased by\s*([\d.]+)/i)
  if (paymentIncreasedMatch) {
    details.push(`Payment +${currency} ${paymentIncreasedMatch[1]}`)
  }

  const paymentDecreasedMatch = description.match(/Payment decreased by\s*([\d.]+)/i)
  if (paymentDecreasedMatch) {
    details.push(`Refund ${currency} ${paymentDecreasedMatch[1]}`)
  }

  if (details.length > 0) {
    return `${prefix} · ${details.join(" · ")}`
  }

  const cleaned = description.replace(/^Sale #\d+\s*-\s*/i, "").replace(/\s*\|\s*/g, " · ")
  return cleaned ? `${prefix} · ${cleaned}` : `${prefix} · Updated`
}

const formatPurchaseAdjustmentDescription = (description: string) => {
  const purchaseId = extractIdFromDescription(description)
  const prefix = `Purchase #${purchaseId || "N/A"}`
  const cleaned = description.replace(/^Purchase #\d+\s*-\s*/i, "").replace(/\s*-\s*/g, " · ")
  return cleaned ? `${prefix} · ${cleaned}` : `${prefix} · Updated`
}

// NEW: Enhanced description generator
const getEnhancedDescription = (transaction: any) => {
  if (!transaction) return "Unknown Transaction"
  
  const type = transaction.type?.toLowerCase()
  const description = transaction.description || ""
  const amount = n(transaction.amount)
  const received = n(transaction.received)
  const status = transaction.status?.toLowerCase()
  
  // Sale transactions
  if (type === 'sale') {
    if (status === 'credit') {
      return `Credit Sale #${transaction.sale_id || 'N/A'} - ${currency} ${amount.toFixed(2)} (Pending: ${currency} ${(amount - received).toFixed(2)})`
    } else if (status === 'completed') {
      if (received < amount) {
        return `Partial Payment Sale #${transaction.sale_id || 'N/A'} - ${currency} ${amount.toFixed(2)} (Paid: ${currency} ${received.toFixed(2)})`
      } else {
        return `Completed Sale #${transaction.sale_id || 'N/A'} - ${currency} ${amount.toFixed(2)}`
      }
    }
    return `Sale #${transaction.sale_id || 'N/A'} - ${currency} ${amount.toFixed(2)}`
  }
  
  // Purchase transactions
  if (type === 'purchase') {
    if (status === 'credit') {
      return `Credit Purchase #${transaction.purchase_id || 'N/A'} - ${currency} ${amount.toFixed(2)} (Pending: ${currency} ${(amount - received).toFixed(2)})`
    } else if (status === 'paid') {
      if (received < amount) {
        return `Partial Payment Purchase #${transaction.purchase_id || 'N/A'} - ${currency} ${amount.toFixed(2)} (Paid: ${currency} ${received.toFixed(2)})`
      } else {
        return `Paid Purchase #${transaction.purchase_id || 'N/A'} - ${currency} ${amount.toFixed(2)}`
      }
    }
    return `Purchase #${transaction.purchase_id || 'N/A'} - ${currency} ${amount.toFixed(2)}`
  }
  
  // Adjustment transactions
  if (type === 'adjustment') {
    if (description.includes('Sale')) {
      return formatSaleAdjustmentDescription(description)
    }
    if (description.includes('Purchase')) {
      return formatPurchaseAdjustmentDescription(description)
    }
    return `Adjustment · ${description.replace(/\s*\|\s*/g, " · ")}`
  }
  
  // Supplier payments
  if (type === 'supplier_payment' || description.toLowerCase().includes('supplier payment')) {
    return `Supplier Payment - ${currency} ${Math.abs(n(transaction.debit)).toFixed(2)}`
  }
  
  // Manual transactions
  if (type === 'manual') {
    return `Manual Entry: ${description || 'No description'}`
  }
  
  // Fallback to original description
  return description || "Transaction"
}

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-violet-600 to-violet-700 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-white" />
            <div>
              <h1 className="text-xl font-bold text-white">Financial Dashboard</h1>
              <div className="text-sm text-violet-100">
                {format(dateFrom, "yyyy-MM-dd") === format(dateTo, "yyyy-MM-dd")
                  ? `${formatDate(dateFrom)} Transactions`
                  : `${formatDate(dateFrom)} - ${formatDate(dateTo)} Transactions`}
                {lastUpdated && (
                  <span className="ml-2 text-xs">Last updated: {format(new Date(lastUpdated), "HH:mm")}</span>
                )}
              </div>
            </div>
          </div>

          {/* Opening and Closing Balance in Header */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-xs text-violet-200">Opening Balance</div>
              <div className="text-lg font-bold text-white">
                {isDataLoading ? (
                  <Skeleton className="h-6 w-24 bg-white/20" />
                ) : (
                  `${currency} ${getOpeningBalance().toFixed(2)}`
                )}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xs text-violet-200">Closing Balance</div>
              <div className="text-lg font-bold text-white">
                {isDataLoading ? (
                  <Skeleton className="h-6 w-24 bg-white/20" />
                ) : (
                  `${currency} ${getClosingBalance().toFixed(2)}`
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 mt-3">
          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 text-white border-0 hover:bg-white/30"
            onClick={openDateModal}
          >
            <Calendar className="h-4 w-4 mr-2" />
            {format(dateFrom, "yyyy-MM-dd") === format(dateTo, "yyyy-MM-dd")
              ? formatDate(dateFrom)
              : `${formatDate(dateFrom)} - ${formatDate(dateTo)}`}
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 text-white border-0 hover:bg-white/30"
            onClick={setToday}
          >
            Today
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 text-white border-0 hover:bg-white/30"
            onClick={setLastWeek}
          >
            Last Week
          </Button>

          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-white/70" />
            <Input
              placeholder="Search transactions..."
              className="pl-8 bg-white/20 border-0 text-white placeholder:text-white/70 h-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[130px] bg-white/20 border-0 text-white h-9">
              <div className="flex items-center">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Types" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="income">
                <div className="flex items-center gap-2">
                  <ArrowUpCircle className="h-4 w-4 text-emerald-600" />
                  Income
                </div>
              </SelectItem>
              <SelectItem value="expense">
                <div className="flex items-center gap-2">
                  <ArrowDownCircle className="h-4 w-4 text-rose-600" />
                  Expense
                </div>
              </SelectItem>
              <SelectItem value="sale">Sales</SelectItem>
              <SelectItem value="purchase">Purchases</SelectItem>
              <SelectItem value="adjustment">Adjustments</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 text-white border-0 hover:bg-white/30"
            onClick={handlePrintReport}
          >
            <Download className="h-4 w-4 mr-2" />
            Print
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 text-white border-0 hover:bg-white/30"
            onClick={() => setIsManualDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="bg-white/20 text-white border-0 hover:bg-white/30"
            onClick={forceRefreshData}
            disabled={isLoading || isBackgroundLoading}
          >
            {isLoading || isBackgroundLoading ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            {isLoading ? "Loading..." : isBackgroundLoading ? "Updating..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="space-y-2">
        {/* Filter indicator */}
        {(filterType !== "all" || searchTerm) && (
          <div className="rounded-lg bg-violet-500/30 px-3 py-1 text-sm text-violet-50">
            📊 Showing {filteredTransactions.length} filtered transactions
            {filterType !== "all" && ` • Filter: ${filterType}`}
            {searchTerm && ` • Search: "${searchTerm}"`}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-2">
          {isDataLoading ? (
            Array.from({ length: 7 }).map((_, i) => <SummaryCardSkeleton key={i} />)
          ) : (
            <>
              {/* Total Sales */}
              <Card className="border border-emerald-100 bg-emerald-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-emerald-700">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="text-xs font-medium">Sales</span>
                  </div>
                  <div className="text-lg font-bold text-emerald-700">{`${currency} ${getSalesTotal().toFixed(2)}`}</div>
                  <div className="mt-1 text-[10px] text-emerald-600">
                    {
                      filteredTransactions.filter(
                        (t) => t.type === "sale" || t.description?.toLowerCase().startsWith("sale"),
                      ).length
                    }{" "}
                    transactions
                  </div>
                </CardContent>
              </Card>

              {/* Total Purchases */}
              <Card className="border border-amber-100 bg-amber-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-amber-700">
                    <Package className="h-4 w-4" />
                    <span className="text-xs font-medium">Purchases</span>
                  </div>
                  <div className="text-lg font-bold text-amber-700">{`${currency} ${getPurchasesTotal().toFixed(2)}`}</div>
                  <div className="mt-1 text-[10px] text-amber-600">
                    {
                      filteredTransactions.filter(
                        (t) => t.type === "purchase" || t.description?.toLowerCase().startsWith("purchase"),
                      ).length
                    }{" "}
                    transactions
                  </div>
                </CardContent>
              </Card>

              {/* Profit */}
              <Card className="border border-blue-100 bg-blue-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-blue-700">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-xs font-medium">Profit</span>
                  </div>
                  <div className="text-lg font-bold text-blue-700">{`${currency} ${getTotalProfit().toFixed(2)}`}</div>
                  {!hideCogs && (
                    <div className="mt-1 text-[10px] text-brand-blue">
                      COGS: {currency} {getFilteredCogs().toFixed(2)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Money In */}
              <Card className="border border-emerald-100 bg-emerald-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-emerald-700">
                    <ArrowDownCircle className="h-4 w-4" />
                    <span className="text-xs font-medium">Money In</span>
                  </div>
                  <div className="text-lg font-bold text-emerald-700">{`${currency} ${getAmountReceived().toFixed(2)}`}</div>
                  <div className="mt-1 text-[10px] text-emerald-600">
                    Inflows: {filteredTransactions.filter((t) => getCashImpact(t) > 0).length}
                  </div>
                </CardContent>
              </Card>

              {/* Money Out */}
              <Card className="border border-rose-100 bg-rose-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-rose-700">
                    <CreditCard className="h-4 w-4" />
                    <span className="text-xs font-medium">Money Out</span>
                  </div>
                  <div className="text-lg font-bold text-rose-700">{`${currency} ${getSpends().toFixed(2)}`}</div>
                  <div className="mt-1 text-[10px] text-rose-600">
                    Outflows: {filteredTransactions.filter((t) => getCashImpact(t) < 0).length}
                  </div>
                </CardContent>
              </Card>

              {/* Receivables */}
              <Card className="border border-violet-100 bg-violet-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-violet-700">
                    <Users className="h-4 w-4" />
                    <span className="text-xs font-medium">Receivables</span>
                  </div>
                  <div className="text-lg font-bold text-violet-700">
                    {`${currency} ${(financialData?.accountsReceivable || 0).toFixed(2)}`}
                  </div>
                  <div className="mt-1 text-[10px] text-violet-600">{(financialData?.receivables || []).length} pending</div>
                </CardContent>
              </Card>

              {/* Payables */}
              <Card className="border border-amber-100 bg-amber-50">
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center gap-1 text-amber-700">
                    <Building className="h-4 w-4" />
                    <span className="text-xs font-medium">Payables</span>
                  </div>
                  <div className="text-lg font-bold text-amber-700">
                    {`${currency} ${(financialData?.accountsPayable || 0).toFixed(2)}`}
                  </div>
                  <div className="mt-1 text-[10px] text-amber-600">{(financialData?.payables || []).length} pending</div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Tabs and Content */}
      <div className="rounded-xl border border-border bg-card">
        <Tabs defaultValue="transactions" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="px-4 pt-4">
            <TabsList className="grid w-full grid-cols-4 rounded-lg bg-muted p-1">
              <TabsTrigger value="transactions" className="rounded-md">
                Transactions
              </TabsTrigger>
              <TabsTrigger value="receivables" className="rounded-md">
                Receivables
              </TabsTrigger>
              <TabsTrigger value="payables" className="rounded-md">
                Payables
              </TabsTrigger>
              <TabsTrigger value="summary" className="rounded-md">
                Summary
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="transactions" className="p-4">
            {isDataLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TransactionSkeleton key={i} />
                ))}
              </div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No transactions found for the selected period
              </div>
            ) : (
              <div className="space-y-2">
                {/* Transaction Headers */}
                <div className="grid grid-cols-12 gap-4 rounded-lg bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
                  <div className="col-span-3">Description</div>
                  <div className="col-span-1 text-center">Type</div>
                  <div className="col-span-1 text-center">Status</div>
                  <div className="col-span-1 text-right">Total Bill</div>
                  <div className="col-span-1 text-right">Money In/Out</div>
                  <div className="col-span-1 text-right">Remaining</div>
                  {!hideCogs && <div className="col-span-1 text-right">Product Cost</div>}
                  <div className="col-span-1 text-right">Cash Impact</div>
                  <div className="col-span-2 text-right">Date & Time</div>
                </div>

                {filteredTransactions.map((transaction) => {
                  const dateTime = formatDateTime(transaction.date)
                  const cashImpact = getCashImpact(transaction)
                  const isPositive = cashImpact > 0
                  const isNegative = cashImpact < 0
                  const remainingAmount = getRemainingAmount(transaction)
                  const moneyFlowInfo = getMoneyFlowInfo(transaction)
                  const enhancedDescription = getEnhancedDescription(transaction)

                  // Determine transaction type and extract the correct ID
                  const isSale = transaction.type === "sale" || transaction.description?.toLowerCase().startsWith("sale")
                  const isPurchase = transaction.type === "purchase" || transaction.description?.toLowerCase().startsWith("purchase")
                  const isManual = transaction.type === "manual" || transaction.description?.toLowerCase().includes("manual")
                  const isSupplierPayment = transaction.type === 'supplier_payment' || 
                                           transaction.description?.toLowerCase().includes('supplier payment')
                  
                  const handleClick = () => {
                    if (isSale) {
                      const saleId = transaction.sale_id || 
                                    transaction.reference_id || 
                                    extractIdFromDescription(transaction.description) ||
                                    transaction.id
                      setViewSaleId(saleId)
                    } else if (isPurchase) {
                      const purchaseId = transaction.purchase_id || 
                                        transaction.reference_id || 
                                        extractIdFromDescription(transaction.description) ||
                                        transaction.id
                      setViewPurchaseId(purchaseId)
                    } else if (isManual) {
                      setViewManualTransactionId(transaction.id)
                    } else if (isSupplierPayment) {
                      const paymentId = transaction.supplier_payment_id || 
                                       transaction.reference_id || 
                                       transaction.id
                      setViewSupplierPaymentId(paymentId)
                    }
                  }

                  return (
                    <div
                      key={transaction.id}
                      className="grid grid-cols-12 gap-4 cursor-pointer items-center rounded-lg border px-4 py-3 transition-colors hover:bg-violet-50"
                      onClick={handleClick}
                      tabIndex={0}
                      role="button"
                      aria-label={
                        isSale ? "View Sale" : 
                        isPurchase ? "View Purchase" : 
                        isSupplierPayment ? "View Supplier Payment" : 
                        "View Transaction"
                      }
                    >
                      {/* Description */}
                      <div className="col-span-3 flex items-center gap-2">
                        <div className="text-muted-foreground">
                          {getTransactionTypeIcon(transaction.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div
                            className="break-words text-sm font-medium leading-snug text-foreground"
                            title={transaction.description || enhancedDescription}
                          >
                            {enhancedDescription}
                          </div>
                        </div>
                      </div>

                      {/* Type */}
                      <div className="col-span-1 text-center">
                        <Badge variant="outline" className="text-xs capitalize">
                          {transaction.type || "unknown"}
                        </Badge>
                      </div>

                      {/* Status */}
                      <div className="col-span-1 text-center">
                        {getStatusBadge(transaction.status)}
                      </div>

                      {/* Total Bill Amount */}
                      <div className="col-span-1 text-right">
                        <div className="text-sm font-medium text-foreground">
                          {currency} {n(transaction.amount).toFixed(2)}
                        </div>
                      </div>

                      {/* Money In/Out */}
                      <div className="col-span-1 text-right">
                        {moneyFlowInfo.type !== 'none' ? (
                          <div className={`text-sm font-medium ${moneyFlowInfo.color}`}>
                            {moneyFlowInfo.type === 'in' ? '+' : '-'}{currency} {moneyFlowInfo.amount.toFixed(2)}
                            <div className="text-xs">{moneyFlowInfo.text}</div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {moneyFlowInfo.text}
                          </div>
                        )}
                      </div>

                      {/* Remaining */}
                      <div className="col-span-1 text-right">
                        <div className={`text-sm font-medium ${
                          remainingAmount > 0 
                            ? "text-amber-600" 
                            : "text-muted-foreground/60"
                        }`}>
                          {remainingAmount > 0 ? `${currency} ${remainingAmount.toFixed(2)}` : 'Paid'}
                        </div>
                      </div>

                      {/* Product Cost */}
                      {!hideCogs && (
                      <div className="col-span-1 text-right">
                        <div className="text-sm font-medium text-amber-600">
                          {currency} {n(transaction.cost).toFixed(2)}
                        </div>
                      </div>
                      )}

                      {/* Cash Impact */}
                      <div className="col-span-1 text-right">
                        <div className={`text-sm font-bold ${
                          isPositive 
                            ? "text-emerald-600" 
                            : isNegative 
                              ? "text-rose-600" 
                              : "text-muted-foreground"
                        }`}>
                          {isPositive ? "+" : isNegative ? "-" : ""}
                          {currency} {Math.abs(cashImpact).toFixed(2)}
                        </div>
                      </div>

                      {/* Date & Time */}
                      <div className="col-span-2 text-right">
                        <div className="text-xs text-muted-foreground">
                          <div>{dateTime.date}</div>
                          <div>{dateTime.time}</div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="receivables" className="p-4">
            {isDataLoading ? (
              <TableSkeleton />
            ) : (financialData?.receivables || []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No outstanding receivables</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Sale ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total Amount
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Received
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Outstanding
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Sale Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {financialData?.receivables.map((receivable) => (
                      <tr key={receivable.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                          #{receivable.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {receivable.customer_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground text-right">
                          {currency} {receivable.total_amount.toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-emerald-600">
                          {currency} {receivable.received_amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-600 font-medium text-right">
                          {currency} {receivable.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateOnly(receivable.due_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={receivable.days_overdue > 30 ? "destructive" : "default"}>
                            {receivable.days_overdue > 0 ? `${receivable.days_overdue} days old` : "Current"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="payables" className="p-4">
            {isDataLoading ? (
              <TableSkeleton />
            ) : (financialData?.payables || []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">No outstanding payables</div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-border">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Purchase ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Supplier
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Total Amount
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Paid
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Outstanding
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Purchase Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-card divide-y divide-border">
                    {financialData?.payables.map((payable) => (
                      <tr key={payable.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                          #{payable.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {payable.supplier_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground text-right">
                          {currency} {payable.total_amount.toFixed(2)}
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right text-sm text-emerald-600">
                          {currency} {payable.received_amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-rose-600 font-medium text-right">
                          {currency} {payable.amount.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {formatDateOnly(payable.due_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={payable.days_overdue > 30 ? "destructive" : "default"}>
                            {payable.days_overdue > 0 ? `${payable.days_overdue} days old` : "Current"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="summary" className="p-4">
            {isDataLoading ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="border rounded-lg p-4">
                    <Skeleton className="h-6 w-48 mb-4" />
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <div key={j} className="flex justify-between items-center">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <React.Fragment>
                {/* Filter Summary */}
                {(filterType !== "all" || searchTerm) && (
                  <div className="mb-6 rounded-lg border border-violet-200 bg-violet-50 p-4">
                    <h4 className="mb-2 font-medium text-violet-900">Filtered Data Summary</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm text-violet-700 md:grid-cols-4">
                      <div>
                        <span className="font-medium">Total Transactions:</span> {filteredTransactions.length}
                      </div>
                      <div>
                        <span className="font-medium">Date Range:</span> {format(dateFrom, "MMM d")} -{" "}
                        {format(dateTo, "MMM d")}
                      </div>
                      {filterType !== "all" && (
                        <div>
                          <span className="font-medium">Filter:</span> {filterType}
                        </div>
                      )}
                      {searchTerm && (
                        <div>
                          <span className="font-medium">Search:</span> "{searchTerm}"
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </React.Fragment>
            )}

            {/* Key Metrics Row - Updated to use filtered data */}
            {!isDataLoading && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-2xl font-bold text-brand-blue">
                    {filteredTransactions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Filtered Transactions</div>
                </div>
                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-2xl font-bold text-emerald-600">
                    {
                      filteredTransactions.filter(
                        (t) => t.type === "sale" || t.description?.toLowerCase().startsWith("sale"),
                      ).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">Sales Transactions</div>
                </div>
                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {
                      filteredTransactions.filter(
                        (t) => t.type === "purchase" || t.description?.toLowerCase().startsWith("purchase"),
                      ).length
                    }
                  </div>
                  <div className="text-sm text-muted-foreground">Purchase Transactions</div>
                </div>
                <div className="rounded-lg border border-border p-4 text-center">
                  <div className="text-2xl font-bold text-violet-600">
                    {getSalesTotal() > 0
                      ? (
                          getSalesTotal() /
                          Math.max(
                            1,
                            filteredTransactions.filter(
                              (t) => t.type === "sale" || t.description?.toLowerCase().startsWith("sale"),
                            ).length,
                          )
                        ).toFixed(2)
                      : "0.00"}
                  </div>
                  <div className="text-sm text-muted-foreground">Avg Sale Value</div>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Date Range Modal */}
      <Dialog open={isDateModalOpen} onOpenChange={setIsDateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Date Range</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="temp-date-from">From Date</Label>
              <SimpleDateInput
                id="temp-date-from"
                value={tempDateFrom}
                onDateChange={setTempDateFrom}
                placeholder="Start date"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="temp-date-to">To Date</Label>
              <SimpleDateInput
                id="temp-date-to"
                value={tempDateTo}
                onDateChange={setTempDateTo}
                placeholder="End date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDateModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyDateRange}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Transaction Dialog */}
      <Dialog open={isManualDialogOpen} onOpenChange={setIsManualDialogOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Manual Transaction</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="manual-type">Transaction Type</Label>
              <Select value={manualType} onValueChange={(value: "debit" | "credit") => setManualType(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="debit">Money Out (Debit)</SelectItem>
                  <SelectItem value="credit">Money In (Credit)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manual-amount">Amount ({currency})</Label>
              <Input
                id="manual-amount"
                type="number"
                step="0.01"
                min="0"
                value={manualAmount}
                onChange={(e) => setManualAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manual-category">Category *</Label>
              <Input
                id="manual-category"
                value={manualCategory}
                onChange={(e) => setManualCategory(e.target.value)}
                placeholder="e.g., Office Supplies, Petty Cash, Utilities"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manual-description">Description</Label>
              <Textarea
                id="manual-description"
                value={manualDescription}
                onChange={(e) => setManualDescription(e.target.value)}
                placeholder="Enter transaction description (optional)"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manual-payment-method">Payment Method</Label>
              <Select value={manualPaymentMethod} onValueChange={setManualPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Card">Card</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Check">Check</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="manual-date">Transaction Date</Label>
              <SimpleDateInput
                id="manual-date"
                value={manualDate}
                onDateChange={setManualDate}
                placeholder="Select date"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManualDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddManualTransaction}
              disabled={isAddingManual || !manualCategory || !manualAmount}
            >
              {isAddingManual ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                "Add Transaction"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Sale Modal */}
      <ViewSaleModal
        isOpen={!!viewSaleId}
        onClose={() => setViewSaleId(null)}
        saleId={viewSaleId}
        currency={currency}
        onEdit={handleEditSale}
        onDelete={handleDeleteSale}
        isDeleting={deletingSaleId === viewSaleId}
      />

      {/* View Purchase Modal */}
      <ViewPurchaseModal
        isOpen={!!viewPurchaseId}
        onClose={() => setViewPurchaseId(null)}
        purchaseId={viewPurchaseId}
        currency={currency}
        onEdit={handleEditPurchase}
        onDelete={handleDeletePurchase}
        isDeleting={deletingPurchaseId === viewPurchaseId}
      />

      {/* Edit Sale Modal */}
      <EditSaleModal
        isOpen={!!editSaleId}
        onClose={() => setEditSaleId(null)}
        saleId={editSaleId}
        userId={userId}
        deviceId={deviceId}
        currency={currency}
        onSaleUpdated={handleSaleUpdated}
      />

      {/* Edit Purchase Modal */}
      <EditPurchaseModal
        isOpen={!!editPurchaseId}
        onClose={() => setEditPurchaseId(null)}
        purchaseId={editPurchaseId}
        userId={userId}
        deviceId={deviceId}
        currency={currency}
        onPurchaseUpdated={handlePurchaseUpdated}
      />

      {/* View Manual Transaction Modal */}
      <ViewManualTransactionModal
        isOpen={!!viewManualTransactionId}
        onClose={() => setViewManualTransactionId(null)}
        transactionId={viewManualTransactionId}
        currency={currency}
        deviceId={deviceId}
        onEdit={(id) => {
          setViewManualTransactionId(null)
          setEditManualTransactionId(id)
        }}
        onTransactionDeleted={() => {
          forceRefreshData()
          notifySuccess(toast,"Manual transaction deleted successfully")
        }}
      />

      {/* Edit Manual Transaction Modal */}
      <EditManualTransactionModal
        isOpen={!!editManualTransactionId}
        onClose={() => setEditManualTransactionId(null)}
        transactionId={editManualTransactionId}
        currency={currency}
        onTransactionUpdated={() => {
          setEditManualTransactionId(null)
          forceRefreshData()
        }}
      />

      {/* View Supplier Payment Modal */}
      <ViewSupplierPaymentModal
        isOpen={!!viewSupplierPaymentId}
        onClose={() => setViewSupplierPaymentId(null)}
        paymentId={viewSupplierPaymentId}
        currency={currency}
        deviceId={deviceId}
        onEdit={handleEditSupplierPayment}
        onPaymentDeleted={() => {
          forceRefreshData()
          notifySuccess(toast,"Supplier payment deleted successfully")
        }}
      />

      <EditSupplierPaymentModal
        isOpen={!!editSupplierPaymentId}
        onClose={() => setEditSupplierPaymentId(null)}
        paymentId={editSupplierPaymentId}
        userId={userId}
        deviceId={deviceId}
        currency={currency}
        onPaymentUpdated={handleSupplierPaymentUpdated}
      />
      {ConfirmDialog}
    </div>
  )
}
