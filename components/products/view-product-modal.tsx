"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2, Printer, Copy, Settings, RefreshCw, TrendingUp, TrendingDown, Minus, CreditCard, Banknote, Smartphone, Building2, Receipt, ShoppingCart, RotateCcw, X, Clock, CheckCircle2 } from "lucide-react"
import { getProductStockHistory } from "@/app/actions/product-actions"
import { printBarcodeSticker, printMultipleBarcodeStickers, encodeNumberAsLetters } from "@/lib/barcode-utils"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"

interface ViewProductModalProps {
  isOpen: boolean
  onClose: () => void
  product: any
  onAdjustStock?: () => void
  currency?: string
  privacyMode?: boolean
}

// Comprehensive payment method icons and labels
const PAYMENT_METHOD_CONFIG = {
  cash: { icon: Banknote, label: "Cash", color: "text-green-600 dark:text-green-400" },
  card: { icon: CreditCard, label: "Card", color: "text-blue-600 dark:text-blue-400" },
  credit_card: { icon: CreditCard, label: "Credit Card", color: "text-blue-600 dark:text-blue-400" },
  debit_card: { icon: CreditCard, label: "Debit Card", color: "text-purple-600 dark:text-purple-400" },
  online: { icon: Smartphone, label: "Online", color: "text-indigo-600 dark:text-indigo-400" },
  upi: { icon: Smartphone, label: "UPI", color: "text-orange-600 dark:text-orange-400" },
  bank_transfer: { icon: Building2, label: "Bank Transfer", color: "text-gray-600 dark:text-gray-400" },
  cheque: { icon: Receipt, label: "Cheque", color: "text-yellow-600 dark:text-yellow-400" },
  wallet: { icon: Smartphone, label: "Digital Wallet", color: "text-teal-600 dark:text-teal-400" },
  mixed: { icon: CreditCard, label: "Mixed Payment", color: "text-pink-600 dark:text-pink-400" },
}

// Enhanced comprehensive stock history types with better categorization
const STOCK_HISTORY_TYPES = {
  // Purchase transactions
  purchase: { 
    label: "Purchase", 
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: TrendingUp,
    impact: "positive",
    category: "purchase"
  },
  
  // Main sale transactions
  sale: { 
    label: "Sale", 
    color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    icon: ShoppingCart,
    impact: "negative",
    category: "sale"
  },
  sale_completed: {
    label: "Sale Completed",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    icon: CheckCircle2,
    impact: "negative",
    category: "sale"
  },
  sale_credit: {
    label: "Credit Sale",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    icon: Clock,
    impact: "negative",
    category: "sale"
  },
  sale_pending: {
    label: "Sale (Pending)",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: Clock,
    impact: "neutral",
    category: "sale"
  },
  
  // Sale returns and cancellations
  sale_returned: {
    label: "Sale Returned",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: RotateCcw,
    impact: "positive",
    category: "return"
  },
  sale_cancelled: {
    label: "Sale Cancelled",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    icon: X,
    impact: "positive",
    category: "return"
  },
  sale_deleted: {
    label: "Sale Deleted",
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    icon: X,
    impact: "positive",
    category: "return"
  },
  
  // Sale modifications
  sale_item_added: {
    label: "Item Added to Sale",
    color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
    icon: TrendingDown,
    impact: "negative",
    category: "modification"
  },
  sale_item_removed: {
    label: "Item Removed from Sale",
    color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
    icon: TrendingUp,
    impact: "positive",
    category: "modification"
  },
  sale_item_increased: {
    label: "Quantity Increased",
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
    icon: TrendingDown,
    impact: "negative",
    category: "modification"
  },
  sale_item_decreased: {
    label: "Quantity Decreased",
    color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
    icon: TrendingUp,
    impact: "positive",
    category: "modification"
  },
  
  // Status changes
  sale_status_changed: {
    label: "Status Changed",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    icon: RefreshCw,
    impact: "neutral",
    category: "status"
  },
  
  // Manual adjustments
  adjustment: {
    label: "Manual Adjustment",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    icon: Settings,
    impact: "neutral",
    category: "manual"
  },
  
  // Service transactions (usually don't affect physical stock)
  service_create: {
    label: "Service Sale",
    color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
    icon: Settings,
    impact: "neutral",
    category: "service"
  },
  
  // Test entries
  test_entry: {
    label: "Test Entry",
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
    icon: Settings,
    impact: "neutral",
    category: "test"
  }
}

