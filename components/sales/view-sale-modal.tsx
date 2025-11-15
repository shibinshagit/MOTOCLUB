"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

import {
  Loader2,
  User,
  Calendar,
  CreditCard,
  Package,
  Receipt,
  DollarSign,
  Phone,
  Mail,
  MapPin,
  Users,
  Wrench,
  Edit,
  Printer,
  Trash2,
  RotateCcw,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { format } from "date-fns"
import { useSelector } from "react-redux"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { getSaleDetails, updateSale } from "@/app/actions/sale-actions"

interface ViewSaleModalProps {
  isOpen: boolean
  onClose: () => void
  saleId: number | null
  currency?: string
  onEdit?: (saleData: any) => void
  onDelete?: (saleId: number) => void
  onPrintInvoice?: (saleId: number) => void
}

export default function ViewSaleModal({
  isOpen,
  onClose,
  saleId,
  currency,
  onEdit,
  onDelete,
  onPrintInvoice,
}: ViewSaleModalProps) {
  const [saleData, setSaleData] = useState<any>(null)
  const [saleItems, setSaleItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

  // Get currency from Redux store
  const deviceCurrency = useSelector(selectDeviceCurrency) || currency || "AED"

  // Format currency with the device currency
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (isNaN(numAmount)) return `${deviceCurrency} 0.00`
    return `${deviceCurrency} ${numAmount.toFixed(2)}`
  }

  // Fetch complete sale data when modal opens
  useEffect(() => {
    const fetchSaleData = async () => {
      if (!isOpen || !saleId) {
        setSaleData(null)
        setSaleItems([])
        setError(null)
        return
      }

      try {
        setIsLoading(true)
        setError(null)
        console.log("Fetching complete sale data for sale ID:", saleId)

        const result = await getSaleDetails(saleId)

        if (result.success && result.data) {
          setSaleData(result.data.sale)
          setSaleItems(result.data.items || [])
          console.log("Sale data loaded successfully:", {
            saleId,
            customerName: result.data.sale.customer_name,
            itemsCount: result.data.items?.length || 0,
            totalAmount: result.data.sale.total_amount,
            receivedAmount: result.data.sale.received_amount,
            outstandingAmount: result.data.sale.outstanding_amount,
            status: result.data.sale.status,
          })
        } else {
          console.error("Failed to fetch sale details:", result.message)
          setError(result.message || "Failed to load sale details")
          toast({
            title: "Error",
            description: result.message || "Failed to load sale details",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error("Error fetching sale details:", error)
        setError("An error occurred while loading sale details")
        toast({
          title: "Error",
          description: "An error occurred while loading sale details",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchSaleData()
  }, [isOpen, saleId, toast])

  // Calculate totals from items or use sale data
  const calculateTotals = () => {
    if (!saleData) {
      return { subtotal: 0, total: 0, remaining: 0 }
    }

    let subtotal = 0
    if (saleItems && saleItems.length > 0) {
      subtotal = saleItems.reduce((sum: number, item: any) => {
        const price = Number.parseFloat(item.price) || 0
        const quantity = Number.parseInt(item.quantity) || 0
        return sum + price * quantity
      }, 0)
    } else {
      // Fallback to sale data if items not loaded
      const total = Number.parseFloat(saleData.total_amount) || 0
      const discount = Number.parseFloat(saleData.discount) || 0
      subtotal = total + discount
    }

    const discount = Number.parseFloat(saleData.discount) || 0
    const total = subtotal - discount
    const receivedAmount = Number.parseFloat(saleData.received_amount) || 0
    const remaining = Math.max(0, total - receivedAmount)

    return { subtotal, total, remaining }
  }

  const { subtotal, total, remaining } = calculateTotals()

  // Helper function to get display value or N/A
  const getDisplayValue = (value: any, fallback = "N/A") => {
    if (value === null || value === undefined || value === "") {
      return fallback
    }
    return value
  }

  // Helper function to get status display
  const getStatusDisplay = (status: any) => {
    if (!status) return "Pending"
    return status
  }

  // Helper function to get payment method display
  const getPaymentMethodDisplay = (paymentMethod: any) => {
    if (!paymentMethod) return "Cash"
    return paymentMethod
  }

  // CORRECTED: Get received amount based on status - use actual received_amount from database
  const getReceivedAmount = () => {
    if (!saleData) return 0

    // For credit sales, only show received amount if it's a partial credit
    // For completely credit sales (no payment received), received_amount should be 0
    const received = Number.parseFloat(saleData.received_amount) || 0
    
    // If it's a credit sale and received amount equals total, it's likely a data issue
    // In proper credit sales, received amount should be less than total
    if (saleData.status === "Credit") {
      const total = Number.parseFloat(saleData.total_amount) || 0
      // If received equals total, it's not actually a credit sale
      if (received === total) {
        return 0
      }
    }
    
    return received
  }

  // CORRECTED: Get remaining amount - use actual outstanding_amount from database or calculate
  const getRemainingAmount = () => {
    if (!saleData) return 0

    // Use outstanding_amount from database if available, otherwise calculate
    if (saleData.outstanding_amount !== undefined && saleData.outstanding_amount !== null) {
      return Number.parseFloat(saleData.outstanding_amount) || 0
    }
    
    const total = Number.parseFloat(saleData.total_amount) || 0
    const received = getReceivedAmount()
    return Math.max(0, total - received)
  }

  // Handle action buttons
  const handleEdit = () => {
    if (onEdit && saleData) {
      onEdit(saleData.id)
      // Don't close here - let the parent handle the modal transition
      // onClose() // Remove this line
    }
  }

  const handleDelete = () => {
    if (onDelete && saleId) {
      if (window.confirm("Are you sure you want to delete this sale? This action cannot be undone.")) {
        onDelete(saleId)
        onClose()
      }
    }
  }

  // Add this after the handleDelete function
  const handleReturn = async () => {
    if (!saleData || !saleId) return

    // Only allow returns for completed sales
    if (saleData.status !== "Completed") {
      toast({
        title: "Cannot Return Sale",
        description: "Only completed sales can be returned",
        variant: "destructive",
      })
      return
    }

    const confirmReturn = window.confirm(
      "Are you sure you want to return this sale? This will:\n" +
        "• Change the sale status to Cancelled\n" +
        "• Restore product stock\n" +
        "• Create accounting adjustments\n" +
        "This action cannot be undone.",
    )

    if (!confirmReturn) return

    try {
      setIsLoading(true)

      // Prepare return data - change status to Cancelled
      const returnData = {
        id: saleId,
        customerId: saleData.customer_id,
        items: saleItems.map((item: any) => ({
          id: item.id,
          productId: item.product_id,
          quantity: item.quantity,
          price: item.price,
          cost: item.actual_cost || item.cost || 0,
          notes: item.notes || "",
        })),
        paymentStatus: "Cancelled", // Change to cancelled
        paymentMethod: saleData.payment_method || "Cash",
        saleDate: saleData.sale_date,
        discount: saleData.discount || 0,
        receivedAmount: 0, // Set to 0 for cancelled sales
        deviceId: saleData.device_id,
        userId: saleData.created_by,
        staffId: saleData.staff_id,
      }

      console.log("Processing sale return:", returnData)

      const result = await updateSale(returnData)

      if (result.success) {
        toast({
          title: "Sale Returned Successfully",
          description: "The sale has been cancelled and stock has been restored",
          variant: "default",
        })

        // Refresh the sale data to show updated status
        const refreshResult = await getSaleDetails(saleId)
        if (refreshResult.success && refreshResult.data) {
          setSaleData(refreshResult.data.sale)
          setSaleItems(refreshResult.data.items || [])
        }
      } else {
        toast({
          title: "Return Failed",
          description: result.message || "Failed to process sale return",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error processing sale return:", error)
      toast({
        title: "Return Error",
        description: "An error occurred while processing the return",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Updated print handler to use unified approach
  const handlePrintInvoice = () => {
    if (saleData && saleItems.length > 0) {
      // Use the unified print function with manual print (autoprint = false)
      printSalesReceipt(saleData, saleItems, deviceCurrency, {}, false)
    } else {
      toast({
        title: "Error",
        description: "Cannot print invoice - sale data not loaded",
        variant: "destructive",
      })
    }
  }

  // Comprehensive Skeleton Component
  const SaleDetailsSkeleton = () => (
    <div className="space-y-6 p-6">
      {/* Sale Information Skeleton */}
      <Card className="shadow-sm border-0 bg-white dark:bg-gray-800">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
            <Package className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
            Sale Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Sale Details Column */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b border-gray-200 dark:border-gray-600 pb-2">
                Sale Details
              </h4>
              <div className="space-y-3">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sale ID</span>
                  <Skeleton className="h-4 w-16 mt-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                    <Calendar className="h-3 w-3 mr-1" />
                    Date
                  </span>
                  <Skeleton className="h-4 w-32 mt-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
                  <Skeleton className="h-6 w-20 mt-1 rounded-full" />
                </div>
              </div>
            </div>

            {/* Payment Details Column */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b border-gray-200 dark:border-gray-600 pb-2">
                Payment Details
              </h4>
              <div className="space-y-3">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                    <CreditCard className="h-3 w-3 mr-1" />
                    Payment Method
                  </span>
                  <Skeleton className="h-4 w-24 mt-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Received Amount
                  </span>
                  <Skeleton className="h-4 w-28 mt-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Remaining Amount
                  </span>
                  <Skeleton className="h-4 w-28 mt-1" />
                </div>
              </div>
            </div>

            {/* Staff & Customer Column */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b border-gray-200 dark:border-gray-600 pb-2">
                Staff & Customer
              </h4>
              <div className="space-y-3">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                    <Users className="h-3 w-3 mr-1" />
                    Staff Member
                  </span>
                  <Skeleton className="h-4 w-32 mt-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                    <User className="h-3 w-3 mr-1" />
                    Customer
                  </span>
                  <Skeleton className="h-4 w-36 mt-1" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                    <Phone className="h-3 w-3 mr-1" />
                    Phone
                  </span>
                  <Skeleton className="h-4 w-28 mt-1" />
                </div>
              </div>
            </div>
          </div>

          {/* Additional Customer Information Skeleton */}
          <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
              Additional Customer Details
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                  <Mail className="h-3 w-3 mr-1" />
                  Email Address
                </span>
                <Skeleton className="h-4 w-48 mt-1" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                  <MapPin className="h-3 w-3 mr-1" />
                  Address
                </span>
                <Skeleton className="h-4 w-56 mt-1" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sale Items Skeleton */}
      <Card className="shadow-sm border-0 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
            <Package className="h-5 w-5 mr-2 text-purple-600 dark:text-purple-400" />
            Sale Items
            <Loader2 className="h-4 w-4 ml-2 animate-spin" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    #
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Product/Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Barcode
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Unit Price
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                {[...Array(3)].map((_, index) => (
                  <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <td className="px-4 py-4">
                      <Skeleton className="h-4 w-4" />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-4 w-4 rounded" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Skeleton className="h-4 w-8 mx-auto" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Skeleton className="h-4 w-16 ml-auto" />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <Skeleton className="h-4 w-20 ml-auto" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Sale Summary Skeleton */}
      <Card className="shadow-sm border-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
            Sale Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {["Subtotal", "Discount", "Total Amount", "Received"].map((label, index) => (
              <div key={index} className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                <Skeleton className="h-8 w-24 mx-auto mb-2" />
                <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">{label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Notes Skeleton */}
      <Card className="shadow-sm border-0 bg-white dark:bg-gray-800">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200">Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <DialogHeader className="bg-white dark:bg-gray-800 p-6 rounded-t-lg border-b dark:border-gray-700">
          <div className="flex flex-col items-center space-y-4">
            <DialogTitle className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
              <Receipt className="h-6 w-6 mr-2 text-blue-600 dark:text-blue-400" />
              Sale Details {saleId ? `- #${saleId}` : ""}
            </DialogTitle>

            {/* Action Buttons - Always visible */}
            <div className="flex items-center space-x-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                disabled={isLoading || !saleData}
                className="flex items-center space-x-2 bg-transparent border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <Edit className="h-4 w-4" />
                <span>Edit</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleReturn}
                disabled={isLoading || !saleData || saleData.status !== "Completed"}
                className="flex items-center space-x-2 bg-transparent border-orange-300 dark:border-orange-600 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Return</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handlePrintInvoice}
                disabled={isLoading || !saleData || !saleItems.length}
                className="flex items-center space-x-2 bg-transparent border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                <span>Print Invoice</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isLoading}
                className="flex items-center space-x-2 bg-transparent border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Delete</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <SaleDetailsSkeleton />
        ) : error ? (
          <div className="text-center py-12 p-6">
            <div className="text-red-500 text-lg mb-4">{error}</div>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        ) : !saleData ? (
          <div className="text-center py-12 p-6">
            <div className="text-gray-500 text-lg mb-4">Sale not found</div>
            <Button onClick={onClose} variant="outline">
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {/* Sale Information */}
            <Card className="shadow-sm border-0 bg-white dark:bg-gray-800">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                  <Package className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
                  Sale Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Basic Sale Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b border-gray-200 dark:border-gray-600 pb-2">
                      Sale Details
                    </h4>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Sale ID
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">#{saleData.id}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                          <Calendar className="h-3 w-3 mr-1" />
                          Date
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {saleData.sale_date
                            ? (() => {
                                try {
                                  return format(new Date(saleData.sale_date), "PPP")
                                } catch (error) {
                                  console.error("Invalid date format:", saleData.sale_date)
                                  return "Invalid date"
                                }
                              })()
                            : "N/A"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</span>
                        <Badge
                          variant="outline"
                          className={
                            getStatusDisplay(saleData.status) === "Completed"
                              ? "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 border-green-300 dark:border-green-700 w-fit"
                              : getStatusDisplay(saleData.status) === "Credit"
                                ? "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 border-orange-300 dark:border-orange-700 w-fit"
                                : getStatusDisplay(saleData.status) === "Cancelled"
                                  ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200 border-red-300 dark:border-red-700 w-fit"
                                  : "bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 w-fit"
                          }
                        >
                          {getStatusDisplay(saleData.status)}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b border-gray-200 dark:border-gray-600 pb-2">
                      Payment Details
                    </h4>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                          <CreditCard className="h-3 w-3 mr-1" />
                          Payment Method
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {getPaymentMethodDisplay(saleData.payment_method)}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Received Amount
                        </span>
                        <span className={`text-sm font-semibold ${
                          getReceivedAmount() > 0 ? "text-green-600 dark:text-green-400" : "text-gray-600 dark:text-gray-400"
                        }`}>
                          {formatCurrency(getReceivedAmount())}
                        </span>
                      </div>
                      {/* Show remaining amount for ALL credit sales */}
                      {saleData.status === "Credit" && (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Remaining Amount
                          </span>
                          <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                            {formatCurrency(getRemainingAmount())}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide border-b border-gray-200 dark:border-gray-600 pb-2">
                      Staff & Customer
                    </h4>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                          <Users className="h-3 w-3 mr-1" />
                          Staff Member
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {saleData.staff_name || "Not assigned"}
                        </span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                          <User className="h-3 w-3 mr-1" />
                          Customer
                        </span>
                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {saleData.customer_name || "Walk-in Customer"}
                        </span>
                      </div>
                      {saleData.customer_phone && (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                            <Phone className="h-3 w-3 mr-1" />
                            Phone
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {saleData.customer_phone}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional Customer Information */}
                {(saleData.customer_email || saleData.customer_address) && (
                  <div className="border-t border-gray-200 dark:border-gray-600 pt-4">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                      Additional Customer Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {saleData.customer_email && (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                            <Mail className="h-3 w-3 mr-1" />
                            Email Address
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {saleData.customer_email}
                          </span>
                        </div>
                      )}
                      {saleData.customer_address && (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center">
                            <MapPin className="h-3 w-3 mr-1" />
                            Address
                          </span>
                          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                            {saleData.customer_address}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sale Items */}
            <Card className="shadow-sm border-0 bg-white dark:bg-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                  <Package className="h-5 w-5 mr-2 text-purple-600 dark:text-purple-400" />
                  Sale Items ({saleItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {saleItems.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Package className="h-12 w-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                    <p className="text-lg font-medium">No items details available</p>
                    <p className="text-sm">Sale total: {formatCurrency(saleData.total_amount || 0)}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            #
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            Product/Service
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            Barcode
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            Unit Price
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            Cost
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                        {saleItems.map((item: any, index: number) => {
                          // Properly detect if it's a service
                          const isService = item.item_type === "service" || !!item.service_name
                          const itemName = isService ? item.service_name : item.product_name

                          return (
                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                {index + 1}
                              </td>
                              <td className="px-4 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <div className="flex items-center gap-2">
                                  {isService ? (
                                    <Wrench className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                  )}
                                  <div>
                                    <div>{getDisplayValue(itemName)}</div>
                                    {item.notes && (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 italic mt-1">
                                        Notes: {item.notes}
                                      </div>
                                    )}
                                    <div className="text-xs font-medium mt-1">
                                      <span
                                        className={
                                          isService
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-blue-600 dark:text-blue-400"
                                        }
                                      >
                                        {isService ? "Service" : "Product"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-sm text-gray-600 dark:text-gray-400">
                                {getDisplayValue(item.barcode, isService ? "N/A" : "N/A")}
                              </td>
                              <td className="px-4 py-4 text-sm text-center text-gray-900 dark:text-gray-100">
                                {getDisplayValue(item.quantity, "0")}
                              </td>
                              <td className="px-4 py-4 text-sm text-right text-gray-900 dark:text-gray-100">
                                {formatCurrency(item.price || 0)}
                              </td>
                              <td className="px-4 py-4 text-sm text-right text-gray-900 dark:text-gray-100">
                                {formatCurrency(item.actual_cost || item.cost || 0)}
                              </td>
                              <td className="px-4 py-4 text-sm text-right font-medium text-gray-900 dark:text-gray-100">
                                {formatCurrency(
                                  (Number.parseFloat(item.price) || 0) * (Number.parseInt(item.quantity) || 0),
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sale Summary */}
            <Card className="shadow-sm border-0 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 dark:bg-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
                  Sale Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(subtotal)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Subtotal</div>
                  </div>
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {formatCurrency(saleData.discount || 0)}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">Discount</div>
                  </div>
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg border-2 border-blue-200 dark:border-blue-700">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(total)}</div>
                    <div className="text-sm text-blue-600 dark:text-blue-400 font-medium">Total Amount</div>
                  </div>
                  <div className="text-center p-4 bg-white dark:bg-gray-700 rounded-lg">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {formatCurrency(getReceivedAmount())}
                    </div>
                    <div className="text-sm text-green-600 dark:text-green-400 font-medium">Received</div>
                    
                    {/* Show remaining amount for ALL credit sales, not just when remaining > 0 */}
                    {saleData.status === "Credit" && (
                      <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                        <div className="text-lg font-bold text-red-600 dark:text-red-400">
                          {formatCurrency(getRemainingAmount())}
                        </div>
                        <div className="text-xs text-red-600 dark:text-red-400 font-medium">Remaining</div>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes */}
            {saleData.notes && (
              <Card className="shadow-sm border-0 bg-white dark:bg-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800 dark:text-gray-200">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                    {saleData.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}