"use client"

import { useMemo, useState, useEffect, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { Loader2, Copy, ImageIcon, Film, Plus, ExternalLink } from "lucide-react"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { cn } from "@/lib/utils"
import { parseProductLinks, getEcommerceProductUrl } from "@/lib/product-links"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ShareProductButton } from "@/components/shared/share-product-button"
import { useAppSelector } from "@/store/hooks"
import { selectDevice } from "@/store/slices/deviceSlice"
import StaffMediaEditModal from "./staff-media-edit-modal"


interface StaffViewProductModalProps {
  isOpen: boolean
  onClose: () => void
  product: any
  currency?: string
  onProductUpdated?: (updatedProduct: any) => void
}

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

export default function StaffViewProductModal({
  isOpen,
  onClose,
  product,
  currency = "AED",
  onProductUpdated,
}: StaffViewProductModalProps) {
  const { toast } = useToast()
  const device = useAppSelector(selectDevice)
  const currentDeviceId = device?.id || undefined
  const [isMediaEditOpen, setIsMediaEditOpen] = useState(false)

  const msp = Number(product?.variants?.[0]?.msp || 0)
  const retailPrice = Number(product?.msp ?? product?.price ?? 0)

  const mediaImageUrls = useMemo(() => {
    if (!product) return []
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
  }, [product])

  const mediaVideoUrl = typeof product?.video_url === "string" && product.video_url.trim() ? product.video_url.trim() : null

  const productLinks = useMemo(() => {
    if (!product) return []
    return parseProductLinks(product.link)
  }, [product])

  useEffect(() => {
    if (product?.barcode && isOpen && typeof window !== "undefined") {
      import("jsbarcode")
        .then((JsBarcode) => {
          const container = document.getElementById("staffBarcodeContainer")
          if (container) {
            container.innerHTML = ""
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
  }, [product?.barcode, isOpen])

  const formatMoney = (amount: number | string) => {
    const num = typeof amount === "string" ? Number.parseFloat(amount) : amount
    if (Number.isNaN(num)) return `${currency} 0.00`
    return `${currency} ${num.toFixed(2)}`
  }

  const stockDisplay = () => {
    if (product.stock === null) return "Hidden"
    const stock = Number(product.stock) || 0
    if (stock === 0) return "Out of stock"
    if (stock < 5) return `${stock} · Low`
    return `${stock} · In stock`
  }

  const tableHeadClass = "border-b border-slate-200 bg-[#F1F4F9] text-xs font-semibold uppercase tracking-wide text-slate-600"

  if (!product) return null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-[95vw] sm:max-w-4xl p-0 overflow-hidden bg-slate-50 flex flex-col max-h-[92vh]">
          <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-white shrink-0">
            <DialogTitle className="text-lg font-semibold text-slate-800">
              {product.name}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            <div className="space-y-6">
              
              <div className={cn("grid grid-cols-2 gap-2", msp > 0 ? "md:grid-cols-3" : "md:grid-cols-2")}>
                <SummaryCard label="Selling Price" value={formatMoney(retailPrice)} tone="violet" />
                <SummaryCard label="Available Stock" value={stockDisplay()} tone="emerald" />
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
                  <InfoCell label="Category" value={product.category || "—"} />
                  {product.shelf ? <InfoCell label="Shelf Location" value={product.shelf} /> : null}
                  {product.color ? <InfoCell label="Colour" value={product.color} /> : null}
                  {product.size ? <InfoCell label="Size" value={product.size} /> : null}
                  {product.suitable_for ? <InfoCell label="Suitable for" value={product.suitable_for} /> : null}
                  
                  <InfoCell
                    label="E-Commerce Link"
                    value={
                      <a
                        href={getEcommerceProductUrl(product.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 break-all text-indigo-600 hover:underline font-medium"
                      >
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        <span>{getEcommerceProductUrl(product.id)}</span>
                      </a>
                    }
                    copyText={getEcommerceProductUrl(product.id)}
                    className="sm:col-span-2 lg:col-span-4"
                  />
                  
                  {productLinks.length > 0 && productLinks.map((entry: any, index: number) => (
                    <InfoCell
                      key={`${entry.name}-${entry.url}-${index}`}
                      label={entry.name}
                      value={
                        <a href={entry.url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-blue hover:underline">
                          {entry.url}
                        </a>
                      }
                      className="sm:col-span-2 lg:col-span-4"
                    />
                  ))}
                  {product.description ? (
                    <InfoCell label="Description" value={product.description} className="sm:col-span-2 lg:col-span-4" />
                  ) : null}
                </div>
              </PanelSection>

              <PanelSection
                title="Media (Photos & Videos)"
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsMediaEditOpen(true)}
                    className="h-7 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                  >
                    <ImageIcon className="h-3.5 w-3.5 mr-1" />
                    Edit Media
                  </Button>
                }
              >
                {mediaImageUrls.length > 0 || mediaVideoUrl ? (
                  <div className="p-4 space-y-4">
                    {mediaImageUrls.length > 0 && (
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                        {mediaImageUrls.map((url, index) => (
                          <div key={`${url}-${index}`} className="overflow-hidden rounded-lg border border-slate-200 bg-white aspect-square">
                            <img
                              src={url}
                              alt={`${product.name} ${index + 1}`}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {mediaVideoUrl && (
                      <div className="rounded-lg border border-slate-200 bg-slate-900 p-1 overflow-hidden">
                        <video controls className="w-full max-h-48 rounded object-contain">
                          <source src={mediaVideoUrl} />
                          Your browser does not support the video tag.
                        </video>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center text-slate-500">
                    <p className="text-xs mb-2">No photos or videos added for this product yet.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setIsMediaEditOpen(true)}
                      className="border-violet-200 text-violet-700 hover:bg-violet-50"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Add Photos & Videos
                    </Button>
                  </div>
                )}
              </PanelSection>

              {product.barcode ? (
                <PanelSection title="Barcode">
                  <div className="flex flex-col items-center px-4 py-4">
                    <div id="staffBarcodeContainer" className="w-full max-w-xs" />
                    <p className="mt-2 text-sm font-medium text-slate-700">{product.barcode}</p>
                  </div>
                </PanelSection>
              ) : null}

              {product.has_variants && product.variants && product.variants.length > 0 && (
                <PanelSection title="Product Variants">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className={tableHeadClass}>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Variant Name</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">SKU</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Barcode</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Selling Price</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Available Stock</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.map((v: any, index: number) => (
                          <tr
                            key={v.id}
                            className={cn(
                              "border-b border-slate-200",
                              index % 2 === 0 ? "bg-[#ffffff]" : "bg-[#f8fafc]",
                            )}
                          >
                            <td className="px-4 py-2.5 font-medium text-slate-800">{v.variant_name || v.name}</td>
                            <td className="px-4 py-2.5 text-slate-600">{v.sku || "—"}</td>
                            <td className="px-4 py-2.5 text-slate-600">{v.barcode || "—"}</td>
                            <td className="px-4 py-2.5 text-right text-slate-800">
                              {v.selling_price !== null && v.selling_price !== undefined ? `${currency} ${Number(v.selling_price).toFixed(2)}` : `Default (${formatMoney(retailPrice)})`}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{v.device_stock || 0}</td>
                            <td className="px-4 py-2.5 text-center">
                              <ShareProductButton 
                                product={{
                                  ...product,
                                  variantName: v.variant_name || v.name,
                                  sellingPrice: v.selling_price !== null && v.selling_price !== undefined ? v.selling_price : retailPrice,
                                  stock: v.device_stock || 0,
                                  barcode: v.barcode || product.barcode,
                                  sku: v.sku || product.sku
                                }} 
                                currency={currency} 
                                currentDeviceId={currentDeviceId} 
                                className="h-8 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50"
                                label="Share" 
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </PanelSection>
              )}

              {product.is_batch_managed && product.batches && product.batches.length > 0 && (
                <PanelSection title="Active Inventory Batches">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-0 text-sm">
                      <thead>
                        <tr className={tableHeadClass}>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Batch Number</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Variant</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Mfg. Date</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-left">Expiry Date</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Selling Price</th>
                          <th className="whitespace-nowrap px-4 py-2.5 text-right">Stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.batches.map((b: any, index: number) => {
                          const mfg = b.mfg_date ? format(new Date(b.mfg_date), "yyyy-MM-dd") : "—"
                          const exp = b.expiry_date ? format(new Date(b.expiry_date), "yyyy-MM-dd") : "—"
                          const totalStock = Array.isArray(b.stocks) ? b.stocks.reduce((acc: number, cur: any) => acc + Number(cur.stock || 0), 0) : 0
                          
                          return (
                            <tr
                              key={b.id}
                              className={cn(
                                "border-b border-slate-200",
                                index % 2 === 0 ? "bg-[#ffffff]" : "bg-[#f8fafc]",
                              )}
                            >
                              <td className="px-4 py-2.5 font-medium text-slate-800">{b.batch_number}</td>
                              <td className="px-4 py-2.5 text-slate-600">{b.variant_name || "Default"}</td>
                              <td className="px-4 py-2.5 text-slate-600">{mfg}</td>
                              <td className="px-4 py-2.5 text-slate-600">{exp}</td>
                              <td className="px-4 py-2.5 text-right text-slate-800">
                                {currency} {Number(b.selling_price || 0).toFixed(2)}
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-emerald-700">{totalStock}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </PanelSection>
              )}

            </div>
          </div>
          
          <div className="border-t bg-slate-50 px-6 py-4 shrink-0 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ShareProductButton product={product} currency={currency} currentDeviceId={currentDeviceId} />
              <Button
                variant="outline"
                onClick={() => setIsMediaEditOpen(true)}
                className="border-violet-200 text-violet-700 hover:bg-violet-50"
              >
                <ImageIcon className="h-4 w-4 mr-2 text-violet-600" />
                Edit Media
              </Button>
            </div>
            <Button onClick={onClose} variant="outline">Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {isMediaEditOpen && (
        <StaffMediaEditModal
          isOpen={isMediaEditOpen}
          onClose={() => setIsMediaEditOpen(false)}
          product={product}
          onSuccess={(updatedProduct) => {
            if (onProductUpdated) {
              onProductUpdated(updatedProduct)
            }
          }}
        />
      )}
    </>
  )
}

