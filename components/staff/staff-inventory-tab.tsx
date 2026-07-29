"use client"

import { useState, useEffect, useMemo } from "react"
import { Package, Search, PackageOpen, AlertTriangle, AlertCircle, RefreshCw, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getStaffInventory } from "@/app/actions/staff-inventory-actions"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import StaffViewProductModal from "./staff-view-product-modal"
import { ShareProductButton } from "@/components/shared/share-product-button"
import { useSelector } from "react-redux"
import { selectDeviceCurrency, selectDeviceId } from "@/store/slices/deviceSlice"

interface StaffInventoryTabProps {}

function SummaryCard({ title, value, icon, tone }: any) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 border-blue-100",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-100",
    amber: "bg-amber-50 text-amber-600 border-amber-100",
    red: "bg-red-50 text-red-600 border-red-100",
  }
  return (
    <div className={cn("rounded-xl border p-4 flex items-center justify-between", (tones as any)[tone])}>
      <div>
        <p className="text-sm font-medium opacity-80 mb-1">{title}</p>
        <h3 className="text-2xl font-bold">{value}</h3>
      </div>
      <div className="p-3 bg-white/60 rounded-lg">
        {icon}
      </div>
    </div>
  )
}

export default function StaffInventoryTab({}: StaffInventoryTabProps) {
  const { toast } = useToast()
  const currency = useSelector(selectDeviceCurrency)
  const deviceId = useSelector(selectDeviceId)
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedProduct, setSelectedProduct] = useState<any>(null)

  const loadInventory = async (search?: string) => {
    setLoading(true)
    try {
      const res = await getStaffInventory(search)
      if (res.success) {
        setProducts(res.data || [])
      } else {
        toast({ title: "Error", description: res.message, variant: "destructive" })
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to load inventory", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInventory()
  }, [])

  // Optional: debounce search later, for now we can just search on submit or type
  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      loadInventory(searchTerm)
    }, 500)
    return () => clearTimeout(delayDebounceFn)
  }, [searchTerm])

  const stats = useMemo(() => {
    const total = products.length
    const available = products.filter(p => p.stock > 0).length
    const low = products.filter(p => p.stock > 0 && p.stock <= 5).length
    const out = products.filter(p => p.stock <= 0).length
    return { total, available, low, out }
  }, [products])

  return (
    <div className="flex flex-col h-full bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Inventory Management</h1>
            <p className="text-sm text-slate-500 mt-1">View available stock and product locations</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadInventory(searchTerm)} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard title="Total Products" value={stats.total} icon={<Package className="h-6 w-6" />} tone="blue" />
          <SummaryCard title="In Stock" value={stats.available} icon={<PackageOpen className="h-6 w-6" />} tone="emerald" />
          <SummaryCard title="Low Stock" value={stats.low} icon={<AlertTriangle className="h-6 w-6" />} tone="amber" />
          <SummaryCard title="Out of Stock" value={stats.out} icon={<AlertCircle className="h-6 w-6" />} tone="red" />
        </div>

        {/* Toolbar */}
        <div className="bg-white p-4 rounded-t-xl border border-b-0 border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder="Search by name, SKU, or barcode..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200"
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 bg-slate-100 text-slate-600 text-sm rounded-md font-medium">
              Read Only Mode
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#f8fafc] text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Product</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold">Barcode</th>
                  <th className="px-6 py-4 font-semibold">Warehouse</th>
                  <th className="px-6 py-4 font-semibold text-right">Selling Price</th>
                  <th className="px-6 py-4 font-semibold text-right">MSP</th>
                  <th className="px-6 py-4 font-semibold text-right">Available Stock</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-indigo-500" />
                      Loading inventory...
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-slate-500">
                      <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      No products found
                    </td>
                  </tr>
                ) : (
                  products.map((product) => (
                    <tr 
                      key={product.id} 
                      onClick={() => setSelectedProduct(product)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors group"
                    >
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                            {product.image_url ? (
                              <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-slate-300">
                                <Package className="h-5 w-5" />
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors">
                              {product.productName || product.name}
                            </p>
                            {product.variantName && product.variantName !== "Default" && !product.has_variants && (
                              <p className="text-xs text-slate-500 mt-0.5">{product.variantName}</p>
                            )}
                            {product.has_variants && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{product.variants?.length || 0} variants</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{product.category || "—"}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-500">{product.variants?.[0]?.barcode || "—"}</td>
                      <td className="px-6 py-3 text-slate-600">{product.branch_name || "Main"}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-800">
                        {(() => {
                          let prices: number[] = []
                          if (product.batches && product.batches.length > 0) {
                            prices = product.batches.map((b: any) => Number(b.selling_price || 0)).filter((p: number) => p > 0)
                          }
                          if (prices.length === 0 && product.variants) {
                            prices = product.variants.map((v: any) => Number(v.selling_price || 0)).filter((p: number) => p > 0)
                          }
                          
                          if (!product.has_variants || (product.variants && product.variants.length <= 1)) {
                             const singlePrice = prices.length > 0 ? Math.max(...prices) : Number(product.variants?.[0]?.msp || 0)
                             return `AED ${singlePrice.toFixed(2)}`
                          }

                          if (prices.length > 0) {
                             const minPrice = Math.min(...prices)
                             return `From AED ${minPrice.toFixed(2)}`
                          }
                          
                          return "AED 0.00"
                        })()}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-slate-600">
                        {(() => {
                          const msp = Number(product.variants?.[0]?.msp || 0)
                          return msp > 0 ? `AED ${msp.toFixed(2)}` : "—"
                        })()}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-slate-700">
                        {product.stock}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {product.stock <= 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-100">
                            OUT OF STOCK
                          </span>
                        ) : product.stock <= 5 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            LOW STOCK
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            IN STOCK
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <ShareProductButton 
                          product={product} 
                          currency={currency} 
                          currentDeviceId={deviceId || undefined} 
                          className="h-8 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50"
                          label="Share" 
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <StaffViewProductModal 
        isOpen={!!selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
        product={selectedProduct} 
      />
    </div>
  )
}