// Helper to extract enhanced transaction details from notes
function extractTransactionDetails(notes: string, paymentMethod?: string, saleStatus?: string) {
  const notesCleaned = notes?.toLowerCase() || ''
  
  // Use provided payment method first, then extract from notes
  let finalPaymentMethod = paymentMethod?.toLowerCase() || 'cash'
  if (!paymentMethod) {
    if (notesCleaned.includes('via card') || notesCleaned.includes('via credit') || notesCleaned.includes('via debit')) {
      finalPaymentMethod = 'card'
    } else if (notesCleaned.includes('via online') || notesCleaned.includes('via digital')) {
      finalPaymentMethod = 'online'
    } else if (notesCleaned.includes('via upi')) {
      finalPaymentMethod = 'upi'
    } else if (notesCleaned.includes('via bank')) {
      finalPaymentMethod = 'bank_transfer'
    }
  }
  
  // Use provided sale status first, then extract from notes
  let finalStatus = saleStatus?.toLowerCase() || 'completed'
  if (!saleStatus) {
    if (notesCleaned.includes('pending')) {
      finalStatus = 'pending'
    } else if (notesCleaned.includes('cancelled') || notesCleaned.includes('canceled')) {
      finalStatus = 'cancelled'
    } else if (notesCleaned.includes('returned')) {
      finalStatus = 'returned'
    } else if (notesCleaned.includes('credit')) {
      finalStatus = 'credit'
    }
  }
  
  // Extract customer info
  let customerInfo = null
  const customerMatch = notesCleaned.match(/customer:\s*([^|]+)/i)
  if (customerMatch) {
    customerInfo = customerMatch[1].trim()
  }
  
  return { 
    paymentMethod: finalPaymentMethod, 
    status: finalStatus,
    customerInfo
  }
}

