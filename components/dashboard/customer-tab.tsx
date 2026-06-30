"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  User,
  Plus,
  Search,
  X,
  Loader2,
  RefreshCw,
  Phone,
  Mail,
  MapPin,
  Wallet,
  CreditCard,
  History,
  FilePenLine,
  Undo2,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import EditCustomerModal from "../customers/edit-customer-modal"
import ViewCustomerModal from "../customers/view-customer-modal"
import PayCustomerCreditModal from "../customers/pay-customer-credit-modal"
import EditCustomerPaymentModal from "../customers/edit-customer-payment-modal"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { exportCustomersToPDF } from "@/lib/pdf-export-utils"
import {
  getCustomers,
  addCustomer as addCustomerAction,
  updateCustomer as updateCustomerAction,
  deleteCustomer as deleteCustomerAction,
  getCustomerSettlementSummaries,
  type CustomerSettlementSummary,
} from "@/app/actions/customer-actions"
import {
  deleteCustomerPayment,
  listCustomerPaymentsForCustomer,
  type CustomerPaymentListRow,
} from "@/app/actions/customer-payment-actions"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { useConfirm } from "@/hooks/use-confirm"
import { useSelector } from "react-redux"
import type { RootState } from "@/store/store"
import {
  setCustomers,
  setSearchTerm as setReduxSearchTerm,
  setIsLoading,
  setShowingLimited,
  addCustomer,
  updateCustomer,
  deleteCustomer,
} from "@/store/slices/customerSlice"
import { formatDistanceToNow } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"

interface Customer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  order_count: number
  created_at?: string
}

