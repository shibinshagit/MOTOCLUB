"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Download, Package, Plus, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import ProductsExcelTable from "@/components/products/products-excel-table"
import NewProductModal from "@/components/sales/new-product-modal"
import { ProductDetailSlider } from "@/components/products/product-detail-slider"
import EditProductModal from "@/components/products/edit-product-modal"
import AdjustStockModal from "@/components/products/adjust-stock-modal"
import { InventorySearchBox } from "@/components/products/inventory-search-box"
import { getPaginatedProducts, getProducts, deleteProduct } from "@/app/actions/product-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"
import { exportProductsToPDF } from "@/lib/pdf-export-utils"
import { useSelector, useDispatch } from "react-redux"
import type { RootState, AppDispatch } from "@/store/store"
import {
  setLoading as setReduxLoading,
  setProducts as setReduxProducts,
  addProduct,
  updateProduct,
  removeProduct,
  setError as setReduxError,
} from "@/store/slices/productSlice"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"

interface ProductTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
  onClose?: () => void
}

export default function ProductTab({
  userId,
  isAddModalOpen = false,
  onModalClose,
}: ProductTabProps) {
  const dispatch = useDispatch<AppDispatch>()
  const currency = useSelector(selectDeviceCurrency)
  const { isValueHidden } = useStaffRestrictions()
  const hideCogs = isValueHidden("cogs")
  const hideStockCount = isValueHidden("stock_count")
  const { toast } = useToast()

  const [products, setProducts] = useState<any[]>([])
  const [totalCount, setTotalCount] = useState<number>(0)
  const [totalPages, setTotalPages] = useState<number>(1)
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)

  const [isProductModalOpen, setIsProductModalOpen] = useState(isAddModalOpen)
  const [detailProduct, setDetailProduct] = useState<any>(null)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchInFlightRef = useRef(false)

  useEffect(() => {
    if (isAddModalOpen) setIsProductModalOpen(true)
  }, [isAddModalOpen])

  // 250ms debouncing for search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
      setPage(1) // Reset to page 1 on search change
    }, 250)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Fetch paginated inventory data from backend
  const fetchInventory = useCallback(
    async ({ silent = false, isRefresh = false }: { silent?: boolean; isRefresh?: boolean } = {}) => {
      if (!userId) return
      if (fetchInFlightRef.current && !isRefresh) return

      fetchInFlightRef.current = true
      if (isRefresh) {
        setIsRefreshing(true)
      } else if (!silent) {
        setLoading(true)
      }

      try {
        const result = await getPaginatedProducts({
          userId,
          page,
          pageSize,
          searchTerm: debouncedSearch,
        })

        if (result.success) {
          setProducts(result.data || [])
          setTotalCount(result.totalCount || 0)
          setTotalPages(result.totalPages || 1)
          dispatch(setReduxProducts(result.data || []))
          dispatch(setReduxError(null))
        } else {
          setProducts([])
          setTotalCount(0)
          setTotalPages(1)
          dispatch(setReduxError(result.message || "Failed to load inventory"))
          notifyError(toast, result.message || "Failed to load inventory")
        }
      } catch (err) {
        console.error("Error fetching inventory:", err)
        setProducts([])
        setTotalCount(0)
        setTotalPages(1)
        notifyError(toast, "Failed to load inventory. Please try again later.")
      } finally {
        setLoading(false)
        setIsRefreshing(false)
        fetchInFlightRef.current = false
      }
    },
    [userId, page, pageSize, debouncedSearch, dispatch, toast],
  )

  useEffect(() => {
    fetchInventory()
  }, [fetchInventory])

  const handleRefresh = () => {
    fetchInventory({ isRefresh: true })
  }

  const handleModalClose = () => {
    setIsProductModalOpen(false)
    onModalClose?.()
  }

  const handleProductAdded = (newProd: any) => {
    dispatch(addProduct(newProd))
    notifySuccess(toast, "Product added successfully")
    fetchInventory({ silent: true })
  }

  const handleProductUpdated = (updatedProd: any) => {
    dispatch(updateProduct(updatedProd))
    setProducts((prev) => prev.map((p) => (p.id === updatedProd.id ? { ...p, ...updatedProd } : p)))
    if (detailProduct?.id === updatedProd.id) {
      setDetailProduct((prev: any) => ({ ...prev, ...updatedProd }))
    }
    notifySuccess(toast, "Product updated successfully")
    fetchInventory({ silent: true })
  }

  const handleStockAdjusted = (updatedProd: any) => {
    dispatch(updateProduct(updatedProd))
    setProducts((prev) => prev.map((p) => (p.id === updatedProd.id ? { ...p, ...updatedProd } : p)))
    if (detailProduct?.id === updatedProd.id) {
      setDetailProduct((prev: any) => ({ ...prev, ...updatedProd }))
    }
    notifySuccess(toast, "Stock adjusted successfully")
    fetchInventory({ silent: true })
  }

  const handleViewProduct = (product: any) => {
    setDetailProduct(product)
  }

  const handleEditProduct = (product: any) => {
    setSelectedProduct(product)
    setDetailProduct(null)
    setIsEditModalOpen(true)
  }

  const handleDeleteProduct = (product: any) => {
    setSelectedProduct(product)
    setIsDeleteModalOpen(true)
  }

  const confirmDelete = async () => {
    if (!selectedProduct) return

    setIsDeleting(true)
    try {
      const result = await deleteProduct(selectedProduct.id)
      if (result.success) {
        notifySuccess(toast, "Product deleted successfully")
        dispatch(removeProduct(String(selectedProduct.id)))
        setProducts((prev) => prev.filter((p) => p.id !== selectedProduct.id))
        setTotalCount((prev) => Math.max(0, prev - 1))
        if (detailProduct?.id === selectedProduct.id) {
          setDetailProduct(null)
        }
      } else {
        notifyError(toast, result.message || "Failed to delete product")
      }
    } catch (err) {
      console.error("Delete product error:", err)
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsDeleting(false)
      setIsDeleteModalOpen(false)
    }
  }

  // Export ALL matching products for the active filter to PDF
  const handleExport = async () => {
    if (!userId) return
    setIsExporting(true)
    try {
      const result = await getProducts(userId, undefined, debouncedSearch)
      if (result.success && result.data && result.data.length > 0) {
        exportProductsToPDF(
          result.data,
          `inventory_report_${new Date().toISOString().split("T")[0]}.pdf`,
          currency,
        )
        notifySuccess(toast, `Exported ${result.data.length.toLocaleString()} products to PDF`)
      } else {
        notifyWarning(toast, "No products available to export")
      }
    } catch (err) {
      console.error("Export inventory error:", err)
      notifyError(toast, "Failed to export inventory")
    } finally {
      setIsExporting(false)
    }
  }

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage)
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  return (
    <div className="w-full max-w-full space-y-4">
      {/* Top Header Card */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-[#F1F4F9] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <Package className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Product Inventory</h1>
            <p className="text-xs text-slate-500 font-medium">
              {totalCount.toLocaleString()} product{totalCount === 1 ? "" : "s"} total
              {isRefreshing ? " · Syncing…" : ""}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="w-full sm:w-64 md:w-72">
            <InventorySearchBox
              value={searchTerm}
              onChange={setSearchTerm}
              onSelectProduct={handleViewProduct}
              products={products}
              userId={userId}
              placeholder="Search by name, brand, category, SKU, barcode..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-none"
              onClick={handleExport}
              disabled={isExporting || totalCount === 0}
            >
              <Download className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
              {isExporting ? "Exporting..." : "Export"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-9 border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-none"
              onClick={handleRefresh}
              disabled={loading || isRefreshing}
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 text-slate-500 ${loading || isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>

            <Button
              size="sm"
              className="h-9 bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-700 shadow-sm"
              onClick={() => setIsProductModalOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Add Product
            </Button>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="w-full overflow-hidden">
        <ProductsExcelTable
          products={products}
          searchTerm={debouncedSearch}
          isLoading={loading}
          hasLoaded={!loading || products.length > 0}
          hideCogs={hideCogs}
          hideStockCount={hideStockCount}
          currency={currency}
          onViewProduct={handleViewProduct}
          onEditProduct={handleEditProduct}
          page={page}
          pageSize={pageSize}
          totalCount={totalCount}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      {/* Product Detail Slider */}
      {detailProduct ? (
        <ProductDetailSlider
          portaled={true}
          product={detailProduct}
          onClose={() => setDetailProduct(null)}
          onEdit={() => handleEditProduct(detailProduct)}
          onDelete={() => handleDeleteProduct(detailProduct)}
          onAdjustStock={
            hideStockCount
              ? undefined
              : () => {
                  setSelectedProduct(detailProduct)
                  setDetailProduct(null)
                  setIsAdjustStockModalOpen(true)
                }
          }
          currency={currency}
          privacyMode={false}
          userId={userId}
        />
      ) : null}

      {/* Add Product Modal */}
      <NewProductModal
        isOpen={isProductModalOpen}
        onClose={handleModalClose}
        onSuccess={handleProductAdded}
        userId={userId}
        elevated
      />

      {/* Edit Product Modal */}
      {selectedProduct ? (
        <EditProductModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          product={selectedProduct}
          onSuccess={handleProductUpdated}
          userId={userId}
        />
      ) : null}

      {/* Adjust Stock Modal */}
      {selectedProduct ? (
        <AdjustStockModal
          isOpen={isAdjustStockModalOpen}
          onClose={() => setIsAdjustStockModalOpen(false)}
          product={selectedProduct}
          userId={userId}
          currency={currency}
          onSuccess={handleStockAdjusted}
        />
      ) : null}

      {/* Delete Confirmation Modal */}
      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent overlayClassName="z-[70]" className="z-[70]">
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the product
              {selectedProduct?.name ? ` "${selectedProduct.name}"` : ""} and remove it from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
