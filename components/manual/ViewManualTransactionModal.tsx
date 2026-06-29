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
  TrendingUp,
  TrendingDown,
  Printer,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { useConfirm } from "@/hooks/use-confirm"
import { format } from "date-fns"
import { getManualTransactionById, deleteManualTransaction } from "@/app/actions/manual-transaction-actions"

interface ViewManualTransactionModalProps {
  isOpen: boolean
  onClose: () => void
  transactionId: number | null
  currency?: string
  deviceId?: number // Make sure this is included
  onEdit?: (id: number) => void
  onTransactionDeleted?: () => void // Change from onDelete to onTransactionDeleted
}


interface ManualTransaction {
  id: number
  amount: number
  type: "debit" | "credit"
  description: string
  category: string
  payment_method: string
  transaction_date: string
  created_at: string
  updated_at: string
  device_id: number
  user_id: number
  status?: string
  reference_number?: string
}

export default function ViewManualTransactionModal({
  isOpen,
  onClose,
  transactionId,
  currency = "AED",
  deviceId,
  onEdit,
  onTransactionDeleted,
}: ViewManualTransactionModalProps) {
  const [transaction, setTransaction] = useState<ManualTransaction | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()

  // Format currency with the device currency
  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (isNaN(numAmount)) return `${currency} 0.00`
    return `${currency} ${numAmount.toFixed(2)}`
  }

  // Format date safely
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A"
    try {
      return format(new Date(dateString), "PPP 'at' p")
    } catch (error) {
      return "Invalid date"
    }
  }

  // Format date only
  const formatDateOnly = (dateString: string | null | undefined) => {
    if (!dateString) return "N/A"
    try {
      return format(new Date(dateString), "PPP")
    } catch (error) {
      return "Invalid date"
    }
  }

  // Fetch transaction data
  useEffect(() => {
    const fetchTransaction = async () => {
      if (!isOpen || !transactionId) return

      try {
        setIsLoading(true)
        console.log("Fetching manual transaction details for ID:", transactionId)

        const response = await getManualTransactionById(transactionId)
        
        if (response.success && response.data) {
          setTransaction(response.data)
        } else {
          console.error("Failed to fetch transaction:", response.message)
          notifyError(toast, response.message || "Failed to load transaction details")
          setTransaction(null)
        }
      } catch (error) {
        console.error("Error fetching manual transaction:", error)
        notifyError(toast, "An unexpected error occurred. Please try again later.")
        setTransaction(null)
      } finally {
        setIsLoading(false)
      }
    }

    if (isOpen && transactionId) {
      fetchTransaction()
    }
  }, [isOpen, transactionId, toast])

  // Handle delete transaction
  const handleDelete = async () => {
    if (!transactionId || !deviceId) {
      notifyError(toast, "Transaction ID or Device ID missing")
      return
    }

    if (!(await confirm("Are you sure you want to delete this manual transaction? This action cannot be undone."))) {
      return
    }

    try {
      setIsDeleting(true)
      const response = await deleteManualTransaction(transactionId, deviceId)

      if (response.success) {
        notifySuccess(toast, response.message || "Transaction deleted successfully")
        onTransactionDeleted?.()
        onClose()
      } else {
        notifyError(toast, response.message || "Failed to delete transaction")
      }
    } catch (error) {
      console.error("Error deleting transaction:", error)
      notifyError(toast, "An unexpected error occurred while deleting the transaction.")
    } finally {
      setIsDeleting(false)
    }
  }

  const handlePrint = () => {
    if (!transaction) return

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
          <title>Manual Transaction Receipt - #${transaction.reference_number || transaction.id}</title>
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
              border-bottom: 2px solid #3b82f6;
            }
            
            .company-name {
              font-size: 24px;
              font-weight: 700;
              color: #3b82f6;
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
              background: #f9fafb;
              border: 2px solid #e5e7eb;
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
            }
            
            .amount-debit {
              color: #dc2626;
            }
            
            .amount-credit {
              color: #16a34a;
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
            
            .badge-debit {
              background: #fee2e2;
              color: #991b1b;
            }
            
            .badge-credit {
              background: #dcfce7;
              color: #166534;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="company-name">Manual Transaction Receipt</div>
            <div class="receipt-title">Transaction Details</div>
            <div class="receipt-number">Reference: ${transaction.reference_number || `MAN-${transaction.id}`}</div>
          </div>
          
          <div class="info-grid">
            <div class="info-card">
              <h3>Transaction Information</h3>
              <div class="info-row">
                <span class="info-label">Transaction ID:</span>
                <span class="info-value">#${transaction.id}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">${formatDateOnly(transaction.transaction_date)}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Type:</span>
                <span class="info-value">
                  <span class="badge ${transaction.type === 'debit' ? 'badge-debit' : 'badge-credit'}">
                    ${transaction.type === 'debit' ? 'Money Out (Debit)' : 'Money In (Credit)'}
                  </span>
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">${transaction.status || 'Completed'}</span>
              </div>
            </div>
            
            <div class="info-card">
              <h3>Payment Details</h3>
              <div class="info-row">
                <span class="info-label">Category:</span>
                <span class="info-value">${transaction.category}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Payment Method:</span>
                <span class="info-value">${transaction.payment_method}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Reference:</span>
                <span class="info-value">${transaction.reference_number || `MAN-${transaction.id}`}</span>
              </div>
            </div>
          </div>
          
          <div class="amount-section">
            <div class="amount-label">Transaction Amount</div>
            <div class="amount-value ${transaction.type === 'debit' ? 'amount-debit' : 'amount-credit'}">
              ${transaction.type === 'debit' ? '- ' : '+ '}${formatCurrency(transaction.amount)}
            </div>
          </div>
          
          ${transaction.description ? `
            <div class="description-section">
              <h3>Description</h3>
              <p>${transaction.description}</p>
            </div>
          ` : ''}
          
          <div class="footer">
            <p>Generated on ${format(new Date(), "PPP 'at' p")}</p>
            <p style="margin-top: 5px;">This is a computer-generated document.</p>
          </div>
          
          <div class="no-print" style="text-align: center; margin-top: 30px;">
            <button onclick="window.print()" style="padding: 10px 20px; background-color: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; margin-right: 10px;">
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
              <Receipt className="h-6 w-6 mr-2 text-purple-600" />
              Manual Transaction Details
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
                    if (transactionId) {
                      onEdit(transactionId)
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
              <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-4" />
              <p className="text-gray-600">Loading transaction details...</p>
            </div>
          </div>
        ) : !transaction ? (
          <div className="text-center py-12 bg-white rounded-lg mx-6">
            <div className="text-red-500 text-lg font-medium">Transaction not found</div>
            <p className="text-gray-500 mt-2">The requested transaction could not be loaded.</p>
          </div>
        ) : (
          <div className="space-y-6 p-6">
            {/* Transaction Information Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Transaction Information */}
              <Card className="shadow-sm border-gray-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                    <FileText className="h-5 w-5 mr-2 text-purple-600" />
                    Transaction Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Transaction ID:</span>
                    <span className="font-semibold text-gray-900">#{transaction.id}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Reference:</span>
                    <span className="font-semibold text-gray-900">
                      {transaction.reference_number || `MAN-${transaction.id}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      Date:
                    </span>
                    <span className="font-semibold text-gray-900">
                      {formatDateOnly(transaction.transaction_date)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Type:</span>
                    <Badge
                      variant="outline"
                      className={
                        transaction.type === "credit"
                          ? "bg-green-100 text-green-800 border-green-300"
                          : "bg-red-100 text-red-800 border-red-300"
                      }
                    >
                      {transaction.type === "credit" ? (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          Money In (Credit)
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <TrendingDown className="h-3 w-3" />
                          Money Out (Debit)
                        </span>
                      )}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Status:</span>
                    <Badge
                      variant="outline"
                      className="bg-blue-100 text-blue-800 border-blue-300"
                    >
                      {transaction.status || "Completed"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Details */}
              <Card className="shadow-sm border-gray-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                    <CreditCard className="h-5 w-5 mr-2 text-green-600" />
                    Payment Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Category:</span>
                    <span className="font-semibold text-gray-900">{transaction.category}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium flex items-center">
                      <CreditCard className="h-4 w-4 mr-1" />
                      Payment Method:
                    </span>
                    <span className="font-semibold text-gray-900">{transaction.payment_method}</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Amount Section */}
            <Card
              className={`shadow-sm border-2 ${
                transaction.type === "credit"
                  ? "border-green-200 bg-gradient-to-r from-green-50 to-emerald-50"
                  : "border-red-200 bg-gradient-to-r from-red-50 to-rose-50"
              }`}
            >
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-semibold text-gray-800 flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-yellow-600" />
                  Transaction Amount
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-4">
                  <div className="text-sm text-gray-600 mb-2">
                    {transaction.type === "credit" ? "Amount Received" : "Amount Paid"}
                  </div>
                  <div
                    className={`text-4xl font-bold ${
                      transaction.type === "credit"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {transaction.type === "credit" ? "+ " : "- "}
                    {formatCurrency(transaction.amount)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Description */}
            {transaction.description && (
              <Card className="shadow-sm border-gray-200 bg-white">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg font-semibold text-gray-800">Description</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 bg-gray-50 p-4 rounded-lg">
                    {transaction.description}
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
                    {formatDate(transaction.created_at)}
                  </span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-gray-600 font-medium flex items-center">
                    <Edit className="h-4 w-4 mr-1" />
                    Updated:
                  </span>
                  <span className="font-semibold text-gray-900 text-right text-sm">
                    {formatDate(transaction.updated_at)}
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
