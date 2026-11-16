"use client"

import { useEffect, useMemo, useState } from "react"
import { useParams } from "next/navigation"
import { getSaleDetails } from "@/app/actions/sale-actions"
import { Loader2, Printer, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { printBatchJobCards } from "@/lib/receipt-utils"
import { BrandLogo } from "@/components/brand-logo"
import { useBranding } from "@/components/branding-provider"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceName } from "@/store/slices/deviceSlice"
import { parseSaleDateTime } from "@/lib/utils"

export default function SaleShippingLabelPage() {
  const params = useParams()
  const { platformName } = useBranding()
  const saleId = Number(params?.id)

  const [sale, setSale] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const deviceCurrency = useSelector(selectDeviceCurrency)
  const deviceName = useSelector(selectDeviceName)
  const currency = deviceCurrency || "INR"

  const companyInfo = useMemo(
    () => ({
      name: deviceName || platformName || "MOTOCLUB",
      address: "",
      phone: "",
    }),
    [platformName, deviceName],
  )

  useEffect(() => {
    const fetchSaleDetails = async () => {
      if (!saleId) return

      try {
        setIsLoading(true)
        const result = await getSaleDetails(saleId)

        if (result.success && result.data) {
          setSale(result.data.sale)
          setItems(result.data.items || [])
        } else {
          setError(result.message || "Failed to load order details")
        }
      } catch (err) {
        console.error("Error fetching sale details for label:", err)
        setError("An error occurred while loading shipping label details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSaleDetails()
  }, [saleId])

  const handlePrint = () => {
    if (!sale) return
    void printBatchJobCards([{ ...sale, items }], currency, companyInfo, false)
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600 mx-auto mb-3" />
          <h1 className="text-base font-semibold text-slate-800 mb-1">Loading Shipping Label...</h1>
          <p className="text-xs text-slate-500">Preparing label #{saleId} for printing</p>
        </div>
      </div>
    )
  }

  if (error || !sale) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="text-center max-w-sm p-6 bg-white rounded-xl shadow-xs border border-slate-200">
          <h1 className="text-lg font-bold text-red-600 mb-2">Label Not Found</h1>
          <p className="text-xs text-slate-600 mb-4">{error || "Could not load order details."}</p>
        </div>
      </div>
    )
  }

  const saleDate = parseSaleDateTime(sale)
  const formattedDate = saleDate.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })

  const customerName = sale.customer_name_override || sale.customer_name || "Customer"
  const customerPhone = sale.customer_phone || ""
  const shippingAddress = sale.shipping_address || sale.customer_address || "Address not provided"
  const trackingNumber = sale.tracking_id || sale.job_card_number || `ORD-${sale.id}`
  const courierName = sale.courier_service_name || "Direct Courier"

  return (
    <div className="min-h-screen bg-slate-100 p-4 sm:p-6 print:p-0 print:bg-white">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Action Header */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-2xs print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <Tag className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">Shipping Label #{sale.id}</h1>
              <p className="text-xs text-slate-500">Order ID: #{sale.id} • {formattedDate}</p>
            </div>
          </div>
          <Button onClick={handlePrint} size="sm" className="bg-purple-700 hover:bg-purple-800 text-white font-medium text-xs px-4 flex items-center gap-1.5">
            <Printer className="h-4 w-4" />
            <span>Print Label</span>
          </Button>
        </div>

        {/* Printable Shipping Label Card */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-xs p-6 space-y-5 print:border-none print:shadow-none print:p-0">
          {/* Top Brand & Barcode Reference */}
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <BrandLogo variant="icon" width={48} height={48} className="h-12 w-12 rounded-lg" />
              <div>
                <h2 className="text-base font-extrabold text-slate-900">{companyInfo.name}</h2>
                <span className="text-[11px] font-semibold tracking-wider uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  Direct Dropship Delivery
                </span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Order ID</span>
              <span className="text-lg font-mono font-bold text-slate-900">#{sale.id}</span>
            </div>
          </div>

          {/* Courier & Tracking Box */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-medium">Courier Service</span>
              <span className="font-bold text-slate-900">{courierName}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block uppercase font-medium">Tracking / AWB #</span>
              <span className="font-mono font-bold text-slate-900">{trackingNumber}</span>
            </div>
          </div>

          {/* Deliver To Section */}
          <div className="border border-slate-300 rounded-lg p-4 space-y-1.5 bg-white">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Deliver To (Customer):</span>
            <p className="text-sm font-bold text-slate-900">{customerName}</p>
            {customerPhone && (
              <p className="text-xs font-semibold text-slate-700">Phone: {customerPhone}</p>
            )}
            <p className="text-xs text-slate-600 whitespace-pre-line leading-relaxed pt-1">
              {shippingAddress}
            </p>
          </div>

          {/* Package Contents */}
          <div className="space-y-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">Package Contents ({items.length} item{items.length !== 1 ? "s" : ""}):</span>
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 text-xs">
              {items.map((item, idx) => (
                <div key={item.id || idx} className="p-2.5 flex justify-between items-center">
                  <div>
                    <span className="font-medium text-slate-800">{item.product_name || `Item #${idx + 1}`}</span>
                    {item.variant_name && (
                      <span className="text-[11px] text-slate-500 block font-normal">Variant: {item.variant_name}</span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-slate-900 px-2 py-0.5 bg-slate-100 rounded">
                    Qty: {item.quantity || 1}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Note */}
          <div className="border-t border-slate-200 pt-3 text-center">
            <p className="text-[11px] text-slate-400">
              Direct supplier fulfillment generated by {companyInfo.name}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

