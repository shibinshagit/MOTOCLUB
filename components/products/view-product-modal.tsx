"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2, Printer, Copy, Settings, RefreshCw } from "lucide-react"
import { getProductStockHistory } from "@/app/actions/product-actions"
import { printBarcodeSticker, printMultipleBarcodeStickers, encodeNumberAsLetters } from "@/lib/barcode-utils"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"

interface ViewProductModalProps {
  isOpen: boolean
  onClose: () => void
  product: any
  onAdjustStock?: () => void
  currency?: string
  privacyMode?: boolean
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

  // UPDATED: Helper function to get type label and color with improved mapping for the corrected stock history
  const getTypeInfo = (
    type: string,
    referenceType: string,
    referenceId?: number,
    notes?: string,
    quantity?: number,
  ) => {
    console.log("Processing stock history type:", { type, referenceType, referenceId, notes, quantity })

    // Enhanced type detection based on the corrected stock history types
    switch (type) {
      case "purchase":
        const isUpdate = notes?.toLowerCase().includes("update") || notes?.toLowerCase().includes("modified")
        return {
          label: `${isUpdate ? "Purchase Update" : "Purchase"} #${referenceId ?? "N/A"}`,
          color: isUpdate
            ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
            : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        }

      // Main sale types from our corrected createStockHistoryEntry function
      case "sale":
        return {
          label: `Sale #${referenceId ?? "N/A"}`,
          color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        }

      case "sale_returned":
        return {
          label: `Sale Return #${referenceId ?? "N/A"}`,
          color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
        }

      case "sale_completed":
        return {
          label: `Sale Completed #${referenceId ?? "N/A"}`,
          color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
        }

      case "sale_deleted":
        return {
          label: `Sale Deleted #${referenceId ?? "N/A"}`,
          color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
        }

      case "sale_item_increased":
        return {
          label: `Sale Item Added #${referenceId ?? "N/A"}`,
          color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
        }

      case "sale_item_decreased":
        return {
          label: `Sale Item Reduced #${referenceId ?? "N/A"}`,
          color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200",
        }

      case "sale_item_added":
        return {
          label: `Sale Item Added #${referenceId ?? "N/A"}`,
          color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
        }

      case "sale_item_removed":
        return {
          label: `Sale Item Removed #${referenceId ?? "N/A"}`,
          color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200",
        }

      // Legacy support for old naming conventions
      case "sale_cancelled":
      case "sale_deleted_cancelled":
        return {
          label: `Sale Cancelled #${referenceId ?? "N/A"}`,
          color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
        }

      case "sale_status_changed":
        return {
          label: `Sale Status Change #${referenceId ?? "N/A"}`,
          color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
        }

      case "sale_item_updated":
        return {
          label: `Sale Item Update #${referenceId ?? "N/A"}`,
          color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
        }

      case "adjustment":
        if (referenceType === "purchase") {
          return {
            label: `Purchase Adjustment #${referenceId ?? "N/A"}`,
            color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
          }
        }
        return {
          label: "Manual Adjustment",
          color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
        }

      case "test_entry":
        return {
          label: "Test Entry",
          color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
        }

      default:
        console.log("Unknown stock history type:", type)
        return {
          label: type || "Unknown",
          color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
        }
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

  // Helper function to determine quantity change display
  const getQuantityDisplay = (item: any) => {
    // Use the quantity field from the corrected stock history structure
    const quantity = Number(item.quantity) || 0
    
    // Determine if this is an increase or decrease based on the transaction type
    const isStockIncrease = [
      'purchase', 
      'sale_returned', 
      'sale_deleted', 
      'sale_item_removed', 
      'adjustment'
    ].includes(item.type) && !item.notes?.toLowerCase().includes('reduced')
    
    const isStockDecrease = [
      'sale', 
      'sale_completed', 
      'sale_item_increased', 
      'sale_item_added'
    ].includes(item.type) || item.notes?.toLowerCase().includes('reduced')
    
    // For manual adjustments, check the notes for direction
    if (item.type === 'adjustment' && item.notes) {
      const notes = item.notes.toLowerCase()
      if (notes.includes('decrease') || notes.includes('reduced')) {
        return {
          value: -Math.abs(quantity),
          isDecrease: true,
          isIncrease: false
        }
      }
    }
    
    return {
      value: isStockDecrease ? -Math.abs(quantity) : Math.abs(quantity),
      isDecrease: isStockDecrease,
      isIncrease: isStockIncrease
    }
  }

  // Don't render if no product
  if (!product) {
    return null
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
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

              {/* UPDATED: Stock History Section with corrected quantity display */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stock History</h3>
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
                ) : stockHistory.length > 0 ? (
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
                              Stock Change
                            </th>
                            <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Notes
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-600">
                          {stockHistory.map((item) => {
                            const typeInfo = getTypeInfo(
                              item.type,
                              item.reference_type,
                              item.reference_id,
                              item.notes,
                              item.quantity,
                            )
                            
                            const quantityDisplay = getQuantityDisplay(item)

                            return (
                              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                  {format(new Date(item.created_at || item.date), "PPP p")}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span
                                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                      privacyMode
                                        ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                                        : typeInfo.color
                                    }`}
                                  >
                                    {privacyMode ? "*** Transaction" : typeInfo.label}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm text-center">
                                  {privacyMode ? (
                                    <span className="text-gray-400 dark:text-gray-500">***</span>
                                  ) : (
                                    <span
                                      className={`font-semibold ${
                                        quantityDisplay.isDecrease
                                          ? "text-red-600 dark:text-red-400"
                                          : quantityDisplay.value === 0
                                            ? "text-gray-600 dark:text-gray-400"
                                            : "text-green-600 dark:text-green-400"
                                      }`}
                                    >
                                      {quantityDisplay.value === 0 
                                        ? "0" 
                                        : quantityDisplay.isDecrease
                                          ? quantityDisplay.value
                                          : `+${quantityDisplay.value}`
                                      }
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                  <div className="max-w-xs truncate" title={privacyMode ? "***" : (item.notes || "-")}>
                                    {privacyMode ? "***" : (item.notes || "-")}
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Show total count and summary */}
                    <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Showing {stockHistory.length} entries {stockHistory.length >= 100 ? '(latest 100)' : ''}
                        {!privacyMode && (
                          <span className="ml-4">
                            Total movements: {stockHistory.reduce((sum, item) => {
                              const quantityDisplay = getQuantityDisplay(item)
                              return sum + Math.abs(quantityDisplay.value)
                            }, 0)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 dark:bg-gray-800 rounded-md border border-gray-200 dark:border-gray-600">
                    <div className="mb-2">
                      <div className="w-12 h-12 mx-auto bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mb-3">
                        <RefreshCw className="w-6 h-6 text-gray-400" />
                      </div>
                      <p className="text-gray-500 dark:text-gray-400 font-medium">No stock history available</p>
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
