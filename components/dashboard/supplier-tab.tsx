"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  MapPin,
  RefreshCw,
  CreditCard,
  History,
  FilePenLine,
} from "lucide-react"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
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
import SimpleAddModal from "../suppliers/simple-add-modal"
import SimpleViewModal from "../suppliers/simple-view-modal"
import SimpleEditModal from "../suppliers/simple-edit-modal"
import PayCreditModal from "../suppliers/pay-credit-modal"
import ViewSupplierPaymentModal from "../suppliers/View-supplier-payment-model"
import EditSupplierPaymentModal from "../suppliers/View-suplier-payment-edit"
import type { SupplierPaymentListRow } from "@/app/actions/supplier-payment-actions"

interface SupplierTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
  mockMode?: boolean
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
  mockMode = false,
}: SupplierTabProps) {
  const dispatch = useAppDispatch()

  // Redux selectors
  const suppliers = useAppSelector(selectFilteredSuppliers)
  const allSuppliers = useAppSelector(selectSuppliers)
  const isLoading = useAppSelector(selectSuppliersLoading)
  const isRefreshing = useAppSelector(selectSuppliersRefreshing)
  const error = useAppSelector(selectSuppliersError)
  const reduxSearchTerm = useAppSelector(selectSupplierSearchTerm)
  const currency = useAppSelector(selectSupplierCurrency)
  const selectedSupplierId = useAppSelector(selectSelectedSupplierId)
  const stats = useAppSelector(selectSuppliersStats)
  const shouldRefresh = useAppSelector(selectShouldRefresh)
  const deviceId = useAppSelector(selectDeviceId)

  // Local state
  const [localSearchTerm, setLocalSearchTerm] = useState("")
  const [showAddModal, setShowAddModal] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showPayCreditModal, setShowPayCreditModal] = useState(false)
  const [selectedSupplierForPayment, setSelectedSupplierForPayment] = useState<{
    id: number
    name: string
    balance_amount: number
  } | null>(null)

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
    if (mockMode || !componentMountedRef.current) return

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
  }, [dispatch, userId, mockMode])

  // Initial data loading - runs only once
  useEffect(() => {
    if (mockMode || isInitializedRef.current) return

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
  }, [dispatch, userId, mockMode, currency, allSuppliers.length, shouldRefresh, fetchSuppliersData])

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
    if (!window.confirm(`Delete supplier "${supplierName}"?`)) return

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
    setShowViewModal(true)
  }, [dispatch])

  const handleEdit = useCallback((supplierId: number) => {
    dispatch(setSelectedSupplierId(supplierId))
    setShowEditModal(true)
  }, [dispatch])

  const handleAdd = useCallback(() => setShowAddModal(true), [])

  const handlePayCredit = useCallback((supplier: { id: number; name: string; balance_amount: number }) => {
    setSelectedSupplierForPayment(supplier)
    setShowPayCreditModal(true)
  }, [])

  const handleOpenPaymentHistory = useCallback((supplier: { id: number; name: string }) => {
    setPaymentHistorySupplier(supplier)
  }, [])

  const handleEditSupplierPayment = useCallback((paymentId: number) => {
    setViewSupplierPaymentId(null)
    setEditSupplierPaymentId(paymentId)
  }, [])

  useEffect(() => {
    if (!paymentHistorySupplier || !deviceId || mockMode) {
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
  }, [paymentHistorySupplier, deviceId, userId, mockMode])

  const handleModalClose = useCallback(() => {
    setShowAddModal(false)
    setShowViewModal(false)
    setShowEditModal(false)
    setShowPayCreditModal(false)
    setSelectedSupplierForPayment(null)
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

    if (paymentHistorySupplier && deviceId && !mockMode) {
      try {
        const { listSupplierPaymentsForSupplier } = await import("@/app/actions/supplier-payment-actions")
        const result = await listSupplierPaymentsForSupplier(paymentHistorySupplier.id, deviceId, userId)
        if (result.success) setSupplierPayments(result.data)
      } catch (e) {
        console.error("Error refreshing supplier payments list:", e)
      }
    }
    
    handleModalClose()
  }, [userId, fetchSuppliersData, handleModalClose, paymentHistorySupplier, deviceId, mockMode])

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
        className="bg-white dark:bg-gray-800 hover:shadow-md transition-shadow dark:border-gray-700"
      >
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-col space-y-3">
            {/* Header Section */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2 truncate">
                  {supplier.name}
                </h3>
                
                {/* Contact Info */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-4 space-y-1 sm:space-y-0 text-xs sm:text-sm text-gray-600 dark:text-gray-300">
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
              <div className="flex flex-col sm:flex-row gap-1 ml-2 sm:ml-4 flex-shrink-0">
                <div className="flex flex-wrap gap-1 justify-end sm:justify-start">
                  {(supplier.balance_amount || 0) > 0 && (
                    <Button
                      size="sm"
                      className="h-7 px-2 bg-green-600 hover:bg-green-700 text-white text-xs whitespace-nowrap"
                      onClick={() =>
                        handlePayCredit({
                          id: supplier.id,
                          name: supplier.name,
                          balance_amount: supplier.balance_amount || 0,
                        })
                      }
                    >
                      <CreditCard className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="hidden sm:inline">Pay Credit</span>
                      <span className="sm:hidden">Pay</span>
                    </Button>
                  )}
                  {(supplier.paid_amount || 0) > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 text-xs whitespace-nowrap border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                      onClick={() => handleOpenPaymentHistory({ id: supplier.id, name: supplier.name })}
                    >
                      <History className="h-3 w-3 mr-1 flex-shrink-0" />
                      <span className="hidden sm:inline">Payments</span>
                      <span className="sm:hidden">Paymts</span>
                    </Button>
                  )}
                </div>

                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    onClick={() => handleView(supplier.id)}
                  >
                    <Eye className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                    onClick={() => handleEdit(supplier.id)}
                  >
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleDelete(supplier.id, supplier.name)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>

            {/* Financial Stats */}
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 text-xs sm:text-sm">
                {/* Purchase Stats */}
                <div className="flex items-center justify-between sm:justify-start sm:space-x-6">
                  <div className="flex items-center">
                    <TrendingUp className="h-3 w-3 text-blue-600 mr-1 flex-shrink-0" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {supplier.total_purchases || 0}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 ml-1">purchases</span>
                  </div>
                  <div className="flex items-center">
                    <DollarSign className="h-3 w-3 text-green-600 mr-1 flex-shrink-0" />
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(supplier.total_amount || 0)}
                    </span>
                    <span className="text-gray-500 dark:text-gray-400 ml-1 hidden sm:inline">total</span>
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
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    ))
  }, [suppliers, formatCurrency, handleView, handleEdit, handleDelete, handlePayCredit, handleOpenPaymentHistory])

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">Suppliers</h1>
                {(isRefreshing || isLoading) && <RefreshCw className="h-4 w-4 animate-spin text-blue-600 flex-shrink-0" />}
              </div>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {stats.total > 0
                  ? `${stats.total} suppliers • ${formatCurrency(stats.totalAmount)} total • ${formatCurrency(stats.totalBalance)} balance`
                  : "No suppliers found"}
              </p>
            </div>
          </div>

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
                className="h-9 flex-shrink-0"
              >
                <RefreshCw className={`h-4 w-4 ${(isLoading || isRefreshing) ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline ml-2">Refresh</span>
              </Button>

              {/* Add button */}
              <Button onClick={handleAdd} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white h-9 flex-shrink-0">
                <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="hidden sm:inline">Add Supplier</span>
                <span className="sm:hidden">Add</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {isLoading && allSuppliers.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin mr-2 text-blue-600" />
            <span className="text-gray-600 dark:text-gray-300">Loading suppliers...</span>
          </div>
        ) : error && allSuppliers.length === 0 ? (
          <Card className="bg-white dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="text-center py-12">
              <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
              <Button onClick={handleRefresh} variant="outline">
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : suppliers.length === 0 ? (
          <Card className="bg-white dark:bg-gray-800 dark:border-gray-700">
            <CardContent className="text-center py-12">
              <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                {localSearchTerm ? "No suppliers match your search" : "No suppliers found"}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
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
        )}
      </div>

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
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto dark:bg-gray-900 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-gray-100">
              Credit payments{paymentHistorySupplier ? ` — ${paymentHistorySupplier.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {loadingSupplierPayments ? (
            <div className="flex items-center justify-center py-10 text-gray-600 dark:text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          ) : supplierPayments.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
              No recorded credit payments for this supplier yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {supplierPayments.map((p) => (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 dark:text-gray-100">
                      {formatCurrency(p.amount)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {p.payment_method} · {new Date(p.transaction_date).toLocaleDateString()}
                    </div>
                  </div>
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
          if (paymentHistorySupplier && deviceId && !mockMode) {
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
          if (paymentHistorySupplier && deviceId && !mockMode) {
            const { listSupplierPaymentsForSupplier } = await import("@/app/actions/supplier-payment-actions")
            const result = await listSupplierPaymentsForSupplier(paymentHistorySupplier.id, deviceId, userId)
            if (result.success) setSupplierPayments(result.data)
          }
        }}
      />
    </div>
  )
}