export default function ViewProductModal({
  isOpen,
  onClose,
  product,
  onAdjustStock,
  currency: currencyProp,
  privacyMode = true,
}: ViewProductModalProps) {
  const [stockHistory, setStockHistory] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [printCopies, setPrintCopies] = useState(1)
  const [showPrintOptions, setShowPrintOptions] = useState(false)
  const [currency, setCurrency] = useState(currencyProp || "AED")
  const [stockHistoryError, setStockHistoryError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showAllHistory, setShowAllHistory] = useState(false)

  // Get encoded wholesale price
  const wholesalePrice =
    typeof product?.wholesale_price === "number"
      ? product.wholesale_price
      : Number.parseFloat(product?.wholesale_price || "0") || 0

  const encodedWholesalePrice = encodeNumberAsLetters(Math.round(wholesalePrice))

  // Get MSP (Maximum Selling Price)
  const msp = typeof product?.msp === "number" ? product.msp : Number.parseFloat(product?.msp || "0") || 0

  const fetchStockHistory = async () => {
    if (!product?.id) return

    try {
      setIsLoading(true)
      setStockHistoryError(null)
      
      console.log('Fetching stock history for product:', product.id)
      const result = await getProductStockHistory(product.id)
      
      console.log('Stock history result:', result)
      
      if (result.success) {
        // Sort by date descending to show most recent first
        const sortedHistory = (result.data || []).sort((a, b) => 
          new Date(b.created_at || b.date).getTime() - new Date(a.created_at || a.date).getTime()
        )
        setStockHistory(sortedHistory)
        console.log('Stock history data:', sortedHistory)
      } else {
        setStockHistoryError(result.message || 'Failed to fetch stock history')
        console.error('Stock history error:', result.message)
        setStockHistory([])
      }

      // If currency is not provided as a prop, fetch it
      if (!currencyProp) {
        try {
          const deviceCurrency = await getDeviceCurrency(product.created_by || 1)
          setCurrency(deviceCurrency)
        } catch (err) {
          console.error("Error fetching currency:", err)
        }
      }
    } catch (error) {
      console.error("Error fetching stock history:", error)
      setStockHistoryError('An error occurred while fetching stock history')
      setStockHistory([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen && product?.id) {
      fetchStockHistory()
    }

    if (product?.barcode && typeof window !== "undefined" && isOpen) {
      // Use dynamic import for JsBarcode
      import("jsbarcode")
        .then((JsBarcode) => {
          const container = document.getElementById("barcodeContainer")
          if (container) {
            container.innerHTML = "" // Clear previous barcode
            const canvas = document.createElement("canvas")
            container.appendChild(canvas)
            JsBarcode.default(canvas, product.barcode, {
              format: "CODE128",
              width: 2,
              height: 50,
              displayValue: false,
            })
          }
        })
        .catch((err) => console.error("Failed to load JsBarcode:", err))
    }
  }, [isOpen, product?.id, product?.barcode, currencyProp])

  // Enhanced helper function to get comprehensive type info
  const getTypeInfo = (
    type: string,
    referenceType: string,
    referenceId?: number,
    notes?: string,
    quantity?: number,
    paymentMethod?: string,
    saleStatus?: string,
  ) => {
    console.log("Processing stock history type:", { type, referenceType, referenceId, notes, quantity, paymentMethod, saleStatus })

    // Get base type info
    const typeInfo = STOCK_HISTORY_TYPES[type] || {
      label: type || "Unknown",
      color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
      icon: Minus,
      impact: "neutral",
      category: "unknown"
    }

    // Extract additional details from notes and provided fields
    const transactionDetails = extractTransactionDetails(notes || "", paymentMethod, saleStatus)
    
    // Build comprehensive label
    let label = typeInfo.label
    if (referenceId) {
      label += ` #${referenceId}`
    }

    return {
      ...typeInfo,
      label,
      transactionDetails,
    }
  }

  const handlePrintPriceTag = () => {
    if (product) {
      printBarcodeSticker(product, currency)
    }
  }

  const handlePrintMultipleTags = () => {
    if (product && printCopies > 0) {
      printMultipleBarcodeStickers([product], printCopies, currency)
    }
  }

  const handleRefreshStockHistory = () => {
    fetchStockHistory()
  }

  // Enhanced helper function to determine quantity change display with proper impact calculation
  const getQuantityDisplay = (item: any) => {
    const quantity = Number(item.quantity) || 0
    const type = item.type || 'unknown'
    
    // Get type info to determine impact
    const typeInfo = STOCK_HISTORY_TYPES[type]
    const impact = typeInfo?.impact || 'neutral'
    
    // For services or neutral impacts, show as no stock change
    const isNeutral = impact === 'neutral' || item.notes?.toLowerCase().includes('service') || type.includes('service')
    
    if (isNeutral) {
      return {
        value: 0,
        isDecrease: false,
        isIncrease: false,
        isNeutral: true,
        displayText: impact === 'neutral' ? "No Stock Impact" : `${quantity} (Service)`
      }
    }
    
    // Determine display based on impact
    const isDecrease = impact === 'negative'
    const isIncrease = impact === 'positive'
    const displayValue = quantity
    
    return {
      value: isDecrease ? -Math.abs(displayValue) : Math.abs(displayValue),
      isDecrease,
      isIncrease,
      isNeutral: false,
      displayText: isDecrease ? `-${Math.abs(displayValue)}` : `+${Math.abs(displayValue)}`
    }
  }

  // Calculate stock movement summary with category breakdown
  const getStockMovementSummary = () => {
    if (!stockHistory.length) return { 
      totalIn: 0, 
      totalOut: 0, 
      totalMovements: 0,
      categorySummary: {}
    }

    return stockHistory.reduce((summary, item) => {
      const quantityDisplay = getQuantityDisplay(item)
      const absValue = Math.abs(quantityDisplay.value)
      const typeInfo = STOCK_HISTORY_TYPES[item.type] || { category: 'unknown' }
      
      if (quantityDisplay.isIncrease) {
        summary.totalIn += absValue
      } else if (quantityDisplay.isDecrease) {
        summary.totalOut += absValue
      }
      
      summary.totalMovements += absValue
      
      // Category summary
      const category = typeInfo.category
      if (!summary.categorySummary[category]) {
        summary.categorySummary[category] = { count: 0, totalQuantity: 0 }
      }
      summary.categorySummary[category].count += 1
      summary.categorySummary[category].totalQuantity += absValue
      
      return summary
    }, { 
      totalIn: 0, 
      totalOut: 0, 
      totalMovements: 0,
      categorySummary: {}
    })
  }

  const stockSummary = getStockMovementSummary()

  // Filter stock history based on category
  const filteredHistory = filterCategory === 'all' 
    ? stockHistory 
    : stockHistory.filter(item => {
        const typeInfo = STOCK_HISTORY_TYPES[item.type] || { category: 'unknown' }
        return typeInfo.category === filterCategory
      })

  // Limit display if not showing all
  const displayHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 10)

  // Get unique categories from stock history
  const availableCategories = [...new Set(stockHistory.map(item => {
    const typeInfo = STOCK_HISTORY_TYPES[item.type] || { category: 'unknown' }
    return typeInfo.category
  }))]

  // Don't render if no product
  if (!product) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
        <div className="flex flex-col h-full max-h-[90vh]">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-center text-xl text-gray-900 dark:text-gray-100">Product Details</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Product Image */}
                {product.image_url && (
                  <div className="lg:col-span-1">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Product Image</h3>
                      <div className="aspect-square rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4 overflow-hidden">
                        <img
                          src={product.image_url || "/placeholder.svg"}
                          alt={product.name || "Product"}
                          className="w-full h-full object-contain rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Product Details */}
                <div className={`space-y-4 ${product.image_url ? "lg:col-span-2" : "lg:col-span-3"}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</h3>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{product.name || "N/A"}</p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Company Name</h3>
                      <p className="text-gray-900 dark:text-gray-100">{product.company_name || "N/A"}</p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Category</h3>
                      <p className="text-gray-900 dark:text-gray-100">{product.category || "N/A"}</p>
                    </div>

                    {product.shelf && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Shelf Location</h3>
                        <p className="text-gray-900 dark:text-gray-100">{product.shelf}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">MRP (Retail Price)</h3>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {currency} {product.price || "0.00"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Wholesale Price</h3>
                      <p className="font-medium text-gray-900 dark:text-gray-100">
                        {privacyMode ? (
                          <span className="text-gray-400 dark:text-gray-500">*** ***</span>
                        ) : (
                          <>
                            {currency} {product.wholesale_price || "0.00"}
                            {encodedWholesalePrice && (
                              <span className="ml-2 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-xs">
                                Code: {encodedWholesalePrice}
                              </span>
                            )}
                          </>
                        )}
                      </p>
                    </div>

                    {msp > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          MSP (Maximum Selling Price)
                        </h3>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {privacyMode ? (
                            <span className="text-gray-400 dark:text-gray-500">*** ***</span>
                          ) : (
                            `${currency} ${msp.toFixed(2)}`
                          )}
                        </p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Stock</h3>
                      <p className="font-medium">
                        {privacyMode ? (
                          <span className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            *** Stock
                          </span>
                        ) : (
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              product.stock === 0
                                ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                                : product.stock < 5
                                  ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200"
                                  : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            }`}
                          >
                            {product.stock || 0}{" "}
                            {product.stock === 0 ? "Out of Stock" : product.stock < 5 ? "Low Stock" : "In Stock"}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Created At</h3>
                      <p className="text-gray-900 dark:text-gray-100">
                        {product.created_at ? format(new Date(product.created_at), "PPP p") : "N/A"}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Updated</h3>
                      <p className="text-gray-900 dark:text-gray-100">
                        {product.updated_at ? format(new Date(product.updated_at), "PPP p") : "N/A"}
                      </p>
                    </div>

                    {product.description && (
                      <div className="space-y-2 md:col-span-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h3>
                        <p className="text-gray-900 dark:text-gray-100">{product.description}</p>
                      </div>
                    )}
                  </div>

                  {/* Barcode Section */}
                  {product.barcode && (
                    <div className="mt-4">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Barcode</h3>
                      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-4">
                        <div id="barcodeContainer" className="w-full max-w-xs"></div>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{product.barcode}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Print Price Tag Section */}
              <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                <h3 className="text-lg font-medium mb-3 text-gray-900 dark:text-gray-100">Price Tag Printing</h3>

                {showPrintOptions ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="copies" className="text-gray-700 dark:text-gray-300">
                          Number of Copies
                        </Label>
                        <Input
                          id="copies"
                          type="number"
                          min="1"
                          max="100"
                          value={printCopies}
                          onChange={(e) => setPrintCopies(Number.parseInt(e.target.value) || 1)}
                          className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button onClick={handlePrintMultipleTags} className="flex-1">
                        <Printer className="mr-2 h-4 w-4" /> Print {printCopies} {printCopies === 1 ? "Copy" : "Copies"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowPrintOptions(false)}
                        className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={handlePrintPriceTag} className="flex-1 sm:flex-none">
                      <Printer className="mr-2 h-4 w-4" /> Print Single Tag
                    </Button>
                    <Button
                      onClick={() => setShowPrintOptions(true)}
                      variant="outline"
                      className="flex-1 sm:flex-none border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Copy className="mr-2 h-4 w-4" /> Print Multiple Copies
                    </Button>
                    {onAdjustStock && (
                      <Button
                        onClick={onAdjustStock}
                        variant="secondary"
                        className="flex-1 sm:flex-none bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
                      >
                        <Settings className="mr-2 h-4 w-4" /> Adjust Stock
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* ENHANCED: Comprehensive Stock Movement History Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stock Movement History</h3>
                  <Button
                    onClick={handleRefreshStockHistory}
                    variant="outline"
                    size="sm"
                    disabled={isLoading}
                    className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                </div>

                {/* Enhanced Stock Movement Summary */}
                {!privacyMode && stockHistory.length > 0 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800">
                        <div className="flex items-center">
                          <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                          <div>
                            <p className="text-sm font-medium text-green-800 dark:text-green-200">Stock In</p>
                            <p className="text-lg font-bold text-green-900 dark:text-green-100">{stockSummary.totalIn}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 border border-red-200 dark:border-red-800">
                        <div className="flex items-center">
                          <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
                          <div>
                            <p className="text-sm font-medium text-red-800 dark:text-red-200">Stock Out</p>
                            <p className="text-lg font-bold text-red-900 dark:text-red-100">{stockSummary.totalOut}</p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center">
                          <RefreshCw className="h-5 w-5 text-blue-600 dark:text-blue-400 mr-2" />
                          <div>
                            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">Net Change</p>
                            <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                              {stockSummary.totalIn - stockSummary.totalOut >= 0 ? '+' : ''}{stockSummary.totalIn - stockSummary.totalOut}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Category Filter and Summary */}
                    {availableCategories.length > 1 && (
                      <div className="flex flex-wrap gap-2 items-center">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filter by category:</span>
                        <Button
                          variant={filterCategory === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setFilterCategory('all')}
                          className="text-xs"
                        >
                          All ({stockHistory.length})
                        </Button>
                        {availableCategories.map(category => (
                          <Button
                            key={category}
                            variant={filterCategory === category ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setFilterCategory(category)}
                            className="text-xs capitalize"
                          >
                            {category} ({stockSummary.categorySummary[category]?.count || 0})
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="animate-spin h-5 w-5 text-gray-400" />
                      <span className="text-gray-500 dark:text-gray-400">Loading stock history...</span>
                    </div>
                  </div>
                ) : stockHistoryError ? (
                  <div className="text-center py-8 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                    <p className="text-red-600 dark:text-red-400 mb-2">{stockHistoryError}</p>
                    <Button 
                      onClick={handleRefreshStockHistory} 
                      variant="outline" 
                      size="sm"
                      className="border-red-300 dark:border-red-600 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/40"
                    >
                      Try Again
                    </Button>
                  </div>
                ) : displayHistory.length > 0 ? (
                  <div className="border rounded-md overflow-hidden border-gray-200 dark:border-gray-600">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Date & Time
                            </th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Transaction Type
                            </th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                              Stock Impact
                            </th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Payment & Status
                            </th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Details
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-600">
                          {displayHistory.map((item) => {
                            const typeInfo = getTypeInfo(
                              item.type,
                              item.reference_type,
                              item.reference_id,
                              item.notes,
                              item.quantity,
                              item.payment_method,
                              item.sale_status
                            )
                            
                            const quantityDisplay = getQuantityDisplay(item)
                            const IconComponent = typeInfo.icon

                            return (
                              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                  {format(new Date(item.created_at || item.date), "MMM dd, yyyy")}
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {format(new Date(item.created_at || item.date), "h:mm a")}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <div className="flex items-center space-x-2">
                                    {privacyMode ? (
                                      <Badge variant="secondary" className="bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                        <Minus className="w-3 h-3 mr-1" />
                                        *** Transaction
                                      </Badge>
                                    ) : (
                                      <Badge 
                                        className={`${typeInfo.color} border-0`}
                                      >
                                        <IconComponent className="w-3 h-3 mr-1" />
                                        {typeInfo.label}
                                      </Badge>
                                    )}
                                  </div>
                                  {!privacyMode && typeInfo.category && (
                                    <div className="mt-1">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 capitalize">
                                        {typeInfo.category}
                                      </span>
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-center">
                                  {privacyMode ? (
                                    <span className="text-gray-400 dark:text-gray-500">***</span>
                                  ) : (
                                    <div className="flex flex-col items-center">
                                      <span
                                        className={`font-semibold text-sm ${
                                          quantityDisplay.isNeutral
                                            ? "text-gray-600 dark:text-gray-400"
                                            : quantityDisplay.isDecrease
                                              ? "text-red-600 dark:text-red-400"
                                              : "text-green-600 dark:text-green-400"
                                        }`}
                                      >
                                        {quantityDisplay.displayText}
                                      </span>
                                      {quantityDisplay.isNeutral && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                          No Physical Impact
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {privacyMode ? (
                                    <span className="text-gray-400 dark:text-gray-500">***</span>
                                  ) : (
                                    <div className="space-y-1">
                                      {/* Payment Method */}
                                      {typeInfo.transactionDetails.paymentMethod && typeInfo.transactionDetails.paymentMethod !== 'cash' && (
                                        <div className="flex items-center space-x-1">
                                          {(() => {
                                            const PaymentIcon = PAYMENT_METHOD_CONFIG[typeInfo.transactionDetails.paymentMethod]?.icon || Banknote
                                            const paymentConfig = PAYMENT_METHOD_CONFIG[typeInfo.transactionDetails.paymentMethod] || { label: typeInfo.transactionDetails.paymentMethod, color: 'text-gray-600' }
                                            return (
                                              <>
                                                <PaymentIcon className={`w-3 h-3 ${paymentConfig.color}`} />
                                                <span className={`text-xs font-medium ${paymentConfig.color}`}>
                                                  {paymentConfig.label}
                                                </span>
                                              </>
                                            )
                                          })()}
                                        </div>
                                      )}
                                      
                                      {/* Sale Status */}
                                      {typeInfo.transactionDetails.status && typeInfo.transactionDetails.status !== 'completed' && (
                                        <div className="flex items-center space-x-1">
                                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                            typeInfo.transactionDetails.status === 'pending' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                                            typeInfo.transactionDetails.status === 'cancelled' ? 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200' :
                                            typeInfo.transactionDetails.status === 'returned' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                                            typeInfo.transactionDetails.status === 'credit' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' :
                                            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                                          }`}>
                                            {typeInfo.transactionDetails.status.toUpperCase()}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                  <div className="max-w-xs">
                                    <p className="truncate" title={privacyMode ? "***" : (item.notes || "-")}>
                                      {privacyMode ? "***" : (item.notes || "-")}
                                    </p>
                                    {!privacyMode && (
                                      <div className="space-y-1 mt-1">
                                        {typeInfo.transactionDetails.customerInfo && (
                                          <p className="text-xs text-blue-600 dark:text-blue-400">
                                            Customer: {typeInfo.transactionDetails.customerInfo}
                                          </p>
                                        )}
                                        {item.created_by && (
                                          <p className="text-xs text-gray-500 dark:text-gray-400">
                                            User ID: {item.created_by}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Enhanced footer with show more/less and comprehensive summary */}
                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {filteredHistory.length > 10 && !showAllHistory && (
                            <div className="flex items-center gap-2 mb-2">
                              <span>Showing 10 of {filteredHistory.length} entries</span>
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setShowAllHistory(true)}
                                className="text-xs p-0 h-auto text-blue-600 dark:text-blue-400"
                              >
                                Show all
                              </Button>
                            </div>
                          )}
                          {showAllHistory && filteredHistory.length > 10 && (
                            <div className="flex items-center gap-2 mb-2">
                              <span>Showing all {filteredHistory.length} entries</span>
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => setShowAllHistory(false)}
                                className="text-xs p-0 h-auto text-blue-600 dark:text-blue-400"
                              >
                                Show less
                              </Button>
                            </div>
                          )}
                        </div>
                        {!privacyMode && (
                          <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-400">
                            <span>Stock In: +{stockSummary.totalIn}</span>
                            <span>Stock Out: -{stockSummary.totalOut}</span>
                            <span>Net: {stockSummary.totalIn - stockSummary.totalOut >= 0 ? '+' : ''}{stockSummary.totalIn - stockSummary.totalOut}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                    <div className="mb-2">
                      <div className="w-12 h-12 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
                        <RefreshCw className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium">
                        {filterCategory === 'all' ? 'No stock movements recorded' : `No ${filterCategory} movements found`}
                      </p>
                      <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                        Stock movements will appear here after sales, purchases, or manual adjustments
                      </p>
                    </div>
                    <Button 
                      onClick={handleRefreshStockHistory}
                      variant="outline" 
                      size="sm"
                      className="mt-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Check Again
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Product ID: {product.id}
                {!privacyMode && stockHistory.length > 0 && (
                  <span className="ml-4">
                    Last activity: {format(new Date(stockHistory[0]?.created_at || stockHistory[0]?.date), "MMM dd, h:mm a")}
                  </span>
                )}
              </div>
              <Button
                onClick={onClose}
                className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 border-0"
              >
                Close
              </Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
