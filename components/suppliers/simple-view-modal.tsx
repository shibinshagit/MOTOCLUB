"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Phone, Mail, MapPin, ShoppingCart, DollarSign, CreditCard, AlertCircle } from "lucide-react"
import { useAppSelector } from "@/store/hooks"

interface SimpleViewModalProps {
  isOpen: boolean
  onClose: () => void
  supplierId: number
  userId: number
}

function SimpleViewModal({ isOpen, onClose, supplierId, userId }: SimpleViewModalProps) {
  console.log("🔵 SimpleViewModal: Component rendered", { isOpen, supplierId, userId })

  const [supplierData, setSupplierData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Get currency from Redux
  const currency = useAppSelector((state) => state.device.currency) || "AED"

  useEffect(() => {
    if (isOpen && supplierId) {
      console.log("🟢 SimpleViewModal: Loading supplier data")
      loadSupplierData()
    }
  }, [isOpen, supplierId])

  const loadSupplierData = () => {
    setIsLoading(true)
    setError(null)

    import("@/app/actions/supplier-actions")
      .then((actions) => {
        console.log("🟡 SimpleViewModal: Actions imported")
        return actions.getSupplierWithPurchases(supplierId, userId)
      })
      .then((response) => {
        console.log("🟡 SimpleViewModal: Data response", response)
        if (response.success) {
          setSupplierData(response.data)
        } else {
          setError(response.message || "Failed to load supplier details")
        }
      })
      .catch((err) => {
        console.error("🔴 SimpleViewModal: Exception", err)
        setError("An unexpected error occurred")
      })
      .finally(() => {
        setIsLoading(false)
      })
  }

  const formatCurrency = (amount: number): string => {
    try {
      return new Intl.NumberFormat("en-AE", {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 2,
      }).format(amount || 0)
    } catch {
      return `${currency} ${(amount || 0).toFixed(2)}`
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="">Supplier Details</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="">Loading supplier details...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <div className="text-red-600 mb-4">{error}</div>
            <Button onClick={loadSupplierData} variant="outline">
              Try Again
            </Button>
          </div>
        ) : supplierData ? (
          <div className="space-y-6">
            {/* Supplier Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h2 className="text-xl font-bold mb-3">{supplierData.supplier.name}</h2>
              <div className="space-y-2">
                <div className="flex items-center text-gray-600">
                  <Phone className="h-4 w-4 mr-2 text-green-600" />
                  {supplierData.supplier.phone}
                </div>
                {supplierData.supplier.email && (
                  <div className="flex items-center text-gray-600">
                    <Mail className="h-4 w-4 mr-2 text-blue-600" />
                    {supplierData.supplier.email}
                  </div>
                )}
                {supplierData.supplier.address && (
                  <div className="flex items-center text-gray-600">
                    <MapPin className="h-4 w-4 mr-2 text-red-600" />
                    {supplierData.supplier.address}
                  </div>
                )}
              </div>
            </div>

            {/* Financial Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <ShoppingCart className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                <div className="text-lg font-bold">{supplierData.supplier.total_purchases || 0}</div>
                <div className="text-sm text-gray-600">Purchases</div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <DollarSign className="h-6 w-6 mx-auto mb-2 text-gray-600" />
                <div className="text-lg font-bold">
                  {formatCurrency(supplierData.supplier.total_amount)}
                </div>
                <div className="text-sm text-gray-600">Total Amount</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <CreditCard className="h-6 w-6 mx-auto mb-2 text-green-600" />
                <div className="text-lg font-bold text-green-600">
                  {formatCurrency(supplierData.supplier.paid_amount)}
                </div>
                <div className="text-sm text-gray-600">Total Paid</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <DollarSign className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                <div className="text-lg font-bold text-blue-600">
                  {formatCurrency(supplierData.supplier.total_credit || 0)}
                </div>
                <div className="text-sm text-gray-600">Total Credit</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <AlertCircle className="h-6 w-6 mx-auto mb-2 text-orange-600" />
                <div className="text-lg font-bold text-orange-600">
                  {formatCurrency(supplierData.supplier.outstanding_balance || 0)}
                </div>
                <div className="text-sm text-gray-600">Outstanding</div>
              </div>
            </div>

            {/* Recent Purchases */}
            <div>
              <h3 className="text-lg font-semibold mb-3">
                Recent Purchases ({supplierData.purchases.length})
              </h3>
              {supplierData.purchases.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No purchases found</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {supplierData.purchases.slice(0, 10).map((purchase: any) => {
                    const receivedAmount = purchase.received_amount || 0
                    const totalAmount = purchase.total_amount || 0
                    const balanceAmount = totalAmount - receivedAmount
                    const hasBalance = balanceAmount > 0

                    return (
                      <div
                        key={purchase.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded"
                      >
                        <div className="flex-1">
                          <div className="font-medium">Purchase #{purchase.id}</div>
                          <div className="text-sm text-gray-600">
                            {new Date(purchase.purchase_date).toLocaleDateString()}
                          </div>
                          {purchase.status === "Credit" && (
                            <div className="text-xs text-gray-500 mt-1">
                              Paid: {formatCurrency(receivedAmount)} | Balance: {formatCurrency(balanceAmount)}
                            </div>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="font-medium">{formatCurrency(totalAmount)}</div>
                          <div className="flex gap-1 mt-1">
                            <Badge variant={purchase.status === "Paid" ? "default" : "secondary"}>
                              {purchase.status}
                            </Badge>
                            {purchase.status === "Credit" && hasBalance && (
                              <Badge variant="outline" className="text-orange-600 border-orange-200">
                                {receivedAmount > 0 ? "Partial Payment" : "Unpaid"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end pt-4">
          <Button onClick={onClose} variant="outline">
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default SimpleViewModal
