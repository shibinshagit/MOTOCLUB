"use client"

import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2, Printer, Copy, Settings, ImageIcon, Film } from "lucide-react"
import { getProductStockHistory, getProductStockByDevice } from "@/app/actions/product-actions"
import { printBarcodeSticker, printMultipleBarcodeStickers, encodeNumberAsLetters } from "@/lib/barcode-utils"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"

interface ViewProductModalProps {
  isOpen: boolean
  onClose: () => void
  product: any
  onAdjustStock?: () => void
  currency?: string
  privacyMode?: boolean
  userId?: number
}

export default function ViewProductModal({
  isOpen,
  onClose,
  product,
  onAdjustStock,
  currency: currencyProp,
  privacyMode = true,
  userId,
}: ViewProductModalProps) {
  const { isValueHidden } = useStaffRestrictions()
  const hideCogs = isValueHidden("cogs")
  const hideStockCount = isValueHidden("stock_count")
  const [stockHistory, setStockHistory] = useState<any[]>([])
  const [deviceStocks, setDeviceStocks] = useState<any[]>([])
  const [historyFilter, setHistoryFilter] = useState<"current" | "other" | "all">("current")
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingAllHistory, setIsLoadingAllHistory] = useState(false)
  const [hasMoreHistory, setHasMoreHistory] = useState(false)
  const [isHistoryLimited, setIsHistoryLimited] = useState(true)
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
  const currentDeviceId = Number(userId || product.created_by || 1)
  const mediaImageUrls = useMemo(() => {
    let urls: string[] = []
    if (Array.isArray(product.image_urls)) {
      urls = product.image_urls.filter((url: unknown) => typeof url === "string" && url.trim().length > 0) as string[]
    } else if (typeof product.image_urls === "string" && product.image_urls.trim()) {
      try {
        const parsed = JSON.parse(product.image_urls)
        if (Array.isArray(parsed)) {
          urls = parsed.filter((url) => typeof url === "string" && url.trim().length > 0)
        }
      } catch {
        urls = []
      }
    }
    if (urls.length === 0 && product.image_url) {
      urls = [product.image_url]
    }
    return urls.slice(0, 4)
  }, [product.image_urls, product.image_url])
  const mediaVideoUrl = typeof product.video_url === "string" && product.video_url.trim() ? product.video_url : null
  const platformStatuses = [
    { key: "amazon", label: "Amazon", status: product.amazon_status || "not_listed" },
    { key: "flipkart", label: "Flipkart", status: product.flipkart_status || "not_listed" },
    { key: "meesho", label: "Meesho", status: product.meesho_status || "not_listed" },
    { key: "own_ecom", label: "Own Ecom", status: product.own_ecom_status || "not_listed" },
  ]

  const getPlatformBadgeClass = (status: string) => {
    if (status === "active") return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    if (status === "archived") return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
    return "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
  }

  const getPlatformStatusLabel = (status: string) => {
    if (status === "active") return "Active"
    if (status === "archived") return "Archived"
    return "Not Listed"
  }

  const loadStockHistory = async (limit?: number) => {
    const result = await getProductStockHistory(product.id, limit)
    if (result.success) {
      setStockHistory(result.data)
      setIsHistoryLimited(typeof limit === "number")
      setHasMoreHistory(Boolean(result.hasMore))
    }
  }

  useEffect(() => {
    const fetchStockHistory = async () => {
      if (!isOpen || !product?.id) return

      try {
        setIsLoading(true)
        await loadStockHistory(5)

        const stockByDevice = await getProductStockByDevice(product.id, userId || product.created_by || 1)
        if (stockByDevice.success) {
          setDeviceStocks(stockByDevice.data)
        } else {
          setDeviceStocks([])
        }

        // If currency is not provided as a prop, fetch it
        if (!currencyProp) {
          try {
            const deviceCurrency = await getDeviceCurrency(userId || product.created_by || 1)
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
  }, [isOpen, product?.id, currencyProp, product.barcode, userId, product.created_by])

  useEffect(() => {
    if (isOpen) {
      setHistoryFilter("current")
      setIsHistoryLimited(true)
    }
  }, [isOpen, product?.id])

  const handleLoadAllHistory = async () => {
    if (!product?.id || isLoadingAllHistory) return
    try {
      setIsLoadingAllHistory(true)
      await loadStockHistory()
    } catch (error) {
      console.error("Error loading full stock history:", error)
    } finally {
      setIsLoadingAllHistory(false)
    }
  }

  const filteredHistory = useMemo(() => {
    if (historyFilter === "all") {
      return stockHistory
    }
    if (historyFilter === "current") {
      return stockHistory.filter((item) => Number(item.device_id) === currentDeviceId)
    }
    return stockHistory.filter((item) => Number(item.device_id) !== currentDeviceId)
  }, [stockHistory, historyFilter, currentDeviceId])

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

    if (type === "transfer_out") {
      return {
        label: `Transfer Out #${referenceId ?? "N/A"}`,
        color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
      }
    }

    if (type === "transfer_in") {
      return {
        label: `Transfer In #${referenceId ?? "N/A"}`,
        color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200",
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
                {/* Product Media */}
                {(mediaImageUrls.length > 0 || mediaVideoUrl) && (
                  <div className="lg:col-span-1">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Product Media</h3>
                      <div className="space-y-2">
                        {mediaImageUrls.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {mediaImageUrls.map((url, index) => (
                              <div key={`${url}-${index}`} className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 overflow-hidden">
                                <img
                                  src={url}
                                  alt={`${product.name} ${index + 1}`}
                                  className="w-full h-20 object-cover rounded-md"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="h-24 rounded-lg border border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400">
                            <ImageIcon className="h-5 w-5 mr-1" />
                            <span className="text-xs">No images</span>
                          </div>
                        )}
                        {mediaVideoUrl ? (
                          <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 p-1 overflow-hidden">
                            <video controls className="w-full h-28 rounded-md">
                              <source src={mediaVideoUrl} />
                            </video>
                          </div>
                        ) : (
                          <div className="h-16 rounded-lg border border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-400">
                            <Film className="h-4 w-4 mr-1" />
                            <span className="text-xs">No video</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Product Details */}
                <div className={`space-y-4 ${(mediaImageUrls.length > 0 || mediaVideoUrl) ? "lg:col-span-2" : "lg:col-span-3"}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</h3>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{product.name}</p>
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
                        {currency} {product.price}
                      </p>
                    </div>

                    {!hideCogs && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Cost Price</h3>
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
                    )}

                    {msp > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                          MSP (Minimum Selling Price)
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

                    {!hideStockCount && (
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
                    )}

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

                    {product.color && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Colour</h3>
                        <p className="text-gray-900 dark:text-gray-100">{product.color}</p>
                      </div>
                    )}

                    {product.size && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Size</h3>
                        <p className="text-gray-900 dark:text-gray-100">{product.size}</p>
                      </div>
                    )}

                    {product.suitable_for && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Suitable For</h3>
                        <p className="text-gray-900 dark:text-gray-100">{product.suitable_for}</p>
                      </div>
                    )}

                    {product.link && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Product Link</h3>
                        <a href={product.link} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline text-sm break-all">{product.link}</a>
                      </div>
                    )}

                    {product.description && (
                      <div className="space-y-2 md:col-span-2">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Description</h3>
                        <p className="text-gray-900 dark:text-gray-100 text-sm">{product.description}</p>
                      </div>
                    )}
                  </div>

                  {/* Attributes Section */}
                  <div className="mt-4">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Marketplace Availability</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {platformStatuses.map((platform) => (
                        <div
                          key={platform.key}
                          className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-2"
                        >
                          <span className="text-xs text-gray-500 dark:text-gray-400">{platform.label}</span>
                          <span
                            className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-xs font-medium ${getPlatformBadgeClass(
                              platform.status,
                            )}`}
                          >
                            {getPlatformStatusLabel(platform.status)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Attributes Section */}
                  {(() => {
                    let attrs: any[] = []
                    try {
                      if (product.attributes) {
                        attrs = typeof product.attributes === "string" ? JSON.parse(product.attributes) : product.attributes
                      }
                    } catch { attrs = [] }
                    return attrs.length > 0 ? (
                      <div className="mt-4">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Attributes</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {attrs.map((attr: any, idx: number) => (
                            <div key={idx} className="flex flex-col rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{attr.key}</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{attr.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  })()}

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

              {!hideStockCount && !privacyMode && deviceStocks.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Stock by Warehouse/Device</h3>
                  <div className="border rounded-md overflow-hidden border-gray-200 dark:border-gray-600">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Device
                            </th>
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center">
                              Stock
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-600">
                          {deviceStocks.map((row) => (
                            <tr key={row.device_id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                              <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                {row.device_name}
                                {row.is_current_device ? (
                                  <span className="ml-2 text-xs text-blue-600 dark:text-blue-300">(Current)</span>
                                ) : null}
                              </td>
                              <td className="px-4 py-2 text-sm text-center text-gray-900 dark:text-gray-100 font-medium">
                                {row.stock}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

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
                    {onAdjustStock && !hideStockCount && (
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
              {!hideStockCount && (
              <div className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">Stock History</h3>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isHistoryLimited && hasMoreHistory && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleLoadAllHistory}
                        disabled={isLoadingAllHistory}
                        className="h-8"
                      >
                        {isLoadingAllHistory ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
                        Show Full History
                      </Button>
                    )}
                    <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setHistoryFilter("current")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          historyFilter === "current"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        Current Device
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryFilter("other")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-600 ${
                          historyFilter === "other"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        Other Devices
                      </button>
                      <button
                        type="button"
                        onClick={() => setHistoryFilter("all")}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-gray-200 dark:border-gray-600 ${
                          historyFilter === "all"
                            ? "bg-blue-600 text-white"
                            : "bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        All
                      </button>
                    </div>
                  </div>
                </div>

                {isLoading ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="animate-spin h-6 w-6 text-gray-400" />
                  </div>
                ) : filteredHistory.length > 0 ? (
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
                            <th className="px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left">
                              Device
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
                          {filteredHistory.map((item) => {
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
                                <td className="px-4 py-2 text-sm text-gray-900 dark:text-gray-100">
                                  {privacyMode ? "***" : item.device_name || "Unknown"}
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
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-4">
                    {historyFilter === "current"
                      ? "No stock history for current device"
                      : historyFilter === "other"
                        ? "No stock history for other devices"
                        : "No stock history available"}
                  </p>
                )}
              </div>
              )}
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
