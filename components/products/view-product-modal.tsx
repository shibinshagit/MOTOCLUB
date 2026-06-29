"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2, Printer, Copy, Settings, ChevronLeft, Link2 } from "lucide-react"
import { getProductStockHistory, getProductStockByDevice } from "@/app/actions/product-actions"
import { createProductShareLink } from "@/app/actions/product-share-actions"
import { printBarcodeSticker, printMultipleBarcodeStickers, encodeNumberAsLetters } from "@/lib/barcode-utils"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { cn } from "@/lib/utils"

interface ProductDetailBaseProps {
  onClose: () => void
  product: any
  onAdjustStock?: () => void
  onEdit?: () => void
  onDelete?: () => void
  currency?: string
  privacyMode?: boolean
  userId?: number
}

export type ProductDetailPanelProps = ProductDetailBaseProps

function InfoCell({
  label,
  value,
  className = "",
  copyText,
}: {
  label: string
  value: ReactNode
  className?: string
  copyText?: string
}) {
  const { toast } = useToast()

  const handleCopy = async () => {
    if (!copyText) return
    try {
      await navigator.clipboard.writeText(copyText)
      toast({ title: "Copied", description: `${label} copied to clipboard.` })
    } catch {
      toast({ title: "Copy failed", description: "Could not copy to clipboard.", variant: "destructive" })
    }
  }

  return (
    <div className={cn("border-b border-slate-200 px-4 py-3", className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-start gap-1.5 text-sm font-medium text-slate-800">
        <div className="min-w-0 flex-1">{value}</div>
        {copyText ? (
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label={`Copy ${label.toLowerCase()}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: ReactNode
  tone: "violet" | "emerald" | "amber" | "blue" | "slate"
}) {
  const tones = {
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-border bg-muted/40 text-foreground",
  }

  return (
    <div className={cn("rounded-lg border px-3 py-2", tones[tone])}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}

function PanelSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
      <div className="flex items-center justify-between border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

export function ProductDetailPanel({
  onClose,
  product,
  onAdjustStock,
  onEdit,
  onDelete,
  currency: currencyProp,
  privacyMode = false,
  userId,
}: ProductDetailPanelProps) {
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
  const [isSharingLink, setIsSharingLink] = useState(false)
  const [currency, setCurrency] = useState(currencyProp || "AED") // Use prop or default to AED
  const { toast } = useToast()

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
      if (!product?.id) return

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
  }, [product?.id, currencyProp, product.barcode, userId, product.created_by])

  useEffect(() => {
    setHistoryFilter("current")
    setIsHistoryLimited(true)
  }, [product?.id])

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
          ? "bg-blue-100 text-blue-800"
          : "bg-green-100 text-green-800",
      }
    }

    // negative adjustment from a purchase delete / reduce  (red),
    // or other manual adjustments (purple)
    if (type === "adjustment") {
      if (referenceType === "purchase") {
        return {
          label: `Purchase Deleted #${referenceId ?? "N/A"}`,
          color: "bg-red-100 text-red-800",
        }
      }
      return {
        label: "Manual Adjustment",
        color: "bg-purple-100 text-purple-800",
      }
    }

    // sale stays red
    if (type === "sale") {
      return {
        label: `Sale #${referenceId ?? "N/A"}`,
        color: "bg-red-100 text-red-800",
      }
    }

    if (type === "transfer_out") {
      return {
        label: `Transfer Out #${referenceId ?? "N/A"}`,
        color: "bg-orange-100 text-orange-800",
      }
    }

    if (type === "transfer_in") {
      return {
        label: `Transfer In #${referenceId ?? "N/A"}`,
        color: "bg-teal-100 text-teal-800",
      }
    }

    // fallback
    return {
      label: type,
      color: "bg-gray-100 text-gray-800",
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

  const handleShareLink = async () => {
    if (!product?.id || !currentDeviceId) {
      notifyError(toast, "Device not found")
      return
    }

    setIsSharingLink(true)
    try {
      const result = await createProductShareLink(product.id, currentDeviceId)
      if (!result.success || !result.url) {
        notifyError(toast, result.message || "Failed to create share link")
        return
      }

      await navigator.clipboard.writeText(result.url)
      notifySuccess(
        toast,
        result.reused ? "Existing share link copied" : "Share link copied",
        "Customers can view product details without price or stock.",
      )
    } catch {
      notifyError(toast, "Could not copy share link")
    } finally {
      setIsSharingLink(false)
    }
  }

  const formatMoney = (amount: number | string) => {
    const num = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (Number.isNaN(num)) return `${currency} 0.00`
    return `${currency} ${num.toFixed(2)}`
  }

  const stockDisplay = () => {
    if (privacyMode) return "***"
    const stock = Number(product.stock) || 0
    if (stock === 0) return "Out of stock"
    if (stock < 5) return `${stock} · Low`
    return `${stock} · In stock`
  }

  const costDisplay = () => {
    if (privacyMode) return "***"
    const costValue = formatMoney(product.wholesale_price || 0)
    const code = encodedWholesalePrice ? (
      <span className="ml-2 text-[11px] font-normal text-slate-500">Code: {encodedWholesalePrice}</span>
    ) : null
    return (
      <span className="group/cost relative inline-block">
        <span className="group-hover/cost:hidden">****</span>
        <span className="hidden group-hover/cost:inline">
          {costValue}
          {code}
        </span>
      </span>
    )
  }

  const tableHeadClass =
    "border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600"

  if (!product) return null

  const toolbarActions = showPrintOptions ? (
    <>
      <div className="flex items-center gap-2">
        <Label htmlFor="copies" className="sr-only">
          Number of copies
        </Label>
        <Input
          id="copies"
          type="number"
          min="1"
          max="100"
          value={printCopies}
          onChange={(e) => setPrintCopies(Number.parseInt(e.target.value) || 1)}
          className="h-8 w-20 border-slate-200 bg-white text-xs"
        />
      </div>
      <Button size="sm" onClick={handlePrintMultipleTags} className="h-8 px-3 text-xs">
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        Print {printCopies}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowPrintOptions(false)}
        className="h-8 border-slate-200 bg-white px-3 text-xs"
      >
        Cancel
      </Button>
    </>
  ) : (
    <>
      <Button size="sm" onClick={handlePrintPriceTag} className="h-8 px-3 text-xs">
        <Printer className="mr-1.5 h-3.5 w-3.5" />
        Print tag
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowPrintOptions(true)}
        className="h-8 border-slate-200 bg-white px-3 text-xs"
      >
        <Copy className="mr-1.5 h-3.5 w-3.5" />
        Multiple
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShareLink}
        disabled={isSharingLink}
        className="h-8 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50"
      >
        {isSharingLink ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
        )}
        Share link
      </Button>
      {onAdjustStock && !hideStockCount ? (
        <Button
          variant="outline"
          size="sm"
          onClick={onAdjustStock}
          className="h-8 border-slate-200 bg-white px-3 text-xs"
        >
          <Settings className="mr-1.5 h-3.5 w-3.5" />
          Adjust stock
        </Button>
      ) : null}
    </>
  )

  const detailBody = (
    <>
      <div className={cn("grid grid-cols-2 gap-2", msp > 0 ? "md:grid-cols-4" : "md:grid-cols-3")}>
            <SummaryCard label="MRP" value={formatMoney(product.price || 0)} tone="violet" />
            {!hideCogs ? <SummaryCard label="Cost" value={costDisplay()} tone="slate" /> : null}
            {!hideStockCount ? (
              <SummaryCard label="Stock" value={stockDisplay()} tone="emerald" />
            ) : (
              <SummaryCard label="Stock" value="—" tone="slate" />
            )}
            {msp > 0 ? (
              <SummaryCard label="MSP" value={formatMoney(msp)} tone="blue" />
            ) : null}
          </div>

          <PanelSection title="Product information">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              <InfoCell
                label="Name"
                value={product.name || "—"}
                copyText={product.name || undefined}
                className="sm:col-span-2"
              />
              <InfoCell label="Company" value={product.company_name || "—"} />
              <InfoCell label="Category" value={product.category || "—"} />
              <InfoCell label="Trending" value={product.trending ? "Yes" : "No"} />
              {product.shelf ? <InfoCell label="Shelf" value={product.shelf} /> : null}
              {product.color ? <InfoCell label="Colour" value={product.color} /> : null}
              {product.size ? <InfoCell label="Size" value={product.size} /> : null}
              {product.suitable_for ? <InfoCell label="Suitable for" value={product.suitable_for} /> : null}
              <InfoCell
                label="Created"
                value={product.created_at ? format(new Date(product.created_at), "yyyy-MM-dd") : "—"}
              />
              <InfoCell
                label="Updated"
                value={product.updated_at ? format(new Date(product.updated_at), "yyyy-MM-dd") : "—"}
              />
              {product.link ? (
                <InfoCell
                  label="Link"
                  value={
                    <a
                      href={product.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-brand-blue hover:underline"
                    >
                      {product.link}
                    </a>
                  }
                  className="sm:col-span-2 lg:col-span-4"
                />
              ) : null}
              {product.description ? (
                <InfoCell label="Description" value={product.description} className="sm:col-span-2 lg:col-span-4" />
              ) : null}
            </div>
          </PanelSection>

          {(mediaImageUrls.length > 0 || mediaVideoUrl) && (
            <PanelSection title="Media">
              <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
                {mediaImageUrls.map((url, index) => (
                  <div key={`${url}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <img
                      src={url}
                      alt={`${product.name} ${index + 1}`}
                      className="h-24 w-full object-cover"
                    />
                  </div>
                ))}
                {mediaVideoUrl ? (
                  <div className="col-span-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-1 md:col-span-4">
                    <video controls className="max-h-40 w-full rounded-md">
                      <source src={mediaVideoUrl} />
                    </video>
                  </div>
                ) : null}
              </div>
            </PanelSection>
          )}

          <PanelSection title="Marketplace">
            <div className="grid grid-cols-2 gap-px bg-slate-200 md:grid-cols-4">
              {platformStatuses.map((platform) => (
                <div key={platform.key} className="bg-white px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {platform.label}
                  </p>
                  <span
                    className={cn(
                      "mt-1 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium",
                      platform.status === "active"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : platform.status === "archived"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-50 text-slate-600",
                    )}
                  >
                    {getPlatformStatusLabel(platform.status)}
                  </span>
                </div>
              ))}
            </div>
          </PanelSection>

          {(() => {
            let attrs: any[] = []
            try {
              if (product.attributes) {
                attrs =
                  typeof product.attributes === "string" ? JSON.parse(product.attributes) : product.attributes
              }
            } catch {
              attrs = []
            }
            return attrs.length > 0 ? (
              <PanelSection title="Attributes">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {attrs.map((attr: any, idx: number) => (
                    <InfoCell key={idx} label={attr.key} value={attr.value || "—"} />
                  ))}
                </div>
              </PanelSection>
            ) : null
          })()}

          {product.barcode ? (
            <PanelSection title="Barcode">
              <div className="flex flex-col items-center px-4 py-4">
                <div id="barcodeContainer" className="w-full max-w-xs" />
                <p className="mt-2 text-sm font-medium text-slate-700">{product.barcode}</p>
              </div>
            </PanelSection>
          ) : null}

          {!hideStockCount && !privacyMode && deviceStocks.length > 0 ? (
            <PanelSection title="Stock by device">
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr className={tableHeadClass}>
                      <th className="whitespace-nowrap px-4 py-2.5 text-left">Device</th>
                      <th className="whitespace-nowrap px-4 py-2.5 text-right">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceStocks.map((row, index) => (
                      <tr
                        key={row.device_id}
                        className={cn(
                          "border-b border-slate-200",
                          index % 2 === 0 ? "bg-white" : "bg-slate-50/60",
                        )}
                      >
                        <td className="px-4 py-2.5 text-slate-800">
                          {row.device_name}
                          {row.is_current_device ? (
                            <span className="ml-2 text-xs text-violet-700">Current</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-slate-800">{row.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelSection>
          ) : null}

          {!hideStockCount ? (
            <PanelSection
              title="Stock history"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  {isHistoryLimited && hasMoreHistory ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleLoadAllHistory}
                      disabled={isLoadingAllHistory}
                      className="h-7 border-slate-200 bg-white px-2 text-[11px]"
                    >
                      {isLoadingAllHistory ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                      Show all
                    </Button>
                  ) : null}
                  <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                    {(["current", "other", "all"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setHistoryFilter(filter)}
                        className={cn(
                          "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                          historyFilter === filter
                            ? "bg-violet-600 text-white"
                            : "text-slate-600 hover:text-slate-900",
                        )}
                      >
                        {filter === "current" ? "Current" : filter === "other" ? "Other" : "All"}
                      </button>
                    ))}
                  </div>
                </div>
              }
            >
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : filteredHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr className={tableHeadClass}>
                        <th className="whitespace-nowrap px-4 py-2.5 text-left">Date</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-left">Type</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-left">Device</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-center">Qty</th>
                        <th className="whitespace-nowrap px-4 py-2.5 text-left">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHistory.map((item, index) => {
                        const typeInfo = getTypeInfo(
                          item.type,
                          item.reference_type,
                          item.reference_id,
                          item.notes,
                          item.quantity,
                        )
                        const isDecrease = item.quantity < 0

                        return (
                          <tr
                            key={item.id}
                            className={cn(
                              "border-b border-slate-200",
                              index % 2 === 0 ? "bg-white" : "bg-slate-50/60",
                            )}
                          >
                            <td className="whitespace-nowrap px-4 py-2.5 text-slate-700">
                              {format(new Date(item.date), "yyyy-MM-dd")}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                                  privacyMode ? "bg-slate-100 text-slate-500" : typeInfo.color,
                                )}
                              >
                                {privacyMode ? "***" : typeInfo.label}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-slate-700">
                              {privacyMode ? "***" : item.device_name || "Unknown"}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {privacyMode ? (
                                <span className="text-slate-400">***</span>
                              ) : (
                                <span className={isDecrease ? "text-rose-600" : "text-emerald-700"}>
                                  {isDecrease ? "" : "+"}
                                  {item.quantity}
                                </span>
                              )}
                            </td>
                            <td className="max-w-[200px] truncate px-4 py-2.5 text-slate-600">
                              {privacyMode ? "***" : item.notes || "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {historyFilter === "current"
                    ? "No stock history for current device"
                    : historyFilter === "other"
                      ? "No stock history for other devices"
                      : "No stock history available"}
                </p>
              )}
            </PanelSection>
          ) : null}
    </>
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
        <div className="shrink-0 border-b border-slate-200 bg-[#F1F4F9] px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div>
            <div className="flex shrink-0 items-center gap-2">
              {onEdit ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-slate-200 bg-white px-3 text-xs"
                  onClick={onEdit}
                >
                  Edit
                </Button>
              ) : null}
              {onDelete ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-red-200 bg-white px-3 text-xs text-red-600 hover:bg-red-50"
                  onClick={onDelete}
                >
                  Delete
                </Button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-md p-1 text-slate-500 hover:bg-white hover:text-slate-800"
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 touch-pan-y space-y-3 overflow-y-auto overscroll-contain p-4"
        >
          {detailBody}
        </div>
      </div>
    )
}
