"use client"

import { useCallback, useEffect, useState } from "react"
import { Flame, RefreshCw, Search, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ProductsExcelTable from "@/components/products/products-excel-table"
import { ProductDetailSlider } from "@/components/products/product-detail-slider"
import EditProductModal from "@/components/products/edit-product-modal"
import AdjustStockModal from "@/components/products/adjust-stock-modal"
import { getTrendingProducts } from "@/app/actions/product-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError } from "@/lib/notifications"
import { useSelector } from "react-redux"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"

interface TrendingInlineViewProps {
  userId: number
}

export default function TrendingInlineView({ userId }: TrendingInlineViewProps) {
  const currency = useSelector(selectDeviceCurrency)
  const { toast } = useToast()

  const [products, setProducts] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(false)
  const [detailProduct, setDetailProduct] = useState<any>(null)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false)

  const fetchTrendingProducts = useCallback(async () => {
    setLoading(true)
    try {
      const result = await getTrendingProducts(userId)
      if (result.success) {
        setProducts(result.data || [])
      } else {
        notifyError(toast, result.message || "Failed to load trending products")
      }
    } catch (err) {
      console.error("Error fetching trending products:", err)
      notifyError(toast, "Failed to load trending products")
    } finally {
      setLoading(false)
    }
  }, [userId, toast])

  useEffect(() => {
    fetchTrendingProducts()
  }, [fetchTrendingProducts])

  const filteredProducts = products.filter((p: any) => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    return (
      p.name?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600">
            <Flame className="h-5 w-5 fill-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Trending Products</h2>
            <p className="text-xs text-slate-500">Products currently featured as trending</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search trending products..."
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Button variant="outline" size="sm" onClick={fetchTrendingProducts} disabled={loading} className="h-8">
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500 text-sm">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-amber-500" /> Loading trending products...
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-dashed text-slate-500">
          <Flame className="h-8 w-8 mx-auto mb-2 text-amber-400 opacity-60" />
          <p className="font-semibold text-slate-800">No trending products found</p>
          <p className="text-xs mt-1 text-slate-500">
            Mark products as "Trending" when editing products in inventory to feature them here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <ProductsExcelTable
            products={filteredProducts}
            searchTerm={searchTerm}
            isLoading={loading}
            hasLoaded={true}
            hideCogs={false}
            hideStockCount={false}
            currency={currency || "INR"}
            onViewProduct={(p: any) => setDetailProduct(p)}
            onEditProduct={(p: any) => {
              setSelectedProduct(p)
              setIsEditModalOpen(true)
            }}
          />
        </div>
      )}

      {detailProduct && (
        <ProductDetailSlider
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onEdit={() => {
            setSelectedProduct(detailProduct)
            setIsEditModalOpen(true)
          }}
          onAdjustStock={() => {
            setSelectedProduct(detailProduct)
            setIsAdjustStockModalOpen(true)
          }}
        />
      )}

      {isEditModalOpen && selectedProduct && (
        <EditProductModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            fetchTrendingProducts()
          }}
          product={selectedProduct}
        />
      )}

      {isAdjustStockModalOpen && selectedProduct && (
        <AdjustStockModal
          isOpen={isAdjustStockModalOpen}
          onClose={() => {
            setIsAdjustStockModalOpen(false)
            fetchTrendingProducts()
          }}
          product={selectedProduct}
          userId={userId}
        />
      )}
    </div>
  )
}
