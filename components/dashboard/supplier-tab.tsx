"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { format } from "date-fns"
import {
  Loader2,
  Search,
  Plus,
  Phone,
  Mail,
  Eye,
  Edit,
  Trash2,
  Users,
  TrendingUp,
  DollarSign,
  Banknote,
  MapPin,
  RefreshCw,
  CreditCard,
  History,
  FilePenLine,
  RotateCcw,
  Wallet,
  Calendar,
  CheckCircle,
  X,
} from "lucide-react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { usePathname } from "next/navigation"
import { selectActiveStaff } from "@/store/slices/staffSlice"
import {
  fetchSuppliers,
  fetchDeviceCurrency,
  deleteSupplier,
  setSearchTerm,
  setSelectedSupplierId,
  clearError,
  checkCacheExpiry,
  selectSuppliers,
  selectSuppliersLoading,
  selectSuppliersRefreshing,
  selectSuppliersError,
  selectSupplierSearchTerm,
  selectSupplierCurrency,
  selectSelectedSupplierId,
  selectFilteredSuppliers,
  selectSuppliersStats,
  selectShouldRefresh,
} from "@/store/slices/supplierSlice"
import { selectDeviceId } from "@/store/slices/deviceSlice"
import SimpleAddModal from "@/components/suppliers/simple-add-modal"
import SimpleViewModal from "@/components/suppliers/simple-view-modal"
import SimpleEditModal from "@/components/suppliers/simple-edit-modal"
import SupplierDetailPage from "@/components/suppliers/supplier-detail-page"
import PayCreditModal from "@/components/suppliers/pay-credit-modal"
import RefundCreditModal from "@/components/suppliers/refund-credit-modal"
import ViewSupplierPaymentModal from "@/components/suppliers/View-supplier-payment-model"
import EditSupplierPaymentModal from "@/components/suppliers/View-suplier-payment-edit"
import type { SupplierPaymentListRow } from "@/app/actions/supplier-payment-actions"
import { useConfirm } from "@/hooks/use-confirm"

interface SupplierTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
}

// Request deduplication utility
class RequestManager {
  private static activeRequests = new Map<string, Promise<any>>()
  private static cache = new Map<string, { data: any; timestamp: number }>()
  private static CACHE_DURATION = 30000 // 30 seconds cache

  static async executeRequest<T>(key: string, requestFn: () => Promise<T>, useCache: boolean = true): Promise<T> {
    // Check cache first
    if (useCache) {
      const cached = this.cache.get(key)
      if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
        console.log("🎯 Using cached result for:", key)
        return cached.data
      }
    }

    // Check if same request is already in progress
    if (this.activeRequests.has(key)) {
      console.log("⏳ Request already in progress, waiting:", key)
      return this.activeRequests.get(key)!
    }

    // Execute new request
    console.log("🚀 Executing new request:", key)
    const requestPromise = requestFn()
    this.activeRequests.set(key, requestPromise)

    try {
      const result = await requestPromise
      
      // Cache successful result
      if (useCache) {
        this.cache.set(key, { data: result, timestamp: Date.now() })
      }
      
      return result
    } finally {
      this.activeRequests.delete(key)
    }
  }

  static clearCache(pattern?: string) {
    if (pattern) {
      for (const [key] of this.cache) {
        if (key.includes(pattern)) {
          this.cache.delete(key)
        }
      }
    } else {
      this.cache.clear()
    }
  }

  static cancelRequest(key: string) {
    this.activeRequests.delete(key)
  }
}