// Changed from default export to named export to match how it's imported
export function CustomerTab({ userId }: { userId: number }) {
  // Redux state
  const dispatch = useAppDispatch()
  const {
    customers,
    searchTerm: reduxSearchTerm,
    isLoading: reduxIsLoading,
    lastUpdated,
    showingLimited: reduxShowingLimited,
  } = useAppSelector((state) => state.customer)

  // Local UI state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false)
  const [settlements, setSettlements] = useState<CustomerSettlementSummary[]>([])
  const [isLoadingSettlements, setIsLoadingSettlements] = useState(false)
  const [showCollectModal, setShowCollectModal] = useState(false)
  const [selectedCustomerForPayment, setSelectedCustomerForPayment] = useState<{
    customer_id: number
    customer_name: string
    still_to_collect: number
  } | null>(null)
  const [paymentHistoryCustomer, setPaymentHistoryCustomer] = useState<{
    customer_id: number
    customer_name: string
  } | null>(null)
  const [customerPayments, setCustomerPayments] = useState<CustomerPaymentListRow[]>([])
  const [loadingCustomerPayments, setLoadingCustomerPayments] = useState(false)
  const [editCustomerPaymentId, setEditCustomerPaymentId] = useState<number | null>(null)
  const [undoingPaymentId, setUndoingPaymentId] = useState<number | null>(null)

  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const currency = useSelector((state: RootState) => state.device.currency) || "AED"
  const formatCurrency = (amount: number) => `${currency} ${Number(amount || 0).toFixed(2)}`

  // Initial load and background refresh
  useEffect(() => {
    const shouldRefresh = !lastUpdated || Date.now() - lastUpdated > 5 * 60 * 1000

    if (customers.length === 0 || shouldRefresh) {
      if (customers.length === 0) {
        dispatch(setIsLoading(true))
      } else {
        setIsBackgroundRefreshing(true)
      }

      fetchCustomers(reduxSearchTerm, !reduxShowingLimited).finally(() => {
        setIsBackgroundRefreshing(false)
      })
    }
  }, [userId])

  const loadSettlements = useCallback(async () => {
    if (!userId) return
    try {
      setIsLoadingSettlements(true)
      const result = await getCustomerSettlementSummaries(userId, userId)
      if (result.success) {
        setSettlements(result.data || [])
      } else {
        notifyError(toast, result.message || "Failed to load customer balances")
      }
    } catch (error) {
      console.error("Load customer settlements error:", error)
      notifyError(toast, "Failed to load customer balances")
    } finally {
      setIsLoadingSettlements(false)
    }
  }, [userId, toast])

  useEffect(() => {
    loadSettlements()
  }, [loadSettlements])

  const settlementByCustomerId = useMemo(() => {
    return new Map(settlements.map((row) => [row.customer_id, row]))
  }, [settlements])

  const settlementTotals = useMemo(() => {
    return settlements.reduce(
      (acc, row) => ({
        totalBilled: acc.totalBilled + Number(row.total_billed || 0),
        alreadyReceived: acc.alreadyReceived + Number(row.already_received || 0),
        stillToCollect: acc.stillToCollect + Number(row.still_to_collect || 0),
      }),
      { totalBilled: 0, alreadyReceived: 0, stillToCollect: 0 },
    )
  }, [settlements])

  const loadCustomerPayments = useCallback(
    async (customerId: number) => {
      if (!userId || !customerId) return
      setLoadingCustomerPayments(true)
      try {
        const result = await listCustomerPaymentsForCustomer(customerId, userId, userId)
        if (result.success) {
          setCustomerPayments(result.data)
        } else {
          notifyError(toast, result.message || "Failed to load payments")
        }
      } catch (error) {
        console.error(error)
        notifyError(toast, "Failed to load payments")
      } finally {
        setLoadingCustomerPayments(false)
      }
    },
    [userId, toast],
  )

  const handleCollectCustomer = (customer: CustomerSettlementSummary) => {
    setSelectedCustomerForPayment({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      still_to_collect: customer.still_to_collect,
    })
    setShowCollectModal(true)
  }

  const handlePaymentSuccess = () => {
    setShowCollectModal(false)
    setSelectedCustomerForPayment(null)
    loadSettlements()
    if (paymentHistoryCustomer) {
      loadCustomerPayments(paymentHistoryCustomer.customer_id)
    }
  }

  const handleOpenPaymentHistory = (customer: CustomerSettlementSummary) => {
    setPaymentHistoryCustomer({
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
    })
    loadCustomerPayments(customer.customer_id)
  }

  const handleUndoPayment = async (paymentId: number) => {
    const ok = await confirm(
      "Undo this payment? The money goes back to the sale balance and the payment record is removed.",
    )
    if (!ok) return

    setUndoingPaymentId(paymentId)
    try {
      const result = await deleteCustomerPayment(paymentId, userId, userId)
      if (result.success) {
        notifySuccess(toast, result.message || "Payment undone")
        loadSettlements()
        if (paymentHistoryCustomer) {
          await loadCustomerPayments(paymentHistoryCustomer.customer_id)
        }
      } else {
        notifyError(toast, result.message || "Failed to undo payment")
      }
    } catch (error) {
      console.error(error)
      notifyError(toast, "Failed to undo payment")
    } finally {
      setUndoingPaymentId(null)
    }
  }

  // Handle search with debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (reduxSearchTerm.trim() === "") {
        fetchCustomers("", !reduxShowingLimited) // Reset to initial state
      } else {
        fetchCustomers(reduxSearchTerm, true)
      }
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [reduxSearchTerm])

  const fetchCustomers = async (searchTerm?: string, showAll = false) => {
    try {
      setIsSearching(!!searchTerm)

      // Get customers with limit if not showing all and not searching
      const limit = showAll || searchTerm ? undefined : 5
      const response = await getCustomers(userId, limit, searchTerm)

      if (response.success) {
        dispatch(setCustomers(response.data))
        dispatch(setShowingLimited(!showAll && !searchTerm && response.data.length >= 5))
      } else {
        notifyError(toast, "Failed to load customers")
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
      notifyError(toast, "Failed to load customers")
    } finally {
      setIsSearching(false)
      dispatch(setIsLoading(false))
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await Promise.all([fetchCustomers(reduxSearchTerm, !reduxShowingLimited), loadSettlements()])
    setIsRefreshing(false)
  }

  const handleAddCustomer = async (formData: FormData) => {
    try {
      const result = await addCustomerAction(formData)

      if (result.success && result.data) {
        dispatch(addCustomer(result.data))
        setIsAddModalOpen(false)
        notifySuccess(toast, "Customer added successfully")
        return { success: true }
      }

      notifyError(toast, result.message || "Failed to add customer")
      return { success: false, message: result.message }
    } catch (error) {
      console.error("Error adding customer:", error)
      notifyError(toast, "An unexpected error occurred")
      return { success: false, message: "An unexpected error occurred" }
    }
  }

  const handleEditCustomer = async (formData: FormData) => {
    try {
      const result = await updateCustomerAction(formData)

      if (result.success && result.data) {
        dispatch(updateCustomer(result.data))
        setIsEditModalOpen(false)
        notifySuccess(toast, "Customer updated successfully")
        return { success: true }
      }

      notifyError(toast, result.message || "Failed to update customer")
      return { success: false, message: result.message }
    } catch (error) {
      console.error("Error updating customer:", error)
      notifyError(toast, "An unexpected error occurred")
      return { success: false, message: "An unexpected error occurred" }
    }
  }

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return

    try {
      const result = await deleteCustomerAction(selectedCustomer.id)

      if (result.success) {
        dispatch(deleteCustomer(selectedCustomer.id))
        setIsDeleteModalOpen(false)
        setSelectedCustomer(null)
        notifySuccess(toast, "Customer deleted successfully")
      } else {
        notifyError(toast, result.message || "Failed to delete customer")
      }
    } catch (error) {
      console.error("Error deleting customer:", error)
      notifyError(toast, "An unexpected error occurred")
    }
  }

  const openEditModal = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsEditModalOpen(true)
  }

  const openViewModal = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsViewModalOpen(true)
  }

  const openDeleteModal = (customer: Customer) => {
    setSelectedCustomer(customer)
    setIsDeleteModalOpen(true)
  }

  const clearSearch = () => {
    dispatch(setReduxSearchTerm(""))
  }

  // Export customers to CSV
  const exportToCSV = () => {
    if (customers.length === 0) return

    const headers = ["ID", "Name", "Email", "Phone", "Address", "Orders"]
    const csvData = customers.map((customer) => [
      customer.id,
      customer.name,
      customer.email || "",
      customer.phone || "",
      customer.address || "",
      customer.order_count || 0,
    ])

    // Add headers to the beginning
    csvData.unshift(headers)

    // Convert to CSV string
    const csvContent = csvData.map((row) => row.join(",")).join("\n")

    // Create a blob and download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const link = document.createElement("a")
    const url = URL.createObjectURL(blob)

    link.setAttribute("href", url)
    link.setAttribute("download", `customers_${new Date().toISOString().split("T")[0]}.csv`)
    link.style.visibility = "hidden"

    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

const renderSkeletonLoading = () => (
  <div className="space-y-3">
    {[...Array(5)].map((_, i) => (
      <div
        key={i}
        className="flex items-center space-x-4 p-3 sm:p-4 bg-white rounded-xl border animate-pulse"
      >
        <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gray-200 rounded-full flex-shrink-0"></div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        </div>
        <div className="flex flex-col sm:flex-row space-y-1 sm:space-y-0 sm:space-x-2">
          <div className="h-6 sm:h-8 w-12 sm:w-16 bg-gray-200 rounded"></div>
          <div className="h-6 sm:h-8 w-12 sm:w-16 bg-gray-200 rounded"></div>
        </div>
      </div>
    ))}
  </div>
)

return (
  <div className="space-y-4 sm:space-y-6 p-4 sm:p-0">
    {/* Header */}
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
      <h1 className="text-xl sm:text-2xl font-bold">Customers</h1>
      
      {/* Action Buttons - Responsive Grid */}
      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
        <Button
          onClick={exportToCSV}
          className="flex items-center gap-2 rounded-xl bg-green-600 hover:bg-green-700 px-3 sm:px-4 py-2 font-medium text-white transition-all text-xs sm:text-sm flex-1 sm:flex-initial justify-center"
          disabled={reduxIsLoading || customers.length === 0}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-download flex-shrink-0"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span className="hidden sm:inline">Export CSV</span>
          <span className="sm:hidden">CSV</span>
        </Button>
        
        <Button
          onClick={() => exportCustomersToPDF(customers)}
          className="flex items-center gap-2 rounded-xl bg-purple-600 hover:bg-purple-700 px-3 sm:px-4 py-2 font-medium text-white transition-all text-xs sm:text-sm flex-1 sm:flex-initial justify-center"
          disabled={reduxIsLoading || customers.length === 0}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="lucide lucide-file flex-shrink-0"
          >
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="hidden sm:inline">Export PDF</span>
          <span className="sm:hidden">PDF</span>
        </Button>
        
        <Button 
          onClick={handleRefresh} 
          variant="outline" 
          size="icon" 
          disabled={isRefreshing} 
          className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing || isBackgroundRefreshing ? "animate-spin" : ""}`} />
        </Button>
        
        <Button 
          onClick={() => setIsAddModalOpen(true)} 
          className="bg-blue-600 hover:bg-blue-700 px-3 sm:px-4 py-2 text-xs sm:text-sm flex-1 sm:flex-initial justify-center"
        >
          <Plus className="mr-1 sm:mr-2 h-4 w-4 flex-shrink-0" /> 
          <span className="hidden sm:inline">Add Customer</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>
    </div>

    {/* Last Updated - Mobile Responsive */}
    {lastUpdated && (
      <div className="text-xs text-gray-500 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
        <span>Last updated: {formatDistanceToNow(lastUpdated)} ago</span>
        {isBackgroundRefreshing && (
          <span className="flex items-center text-blue-500">
            <Loader2 className="h-3 w-3 animate-spin mr-1" /> Refreshing...
          </span>
        )}
      </div>
    )}

    {/* Search Bar */}
    <Card className="">
      <CardContent className="p-3 sm:p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 flex-shrink-0" />
          <Input
            placeholder="Search customers..."
            value={reduxSearchTerm}
            onChange={(e) => dispatch(setReduxSearchTerm(e.target.value))}
            className="pl-10 pr-10 text-sm sm:text-base"
          />
          {isSearching && (
            <Loader2 className="absolute right-10 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
          {reduxSearchTerm && !isSearching && (
            <button
              onClick={clearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </CardContent>
    </Card>

    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-600" />
            Customer payments
          </h2>
          <p className="text-xs text-gray-500 mt-1">Money still pending on credit sales</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-blue-50 text-blue-700 px-3 py-1 border border-blue-100">
            Total billed: {formatCurrency(settlementTotals.totalBilled)}
          </span>
          <span className="rounded-full bg-gray-50 text-gray-700 px-3 py-1 border border-gray-100">
            Already received: {formatCurrency(settlementTotals.alreadyReceived)}
          </span>
          <span className="rounded-full bg-emerald-50 text-emerald-700 px-3 py-1 border border-emerald-100">
            Still to collect: {formatCurrency(settlementTotals.stillToCollect)}
          </span>
        </div>
      </div>

      {isLoadingSettlements ? (
        <div className="py-8 text-center text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
          Loading...
        </div>
      ) : settlements.length === 0 ? (
        <div className="py-6 text-center text-sm text-gray-500">No outstanding customer balances yet</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {settlements.map((customer) => (
            <Card key={customer.customer_id} className="border border-gray-200 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900">{customer.customer_name}</div>
                    <div className="text-xs text-gray-500">
                      {customer.open_sale_count} open sale{customer.open_sale_count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    <Button size="sm" variant="outline" onClick={() => handleOpenPaymentHistory(customer)}>
                      <History className="h-3.5 w-3.5 mr-1" />
                      Payments
                    </Button>
                    {customer.still_to_collect > 0.01 && (
                      <Button size="sm" onClick={() => handleCollectCustomer(customer)}>
                        <CreditCard className="h-3.5 w-3.5 mr-1" />
                        Collect now
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-emerald-100 bg-emerald-50/50 p-3 space-y-1.5">
                  <div className="text-xs font-semibold text-emerald-800">Credit sales</div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Total amount</span>
                    <span className="font-medium">{formatCurrency(customer.total_billed)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>Already received</span>
                    <span className="font-medium">{formatCurrency(customer.already_received)}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-emerald-100">
                    <span className="font-medium text-emerald-800">Still to collect</span>
                    <span className="font-bold text-emerald-700">{formatCurrency(customer.still_to_collect)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>

    {/* Customer List */}
    {reduxIsLoading && customers.length === 0 ? (
      renderSkeletonLoading()
    ) : customers.length === 0 ? (
      <div className="text-center py-12 sm:py-16 bg-gray-50 rounded-2xl border border-dashed mx-2 sm:mx-0">
        <div className="flex justify-center mb-4">
          <div className="p-3 sm:p-4 bg-gray-100 rounded-full">
            <User className="h-6 w-6 sm:h-8 sm:w-8 text-gray-400" />
          </div>
        </div>
        <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">No customers found</h3>
        <p className="text-sm text-gray-500 mb-4 sm:mb-6 px-4">
          {reduxSearchTerm ? "Try a different search term" : "Get started by adding your first customer"}
        </p>
        {!reduxSearchTerm && (
          <Button onClick={() => setIsAddModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-sm">
            <Plus className="mr-2 h-4 w-4" /> Add Customer
          </Button>
        )}
      </div>
    ) : (
      <div className="space-y-2 sm:space-y-3">
        {customers.map((customer) => (
          <div
            key={customer.id}
            className="flex items-center p-3 sm:p-4 bg-white rounded-xl border hover:shadow-md transition-all duration-200 cursor-pointer group"
            onClick={() => openViewModal(customer)}
          >
            {/* Avatar - Responsive Size */}
            <div className="flex-shrink-0 mr-3 sm:mr-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
              </div>
            </div>

            {/* Customer Info - Responsive Layout */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{customer.name}</h3>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <div className="bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-1 rounded-full min-w-[24px] h-5 sm:h-6 flex items-center justify-center">
                      {customer.order_count || 0}
                    </div>
                    {/* Check if customer is new (created within last 7 days) */}
                    {(customer as Customer).created_at &&
                      new Date((customer as Customer).created_at!) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) && (
                        <span className="bg-yellow-100 text-yellow-800 text-xs font-semibold px-2 py-1 rounded-full">
                          New
                        </span>
                      )}
                    {settlementByCustomerId.get(customer.id)?.still_to_collect ? (
                      <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2 py-1 rounded-full">
                        Due {formatCurrency(settlementByCustomerId.get(customer.id)!.still_to_collect)}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Contact Info - Responsive Stacking */}
              <div className="mt-1 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 text-xs text-gray-500">
                {customer.phone && (
                  <div className="flex items-center">
                    <Phone className="h-3 w-3 mr-1 flex-shrink-0" />
                    <span className="truncate">{customer.phone}</span>
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center">
                    <Mail className="h-3 w-3 mr-1 flex-shrink-0" />
                    <span className="truncate">{customer.email}</span>
                  </div>
                )}
              </div>

              {/* Address - Responsive Display */}
              {customer.address && (
                <div className="mt-1 flex items-center text-xs text-gray-500">
                  <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
                  <span className="truncate">{customer.address}</span>
                </div>
              )}
            </div>

            {/* Action Buttons - Responsive Layout */}
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1 sm:gap-2 ml-2 sm:ml-4 flex-shrink-0">
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  openEditModal(customer)
                }}
                size="sm"
                className="bg-blue-500 hover:bg-blue-600 text-white px-2 sm:px-3 py-1 text-xs rounded-lg min-w-0 w-12 sm:w-auto"
              >
                <span className="hidden sm:inline">Edit</span>
                <span className="sm:hidden">✏️</span>
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  openDeleteModal(customer)
                }}
                size="sm"
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 px-2 sm:px-3 py-1 text-xs rounded-lg min-w-0 w-12 sm:w-auto"
              >
                <span className="hidden sm:inline">Delete</span>
                <span className="sm:hidden">🗑️</span>
              </Button>
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Show All Button */}
    {reduxShowingLimited && !reduxSearchTerm && (
      <div className="flex justify-center py-4">
        <Button onClick={() => fetchCustomers("", true)} variant="outline" className="flex items-center gap-2 text-sm">
          Show All Customers
        </Button>
      </div>
    )}

    {/* Add Customer Modal - Responsive */}
    <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
      <DialogContent className="sm:max-w-md w-[95vw] max-w-[95vw] sm:w-full rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Add New Customer</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void handleAddCustomer(new FormData(e.currentTarget))
          }}
        >
          <input type="hidden" name="user_id" value={userId} />
          <div className="grid gap-3 sm:gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium">
                Name
              </label>
              <Input id="name" name="name" required className="text-sm sm:text-base" />
            </div>
            <div className="grid gap-2">
              <label htmlFor="phone" className="text-sm font-medium">
                Phone
              </label>
              <Input id="phone" name="phone" className="text-sm sm:text-base" />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-sm font-medium">
                Email
              </label>
              <Input id="email" name="email" type="email" className="text-sm sm:text-base" />
            </div>
            <div className="grid gap-2">
              <label htmlFor="address" className="text-sm font-medium">
                Address
              </label>
              <Input id="address" name="address" className="text-sm sm:text-base" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setIsAddModalOpen(false)}
              className="w-full sm:w-auto text-sm"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-blue-600 hover:bg-blue-700 w-full sm:w-auto text-sm"
            >
              Add Customer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    {/* Edit Customer Modal */}
    {selectedCustomer && (
      <EditCustomerModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        customer={selectedCustomer}
        userId={userId}
      />
    )}

    {/* View Customer Modal */}
    {selectedCustomer && (
      <ViewCustomerModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        customer={selectedCustomer}
      />
    )}

    {/* Delete Confirmation Modal - Responsive */}
    <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
      <DialogContent className="sm:max-w-md w-[95vw] max-w-[95vw] sm:w-full rounded-lg">
        <DialogHeader>
          <DialogTitle className="text-red-600 text-base sm:text-lg">Confirm Deletion</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm sm:text-base">
            Are you sure you want to delete customer <span className="font-medium">{selectedCustomer?.name}</span>?
          </p>
          <p className="text-xs sm:text-sm text-gray-500 mt-2">
            This action cannot be undone. All data associated with this customer will be permanently removed.
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button 
            variant="outline" 
            onClick={() => setIsDeleteModalOpen(false)}
            className="w-full sm:w-auto text-sm"
          >
            Cancel
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleDeleteCustomer} 
            className="bg-red-600 hover:bg-red-700 w-full sm:w-auto text-sm"
          >
            Delete Customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {selectedCustomerForPayment && (
      <PayCustomerCreditModal
        isOpen={showCollectModal}
        onClose={() => {
          setShowCollectModal(false)
          setSelectedCustomerForPayment(null)
        }}
        onSuccess={handlePaymentSuccess}
        customer={selectedCustomerForPayment}
        userId={userId}
        deviceId={userId}
      />
    )}

    <Dialog
      open={!!paymentHistoryCustomer}
      onOpenChange={(open) => {
        if (!open) {
          setPaymentHistoryCustomer(null)
          setCustomerPayments([])
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Payments{paymentHistoryCustomer ? ` — ${paymentHistoryCustomer.customer_name}` : ""}
          </DialogTitle>
        </DialogHeader>
        {loadingCustomerPayments ? (
          <div className="flex items-center justify-center py-10 text-gray-600">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading...
          </div>
        ) : customerPayments.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            No bulk payments recorded for this customer yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {customerPayments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900">{formatCurrency(payment.amount)}</div>
                    <div className="text-xs text-gray-500">
                      {payment.payment_method} · {new Date(payment.transaction_date).toLocaleDateString()}
                    </div>
                    {payment.user_notes ? (
                      <div className="text-xs text-gray-500 mt-1">{payment.user_notes}</div>
                    ) : null}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-amber-600"
                      onClick={() => setEditCustomerPaymentId(payment.id)}
                    >
                      <FilePenLine className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-rose-600"
                      onClick={() => handleUndoPayment(payment.id)}
                      disabled={undoingPaymentId === payment.id}
                    >
                      {undoingPaymentId === payment.id ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Undo2 className="h-4 w-4 mr-1" />
                      )}
                      Undo
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>

    <EditCustomerPaymentModal
      isOpen={editCustomerPaymentId != null}
      onClose={() => setEditCustomerPaymentId(null)}
      onSuccess={() => {
        setEditCustomerPaymentId(null)
        loadSettlements()
        if (paymentHistoryCustomer) {
          loadCustomerPayments(paymentHistoryCustomer.customer_id)
        }
      }}
      paymentId={editCustomerPaymentId}
      userId={userId}
      deviceId={userId}
    />
    {ConfirmDialog}
  </div>
)
}
// Also add this line to maintain backward compatibility with default imports
export default CustomerTab