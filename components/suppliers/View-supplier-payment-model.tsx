"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Loader2,
  Calendar,
  CreditCard,
  Receipt,
  DollarSign,
  Edit,
  Trash2,
  Clock,
  User,
  FileText,
  TrendingDown,
  Printer,
  Building,
  Package,
} from "lucide-react"
import { format } from "date-fns"
import { getSupplierPaymentById, deleteSupplierPayment } from "@/app/actions/supplier-payment-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { useConfirm } from "@/hooks/use-confirm"

interface ViewSupplierPaymentModalProps {
  isOpen: boolean
  onClose: () => void
  paymentId: number | null
  currency?: string
  deviceId?: number
  onEdit?: (id: number) => void
  onPaymentDeleted?: () => void
}

interface SupplierPayment {
  id: number
  supplier_id: number
  supplier_name: string
  amount: number
  payment_method: string
  payment_date: string
  description?: string
  notes?: string
  reference_number?: string
  affected_purchases?: number
  created_at: string
  updated_at: string
  device_id: number
  user_id: number
  status?: string
}

export default function ViewSupplierPaymentModal({
  isOpen,
  onClose,
  paymentId,
  currency = "AED",
  deviceId,
  onEdit,
  onPaymentDeleted,
}: ViewSupplierPaymentModalProps) {
  const [payment, setPayment] = useState<SupplierPayment | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()

  // Format currency
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (isNaN(numAmount)) return `${currency} 0.00`
    return `${currency} ${numAmount.toFixed(2)}`
  }

  // Format date and time - matching your app's format
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      return format(date, "MMMM do, yyyy")
    } catch (error) {
      return "Invalid date"
    }
  }

  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A"
    try {
      const date = new Date(dateString)
      return format(date, "MMM d, yyyy 'at' HH:mm")
    } catch (error) {
      return "Invalid date"
    }
  }

  // Fetch payment data using server action
  useEffect(() => {
    const fetchPayment = async () => {
      if (!isOpen || !paymentId) return

      try {
        setIsLoading(true)
        console.log("Fetching supplier payment details for ID:", paymentId)

        // Call server action to get payment by ID
        const result = await getSupplierPaymentById(paymentId)
        
        if (result.success && result.data) {
          setPayment(result.data)
        } else {
          throw new Error(result.message || "Failed to load payment details")
        }
      } catch (error) {
        console.error("Error fetching supplier payment:", error)
        notifyError(
          toast,
          error instanceof Error ? error.message : "An unexpected error occurred. Please try again later.",
        )
        setPayment(null)
      } finally {
        setIsLoading(false)
      }
    }

    if (isOpen && paymentId) {
      fetchPayment()
    }
  }, [isOpen, paymentId])

  // Handle delete payment using server action
  const handleDelete = async () => {
    if (!paymentId || !deviceId) {
      notifyError(toast, "Payment ID or Device ID missing")
      return
    }

    if (!(await confirm("Are you sure you want to delete this supplier payment? This action cannot be undone and will affect supplier balances."))) {
      return
    }

    try {
      setIsDeleting(true)
      
      // Call server action to delete payment
      const result = await deleteSupplierPayment(paymentId, deviceId)
      
      if (result.success) {
        notifySuccess(toast, result.message || "Supplier payment deleted successfully")
        onPaymentDeleted?.()
        onClose()
      } else {
        throw new Error(result.message || "Failed to delete payment")
      }
    } catch (error) {
      console.error("Error deleting payment:", error)
      notifyError(
        toast,
        error instanceof Error ? error.message : "An unexpected error occurred while deleting the payment.",
      )
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePrint = () => {
    if (!payment) return

    try {
      const printWindow = window.open("", "_blank", "width=800,height=600")
      if (!printWindow) {
        notifyError(toast, "Please allow pop-ups to print receipts", "Print Blocked")
        return
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Supplier Payment Receipt - #${payment.reference_number || payment.id}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            @media print {
              @page { size: A4; margin: 0.5cm; }
              .no-print { display: none !important; }
            }
            
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body {
              font-family: 'Inter', sans-serif;
              font-size: 14px;
              line-height: 1.6;
              color: #1f2937;
              padding: 20px;
            }
            
            .header {
              text-align: center;
              margin-bottom: 30px;
              padding-bottom: 20px;
              border-bottom: 2px solid #f97316;
            }
            
            .company-name {
              font-size: 24px;
              font-weight: 700;
              color: #f97316;
              margin-bottom: 5px;
            }
            
            .receipt-title {
              font-size: 18px;
              font-weight: 600;
              margin: 10px 0;
            }
            
            .receipt-number {
              font-size: 14px;
              color: #6b7280;
            }
            
            .info-grid {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 20px;
              margin: 20px 0;
            }
            
            .info-card {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 15px;
            }
            
            .info-card h3 {
              font-size: 14px;
              font-weight: 600;
              color: #374151;
              margin-bottom: 10px;
              text-transform: uppercase;
            }
            
            .info-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #f3f4f6;
            }
            
            .info-row:last-child {
              border-bottom: none;
            }
            
            .info-label {
              color: #6b7280;
              font-weight: 500;
            }
            
            .info-value {
              color: #111827;
              font-weight: 600;
            }
            
            .amount-section {
              background: #fef3e7;
              border: 2px solid #f97316;
              border-radius: 8px;
              padding: 20px;
              margin: 30px 0;
              text-align: center;
            }
            
            .amount-label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              margin-bottom: 10px;
            }
            
            .amount-value {
              font-size: 32px;
              font-weight: 700;
              color: #dc2626;
            }
            
            .description-section {
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 15px;
              margin: 20px 0;
            }
            
            .description-section h3 {
              font-size: 14px;
              font-weight: 600;
              margin-bottom: 10px;
            }
            
            .footer {
              margin-top: 40px;
              text-align: center;
              font-size: 12px;
              color: #6b7280;
              border-top: 1px solid #e5e7eb;
              padding-top: 20px;
            }
            
            .badge {
              display: inline-block;
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 600;
            }
            
            .badge-completed {
              background: #dcfce7;
              color: #166534;
            }
            
            .badge-supplier-payment {
              background: #fef3e7;
              color: #9a3412;
            }
            
            .financial-grid {
              display: grid;
              grid-template-columns: repeat(4, 1fr);
              gap: 15px;
              margin-top: 20px;
            }
            
            .financial-item {
              text-align: center;
              padding: 10px;
              background: #f9fafb;
              border-radius: 6px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">Supplier Payment Receipt</div>
            <div class="receipt-title">Payment Details</div>
            <div class="receipt-number">Reference: ${payment.reference_number || `SP-${payment.id}`}</div>
          </div>
          
          <div class="info-grid">
            <div class="info-card">
              <h3>Payment Information</h3>
              <div class="info-row">
                <span class="info-label">Payment ID:</span>
                <span class="info-value">#${payment.id}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">${formatDate(payment.payment_date)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Type:</span>
                <span class="info-value">
                  <span class="badge badge-supplier-payment">Supplier Payment</span>
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">
                  <span class="badge badge-completed">${payment.status || 'Completed'}</span>
                </span>
              </div>
            </div>
            
            <div class="info-card">
              <h3>Supplier Details</h3>
              <div class="info-row">
                <span class="info-label">Supplier Name:</span>
                <span class="info-value">${payment.supplier_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment Method:</span>
                <span class="info-value">${payment.payment_method}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Purchases Affected:</span>
                <span class="info-value">${payment.affected_purchases || 0}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Reference:</span>
                <span class="info-value">${payment.reference_number || `SP-${payment.id}`}</span>
              </div>
            </div>
          </div>
          
          <div class="amount-section">
            <div class="amount-label">Payment Amount</div>
            <div class="amount-value">
              - ${formatCurrency(payment.amount)}
            </div>
            
            <div class="financial-grid">
              <div class="financial-item">
                <div class="info-label">Spend</div>
                <div style="color: #dc2626; font-weight: 600;">${formatCurrency(payment.amount)}</div>
              </div>
              <div class="financial-item">
                <div class="info-label">Cost</div>
                <div style="font-weight: 600;">${currency} 0.00</div>
              </div>
              <div class="financial-item">
                <div class="info-label">Credit/Debit</div>
                <div style="color: #3b82f6; font-weight: 600;">${currency} 0.00 / ${formatCurrency(payment.amount)}</div>
              </div>
              <div class="financial-item">
                <div class="info-label">Net Impact</div>
                <div style="color: #dc2626; font-weight: 600;">- ${formatCurrency(payment.amount)}</div>
              </div>
            </div>
          </div>
          
          ${payment.notes || payment.description ? `
            <div class="description-section">
              <h3>Notes</h3>
              <p>${payment.notes || payment.description}</p>
            </div>
          ` : ''}
          
          <div class="footer">
            <p>Generated on ${format(new Date(), "MMMM do, yyyy 'at' HH:mm")}</p>
            <p style="margin-top: 5px;">This is a computer-generated document.</p>
          </div>
          
          <div class="no-print" style="text-align: center; margin-top: 30px;">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #f97316; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 10px;">
              Print
            </button>
            <button onclick="window.close()" style="padding: 10px 20px; background-color: #6b7280; color: white; border: none; border-radius: 6px; cursor: pointer;">
              Close
            </button>
          </div>
        </body>
        </html>
      `

      printWindow.document.write(htmlContent)
      printWindow.document.close()
    } catch (error) {
      console.error("Print error:", error)
      notifyError(toast, "Failed to generate print receipt.", "Print Error")
    }
  }

  if (!isOpen) return null

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto bg-white border-gray-200">
        <DialogHeader className="bg-white p-6 rounded-t-lg border-b border-gray-200">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center">
              <Receipt className="h-6 w-6 mr-2 text-orange-600" />
              Supplier Payment Details
            </DialogTitle>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="flex items-center gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                <Printer className="h-4 w-4" />
                Print
              </Button>
              {onEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (paymentId) {
                      onEdit(paymentId)
                      onClose()
                    }
                  }}
                  className="flex items-center gap-2 text-amber-600 border-amber-200 hover:bg-amber-50"
                >
                  <Edit className="h-4 w-4" />
                  Edit
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 text-red-600 border-red-200 hover:bg-red-50"
              >
                {isDeleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isDeleting ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center items-center py-12 bg-white rounded-lg mx-6">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading payment details...</p>
            </div>
          </div>
        ) : !payment ? (
          <div className="text-center py-12 bg-white rounded-lg mx-6">
            <div className="text-red-500 text-lg font-medium">Payment not found</div>
            <p className="text-gray-500 mt-2">The requested payment could not be loaded.</p>
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {/* Payment Information Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Payment Information */}
              <Card className="shadow-sm border-gray-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-orange-600" />
                    Payment Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Payment ID:</span>
                    <span className="font-semibold text-gray-900">#{payment.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Reference:</span>
                    <span className="font-semibold text-gray-900">
                      {payment.reference_number || `SP-${payment.id}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Date:
                    </span>
                    <span className="font-semibold text-gray-900">
                      {formatDate(payment.payment_date)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Type:</span>
                    <Badge
                      variant="outline"
                      className="bg-orange-100 text-orange-800 border-orange-300"
                    >
                      <span className="flex items-center gap-1">
                        <TrendingDown className="h-3 w-3" />
                        Supplier Payment
                      </span>
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Status:</span>
                    <Badge
                      variant="outline"
                      className="bg-green-100 text-green-800 border-green-300"
                    >
                      {payment.status || "Completed"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Supplier Details */}
              <Card className="shadow-sm border-gray-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                    <Building className="h-5 w-5 mr-2 text-blue-600" />
                    Supplier Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Supplier Name:</span>
                    <span className="font-semibold text-gray-900">{payment.supplier_name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium flex items-center">
                      <CreditCard className="h-4 w-4 mr-1" />
                      Payment Method:
                    </span>
                    <span className="font-semibold text-gray-900">{payment.payment_method}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium flex items-center">
                      <Package className="h-4 w-4 mr-1" />
                      Purchases Affected:
                    </span>
                    <span className="font-semibold text-gray-900">
                      {payment.affected_purchases || 0}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Amount Section */}
            <Card
              className="shadow-sm border-2 border-red-200 bg-gradient-to-r from-red-50 to-rose-50"
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-yellow-600" />
                  Payment Amount
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <div className="text-sm text-gray-600 mb-2">Amount Paid</div>
                  <div className="text-4xl font-bold text-red-600">
                    - {formatCurrency(payment.amount)}
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Spend</div>
                      <div className="font-semibold text-red-600">
                        {formatCurrency(payment.amount)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Cost</div>
                      <div className="font-semibold text-gray-900">
                        {currency} 0.00
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Credit/Debit</div>
                      <div className="font-semibold text-blue-600">
                        {currency} 0.00 / {formatCurrency(payment.amount)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Net Impact</div>
                      <div className="font-semibold text-red-600">
                        - {formatCurrency(payment.amount)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Notes/Description */}
            {(payment.notes || payment.description) && (
              <Card className="shadow-sm border-gray-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {payment.notes || payment.description}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Record Information */}
            <Card className="shadow-sm border-gray-200 bg-white">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-blue-600" />
                  Record Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-start">
                  <span className="text-gray-600 font-medium flex items-center">
                    <User className="h-4 w-4 mr-1" />
                    Created:
                  </span>
                  <span className="font-semibold text-gray-900 text-right text-sm">
                    {formatDateTime(payment.created_at)}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-600 font-medium flex items-center">
                    <Edit className="h-4 w-4 mr-1" />
                    Updated:
                  </span>
                  <span className="font-semibold text-gray-900 text-right text-sm">
                    {formatDateTime(payment.updated_at)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Footer with Close Button */}
        <div className="flex justify-end p-6 bg-white border-t border-gray-200">
          <Button
            variant="outline"
            onClick={onClose}
            className="px-6 border-gray-300 text-gray-700 hover:bg-gray-50 bg-transparent"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    {ConfirmDialog}
    </>
  )
}