export default function SupplierTab({
  userId,
  isAddModalOpen = false,
  onModalClose,
}: SupplierTabProps) {
  const dispatch = useAppDispatch()
  const { confirm, ConfirmDialog } = useConfirm()

  // Redux selectors
  const suppliers = useAppSelector(selectFilteredSuppliers)
  const allSuppliers = useAppSelector(selectSuppliers)
  const isLoading = useAppSelector(selectSuppliersLoading)
  const isRefreshing = useAppSelector(selectSuppliersRefreshing)
  const error = useAppSelector(selectSuppliersError)
  const reduxSearchTerm = useAppSelector(selectSupplierSearchTerm)
  const currency = useAppSelector((state) => state.device.currency) || "AED"
  const selectedSupplierId = useAppSelector(selectSelectedSupplierId)
  const stats = useAppSelector(selectSuppliersStats)
  const shouldRefresh = useAppSelector(selectShouldRefresh)
  const deviceId = useAppSelector(selectDeviceId)
  const activeStaff = useAppSelector(selectActiveStaff)
  const pathname = usePathname()
  const isPurchaseManager = activeStaff?.role === "purchase_manager" || Boolean(pathname?.startsWith("/purchase-manager"))

  // Local state
  const [activeView, setActiveView] = useState<"suppliers" | "payments">("suppliers")
  const [paymentSearchTerm, setPaymentSearchTerm] = useState("")
  const [localSearchTerm, setLocalSearchTerm] = useState("")
  const [viewingSupplierId, setViewingSupplierId] = useState<number | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPayCreditModal, setShowPayCreditModal] = useState(false)
  const [showRefundModal, setShowRefundModal] = useState(false)
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState<{
    id: number
    name: string
    balance_amount: number
    available_credit?: number
    supplier_credit?: number
    initialPurchaseId?: number
    initialAmount?: number
  } | null>(null)
  const [selectedSupplierForRefund, setSelectedSupplierForRefund] = useState<any>(null)

  const dueSuppliers = useMemo(() => {
    return allSuppliers.filter((s) => (s.balance_amount || 0) > 0.01)
  }, [allSuppliers])

  const filteredDueSuppliers = useMemo(() => {
    if (!paymentSearchTerm.trim()) return dueSuppliers
    const term = paymentSearchTerm.toLowerCase().trim()
    return dueSuppliers.filter(
      (s) =>
        s.name?.toLowerCase().includes(term) ||
        s.phone?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        String(s.id).includes(term)
    )
  }, [dueSuppliers, paymentSearchTerm])

  const dueTotals = useMemo(() => {
    return dueSuppliers.reduce(
      (acc, s) => ({
        totalPurchases: acc.totalPurchases + Number(s.total_amount || 0),
        alreadyPaid: acc.alreadyPaid + Number(s.paid_amount || 0),
        stillToPay: acc.stillToPay + Number(s.balance_amount || 0),
        availableCredit: acc.availableCredit + Number(s.available_credit || s.supplier_credit || 0),
      }),
      { totalPurchases: 0, alreadyPaid: 0, stillToPay: 0, availableCredit: 0 }
    )
  }, [dueSuppliers])

  const [paymentHistorySupplier, setPaymentHistorySupplier] = useState<{ id: number; name: string } | null>(null)
  const [supplierPayments, setSupplierPayments] = useState<SupplierPaymentListRow[]>([])
  const [loadingSupplierPayments, setLoadingSupplierPayments] = useState(false)
  const [viewSupplierPaymentId, setViewSupplierPaymentId] = useState<number | null>(null)
  const [editSupplierPaymentId, setEditSupplierPaymentId] = useState<number | null>(null)

  // Refs for managing state and preventing issues
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isInitializedRef = useRef(false)
  const componentMountedRef = useRef(true)
  const currentSearchTermRef = useRef("")
  const lastServerSearchRef = useRef("")

  // Sync local search with Redux on mount
  useEffect(() => {
    setLocalSearchTerm(reduxSearchTerm || "")
    currentSearchTermRef.current = reduxSearchTerm || ""
  }, [reduxSearchTerm])

  // Component mounted state management
  useEffect(() => {
    componentMountedRef.current = true
    return () => {
      componentMountedRef.current = false
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  // Currency formatter - memoized for performance
  const formatCurrency = useMemo(() => {
    return (amount: number): string => {
      try {
        return `${currency || 'AED'} ${amount.toFixed(2)}`
      } catch {
        return `${currency || 'AED'} 0.00`
      }
    }
  }, [currency])

  // Optimized data fetching function
  const fetchSuppliersData = useCallback(async (options: {
    searchTerm?: string
    forceRefresh?: boolean
    silent?: boolean
  } = {}) => {
    if (!componentMountedRef.current) return

    const { searchTerm, forceRefresh = false, silent = false } = options
    const requestKey = `suppliers_${userId}_${searchTerm || 'all'}`

    try {
      const result = await RequestManager.executeRequest(
        requestKey,
        async () => {
          const params = {
            userId,
            searchTerm: searchTerm || undefined,
            forceRefresh,
            isBackground: silent,
          }
          
          return await dispatch(fetchSuppliers(params)).unwrap()
        },
        !forceRefresh // Use cache unless force refresh
      )

      return result
    } catch (error) {
      if (componentMountedRef.current) {
        console.error("❌ Error fetching suppliers:", error)
      }
      throw error
    }
  }, [dispatch, userId])

  // Initial data loading - runs only once
  useEffect(() => {
    if (isInitializedRef.current) return

    isInitializedRef.current = true

    const initializeData = async () => {
      try {
        // Always fetch currency if not available
        if (!currency) {
          await RequestManager.executeRequest(
            `currency_${userId}`,
            () => dispatch(fetchDeviceCurrency(userId)).unwrap(),
            true
          )
        }

        // Check cache expiry
        dispatch(checkCacheExpiry())

        // Load suppliers data
        if (allSuppliers.length === 0 || shouldRefresh) {
          console.log("🔄 Initial suppliers load")
          await fetchSuppliersData({ forceRefresh: true })
        } else {
          console.log("📦 Using existing suppliers data")
          // Optionally refresh in background after a delay
          setTimeout(() => {
            if (componentMountedRef.current) {
              fetchSuppliersData({ silent: true })
            }
          }, 2000)
        }
      } catch (error) {
        console.error("❌ Error during initialization:", error)
      }
    }

    initializeData()
  }, [dispatch, userId, currency, allSuppliers.length, shouldRefresh, fetchSuppliersData])

  // Debounced search handler with better logic
  const handleSearchChange = useCallback((value: string) => {
    if (!componentMountedRef.current) return

    // Update local state immediately for UI responsiveness
    setLocalSearchTerm(value)
    currentSearchTermRef.current = value

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // Update Redux immediately for local filtering
    dispatch(setSearchTerm(value))

    // Only trigger server search if:
    // 1. Search term is meaningful (>= 2 chars) or empty (to show all)
    // 2. Different from last server search
    // 3. Component is still mounted
    const trimmedValue = value.trim()
    const shouldSearchServer = (
      (trimmedValue.length >= 2 || trimmedValue === "") &&
      trimmedValue !== lastServerSearchRef.current
    )

    if (shouldSearchServer) {
      searchTimeoutRef.current = setTimeout(async () => {
        if (!componentMountedRef.current || currentSearchTermRef.current !== value) {
          return // Component unmounted or search term changed
        }

        try {
          lastServerSearchRef.current = trimmedValue
          console.log("🔍 Server search triggered:", trimmedValue || "all")
          await fetchSuppliersData({ 
            searchTerm: trimmedValue || undefined,
            silent: allSuppliers.length > 0 
          })
        } catch (error) {
          console.error("Search error:", error)
        }
      }, 600) // Reasonable debounce delay
    }
  }, [dispatch, allSuppliers.length, fetchSuppliersData])

  // Optimized handlers with useCallback
  const handleRefresh = useCallback(async () => {
    if (!componentMountedRef.current) return

    dispatch(clearError())
    RequestManager.clearCache(`suppliers_${userId}`)
    
    try {
      await fetchSuppliersData({ 
        searchTerm: currentSearchTermRef.current || undefined,
        forceRefresh: true 
      })
    } catch (error) {
      console.error("Refresh error:", error)
    }
  }, [dispatch, userId, fetchSuppliersData])

  const handleDelete = useCallback(async (supplierId: number, supplierName: string) => {
    if (!(await confirm(`Delete supplier "${supplierName}"?`))) return

    try {
      await RequestManager.executeRequest(
        `delete_supplier_${supplierId}`,
        () => dispatch(deleteSupplier({ supplierId, userId })).unwrap(),
        false // Don't cache delete operations
      )
      
      // Clear relevant cache entries
      RequestManager.clearCache(`suppliers_${userId}`)
      
      // Refresh data
      setTimeout(() => {
        if (componentMountedRef.current) {
          fetchSuppliersData({ forceRefresh: true })
        }
      }, 100)
    } catch (error) {
      console.error("Delete error:", error)
      alert(typeof error === "string" ? error : "Failed to delete supplier")
    }
  }, [dispatch, userId, fetchSuppliersData])

  // Modal handlers
  const handleView = useCallback((supplierId: number) => {
    dispatch(setSelectedSupplierId(supplierId))
    setViewingSupplierId(supplierId)
  }, [dispatch])

  const handleEdit = useCallback((supplierId: number) => {
    dispatch(setSelectedSupplierId(supplierId))
    setShowEditModal(true)
  }, [dispatch])

  const handleAdd = useCallback(() => setShowAddModal(true), [])

  const handlePayCredit = useCallback((supplier: {
    id: number
    name: string
    balance_amount: number
    available_credit?: number
    supplier_credit?: number
    initialPurchaseId?: number
    initialAmount?: number
  }) => {
    if (isPurchaseManager) return
    setSelectedSupplierForPayment(supplier)
    setShowPayCreditModal(true)
  }, [isPurchaseManager])

  const handleRefundCredit = useCallback((supplier: any) => {
    setSelectedSupplierForRefund(supplier)
    setShowRefundModal(true)
  }, [])

  const handleOpenPaymentHistory = useCallback((supplier: { id: number; name: string }) => {
    setPaymentHistorySupplier(supplier)
  }, [])

  const handleEditSupplierPayment = useCallback((paymentId: number) => {
    setViewSupplierPaymentId(null)
    setEditSupplierPaymentId(paymentId)
  }, [])

  useEffect(() => {
    if (!paymentHistorySupplier || !deviceId) {
      setSupplierPayments([])
      setLoadingSupplierPayments(false)
      return
    }
    let cancelled = false
    setLoadingSupplierPayments(true)
    import("@/app/actions/supplier-payment-actions")
      .then(({ listSupplierPaymentsForSupplier }) =>
        listSupplierPaymentsForSupplier(paymentHistorySupplier.id, deviceId, userId),
      )
      .then((result) => {
        if (!cancelled && result.success) setSupplierPayments(result.data)
      })
      .finally(() => {
        if (!cancelled) setLoadingSupplierPayments(false)
      })
    return () => {
      cancelled = true
    }
  }, [paymentHistorySupplier, deviceId, userId])

  const handleModalClose = useCallback(() => {
    setShowAddModal(false)
    setShowViewModal(false)
    setShowEditModal(false)
    setShowPayCreditModal(false)
    setShowRefundModal(false)
    setSelectedSupplierForPayment(null)
    setSelectedSupplierForRefund(null)
    dispatch(setSelectedSupplierId(null))
    onModalClose?.()
  }, [dispatch, onModalClose])

  const handleModalSuccess = useCallback(async () => {
    // Clear cache and refresh data after successful operations
    RequestManager.clearCache(`suppliers_${userId}`)
    
    try {
      await fetchSuppliersData({ 
        searchTerm: currentSearchTermRef.current || undefined,
        forceRefresh: true 
      })
    } catch (error) {
      console.error("Error refreshing after modal success:", error)
    }

    if (paymentHistorySupplier && deviceId) {
      try {
        const { listSupplierPaymentsForSupplier } = await import("@/app/actions/supplier-payment-actions")
        const result = await listSupplierPaymentsForSupplier(paymentHistorySupplier.id, deviceId, userId)
        if (result.success) setSupplierPayments(result.data)
      } catch (e) {
        console.error("Error refreshing supplier payments list:", e)
      }
    }
    
    handleModalClose()
  }, [userId, fetchSuppliersData, handleModalClose, paymentHistorySupplier, deviceId])

  // Handle external add modal
  useEffect(() => {
    if (isAddModalOpen) setShowAddModal(true)
  }, [isAddModalOpen])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
      dispatch(clearError())
    }
  }, [dispatch])

  // Memoized supplier cards for performance
  const supplierCards = useMemo(() => {
    return suppliers.map((supplier) => (
      <Card
        key={supplier.id}
        className="bg-white hover:shadow-md transition-shadow"
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col space-y-3">
            {/* Header Section */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                    {supplier.name}
                  </h3>
                  <Badge variant="outline" className="text-xs font-semibold bg-gray-50 text-gray-700 border-gray-200">
                    #{supplier.id}
                  </Badge>
                  {(supplier.balance_amount || 0) > 0.01 && (supplier as any).last_credit_purchase_date && (
                    <Badge
                      variant="outline"
                      className="bg-red-50 text-red-600 border-red-200 text-[11px] font-semibold px-2 py-0.5 flex items-center gap-1 shadow-2xs"
                    >
                      <Calendar className="h-3 w-3 text-red-500" />
                      <span>Last Credit: {format(new Date((supplier as any).last_credit_purchase_date), "dd MMM yyyy")}</span>
                    </Badge>
                  )}
                </div>
                
                {/* Contact Info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-xs sm:text-sm text-gray-600">
                  <div className="flex items-center">
                    <Phone className="h-3 w-3 mr-1 text-green-600 flex-shrink-0" />
                    <span className="truncate">{supplier.phone}</span>
                  </div>
                  {supplier.email && (
                    <div className="flex items-center">
                      <Mail className="h-3 w-3 mr-1 text-blue-600 flex-shrink-0" />
                      <span className="truncate max-w-48 sm:max-w-32">{supplier.email}</span>
                    </div>
                  )}
                  {supplier.address && (
                    <div className="flex items-center">
                      <MapPin className="h-3 w-3 mr-1 text-gray-500 flex-shrink-0" />
                      <span className="truncate max-w-48 sm:max-w-32">{supplier.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-1 ml-2 sm:ml-4 flex-shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 cursor-pointer"
                  onClick={() => handleView(supplier.id)}
                  title="View Supplier"
                >
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-amber-600 hover:bg-amber-50 cursor-pointer"
                  onClick={() => handleEdit(supplier.id)}
                  title="Edit Supplier"
                >
                  <Edit className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 cursor-pointer"
                  onClick={() => handleDelete(supplier.id, supplier.name)}
                  title="Delete Supplier"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Financial Stats */}
            <div className="pt-2 border-t border-gray-100">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 text-xs sm:text-sm">
                {/* Purchase Stats */}
                <div className="flex items-center justify-between sm:justify-start sm:space-x-6">
                  <div className="flex items-center">
                    <TrendingUp className="h-3 w-3 text-blue-600 mr-1 flex-shrink-0" />
                    <span className="font-medium text-gray-900">
                      {supplier.total_purchases || 0}
                    </span>
                    <span className="text-gray-500 ml-1">purchases</span>
                  </div>
                  <div className="flex items-center">
                    <Banknote className="h-3 w-3 text-green-600 mr-1 flex-shrink-0" />
                    <span className="font-medium text-gray-900">
                      {formatCurrency(supplier.total_amount || 0)}
                    </span>
                    <span className="text-gray-500 ml-1 hidden sm:inline">total</span>
                  </div>
                </div>

                {/* Financial Stats */}
                <div className="flex items-center justify-between sm:justify-end sm:space-x-4">
                  <div className="text-center sm:text-right">
                    <div className="font-medium text-green-600">
                      {formatCurrency(supplier.paid_amount || 0)}
                    </div>
                    <div className="text-xs text-gray-500">Paid</div>
                  </div>
                  <div className="text-center sm:text-right">
                    <div
                      className={`font-medium ${(supplier.balance_amount || 0) > 0 ? "text-orange-600" : "text-green-600"}`}
                    >
                      {formatCurrency(supplier.balance_amount || 0)}
                    </div>
                    <div className="text-xs text-gray-500">Balance</div>
                  </div>
                  {((supplier.available_credit || supplier.supplier_credit || 0) > 0 || (supplier.paid_amount || 0) > Math.max((supplier.total_amount || 0) - (supplier.balance_amount || 0), 0)) && (
                    <div className="text-center sm:text-right bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-1 shadow-sm">
                      <div className="flex items-center justify-center sm:justify-end font-bold text-blue-600 text-xs sm:text-sm">
                        <Wallet className="h-3.5 w-3.5 mr-1 flex-shrink-0 text-blue-600" />
                        {formatCurrency(
                          supplier.available_credit ||
                          supplier.supplier_credit ||
                          Math.max((supplier.paid_amount || 0) - Math.max((supplier.total_amount || 0) - (supplier.balance_amount || 0), 0), 0)
                        )}
                      </div>
                      <div className="text-xs text-blue-600 font-semibold">Available Credit</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ))
  }, [suppliers, formatCurrency, handleView, handleEdit, handleDelete])

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {viewingSupplierId ? (
        <SupplierDetailPage
          supplierId={viewingSupplierId}
          userId={userId}
          onBack={() => {
            setViewingSupplierId(null)
            fetchSuppliersData({ forceRefresh: true })
          }}
          onPayCredit={isPurchaseManager ? undefined : handlePayCredit}
          onViewPayments={handleOpenPaymentHistory}
          onEditSupplier={handleEdit}
        />
      ) : (
        <>
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg sm:text-xl font-bold text-gray-900">Suppliers</h1>
                  {(isRefreshing || isLoading) && <RefreshCw className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />}
                </div>

                {/* View Switcher: Suppliers vs Supplier Payments */}
                <div role="tablist" aria-label="Suppliers view" className="inline-flex rounded-lg bg-gray-100 p-1">
                  {([
                    { id: "suppliers", label: "Suppliers" },
                    { id: "payments", label: `Supplier Payments${dueSuppliers.length > 0 ? ` (${dueSuppliers.length})` : ""}` },
                  ] as const).map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      role="tab"
                      aria-selected={activeView === view.id}
                      onClick={() => setActiveView(view.id)}
                      className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm cursor-pointer ${
                        activeView === view.id ? "bg-white text-gray-900 shadow-xs" : "text-gray-600 hover:text-gray-900"
                      }`}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>

              {activeView === "suppliers" ? (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* Search */}
                  <div className="relative flex-1 sm:flex-initial">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 flex-shrink-0" />
                    <Input
                      placeholder="Search suppliers..."
                      value={localSearchTerm}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      className="pl-10 w-full sm:w-64 h-9 text-sm"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Refresh button */}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRefresh} 
                      disabled={isLoading || isRefreshing} 
                      className="h-9 flex-shrink-0 cursor-pointer"
                    >
                      <RefreshCw className={`h-4 w-4 ${(isLoading || isRefreshing) ? "animate-spin" : ""}`} />
                      <span className="hidden sm:inline ml-2">Refresh</span>
                    </Button>

                    {/* Add button */}
                    <Button onClick={handleAdd} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-9 flex-shrink-0 cursor-pointer">
                      <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="hidden sm:inline">Add Supplier</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleRefresh} 
                    disabled={isLoading || isRefreshing} 
                    className="h-9 flex-shrink-0 cursor-pointer"
                  >
                    <RefreshCw className={`h-4 w-4 ${(isLoading || isRefreshing) ? "animate-spin" : ""}`} />
                    <span className="hidden sm:inline ml-2">Refresh</span>
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-auto p-4 sm:p-6">
            {activeView === "suppliers" ? (
              isLoading && allSuppliers.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin mr-2 text-blue-600" />
                  <span className="text-gray-600">Loading suppliers...</span>
                </div>
              ) : error && allSuppliers.length === 0 ? (
                <Card className="bg-white">
                  <CardContent className="text-center py-12">
                    <div className="text-red-600 mb-4">{error}</div>
                    <Button onClick={handleRefresh} variant="outline">
                      Try Again
                    </Button>
                  </CardContent>
                </Card>
              ) : suppliers.length === 0 ? (
                <Card className="bg-white">
                  <CardContent className="text-center py-12">
                    <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      {localSearchTerm ? "No suppliers match your search" : "No suppliers found"}
                    </h3>
                    <p className="text-gray-500 mb-6">
                      {localSearchTerm ? "Try adjusting your search terms" : "Get started by adding your first supplier"}
                    </p>
                    {!localSearchTerm && (
                      <Button onClick={handleAdd} className="bg-blue-600 hover:bg-blue-700 text-white">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Your First Supplier
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {supplierCards}
                </div>
              )
            ) : (
              /* Supplier Payments View */
              <div className="space-y-4">
                {/* Summary Stats KPI Banner */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-gray-200 shadow-2xs">
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-gray-900">Supplier Due Payments</h2>
                    <p className="text-xs sm:text-sm text-gray-500">
                      Showing suppliers with outstanding credit balances to settle
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-gray-50 text-gray-700 px-3 py-1 border border-gray-200">
                      Total purchases: {formatCurrency(dueTotals.totalPurchases)}
                    </span>
                    <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 border border-blue-200">
                      Already paid: {formatCurrency(dueTotals.alreadyPaid)}
                    </span>
                    <span className="rounded-full bg-emerald-50 text-emerald-800 px-3 py-1 font-semibold border border-emerald-200">
                      Still to pay: {formatCurrency(dueTotals.stillToPay)}
                    </span>
                    {dueTotals.availableCredit > 0 && (
                      <span className="rounded-full bg-indigo-50 text-indigo-700 px-3 py-1 border border-indigo-200">
                        Available credit: {formatCurrency(dueTotals.availableCredit)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Search Bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 flex-shrink-0" />
                  <Input
                    placeholder="Search supplier payments by name, phone, or email..."
                    value={paymentSearchTerm}
                    onChange={(e) => setPaymentSearchTerm(e.target.value)}
                    className="pl-10 pr-10 text-sm bg-white"
                  />
                  {paymentSearchTerm && (
                    <button
                      onClick={() => setPaymentSearchTerm("")}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {paymentSearchTerm && (
                  <div className="text-xs text-gray-500">
                    Found {filteredDueSuppliers.length} matching {filteredDueSuppliers.length === 1 ? "supplier" : "suppliers"}
                  </div>
                )}

                {/* Cards Grid or Empty States */}
                {isLoading && allSuppliers.length === 0 ? (
                  <div className="py-12 text-center text-gray-500">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
                    <span>Loading supplier balances...</span>
                  </div>
                ) : dueSuppliers.length === 0 ? (
                  <div className="py-12 text-center bg-white rounded-xl border border-dashed border-gray-200 p-6">
                    <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">All Clear! No Due Payments</h3>
                    <p className="text-xs text-gray-500">
                      There are currently no outstanding supplier balances to pay.
                    </p>
                  </div>
                ) : filteredDueSuppliers.length === 0 ? (
                  <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200 p-6">
                    <Search className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <h3 className="text-sm font-medium text-gray-900 mb-1">No matching payments found</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      No pending supplier balance matches &ldquo;{paymentSearchTerm}&rdquo;.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPaymentSearchTerm("")}
                      className="text-xs cursor-pointer"
                    >
                      Clear search
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {filteredDueSuppliers.map((supplier) => (
                      <Card
                        key={supplier.id}
                        className="border border-gray-200 shadow-2xs cursor-pointer hover:border-blue-400 hover:shadow-md transition-all group bg-white"
                        onClick={() =>
                          !isPurchaseManager &&
                          handlePayCredit({
                            id: supplier.id,
                            name: supplier.name,
                            balance_amount: supplier.balance_amount || 0,
                            available_credit: supplier.available_credit || supplier.supplier_credit || 0,
                          })
                        }
                      >
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-bold text-gray-900 text-sm sm:text-base group-hover:text-blue-600 transition-colors truncate">
                                  {supplier.name}
                                </span>
                                <Badge variant="outline" className="text-[10px] font-semibold bg-gray-50 text-gray-600 border-gray-200">
                                  #{supplier.id}
                                </Badge>
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 truncate">
                                {supplier.phone ? `${supplier.phone} · ` : ""}
                                {supplier.open_purchase_count || 0} open purchase{supplier.open_purchase_count === 1 ? "" : "s"}
                              </div>
                              {supplier.last_credit_purchase_date && (
                                <div className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 border border-red-200/80 rounded-md px-2 py-0.5 w-fit mt-1.5 shadow-2xs">
                                  <Calendar className="h-3 w-3 text-red-500 flex-shrink-0" />
                                  <span>Last credit: {format(new Date(supplier.last_credit_purchase_date), "dd MMM yyyy")}</span>
                                </div>
                              )}
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap gap-1 justify-end flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              {(supplier.paid_amount || 0) > 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                  onClick={() => handleOpenPaymentHistory({ id: supplier.id, name: supplier.name })}
                                >
                                  <History className="h-3.5 w-3.5 mr-1 text-slate-500" />
                                  Payments
                                </Button>
                              )}
                              {!isPurchaseManager && (
                                <Button
                                  size="sm"
                                  className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer font-medium"
                                  onClick={() =>
                                    handlePayCredit({
                                      id: supplier.id,
                                      name: supplier.name,
                                      balance_amount: supplier.balance_amount || 0,
                                      available_credit: supplier.available_credit || supplier.supplier_credit || 0,
                                    })
                                  }
                                >
                                  <CreditCard className="h-3.5 w-3.5 mr-1" />
                                  Pay Credit
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Financial Breakdown Card */}
                          <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 space-y-1.5">
                            <div className="text-xs font-semibold text-emerald-800">Credit Purchases</div>
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Total amount</span>
                              <span className="font-medium text-gray-900">{formatCurrency(supplier.total_amount || 0)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-600">
                              <span>Already paid</span>
                              <span className="font-medium text-emerald-700">{formatCurrency(supplier.paid_amount || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm pt-1.5 border-t border-emerald-100">
                              <span className="font-medium text-emerald-900">Still to pay</span>
                              <span className="font-bold text-emerald-700">{formatCurrency(supplier.balance_amount || 0)}</span>
                            </div>
                            {((supplier.available_credit || supplier.supplier_credit || 0) > 0) && (
                              <div className="flex justify-between text-xs pt-1 border-t border-emerald-100 text-blue-700 font-medium">
                                <span className="flex items-center gap-1">
                                  <Wallet className="h-3 w-3 text-blue-600" />
                                  Available credit
                                </span>
                                <span>{formatCurrency(supplier.available_credit || supplier.supplier_credit || 0)}</span>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Modals */}
      <SimpleAddModal 
        isOpen={showAddModal} 
        onClose={handleModalClose} 
        onSuccess={handleModalSuccess} 
        userId={userId} 
      />

      {selectedSupplierId && (
        <>
          <SimpleViewModal
            isOpen={showViewModal}
            onClose={handleModalClose}
            supplierId={selectedSupplierId}
            userId={userId}
          />
          <SimpleEditModal
            isOpen={showEditModal}
            onClose={handleModalClose}
            onSuccess={handleModalSuccess}
            supplierId={selectedSupplierId}
            userId={userId}
          />
        </>
      )}

      {selectedSupplierForPayment && (
        <PayCreditModal
          isOpen={showPayCreditModal}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          supplier={selectedSupplierForPayment}
          userId={userId}
          deviceId={deviceId || 0}
          initialPurchaseId={selectedSupplierForPayment.initialPurchaseId}
          initialAmount={selectedSupplierForPayment.initialAmount}
        />
      )}

      {selectedSupplierForRefund && (
        <RefundCreditModal
          isOpen={showRefundModal}
          onClose={handleModalClose}
          onSuccess={handleModalSuccess}
          supplier={selectedSupplierForRefund}
          userId={userId}
          deviceId={deviceId || 0}
        />
      )}

      <Dialog
        open={!!paymentHistorySupplier}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentHistorySupplier(null)
            setSupplierPayments([])
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="">
              Payment & Credit History{paymentHistorySupplier ? ` — ${paymentHistorySupplier.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {loadingSupplierPayments ? (
            <div className="flex items-center justify-center py-10 text-gray-600">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : supplierPayments.length === 0 ? (
            <p className="text-sm text-gray-500 py-6 text-center">
              No recorded credit payments or refunds for this supplier yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {supplierPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(p.amount)}
                      </span>
                      {p.transaction_type === "supplier_refund" ? (
                        <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          Supplier Refund
                        </span>
                      ) : p.transaction_type === "supplier_credit_use" ? (
                        <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          Credit Used
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-800 text-[10px] font-bold px-2 py-0.5 rounded">
                          Payment
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {p.payment_method} · {new Date(p.transaction_date).toLocaleDateString()}
                    </div>
                  </div>
                  {p.transaction_type === "supplier_payment" && (
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-blue-600"
                        onClick={() => setViewSupplierPaymentId(p.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-amber-600"
                        onClick={() => setEditSupplierPaymentId(p.id)}
                      >
                        <FilePenLine className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>

      <ViewSupplierPaymentModal
        isOpen={viewSupplierPaymentId != null}
        onClose={() => setViewSupplierPaymentId(null)}
        paymentId={viewSupplierPaymentId}
        currency={currency || "AED"}
        deviceId={deviceId ?? undefined}
        onEdit={handleEditSupplierPayment}
        onPaymentDeleted={async () => {
          setViewSupplierPaymentId(null)
          RequestManager.clearCache(`suppliers_${userId}`)
          try {
            await fetchSuppliersData({
              searchTerm: currentSearchTermRef.current || undefined,
              forceRefresh: true,
            })
          } catch (e) {
            console.error(e)
          }
          if (paymentHistorySupplier && deviceId) {
            const { listSupplierPaymentsForSupplier } = await import("@/app/actions/supplier-payment-actions")
            const result = await listSupplierPaymentsForSupplier(paymentHistorySupplier.id, deviceId, userId)
            if (result.success) setSupplierPayments(result.data)
          }
        }}
      />

      <EditSupplierPaymentModal
        isOpen={editSupplierPaymentId != null}
        onClose={() => setEditSupplierPaymentId(null)}
        paymentId={editSupplierPaymentId}
        userId={userId}
        deviceId={deviceId || 0}
        currency={currency || "AED"}
        onPaymentUpdated={async () => {
          setEditSupplierPaymentId(null)
          RequestManager.clearCache(`suppliers_${userId}`)
          try {
            await fetchSuppliersData({
              searchTerm: currentSearchTermRef.current || undefined,
              forceRefresh: true,
            })
          } catch (e) {
            console.error(e)
          }
          if (paymentHistorySupplier && deviceId) {
            const { listSupplierPaymentsForSupplier } = await import("@/app/actions/supplier-payment-actions")
            const result = await listSupplierPaymentsForSupplier(paymentHistorySupplier.id, deviceId, userId)
            if (result.success) setSupplierPayments(result.data)
          }
        }}
      />
      {ConfirmDialog}
    </div>
  )
}
