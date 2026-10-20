"use client"

import React, { useState, useEffect, useMemo } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Database,
  Loader2,
  Calendar,
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  Search,
  Building2,
  Tag,
  CreditCard,
  User,
  Info,
  X,
} from "lucide-react"
import { getManualCategoryDetails } from "@/app/actions/master-data-actions"
import { cn } from "@/lib/utils"

interface ManualCategoryDetailModalProps {
  categoryId: number | null
  deviceId?: number
  isOpen: boolean
  onClose: () => void
  currency?: string
}

export function ManualCategoryDetailModal({
  categoryId,
  deviceId,
  isOpen,
  onClose,
  currency = "INR",
}: ManualCategoryDetailModalProps) {
  const [loading, setLoading] = useState(true)
  const [details, setDetails] = useState<any>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [methodFilter, setMethodFilter] = useState<string>("all")
  const [typeFilter, setTypeFilter] = useState<string>("all")

  useEffect(() => {
    if (isOpen && categoryId) {
      fetchCategoryDetails()
      setSearchQuery("")
      setMethodFilter("all")
      setTypeFilter("all")
    } else {
      setDetails(null)
    }
  }, [isOpen, categoryId])

  const fetchCategoryDetails = async () => {
    if (!categoryId) return
    setLoading(true)
    try {
      const res = await getManualCategoryDetails(categoryId, deviceId)
      if (res.success && res.data) {
        setDetails(res.data)
      }
    } catch (err) {
      console.error("Failed to load manual category details:", err)
    } finally {
      setLoading(false)
    }
  }

  const category = details?.category
  const stats = details?.stats
  const transactions = details?.transactions || []
  const effectiveCurrency = details?.currency || currency

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: effectiveCurrency,
      maximumFractionDigits: 2,
    }).format(amount)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—"
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    } catch {
      return dateStr
    }
  }

  // Unique payment methods in transactions for the filter dropdown
  const paymentMethods = useMemo(() => {
    const set = new Set<string>()
    transactions.forEach((t: any) => {
      if (t.payment_method) set.add(t.payment_method)
    })
    return Array.from(set)
  }, [transactions])

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t: any) => {
      // Search text match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const desc = (t.description || "").toLowerCase()
        const method = (t.payment_method || "").toLowerCase()
        const createdBy = (t.created_by_name || "").toLowerCase()
        const amt = String(t.amount || t.debit_amount || "")
        if (!desc.includes(q) && !method.includes(q) && !createdBy.includes(q) && !amt.includes(q)) {
          return false
        }
      }

      // Payment method match
      if (methodFilter !== "all" && t.payment_method !== methodFilter) {
        return false
      }

      // Type match (debit / expense vs credit / income)
      if (typeFilter === "debit") {
        if (Number(t.debit_amount || 0) <= 0 && t.transaction_type !== "expense" && t.transaction_type !== "manual") {
          return false
        }
      } else if (typeFilter === "credit") {
        if (Number(t.credit_amount || 0) <= 0 && t.transaction_type !== "income") {
          return false
        }
      }

      return true
    })
  }, [transactions, searchQuery, methodFilter, typeFilter])

  // Dynamic stats that update immediately when filters (like Cash payment method) change
  const isFiltered = methodFilter !== "all" || typeFilter !== "all" || Boolean(searchQuery.trim())

  const activeStats = useMemo(() => {
    if (!isFiltered && stats) {
      return {
        totalCount: stats.totalCount || 0,
        totalDebit: stats.totalDebit || 0,
        totalCredit: stats.totalCredit || 0,
        thisMonthDebit: stats.thisMonthDebit || 0,
        averageAmount: stats.averageAmount || 0,
      }
    }

    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()

    let count = 0
    let totalDebit = 0
    let totalCredit = 0
    let thisMonthDebit = 0

    filteredTransactions.forEach((t: any) => {
      count++
      const debit = Number(t.debit_amount || (t.transaction_type === "expense" ? t.amount : 0)) || 0
      const credit = Number(t.credit_amount || (t.transaction_type === "income" ? t.amount : 0)) || 0
      totalDebit += debit
      totalCredit += credit

      if (t.transaction_date) {
        const txDate = new Date(t.transaction_date)
        if (!isNaN(txDate.getTime()) && txDate.getFullYear() === currentYear && txDate.getMonth() === currentMonth) {
          thisMonthDebit += debit
        }
      }
    })

    const averageAmount = count > 0 ? totalDebit / count : 0

    return {
      totalCount: count,
      totalDebit,
      totalCredit,
      thisMonthDebit,
      averageAmount,
    }
  }, [isFiltered, stats, filteredTransactions])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-hidden flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-slate-50/50">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-xl bg-violet-600/10 text-violet-700 border border-violet-200/60 flex items-center justify-center font-bold shadow-sm shrink-0">
                <Database className="h-6 w-6 text-violet-600" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <DialogTitle className="text-xl font-bold text-slate-900">
                    {category?.name || "Manual Entry Category"}
                  </DialogTitle>
                  {category?.code && (
                    <Badge variant="outline" className="text-[11px] font-mono border-slate-200 text-slate-600 bg-slate-50">
                      #{category.code}
                    </Badge>
                  )}
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[11px] font-medium",
                      category?.is_active !== false
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-slate-200 bg-slate-100 text-slate-600"
                    )}
                  >
                    {category?.is_active !== false ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-slate-500 flex items-center gap-3 mt-1.5 flex-wrap">
                  <span className="flex items-center gap-1 text-slate-600">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    <span>{details?.deviceName || "All Branches"}</span>
                  </span>
                  {category?.notes && (
                    <span className="flex items-center gap-1 text-slate-500 italic max-w-sm truncate" title={category.notes}>
                      <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" /> {category.notes}
                    </span>
                  )}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-500 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-violet-600" />
              <p className="text-sm font-medium">Loading category transactions and statistics...</p>
            </div>
          ) : !details ? (
            <div className="py-20 text-center text-slate-500 text-sm">
              No category details found.
            </div>
          ) : (
            <>
              {/* Stat Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                {/* Total Entries */}
                <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-200/80">
                  <div className="flex items-center justify-between text-slate-500 text-xs font-semibold">
                    <span>Total Entries</span>
                    <Receipt className="h-4 w-4 text-slate-400" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 mt-1.5">
                    {activeStats.totalCount}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {isFiltered ? `${methodFilter !== "all" ? methodFilter : "filtered"} entries` : "recorded entries"}
                  </p>
                </div>

                {/* Total Expenses / Debited */}
                <div className="bg-rose-50/60 p-3.5 rounded-xl border border-rose-100">
                  <div className="flex items-center justify-between text-rose-800 text-xs font-semibold">
                    <span>Total Expenses</span>
                    <ArrowDownRight className="h-4 w-4 text-rose-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-rose-900 mt-1.5 truncate" title={formatCurrency(activeStats.totalDebit)}>
                    {formatCurrency(activeStats.totalDebit)}
                  </div>
                  <p className="text-[11px] text-rose-600/80 mt-0.5">
                    {isFiltered ? `${methodFilter !== "all" ? methodFilter : "filtered"} spend` : "lifetime spent"}
                  </p>
                </div>

                {/* This Month */}
                <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-100">
                  <div className="flex items-center justify-between text-amber-800 text-xs font-semibold">
                    <span>This Month</span>
                    <Calendar className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-amber-900 mt-1.5 truncate" title={formatCurrency(activeStats.thisMonthDebit)}>
                    {formatCurrency(activeStats.thisMonthDebit)}
                  </div>
                  <p className="text-[11px] text-amber-600/80 mt-0.5">
                    {isFiltered ? `this month (${methodFilter !== "all" ? methodFilter : "filtered"})` : "current cycle"}
                  </p>
                </div>

                {/* Average per Entry */}
                <div className="bg-violet-50/60 p-3.5 rounded-xl border border-violet-100">
                  <div className="flex items-center justify-between text-violet-800 text-xs font-semibold">
                    <span>Average / Entry</span>
                    <Wallet className="h-4 w-4 text-violet-600" />
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-violet-900 mt-1.5 truncate" title={formatCurrency(activeStats.averageAmount)}>
                    {formatCurrency(activeStats.averageAmount)}
                  </div>
                  <p className="text-[11px] text-violet-600/80 mt-0.5">
                    {isFiltered ? `avg (${methodFilter !== "all" ? methodFilter : "filtered"})` : "average amount"}
                  </p>
                </div>
              </div>

              {/* Transaction History Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>Transaction History</span>
                      <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
                        {filteredTransactions.length} of {transactions.length}
                      </span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      Recent manual accounting entries associated with this category
                    </p>
                  </div>

                  {/* Filter Toolbar */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search description, staff, amount..."
                        className="h-8 w-48 sm:w-60 border-slate-200 bg-white pl-8 text-xs"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>

                    {paymentMethods.length > 0 && (
                      <select
                        value={methodFilter}
                        onChange={(e) => setMethodFilter(e.target.value)}
                        className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none"
                      >
                        <option value="all">All Methods</option>
                        {paymentMethods.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Transactions Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                  <div className="overflow-x-auto max-h-[380px]">
                    <table className="min-w-full border-separate border-spacing-0 text-xs">
                      <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-sm">
                        <tr className="text-slate-600 font-semibold uppercase tracking-wider text-[10px]">
                          <th className="px-4 py-2.5 text-left border-b border-slate-200">Date & Time</th>
                          <th className="px-4 py-2.5 text-left border-b border-slate-200">Description</th>
                          <th className="px-4 py-2.5 text-left border-b border-slate-200">Method</th>
                          <th className="px-4 py-2.5 text-left border-b border-slate-200">Recorded By</th>
                          <th className="px-4 py-2.5 text-right border-b border-slate-200">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center text-slate-400">
                              {transactions.length === 0
                                ? "No manual transactions recorded for this category yet."
                                : "No transactions match your current search filters."}
                            </td>
                          </tr>
                        ) : (
                          filteredTransactions.map((tx: any, idx: number) => {
                            const isCredit = Number(tx.credit_amount || 0) > 0 || tx.transaction_type === "income"
                            const amountVal = Number(tx.debit_amount || tx.credit_amount || tx.amount || 0)

                            return (
                              <tr
                                key={tx.id || idx}
                                className={cn(
                                  "hover:bg-slate-50/80 transition-colors",
                                  idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                                )}
                              >
                                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                  {formatDate(tx.transaction_date || tx.created_at)}
                                </td>
                                <td className="px-4 py-2.5 text-slate-800 font-medium max-w-[280px]">
                                  <div className="truncate" title={tx.description || "Manual Entry"}>
                                    {tx.description || "Manual Entry"}
                                  </div>
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200">
                                    <CreditCard className="h-3 w-3 text-slate-400" />
                                    <span>{tx.payment_method || "Cash"}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-600 whitespace-nowrap">
                                  <span className="flex items-center gap-1 text-[11px] text-slate-700">
                                    <User className="h-3 w-3 text-slate-400" />
                                    <span>{tx.created_by_name || "Staff"}</span>
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                                  <span
                                    className={cn(
                                      "inline-flex items-center gap-0.5",
                                      isCredit ? "text-emerald-600" : "text-rose-600"
                                    )}
                                  >
                                    {isCredit ? (
                                      <ArrowUpRight className="h-3.5 w-3.5" />
                                    ) : (
                                      <ArrowDownRight className="h-3.5 w-3.5" />
                                    )}
                                    <span>{formatCurrency(amountVal)}</span>
                                  </span>
                                </td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            Category ID: #{category?.id}
          </span>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs font-semibold">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
