"use client"

import React, { useState, useEffect, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  ShoppingCart,
  Banknote,
  CreditCard,
  Wallet,
  AlertCircle,
  RotateCcw,
  RefreshCw,
  Search,
  Eye,
  Loader2,
  Calendar,
  Package,
  History,
  Edit,
  ChevronRight,
  ChevronLeft,
  Download,
} from "lucide-react"
import { useAppSelector } from "@/store/hooks"
import ViewPurchaseModal from "@/components/purchases/view-purchase-modal"
import { TableRowsInput } from "@/components/ui/table-rows-input"
import { downloadPurchasesPDF } from "@/lib/purchases-pdf-utils"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { format } from "date-fns"

interface SupplierDetailPageProps {
  supplierId: number
  userId: number
  onBack: () => void
  onPayCredit?: (supplier: any) => void
  onViewPayments?: (supplier: any) => void
  onEditSupplier?: (supplierId: number) => void
}

export default function SupplierDetailPage({
  supplierId,
  userId,
  onBack,
  onPayCredit,
  onViewPayments,
  onEditSupplier,
}: SupplierDetailPageProps) {
  const { toast } = useToast()
  const [supplierData, setSupplierData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false)

  // Search & filter for purchases
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "Paid" | "Credit">("all")

  // Pagination state (like other tables)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // View purchase modal state
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null)
  const [isViewPurchaseModalOpen, setIsViewPurchaseModalOpen] = useState(false)

  // Currency from Redux
  const currency = useAppSelector((state) => state.device.currency) || "INR"

  const loadSupplierData = useCallback(async () => {
    if (!supplierId) return
    setIsLoading(true)
    setError(null)

    try {
      const { getSupplierWithPurchases } = await import("@/app/actions/supplier-actions")
      const response = await getSupplierWithPurchases(supplierId, userId)
      if (response.success && response.data) {
        setSupplierData(response.data)
      } else {
        setError(response.message || "Failed to load supplier details")
      }
    } catch (err: any) {
      console.error("Failed to load supplier details:", err)
      setError(err?.message || "An unexpected error occurred while loading supplier details")
    } finally {
      setIsLoading(false)
    }
  }, [supplierId, userId])

  useEffect(() => {
    loadSupplierData()
  }, [loadSupplierData])

  const formatCurrency = useCallback(
    (amount: number): string => {
      try {
        return new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: currency === "AED" ? "AED" : "INR",
          minimumFractionDigits: 2,
        }).format(amount || 0)
      } catch {
        return `${currency} ${(amount || 0).toFixed(2)}`
      }
    },
    [currency],
  )

  const purchases = supplierData?.purchases || []
  const supplier = supplierData?.supplier

  // Filtered purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p: any) => {
      if (statusFilter !== "all") {
        const pStatus = (p.status || "").toLowerCase()
        if (statusFilter === "Paid" && pStatus !== "paid") return false
        if (statusFilter === "Credit" && pStatus !== "credit" && pStatus !== "partial") return false
      }

      if (!searchTerm.trim()) return true
      const term = searchTerm.toLowerCase().trim()
      const pId = String(p.id).toLowerCase()
      const pNum = (p.purchase_number || "").toLowerCase()
      const pNotes = (p.notes || "").toLowerCase()
      const pItems = (p.items_summary || "").toLowerCase()

      return (
        pId.includes(term) ||
        pNum.includes(term) ||
        pNotes.includes(term) ||
        pItems.includes(term) ||
        String(p.total_amount).includes(term)
      )
    })
  }, [purchases, statusFilter, searchTerm])

  // Reset page when filters change
  useEffect(() => {
    setPage(1)
  }, [searchTerm, statusFilter])

  const totalCount = filteredPurchases.length
  const totalPages = Math.ceil(totalCount / pageSize) || 1

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages)
    }
  }, [page, totalPages])

  const paginatedPurchases = useMemo(() => {
    const start = (page - 1) * pageSize
    return filteredPurchases.slice(start, start + pageSize)
  }, [filteredPurchases, page, pageSize])

  const handleOpenPurchase = (purchaseId: number) => {
    setSelectedPurchaseId(purchaseId)
    setIsViewPurchaseModalOpen(true)
  }

  const handleDownloadPDF = async () => {
    if (isDownloadingPDF) return
    if (!filteredPurchases || filteredPurchases.length === 0) {
      notifyWarning(toast, "No purchases found to download")
      return
    }

    setIsDownloadingPDF(true)
    try {
      // Include all filtered purchases across all pages with supplier name
      const allPurchasesForPDF = filteredPurchases.map((p: any) => ({
        ...p,
        supplier: p.supplier || supplier?.name || "—",
      }))

      const periodLabel = supplier?.name ? `${supplier.name} - Purchases` : "Supplier Purchases"
      await downloadPurchasesPDF(
        allPurchasesForPDF,
        periodLabel,
        formatCurrency,
        (p) => Number(p.received_amount) || 0,
        (p) => Math.max(0, (Number(p.total_amount) || 0) - (Number(p.received_amount) || 0)),
        (p) => p.payment_method || "—",
      )
      notifySuccess(toast, `Purchases PDF report downloaded successfully (${filteredPurchases.length} orders)`)
    } catch (err: any) {
      console.error("Error downloading purchases PDF:", err)
      notifyError(toast, err?.message || "Failed to download purchases PDF")
    } finally {
      setIsDownloadingPDF(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* TOP HEADER BAR */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 shrink-0 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Back button & Supplier Title */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="h-8 gap-1.5 px-3 text-xs font-semibold text-slate-700 hover:text-slate-900 border-slate-300 bg-white hover:bg-slate-50 shadow-2xs shrink-0 cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4 text-slate-600" />
              <span>Back to Suppliers</span>
            </Button>

            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                {supplier ? supplier.name : "Supplier Details"}
              </h1>
            </div>
          </div>

          {/* Action buttons on the right */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadSupplierData}
              disabled={isLoading}
              className="h-8 gap-1.5 px-2.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs cursor-pointer"
              title="Refresh supplier and purchase data"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-600 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {supplier && onPayCredit && (
              <Button
                size="sm"
                className="h-8 gap-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-2xs cursor-pointer"
                onClick={() =>
                  onPayCredit({
                    id: supplier.id,
                    name: supplier.name,
                    balance_amount: supplier.balance_amount || 0,
                    available_credit: supplier.available_credit || supplier.supplier_credit || 0,
                  })
                }
              >
                <CreditCard className="h-3.5 w-3.5" />
                <span>Pay Credit</span>
              </Button>
            )}

            {supplier && onViewPayments && (supplier.paid_amount || 0) > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-3 text-xs font-medium border-amber-200 text-amber-800 bg-amber-50/50 hover:bg-amber-100/60 shadow-2xs cursor-pointer"
                onClick={() => onViewPayments({ id: supplier.id, name: supplier.name })}
              >
                <History className="h-3.5 w-3.5 text-amber-700" />
                <span>Payments</span>
              </Button>
            )}

            {supplier && onEditSupplier && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 px-2.5 text-xs text-slate-700 bg-white hover:bg-slate-50 border-slate-200 shadow-2xs cursor-pointer"
                onClick={() => onEditSupplier(supplier.id)}
                title="Edit Supplier Details"
              >
                <Edit className="h-3.5 w-3.5 text-slate-600" />
                <span className="hidden sm:inline">Edit</span>
              </Button>
            )}
          </div>
        </div>

        {/* Supplier Contact Info Tags */}
        {supplier && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2.5 pt-2 border-t border-slate-100 text-xs text-slate-600">
            {supplier.phone && (
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span className="font-medium text-slate-800">{supplier.phone}</span>
              </div>
            )}
            {supplier.email && (
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                <span>{supplier.email}</span>
              </div>
            )}
            {supplier.address && (
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                <span className="truncate max-w-md">{supplier.address}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* BODY CONTENT SCROLLABLE */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        {isLoading && !supplierData ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
            <span className="text-sm font-medium">Loading supplier details and purchases...</span>
          </div>
        ) : error && !supplierData ? (
          <div className="bg-white rounded-xl border border-rose-200 p-8 text-center max-w-md mx-auto shadow-xs">
            <AlertCircle className="h-10 w-10 text-rose-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 mb-1">Failed to Load Supplier</h3>
            <p className="text-xs text-rose-600 mb-4">{error}</p>
            <Button onClick={loadSupplierData} variant="outline" size="sm" className="h-8 text-xs">
              Try Again
            </Button>
          </div>
        ) : supplierData ? (
          <>
            {/* FINANCIAL STATS CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="bg-white rounded-xl border border-blue-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Purchases</span>
                  <ShoppingCart className="h-4 w-4 text-blue-600" />
                </div>
                <div className="text-xl font-extrabold text-slate-900">
                  {supplier?.total_purchases || purchases.length || 0}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Orders recorded</div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Spend</span>
                  <Banknote className="h-4 w-4 text-slate-600" />
                </div>
                <div className="text-xl font-extrabold text-slate-900 truncate">
                  {formatCurrency(supplier?.total_amount || 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Gross purchases</div>
              </div>

              <div className="bg-white rounded-xl border border-emerald-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Total Paid</span>
                  <CreditCard className="h-4 w-4 text-emerald-600" />
                </div>
                <div className="text-xl font-extrabold text-emerald-600 truncate">
                  {formatCurrency(supplier?.paid_amount || 0)}
                </div>
                <div className="text-[11px] text-emerald-700/80 mt-0.5 font-medium">Settled payments</div>
              </div>

              <div className="bg-white rounded-xl border border-amber-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Balance</span>
                  <AlertCircle className={`h-4 w-4 ${(supplier?.outstanding_balance || supplier?.balance_amount || 0) > 0 ? "text-amber-600" : "text-emerald-600"}`} />
                </div>
                <div
                  className={`text-xl font-extrabold truncate ${
                    (supplier?.outstanding_balance || supplier?.balance_amount || 0) > 0
                      ? "text-amber-600"
                      : "text-emerald-600"
                  }`}
                >
                  {formatCurrency(supplier?.outstanding_balance || supplier?.balance_amount || 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Outstanding balance</div>
              </div>

              <div className="bg-white rounded-xl border border-sky-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Available Credit</span>
                  <Wallet className="h-4 w-4 text-sky-600" />
                </div>
                <div className="text-xl font-extrabold text-sky-600 truncate">
                  {formatCurrency(supplier?.available_credit || supplier?.supplier_credit || 0)}
                </div>
                <div className="text-[11px] text-sky-700/80 mt-0.5 font-medium">Advance / credit</div>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-2xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Refunded</span>
                  <RotateCcw className="h-4 w-4 text-slate-600" />
                </div>
                <div className="text-xl font-extrabold text-slate-700 truncate">
                  {formatCurrency(supplier?.refunded_credit || 0)}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Refunded credits</div>
              </div>
            </div>

            {/* PURCHASES TABLE CARD */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              {/* SECTION HEADER & FILTERS */}
              <div className="p-4 border-b border-slate-200 bg-white">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">Purchase Orders</h2>
                    <Badge variant="secondary" className="text-xs font-semibold bg-slate-100 text-slate-700 px-2 py-0.5">
                      {filteredPurchases.length} of {purchases.length}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Search */}
                    <div className="relative w-full sm:w-60">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Search purchase #, item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="h-8 pl-8 pr-3 text-xs bg-slate-50 border-slate-200 focus:bg-white"
                      />
                    </div>

                    {/* Status filter buttons */}
                    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                      <button
                        type="button"
                        onClick={() => setStatusFilter("all")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          statusFilter === "all"
                            ? "bg-white text-slate-900 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter("Paid")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          statusFilter === "Paid"
                            ? "bg-white text-emerald-700 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusFilter("Credit")}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                          statusFilter === "Credit"
                            ? "bg-white text-amber-700 shadow-2xs font-semibold"
                            : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        Credit
                      </button>
                    </div>

                    {/* PDF Download Button */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDownloadPDF}
                      disabled={isDownloadingPDF || filteredPurchases.length === 0}
                      className="h-8 gap-1.5 px-3 text-xs font-semibold bg-white border-slate-200 hover:bg-slate-50 text-slate-700 shadow-2xs cursor-pointer"
                      title={
                        filteredPurchases.length > 0
                          ? `Download all ${filteredPurchases.length} purchases as PDF`
                          : "Download purchases as PDF"
                      }
                    >
                      PDF
                      {isDownloadingPDF ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />
                      ) : (
                        <Download className="h-3.5 w-3.5 text-slate-600" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* TABLE VIEW (DESKTOP) */}
              {filteredPurchases.length === 0 ? (
                <div className="text-center py-12 px-4">
                  <Package className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-800">No purchases found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {searchTerm || statusFilter !== "all"
                      ? "Try adjusting your search or status filter"
                      : "No purchases recorded for this supplier yet"}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-slate-700">
                    <thead className="bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5">Purchase #</th>
                        <th className="px-3 py-2.5">Date</th>
                        <th className="px-3 py-2.5">Items Summary</th>
                        <th className="px-3 py-2.5 text-center">Items</th>
                        <th className="px-3 py-2.5 text-right">Total Amount</th>
                        <th className="px-3 py-2.5 text-right">Paid</th>
                        <th className="px-3 py-2.5 text-right">Balance</th>
                        <th className="px-3 py-2.5 text-center">Status</th>
                        <th className="px-4 py-2.5 text-center w-20">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedPurchases.map((purchase: any) => {
                        const total = Number(purchase.total_amount || 0)
                        const paid = Number(purchase.received_amount || 0)
                        const balance = Math.max(total - paid, 0)
                        const isCredit = purchase.status === "Credit" || purchase.status === "Partial"
                        const isPaid = purchase.status === "Paid"

                        let formattedDate = "—"
                        try {
                          if (purchase.purchase_date) {
                            formattedDate = format(new Date(purchase.purchase_date), "dd/MM/yyyy")
                          }
                        } catch {
                          formattedDate = String(purchase.purchase_date || "—")
                        }

                        return (
                          <tr
                            key={purchase.id}
                            onClick={() => handleOpenPurchase(purchase.id)}
                            className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                            title="Click to view purchase details"
                          >
                            <td className="px-4 py-3 font-bold text-slate-900 whitespace-nowrap">
                              <span className="text-blue-600 group-hover:underline">
                                #{purchase.purchase_number || purchase.id}
                              </span>
                            </td>

                            <td className="px-3 py-3 whitespace-nowrap text-slate-600">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-3 w-3 text-slate-400" />
                                <span>{formattedDate}</span>
                              </div>
                            </td>

                            <td className="px-3 py-3 max-w-xs truncate text-slate-700" title={purchase.items_summary}>
                              {purchase.items_summary || "—"}
                            </td>

                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <Badge variant="outline" className="text-[11px] font-medium border-slate-200 bg-slate-50">
                                {purchase.items_count || 1} {Number(purchase.items_count) === 1 ? "item" : "items"}
                              </Badge>
                            </td>

                            <td className="px-3 py-3 text-right font-bold text-slate-900 whitespace-nowrap">
                              {formatCurrency(total)}
                            </td>

                            <td className="px-3 py-3 text-right font-medium text-emerald-600 whitespace-nowrap">
                              {formatCurrency(paid)}
                            </td>

                            <td
                              className={`px-3 py-3 text-right font-bold whitespace-nowrap ${
                                balance > 0 ? "text-amber-600" : "text-emerald-600"
                              }`}
                            >
                              {formatCurrency(balance)}
                            </td>

                            <td className="px-3 py-3 text-center whitespace-nowrap">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  isPaid
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : isCredit && paid > 0
                                      ? "bg-amber-50 text-amber-700 border-amber-200"
                                      : "bg-rose-50 text-rose-700 border-rose-200"
                                }`}
                              >
                                {isPaid ? "Paid" : isCredit && paid > 0 ? "Partial" : "Credit"}
                              </span>
                            </td>

                            <td className="px-4 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleOpenPurchase(purchase.id)}
                                className="h-7 px-2.5 text-xs gap-1 border-slate-200 text-slate-700 hover:text-blue-600 hover:bg-blue-50 shadow-2xs cursor-pointer"
                                title="View Purchase Details"
                              >
                                <Eye className="h-3.5 w-3.5 text-slate-500" />
                                <span>View</span>
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* PAGINATION TOOLBAR */}
              {filteredPurchases.length > 0 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-[#F1F4F9] px-4 py-3 text-xs font-medium text-slate-600">
                  <div>
                    Showing {filteredPurchases.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
                    {Math.min(page * pageSize, filteredPurchases.length)} of {filteredPurchases.length} purchases
                  </div>
                  <div className="flex items-center gap-2">
                    <TableRowsInput
                      value={pageSize}
                      onChange={(newSize) => {
                        setPageSize(newSize)
                        setPage(1)
                      }}
                      disabled={isLoading}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs bg-white border-slate-200 hover:bg-slate-50 cursor-pointer"
                      disabled={page <= 1 || isLoading}
                      onClick={() => setPage(Math.max(1, page - 1))}
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
                      className="h-8 px-3 text-xs bg-white border-slate-200 hover:bg-slate-50 cursor-pointer"
                      disabled={page >= totalPages || isLoading}
                      onClick={() => setPage(Math.min(totalPages, page + 1))}
                    >
                      Next
                      <ChevronRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* VIEW PURCHASE DETAILS MODAL */}
      <ViewPurchaseModal
        isOpen={isViewPurchaseModalOpen}
        onClose={() => {
          setIsViewPurchaseModalOpen(false)
          setSelectedPurchaseId(null)
        }}
        purchaseId={selectedPurchaseId}
        currency={currency}
        onDelivered={() => loadSupplierData()}
        onEdit={() => loadSupplierData()}
      />
    </div>
  )
}
