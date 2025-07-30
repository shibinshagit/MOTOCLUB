"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2, Printer, Copy, Settings } from "lucide-react"
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
  const [currency, setCurrency] = useState(currencyProp || "AED") // Use prop or default to AED

  // Get encoded wholesale price
  const wholesalePrice =
    typeof product.wholesale_price === "number"
      ? product.wholesale_price
      : Number.parseFloat(product.wholesale_price || "0") || 0

  const encodedWholesalePrice = encodeNumberAsLetters(Math.round(wholesalePrice))

  // Get MSP (Maximum Selling Price)
  const msp = typeof product.msp === "number" ? product.msp : Number.parseFloat(product.msp || "0") || 0

  useEffect(() => {
    const fetchStockHistory = async () => {
      if (!isOpen || !product?.id) return

      try {
        setIsLoading(true)
        const result = await getProductStockHistory(product.id)
        if (result.success) {
          setStockHistory(result.data)
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
      } finally {
        setIsLoading(false)
      }
    }

    fetchStockHistory()

    if (product.barcode && typeof window !== "undefined") {
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
  }, [isOpen, product?.id, currencyProp, product.barcode])

  // Helper function to get type label and color
  const getTypeInfo = (
    type: string,
    referenceType: string,
    referenceId?: number,
    notes?: string,
    quantity?: number,
  ) => {
    // regular purchase (green) or "purchase update" (blue)
    if (type === "purchase") {
      const isUpdate = notes?.toLowerCase().includes("update")
      return {
        label: `${isUpdate ? "Purchase Update" : "Purchase"} #${referenceId ?? "N/A"}`,
        color: isUpdate
          ? "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
          : "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
      }
    }

    // negative adjustment from a purchase delete / reduce  (red),
    // or other manual adjustments (purple)
    if (type === "adjustment") {
      if (referenceType === "purchase") {
        return {
          label: `Purchase Deleted #${referenceId ?? "N/A"}`,
          color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
        }
      }
      return {
        label: "Manual Adjustment",
        color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
      }
    }

    // sale stays red
    if (type === "sale") {
      return {
        label: `Sale #${referenceId ?? "N/A"}`,
        color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
      }
    }

    // fallback
    return {
      label: type,
      color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
    }
  }

  const handlePrintPriceTag = () => {
    if (product) {
      printBarcodeSticker(product, currency)
    }
  }

  const handlePrintMultipleTags = () => {
    if (product) {
      printMultipleBarcodeStickers([product], printCopies, currency)
    }
  }

  // Helper function to mask sensitive data
  const maskValue = (value: string | number, showValue: boolean) => {
    if (showValue) return value
    return "***"
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
                          alt={product.name}
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
                      <p className="font-medium text-gray-900 dark:text-gray-100">{product.name}</p>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Company Name</h3>
                      <p className="text-gray-900 dark:text-gray-100">{product.company_name || "Al Aneeq"}</p>
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
                        {currency} {product.price}
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
                            {product.stock}{" "}
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

              {/* Stock History Section - Show with masked data in privacy mode */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stock History</h3>

                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin h-6 w-6 text-gray-400" />
                  </div>
                ) : stockHistory.length > 0 ? (
                  <div className="border rounded-md overflow-hidden border-gray-200 dark:border-gray-600">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Date
                            </th>
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Type
                            </th>
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                              Quantity
                            </th>
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
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
                            const isDecrease = item.quantity < 0

                            return (
                              <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {format(new Date(item.date), "PPP")}
                                </td>
                                <td className="px-4 py-2 text-sm">
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
                                <td className="px-4 py-2 text-sm text-center">
                                  {privacyMode ? (
                                    <span className="text-gray-400 dark:text-gray-500">***</span>
                                  ) : (
                                    <span
                                      className={
                                        isDecrease
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-green-600 dark:text-green-400"
                                      }
                                    >
                                      {isDecrease ? "" : "+"}
                                      {item.quantity}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {privacyMode ? "***" : item.notes || "-"}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">No stock history available</p>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-gray-200 dark:border-gray-600">
            <Button
              onClick={onClose}
              className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Close
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
