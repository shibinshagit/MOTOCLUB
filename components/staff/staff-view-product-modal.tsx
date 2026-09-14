"use client"

import { useMemo, useState, useEffect, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { format } from "date-fns"
import { 
  Loader2, 
  Copy, 
  ImageIcon, 
  Film, 
  Plus, 
  ExternalLink, 
  Package, 
  Tag, 
  MapPin, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Share2,
  Sparkles
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import { parseProductLinks, getEcommerceProductUrl } from "@/lib/product-links"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ShareProductButton } from "@/components/shared/share-product-button"
import { useAppSelector } from "@/store/hooks"
import { selectDevice, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import StaffMediaEditModal from "./staff-media-edit-modal"

interface StaffViewProductModalProps {
  isOpen: boolean
  onClose: () => void
  product: any
  currency?: string
  onProductUpdated?: (updatedProduct: any) => void
}

function InfoItem({
  label,
  value,
  icon,
  copyText,
  className = "",
}: {
  label: string
  value: ReactNode
  icon?: ReactNode
  copyText?: string
  className?: string
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
    <div className={cn("p-3 rounded-xl bg-slate-50 border border-slate-100 flex flex-col justify-between min-w-0", className)}>
      <div className="flex items-center gap-1.5 text-slate-400 mb-1">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <div className="flex items-center justify-between gap-1.5 text-sm font-semibold text-slate-800 min-w-0">
        <div className="truncate min-w-0 flex-1">{value}</div>
        {copyText && (
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
            title={`Copy ${label}`}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  )
}

export default function StaffViewProductModal({
  isOpen,
  onClose,
  product,
  currency: currencyProp,
  onProductUpdated,
}: StaffViewProductModalProps) {
  const { toast } = useToast()
  const device = useAppSelector(selectDevice)
  const deviceCurrency = useAppSelector(selectDeviceCurrency)
  const currency = currencyProp || deviceCurrency || "INR"
  const currentDeviceId = device?.id || undefined
  const [isMediaEditOpen, setIsMediaEditOpen] = useState(false)
  const [selectedImageIndex, setSelectedImageIndex] = useState(0)
  const [activeMediaTab, setActiveMediaTab] = useState<"images" | "video">("images")

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
    return urls.slice(0, 8)
  }, [product])

  const mediaVideoUrl = typeof product?.video_url === "string" && product.video_url.trim() ? product.video_url.trim() : null

  const productLinks = useMemo(() => {
    if (!product) return []
    return parseProductLinks(product.link)
  }, [product])

  useEffect(() => {
    setSelectedImageIndex(0)
    setActiveMediaTab("images")
  }, [product?.id])

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
              height: 55,
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

  const stockBadge = () => {
    if (product.stock === null) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
          Hidden
        </span>
      )
    }
    const stock = Math.max(0, Number(product.stock) || 0)
    if (stock <= 0) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200 shadow-sm">
          <XCircle className="h-3.5 w-3.5 text-red-500" /> Out of stock
        </span>
      )
    }
    if (stock <= 5) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 shadow-sm">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {stock} · Low Stock
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {stock} · In Stock
      </span>
    )
  }

  if (!product) return null

  const mainImageUrl = mediaImageUrls[selectedImageIndex] || mediaImageUrls[0] || null

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="w-[96vw] max-w-5xl p-0 overflow-hidden bg-slate-50 flex flex-col max-h-[92vh] rounded-2xl shadow-2xl border-slate-200">
          {/* Header */}
          <DialogHeader className="px-5 sm:px-6 py-4 border-b border-slate-200 bg-white shrink-0 flex flex-row items-center justify-between pr-12">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-violet-50 text-violet-600 border border-violet-100 shrink-0">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {product.name}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  {product.category && (
                    <span className="font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                      {product.category}
                    </span>
                  )}
                  {product.company_name && (
                    <span className="font-medium text-slate-500">
                      Brand: <strong className="text-slate-700">{product.company_name}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          {/* Main Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            
            {/* Top Grid: Hero Media Showcase (Left) vs Specs & Pricing (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* LEFT COLUMN: Main Hero Media Showcase */}
              <div className="lg:col-span-5 flex flex-col space-y-3">
                
                {/* Main Hero Viewer Container */}
                <div className="relative w-full aspect-square bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden flex items-center justify-center group">
                  
                  {/* Floating Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between z-10 pointer-events-none">
                    <span className="bg-slate-900/70 backdrop-blur-md text-white text-[11px] font-medium px-2.5 py-1 rounded-full shadow">
                      {activeMediaTab === "video" ? "Video View" : `Photo ${mediaImageUrls.length > 0 ? selectedImageIndex + 1 : 0} of ${mediaImageUrls.length}`}
                    </span>
                    <div className="pointer-events-auto">
                      {stockBadge()}
                    </div>
                  </div>

                  {activeMediaTab === "video" && mediaVideoUrl ? (
                    <div className="w-full h-full bg-slate-950 flex items-center justify-center p-2">
                      <video controls className="w-full max-h-full rounded-xl object-contain">
                        <source src={mediaVideoUrl} />
                        Your browser does not support the video tag.
                      </video>
                    </div>
                  ) : mainImageUrl ? (
                    <img
                      src={mainImageUrl}
                      alt={product.name}
                      className="w-full h-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-300 p-6 text-center">
                      <Package className="h-16 w-16 mb-2 stroke-[1.2]" />
                      <p className="text-xs text-slate-400 font-medium">No product photo uploaded</p>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsMediaEditOpen(true)}
                        className="mt-3 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                      >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Upload Image
                      </Button>
                    </div>
                  )}
                </div>

                {/* Thumbnails & Video Toggle Toolbar */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                  {mediaImageUrls.map((url, idx) => (
                    <button
                      key={`${url}-${idx}`}
                      type="button"
                      onClick={() => {
                        setSelectedImageIndex(idx)
                        setActiveMediaTab("images")
                      }}
                      className={cn(
                        "h-14 w-14 rounded-xl overflow-hidden border-2 bg-white shrink-0 transition-all p-0.5",
                        activeMediaTab === "images" && selectedImageIndex === idx
                          ? "border-violet-600 ring-2 ring-violet-500/20 shadow-sm scale-105"
                          : "border-slate-200 hover:border-slate-300 opacity-70 hover:opacity-100"
                      )}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover rounded-lg" />
                    </button>
                  ))}

                  {mediaVideoUrl && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab("video")}
                      className={cn(
                        "h-14 w-14 rounded-xl border-2 bg-slate-900 text-white shrink-0 transition-all flex flex-col items-center justify-center p-1",
                        activeMediaTab === "video"
                          ? "border-violet-500 ring-2 ring-violet-500/20 shadow-sm scale-105"
                          : "border-slate-700 hover:border-slate-600 opacity-80 hover:opacity-100"
                      )}
                      title="Play video"
                    >
                      <Film className="h-5 w-5 text-violet-400" />
                      <span className="text-[9px] font-semibold mt-0.5">Video</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setIsMediaEditOpen(true)}
                    className="h-14 px-3 rounded-xl border border-dashed border-violet-300 bg-violet-50/50 text-violet-700 hover:bg-violet-100/60 shrink-0 transition-colors flex flex-col items-center justify-center text-xs font-semibold"
                    title="Manage Photos & Video"
                  >
                    <ImageIcon className="h-4 w-4 mb-0.5 text-violet-600" />
                    <span className="text-[10px]">Edit Media</span>
                  </button>
                </div>
              </div>

              {/* RIGHT COLUMN: Price Cards & Product Information */}
              <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
                
                {/* Price & Primary Metrics Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  
                  {/* Selling Price Card */}
                  <div className="col-span-2 sm:col-span-1 rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-violet-950 text-white p-4 shadow-md flex flex-col justify-between min-h-[90px]">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-violet-200/80">Selling Price</span>
                    <p className="text-xl sm:text-2xl font-black tracking-tight text-white mt-1">
                      {formatMoney(retailPrice)}
                    </p>
                  </div>

                  {/* Available Stock Card */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col justify-between min-h-[90px]">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Available Stock</span>
                    <p className="text-xl sm:text-2xl font-black text-slate-800 mt-1">
                      {product.stock === null ? "—" : Math.max(0, Number(product.stock) || 0)}
                    </p>
                  </div>

                  {/* MSP Card (if available) */}
                  <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm flex flex-col justify-between min-h-[90px]">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">MSP</span>
                    <p className="text-xl sm:text-2xl font-black text-indigo-600 mt-1">
                      {msp > 0 ? formatMoney(msp) : formatMoney(retailPrice)}
                    </p>
                  </div>
                </div>

                {/* E-Commerce Direct Link Box */}
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <ExternalLink className="h-4 w-4 text-indigo-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-500">E-Commerce Product Link</p>
                      <a
                        href={getEcommerceProductUrl(product.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs sm:text-sm font-semibold text-indigo-700 hover:underline truncate block"
                      >
                        {getEcommerceProductUrl(product.id)}
                      </a>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await navigator.clipboard.writeText(getEcommerceProductUrl(product.id))
                      toast({ title: "Link Copied", description: "Product URL copied to clipboard." })
                    }}
                    className="h-8 text-xs border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 shrink-0"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1" /> Copy Link
                  </Button>
                </div>

                {/* Information Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <InfoItem label="Product Name" value={product.name} copyText={product.name} className="col-span-2" />
                  <InfoItem label="Category" value={product.category || "—"} />
                  {product.shelf ? <InfoItem label="Shelf Location" value={product.shelf} icon={<MapPin className="h-3.5 w-3.5" />} /> : null}
                  {product.color ? <InfoItem label="Colour" value={product.color} /> : null}
                  {product.size ? <InfoItem label="Size" value={product.size} /> : null}
                  {product.suitable_for ? <InfoItem label="Suitable for" value={product.suitable_for} className="col-span-2 sm:col-span-3" /> : null}
                </div>

                {/* Description */}
                {product.description && (
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Description</p>
                    <p className="text-xs sm:text-sm text-slate-700 whitespace-pre-line leading-relaxed">{product.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Barcode Banner */}
            {product.barcode && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Product Barcode</h4>
                  <p className="text-sm font-mono font-bold text-slate-800 mt-0.5">{product.barcode}</p>
                </div>
                <div className="flex flex-col items-center">
                  <div id="staffBarcodeContainer" className="bg-white p-1 rounded" />
                </div>
              </div>
            )}

            {/* Product Variants Table */}
            {product.has_variants && product.variants && product.variants.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Product Variants</h3>
                  <span className="text-xs font-semibold text-slate-500">{product.variants.length} Variants</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#f8fafc] text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase">
                      <tr>
                        <th className="px-4 py-3">Variant Name</th>
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Barcode</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                        <th className="px-4 py-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {product.variants.map((v: any, index: number) => (
                        <tr key={v.id} className={cn("hover:bg-slate-50", index % 2 === 1 && "bg-slate-50/50")}>
                          <td className="px-4 py-2.5 font-semibold text-slate-800">{v.variant_name || v.name}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{v.sku || "—"}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{v.barcode || "—"}</td>
                          <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                            {v.selling_price !== null && v.selling_price !== undefined ? `${currency} ${Number(v.selling_price).toFixed(2)}` : formatMoney(retailPrice)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{v.device_stock || 0}</td>
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
                              className="h-7 border-violet-200 bg-white px-2.5 text-xs text-violet-700 hover:bg-violet-50"
                              label="Share" 
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Batch Inventory Table */}
            {product.is_batch_managed && product.batches && product.batches.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Active Inventory Batches</h3>
                  <span className="text-xs font-semibold text-slate-500">{product.batches.length} Batches</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-[#f8fafc] text-slate-600 border-b border-slate-200 text-xs font-semibold uppercase">
                      <tr>
                        <th className="px-4 py-3">Batch Number</th>
                        <th className="px-4 py-3">Variant</th>
                        <th className="px-4 py-3">Mfg. Date</th>
                        <th className="px-4 py-3">Expiry Date</th>
                        <th className="px-4 py-3 text-right">Price</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {product.batches.map((b: any, index: number) => {
                        const mfg = b.mfg_date ? format(new Date(b.mfg_date), "yyyy-MM-dd") : "—"
                        const exp = b.expiry_date ? format(new Date(b.expiry_date), "yyyy-MM-dd") : "—"
                        const totalStock = Array.isArray(b.stocks) ? b.stocks.reduce((acc: number, cur: any) => acc + Number(cur.stock || 0), 0) : 0
                        
                        return (
                          <tr key={b.id} className={cn("hover:bg-slate-50", index % 2 === 1 && "bg-slate-50/50")}>
                            <td className="px-4 py-2.5 font-mono font-semibold text-slate-800">{b.batch_number}</td>
                            <td className="px-4 py-2.5 text-slate-600">{b.variant_name || "Default"}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">{mfg}</td>
                            <td className="px-4 py-2.5 text-xs text-slate-500">{exp}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-slate-800">
                              {currency} {Number(b.selling_price || 0).toFixed(2)}
                            </td>
                            <td className="px-4 py-2.5 text-right font-bold text-emerald-700">{totalStock}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
          
          {/* Modal Footer */}
          <div className="border-t border-slate-200 bg-white px-6 py-3.5 shrink-0 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <ShareProductButton product={product} currency={currency} currentDeviceId={currentDeviceId} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsMediaEditOpen(true)}
                className="border-violet-200 text-violet-700 bg-white hover:bg-violet-50 text-xs font-semibold h-9"
              >
                <ImageIcon className="h-4 w-4 mr-1.5 text-violet-600" />
                Edit Media
              </Button>
            </div>
            <Button onClick={onClose} variant="outline" size="sm" className="px-5 font-semibold text-xs h-9">
              Close
            </Button>
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
