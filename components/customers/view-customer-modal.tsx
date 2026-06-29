"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { format } from "date-fns"
import { useEffect, useState } from "react"
import { getCustomerSales } from "@/app/actions/customer-actions"
import { User, Mail, Phone, MapPin, Calendar, ShoppingBag, DollarSign, Package, Clock, TrendingUp } from "lucide-react"
import { useSelector } from "react-redux"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"

interface ViewCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  customer: any
}

export default function ViewCustomerModal({ isOpen, onClose, customer }: ViewCustomerModalProps) {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(false)
  const [totalSpent, setTotalSpent] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalCredit, setTotalCredit] = useState(0)
  const [totalBalance, setTotalBalance] = useState(0)
  const currency = useSelector(selectDeviceCurrency)

  useEffect(() => {
    if (isOpen && customer?.id) {
      fetchCustomerSales()
    }
  }, [isOpen, customer?.id])

  const fetchCustomerSales = async () => {
    setLoading(true)
    try {
      const result = await getCustomerSales(customer.id)
      if (result.success) {
        setSales(result.data)

        // Calculate totals
        const totalSpentAmount = result.data.reduce((sum, sale) => sum + Number(sale.received_amount || 0), 0)
        const totalAmountCalculated = result.data.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0)
        const totalCreditAmount = result.data.reduce((sum, sale) => {
          const total = Number(sale.total_amount || 0)
          const received = Number(sale.received_amount || 0)
          return sum + Math.max(0, total - received)
        }, 0)
        const totalBalanceAmount = result.data.reduce((sum, sale) => {
          const total = Number(sale.total_amount || 0)
          const received = Number(sale.received_amount || 0)
          return sum + (total - received)
        }, 0)

        setTotalSpent(totalSpentAmount)
        setTotalAmount(totalAmountCalculated)
        setTotalCredit(totalCreditAmount)
        setTotalBalance(totalBalanceAmount)
      }
    } catch (error) {
      console.error("Error fetching customer sales:", error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "completed":
        return "bg-green-100 text-green-800 border-green-200"
      case "pending":
        return "bg-yellow-100 text-yellow-800 border-yellow-200"
      case "cancelled":
        return "bg-red-100 text-red-800 border-red-200"
      case "delivered":
        return "bg-blue-100 text-blue-800 border-blue-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const getCustomerType = (orderCount: number) => {
    if (orderCount >= 20) return { label: "VIP Customer", color: "bg-purple-100 text-purple-800 border-purple-200" }
    if (orderCount >= 10) return { label: "Premium Customer", color: "bg-blue-100 text-blue-800 border-blue-200" }
    if (orderCount >= 5) return { label: "Regular Customer", color: "bg-green-100 text-green-800 border-green-200" }
    return { label: "New Customer", color: "bg-gray-100 text-gray-800 border-gray-200" }
  }

  const customerType = getCustomerType(customer?.order_count || 0)

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-gray-50">
        <DialogHeader className="pb-6">
          <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="h-6 w-6 text-blue-600" />
            </div>
            Customer Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Compact Customer Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Basic Info - Compact */}
            <Card className="bg-white shadow-sm border-gray-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-600" />
                  Basic Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">Full Name</p>
                  <p className="font-semibold text-gray-900">{customer.name}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-500">Email</p>
                    <p className="text-sm text-gray-700 truncate">
                      {customer.email || "Not provided"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Phone</p>
                    <p className="text-sm text-gray-700">{customer.phone || "Not provided"}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-500">Address</p>
                    <p className="text-sm text-gray-700">{customer.address || "Not provided"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Stats - Compact Grid */}
            <div className="lg:col-span-2">
              <Card className="bg-white shadow-sm border-gray-200">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-green-600" />
                    Financial Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                    <div className="text-center p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <ShoppingBag className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-blue-600">{customer.order_count || 0}</p>
                      <p className="text-xs text-blue-700">Total Orders</p>
                    </div>

                    <div className="text-center p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <DollarSign className="h-5 w-5 text-purple-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-purple-600">
                        {currency} {totalAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-purple-700">Total Amount</p>
                    </div>

                    <div className="text-center p-3 bg-green-50 rounded-lg border border-green-100">
                      <DollarSign className="h-5 w-5 text-green-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-green-600">
                        {currency} {totalSpent.toFixed(2)}
                      </p>
                      <p className="text-xs text-green-700">Total Paid</p>
                    </div>

                    <div className="text-center p-3 bg-orange-50 rounded-lg border border-orange-100">
                      <DollarSign className="h-5 w-5 text-orange-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-orange-600">
                        {currency} {totalCredit.toFixed(2)}
                      </p>
                      <p className="text-xs text-orange-700">Total Credit</p>
                    </div>

                    <div className="text-center p-3 bg-red-50 rounded-lg border border-red-100">
                      <DollarSign className="h-5 w-5 text-red-600 mx-auto mb-1" />
                      <p className="text-lg font-bold text-red-600">
                        {currency} {totalBalance.toFixed(2)}
                      </p>
                      <p className="text-xs text-red-700">Outstanding Balance</p>
                    </div>

                    <div className="text-center p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <User className="h-5 w-5 text-gray-600 mx-auto mb-1" />
                      <Badge className={`${customerType.color} border font-medium text-xs`}>{customerType.label}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">Member Since</p>
                        <p className="text-gray-700">
                          {customer.created_at ? format(new Date(customer.created_at), "MMM dd, yyyy") : "N/A"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-xs font-medium text-gray-500">Last Updated</p>
                        <p className="text-gray-700">
                          {customer.updated_at ? format(new Date(customer.updated_at), "MMM dd, yyyy") : "N/A"}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <Separator className="bg-gray-200" />

          {/* Sales History */}
          <Card className="bg-white shadow-sm border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Package className="h-5 w-5 text-purple-600" />
                Sales History
                <Badge variant="secondary" className="ml-2">
                  {sales.length} {sales.length === 1 ? "Sale" : "Sales"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span className="ml-2 text-gray-600">Loading sales...</span>
                </div>
              ) : sales.length > 0 ? (
                <div className="space-y-3">
                  {sales.map((sale: any) => {
                    const totalAmount = Number(sale.total_amount || 0)
                    const receivedAmount = Number(sale.received_amount || 0)
                    const balance = totalAmount - receivedAmount
                    const isCredit = balance > 0

                    return (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <p className="font-semibold text-gray-900">Sale #{sale.id}</p>
                            <Badge className={`${getStatusColor(sale.status)} border text-xs`}>{sale.status}</Badge>
                            {isCredit && (
                              <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-xs">Credit</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {format(new Date(sale.sale_date), "MMM dd, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package className="h-3 w-3" />
                              {sale.item_count} {sale.item_count === 1 ? "item" : "items"}
                            </span>
                            {sale.payment_method && (
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {sale.payment_method}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="space-y-1">
                            <p className="text-sm text-gray-600">
                              Total: {currency} {totalAmount.toFixed(2)}
                            </p>
                            <p className="text-lg font-bold text-green-600">
                              Paid: {currency} {receivedAmount.toFixed(2)}
                            </p>
                            {isCredit && (
                              <p className="text-sm font-semibold text-red-600">
                                Balance: {currency} {balance.toFixed(2)}
                              </p>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {sale.sale_date ? format(new Date(sale.sale_date), "h:mm a") : "N/A"}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Package className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 font-medium">No sales found</p>
                  <p className="text-sm text-gray-400">
                    This customer hasn't made any purchases yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter className="pt-4 border-t border-gray-200 bg-white">
          <Button onClick={onClose} className="bg-gray-600 hover:bg-gray-700 text-white">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
