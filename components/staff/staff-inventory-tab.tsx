"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { 
  Package, 
  Search, 
  PackageOpen, 
  AlertTriangle, 
  AlertCircle, 
  RefreshCw, 
  Loader2, 
  ImageIcon, 
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InventorySearchBox } from "@/components/products/inventory-search-box"
import { getStaffInventory, getStaffInventoryStats } from "@/app/actions/staff-inventory-actions"
import { useToast } from "@/components/ui/use-toast"
import { cn } from "@/lib/utils"
import StaffViewProductModal from "./staff-view-product-modal"
import StaffMediaEditModal from "./staff-media-edit-modal"
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
    <div className={cn("rounded-xl border p-3 sm:p-4 flex items-center justify-between min-w-0", (tones as any)[tone])}>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm font-medium opacity-80 mb-1 truncate">{title}</p>
        <h3 className="text-xl sm:text-2xl font-bold truncate">{value.toLocaleString()}</h3>
      </div>
      <div className="p-2 sm:p-3 bg-white/60 rounded-lg shrink-0 ml-2">
        {icon}
      </div>
    </div>
  )
}

export default function StaffInventoryTab({}: StaffInventoryTabProps) {
  const { toast } = useToast()
  const currency = useSelector((state: any) => selectDeviceCurrency(state)) as string
  const deviceId = useSelector((state: any) => selectDeviceId(state)) as number | undefined

  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  // Server-side pagination & search state
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [searchTerm, setSearchTerm] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<{ id?: number | string | null; name: string } | null>(null)

  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [mediaEditProduct, setMediaEditProduct] = useState<any>(null)
  const [stats, setStats] = useState({ total: 0, available: 0, low: 0, out: 0 })

  const isFirstMount = useRef(true)

  // 250ms Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Reset to page 1 whenever search query or category changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    setPage(1)
  }, [debouncedSearch, selectedCategory])

  // Fetch summary stats for summary cards
  const loadStats = useCallback(async () => {
    try {
      const res = await getStaffInventoryStats()
      if (res.success && res.stats) {
        setStats(res.stats)
      }
    } catch (err) {
      console.error("Failed to load inventory stats:", err)
    }
  }, [])

  // Fetch paginated inventory from server
  const loadInventory = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true)
    } else {
      setLoading(true)
    }
    setHasError(false)
    setErrorMessage("")

    try {
      const res = await getStaffInventory({
        page,
        pageSize,
        searchTerm: debouncedSearch,
        categoryId: selectedCategory?.id ? Number(selectedCategory.id) : null,
        categoryName: selectedCategory?.name || null,
      })

      if (res.success) {
        setProducts(res.data || [])
        setTotalCount(res.totalCount || 0)
        setTotalPages(res.totalPages || 1)
      } else {
        setHasError(true)
        setErrorMessage(res.message || "Failed to load inventory")
        toast({ title: "Error", description: res.message || "Failed to load inventory", variant: "destructive" })
      }
    } catch (err: any) {
      setHasError(true)
      setErrorMessage("Failed to load inventory. Please try again.")
      toast({ title: "Error", description: "Failed to load inventory", variant: "destructive" })
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [page, pageSize, debouncedSearch, selectedCategory, toast])

  // Fetch products on page, pageSize, or debouncedSearch change
  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  // Load summary stats on mount
  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleRefresh = () => {
    loadStats()
    loadInventory(true)
  }

  const handleProductUpdated = (updatedProduct: any) => {
    setProducts((prev) =>
      prev.map((p) => (p.id === updatedProduct.id ? { ...p, ...updatedProduct } : p))
    )
    if (selectedProduct?.id === updatedProduct.id) {
      setSelectedProduct((prev: any) => (prev ? { ...prev, ...updatedProduct } : null))
    }
    loadStats()
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  const startIndex = (page - 1) * pageSize

  return (
    <div className="flex flex-col h-full bg-[#f8fafc]">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 sm:py-5 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-800">Inventory Management</h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 sm:mt-1">View stock, locations, and manage product photos & videos</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading || isRefreshing} className="w-full sm:w-auto">
              <RefreshCw className={cn("h-4 w-4 mr-2", (loading || isRefreshing) && "animate-spin")} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 sm:p-6">
        
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
          <SummaryCard title="Total Products" value={stats.total} icon={<Package className="h-5 w-5 sm:h-6 sm:w-6" />} tone="blue" />
          <SummaryCard title="In Stock" value={stats.available} icon={<PackageOpen className="h-5 w-5 sm:h-6 sm:w-6" />} tone="emerald" />
          <SummaryCard title="Low Stock" value={stats.low} icon={<AlertTriangle className="h-5 w-5 sm:h-6 sm:w-6" />} tone="amber" />
          <SummaryCard title="Out of Stock" value={stats.out} icon={<AlertCircle className="h-5 w-5 sm:h-6 sm:w-6" />} tone="red" />
        </div>

        {/* Toolbar */}
        <div className="bg-white p-3 sm:p-4 rounded-t-xl border border-b-0 border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="w-full max-w-lg">
            <InventorySearchBox
              value={searchTerm}
              onChange={setSearchTerm}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onSelectProduct={(prod) => setSelectedProduct(prod)}
              products={products}
              userId={deviceId}
              placeholder="Search by name, brand, category, SKU, barcode..."
              className="w-full"
            />
          </div>

          <div className="text-xs text-slate-500 self-end sm:self-center font-medium">
            {loading ? (
              <span className="flex items-center gap-1.5 text-indigo-600">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...
              </span>
            ) : totalCount > 0 ? (
              <span>Showing {startIndex + 1}–{Math.min(startIndex + pageSize, totalCount)} of {totalCount.toLocaleString()} products</span>
            ) : null}
          </div>
        </div>

        {/* Table / Card Container */}
        <div className="bg-white rounded-b-xl border border-slate-200 shadow-sm overflow-hidden w-full">
          {/* MOBILE PRODUCT CARD VIEW (< md) */}
          <div className="block md:hidden p-3 space-y-3">
            {loading && products.length === 0 ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 bg-slate-200 rounded-lg shrink-0" />
                    <div className="space-y-1 flex-1">
                      <div className="h-4 bg-slate-200 rounded w-2/3" />
                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                    </div>
                  </div>
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                </div>
              ))
            ) : hasError ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                <p className="font-semibold text-slate-700 text-sm">{errorMessage || "Unable to load products."}</p>
                <Button variant="outline" size="sm" onClick={() => loadInventory()} className="mt-3 text-xs">
                  Retry
                </Button>
              </div>
            ) : products.length === 0 ? (
              <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 shadow-sm">
                <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="font-medium text-sm">No products found{debouncedSearch ? ` for "${debouncedSearch}"` : ""}</p>
                {debouncedSearch && (
                  <Button 
                    variant="link" 
                    size="sm" 
                    onClick={() => setSearchTerm("")} 
                    className="mt-1 text-xs text-indigo-600"
                  >
                    Clear search query
                  </Button>
                )}
              </div>
            ) : (
              products.map((product) => {
                const sellingPrice = Number(product.msp ?? product.price ?? 0)
                const msp = Number(product.msp || product.variants?.[0]?.msp || 0)
                return (
                  <div
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all space-y-3 cursor-pointer"
                  >
                    {/* Header Row: Thumbnail, Name & Category */}
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 shrink-0">
                        {product.image_url ? (
                          <img src={product.image_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-slate-300">
                            <Package className="h-6 w-6" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">{product.name}</h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                            {product.category || "General"}
                          </span>
                          {product.barcode && (
                            <span className="text-[10px] font-mono text-slate-400">
                              #{product.barcode}
                            </span>
                          )}
                          {product.has_variants && (
                            <span className="text-[10px] text-indigo-600 font-medium">
                              {product.variants?.length || 0} variants
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Pricing & Stock Row */}
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">Price</p>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-bold text-slate-900">
                            {currency} {sellingPrice.toFixed(2)}
                          </span>
                          {msp > 0 && msp !== sellingPrice && (
                            <span className="text-[11px] text-slate-400 line-through">
                              {currency} {msp.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase mb-0.5">Stock ({product.stock === null ? 0 : product.stock})</p>
                        {product.stock === null ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Hidden
                          </span>
                        ) : product.stock <= 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">
                            Out of Stock
                          </span>
                        ) : product.stock <= 5 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action Row */}
                    <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setMediaEditProduct(product)}
                        className="flex-1 h-8 text-xs border-slate-200 text-slate-700"
                      >
                        <ImageIcon className="h-3.5 w-3.5 mr-1 text-violet-600" /> Media
                      </Button>
                      <ShareProductButton 
                        product={product} 
                        currency={currency} 
                        currentDeviceId={deviceId || undefined} 
                        className="flex-1 h-8 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50 justify-center"
                        label="Share" 
                      />
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => setSelectedProduct(product)}
                        className="h-8 text-xs bg-indigo-600 hover:bg-indigo-700 text-white px-3"
                      >
                        Details
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          {/* DESKTOP TABLE VIEW (>= md) */}
          <div className="hidden md:block overflow-x-auto w-full">
            <table className="w-full min-w-[750px] text-sm text-left">
              <thead className="bg-[#f8fafc] text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Product</th>
                  <th className="px-6 py-4 font-semibold">Category</th>
                  <th className="px-6 py-4 font-semibold">Barcode</th>
                  <th className="px-6 py-4 font-semibold text-right">Price</th>
                  <th className="px-6 py-4 font-semibold text-right">MSP</th>
                  <th className="px-6 py-4 font-semibold text-right">Available Stock</th>
                  <th className="px-6 py-4 font-semibold text-center">Status</th>
                  <th className="px-6 py-4 font-semibold text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && products.length === 0 ? (
                  Array.from({ length: 5 }).map((_, idx) => (
                    <tr key={idx} className="animate-pulse">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 bg-slate-200 rounded shrink-0" />
                          <div className="space-y-1 flex-1">
                            <div className="h-4 bg-slate-200 rounded w-3/4" />
                            <div className="h-3 bg-slate-100 rounded w-1/2" />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-20" /></td>
                      <td className="px-6 py-4"><div className="h-4 bg-slate-200 rounded w-24" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-200 rounded w-16 ml-auto" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-200 rounded w-16 ml-auto" /></td>
                      <td className="px-6 py-4 text-right"><div className="h-4 bg-slate-200 rounded w-12 ml-auto" /></td>
                      <td className="px-6 py-4 text-center"><div className="h-6 bg-slate-200 rounded-full w-20 mx-auto" /></td>
                      <td className="px-6 py-4 text-center"><div className="h-8 bg-slate-200 rounded w-28 mx-auto" /></td>
                    </tr>
                  ))
                ) : hasError ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
                      <p className="font-semibold text-slate-700">{errorMessage || "Unable to load products."}</p>
                      <Button variant="outline" size="sm" onClick={() => loadInventory()} className="mt-3 text-xs">
                        Retry
                      </Button>
                    </td>
                  </tr>
                ) : products.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-slate-500">
                      <Package className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="font-medium">No products found{debouncedSearch ? ` for "${debouncedSearch}"` : ""}</p>
                      {debouncedSearch && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          onClick={() => setSearchTerm("")} 
                          className="mt-1 text-xs text-indigo-600"
                        >
                          Clear search query
                        </Button>
                      )}
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
                              {product.name}
                            </p>
                            {product.variants?.[0]?.name && product.variants[0].name !== "Default" && !product.has_variants && (
                              <p className="text-xs text-slate-500 mt-0.5">{product.variants[0].name}</p>
                            )}
                            {product.has_variants && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{product.variants?.length || 0} variants</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-slate-600">{product.category || "—"}</td>
                      <td className="px-6 py-3 font-mono text-xs text-slate-500">{product.barcode || product.variants?.[0]?.barcode || "—"}</td>
                      <td className="px-6 py-3 text-right font-medium text-slate-800">
                        {(() => {
                          const sellingPrice = Number(product.msp ?? product.price ?? 0)
                          return `${currency} ${sellingPrice.toFixed(2)}`
                        })()}
                      </td>
                      <td className="px-6 py-3 text-right font-medium text-slate-600">
                        {(() => {
                          const msp = Number(product.msp || product.variants?.[0]?.msp || 0)
                          return msp > 0 ? `${currency} ${msp.toFixed(2)}` : "—"
                        })()}
                      </td>
                      <td className="px-6 py-3 text-right font-bold text-slate-700">
                        {product.stock === null ? "—" : product.stock}
                      </td>
                      <td className="px-6 py-3 text-center">
                        {product.stock === null ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                            Hidden
                          </span>
                        ) : product.stock <= 0 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                            Out of Stock
                          </span>
                        ) : product.stock <= 5 ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            Low Stock
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setMediaEditProduct(product)}
                            className="h-8 border-slate-200 bg-white px-2.5 text-xs text-slate-700 hover:bg-slate-50"
                            title="Edit photos and videos"
                          >
                            <ImageIcon className="h-3.5 w-3.5 mr-1 text-violet-600" />
                            Media
                          </Button>
                          <ShareProductButton 
                            product={product} 
                            currency={currency} 
                            currentDeviceId={deviceId || undefined} 
                            className="h-8 border-violet-200 bg-white px-3 text-xs text-violet-700 hover:bg-violet-50"
                            label="Share" 
                          />
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-200 bg-[#F1F4F9] px-4 py-3 text-xs text-slate-600">
              <div className="flex items-center gap-2 font-medium">
                Showing {startIndex + 1}–{Math.min(startIndex + pageSize, totalCount)} of {totalCount.toLocaleString()} products
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500">Per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                    className="h-8 rounded border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-indigo-500 focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-600 border-slate-200 bg-white disabled:opacity-50"
                    onClick={() => setPage(1)}
                    disabled={page <= 1 || loading}
                    title="First page"
                  >
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-600 border-slate-200 bg-white disabled:opacity-50"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1 || loading}
                    title="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>

                  <span className="px-2 font-medium text-slate-700">
                    Page {page} of {totalPages}
                  </span>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-600 border-slate-200 bg-white disabled:opacity-50"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages || loading}
                    title="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0 text-slate-600 border-slate-200 bg-white disabled:opacity-50"
                    onClick={() => setPage(totalPages)}
                    disabled={page >= totalPages || loading}
                    title="Last page"
                  >
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <StaffViewProductModal 
        isOpen={!!selectedProduct} 
        onClose={() => setSelectedProduct(null)} 
        product={selectedProduct} 
        currency={currency}
        onProductUpdated={handleProductUpdated}
      />

      {mediaEditProduct && (
        <StaffMediaEditModal
          isOpen={!!mediaEditProduct}
          onClose={() => setMediaEditProduct(null)}
          product={mediaEditProduct}
          onSuccess={handleProductUpdated}
        />
      )}
    </div>
  )
}
