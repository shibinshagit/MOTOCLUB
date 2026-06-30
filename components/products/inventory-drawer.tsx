"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Download, Package, Plus, RefreshCw, Search, X } from "lucide-react"
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import ProductsExcelTable from "@/components/products/products-excel-table"
import { EXCEL_COLUMN_FILTER_POPOVER_ATTR } from "@/components/sales/excel-column-filter"
import NewProductModal from "@/components/sales/new-product-modal"
import { ProductDetailSlider } from "@/components/products/product-detail-slider"
import EditProductModal from "@/components/products/edit-product-modal"
import AdjustStockModal from "@/components/products/adjust-stock-modal"
import { getProducts, deleteProduct } from "@/app/actions/product-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"
import { exportProductsToPDF } from "@/lib/pdf-export-utils"
import { useSelector, useDispatch } from "react-redux"
import type { RootState, AppDispatch } from "@/store/store"
import type { Product } from "@/store/slices/productSlice"
import {
  setLoading,
  setProducts,
  addProduct,
  updateProduct,
  removeProduct,
  setSearchTerm,
  setError,
  setSilentRefreshing,
} from "@/store/slices/productSlice"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"

const SHEET_ANIMATION_MS = 300

interface InventoryDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
}

export default function InventoryDrawer({
  open,
  onOpenChange,
  userId,
  isAddModalOpen = false,
  onModalClose,
}: InventoryDrawerProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { products, searchTerm, loading, error, fetchedTime, needsRefresh, silentRefreshing } = useSelector(
    (state: RootState) => state.product,
  )
  const currency = useSelector(selectDeviceCurrency)
  const { isValueHidden } = useStaffRestrictions()
  const hideCogs = isValueHidden("cogs")
  const hideStockCount = isValueHidden("stock_count")
  const { toast } = useToast()

  const hasLoaded = Boolean(fetchedTime) || products.length > 0
  const hasCachedProducts = products.length > 0
  const [isProductModalOpen, setIsProductModalOpen] = useState(isAddModalOpen)
  const [detailProduct, setDetailProduct] = useState<any>(null)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [contentReady, setContentReady] = useState(false)
  const [, startTableTransition] = useTransition()
  const fetchInFlightRef = useRef(false)

  useEffect(() => {
    if (isAddModalOpen) setIsProductModalOpen(true)
  }, [isAddModalOpen])

  useEffect(() => {
    if (!open) {
      const closeTimer = window.setTimeout(() => {
        setDetailProduct(null)
      }, SHEET_ANIMATION_MS)
      return () => window.clearTimeout(closeTimer)
    }

    if (hasCachedProducts || hasLoaded) {
      setContentReady(true)
      return
    }

    setContentReady(false)
    const openTimer = window.setTimeout(() => {
      startTableTransition(() => setContentReady(true))
    }, SHEET_ANIMATION_MS)
    return () => window.clearTimeout(openTimer)
  }, [open, hasCachedProducts, hasLoaded])

  const searchedProducts = useMemo(() => {
    if (!searchTerm.trim()) return products
    const query = searchTerm.toLowerCase()
    return products.filter(
      (product) =>
        product.name?.toLowerCase().includes(query) ||
        product.category?.toLowerCase().includes(query) ||
        product.company_name?.toLowerCase().includes(query) ||
        product.barcode?.toLowerCase().includes(query) ||
        product.shelf?.toLowerCase().includes(query) ||
        String(product.id).includes(query),
    )
  }, [products, searchTerm])

  const fetchProducts = useCallback(
    async ({ silent = false, force = false }: { silent?: boolean; force?: boolean } = {}) => {
      if (!userId) return
      if (fetchInFlightRef.current && !force) return

      fetchInFlightRef.current = true
      try {
        if (silent) {
          dispatch(setSilentRefreshing(true))
        } else {
          dispatch(setLoading(true))
        }

        const result = await getProducts(userId)
        if (result.success) {
          dispatch(setProducts(result.data as Product[]))
          dispatch(setError(null))
        } else if (!silent) {
          dispatch(setProducts([]))
          dispatch(setError(result.message || "Failed to load products"))
          notifyError(toast, result.message || "Failed to load products")
        }
      } catch (err) {
        console.error("Error fetching products:", err)
        if (!silent) {
          dispatch(setProducts([]))
          dispatch(setError("Failed to load products. Please try again later."))
          notifyError(toast, "Failed to load products. Please try again later.")
        }
      } finally {
        dispatch(setLoading(false))
        dispatch(setSilentRefreshing(false))
        fetchInFlightRef.current = false
      }
    },
    [userId, dispatch, toast],
  )

  useEffect(() => {
    if (!open || !userId || hasLoaded) return
    fetchProducts()
  }, [open, userId, hasLoaded, fetchProducts])

  useEffect(() => {
    if (!open || !userId || !needsRefresh) return
    fetchProducts({ silent: true })
  }, [open, userId, needsRefresh, fetchProducts])

  const handleRefresh = () => {
    fetchProducts({ force: true })
  }

  const handleModalClose = () => {
    setIsProductModalOpen(false)
    onModalClose?.()
  }

  const handleProductAdded = (product: any) => {
    dispatch(addProduct(product))
    notifySuccess(toast, "Product added successfully")
  }

  const handleProductUpdated = (updatedProduct: any) => {
    dispatch(updateProduct(updatedProduct))
    if (detailProduct?.id === updatedProduct.id) {
      setDetailProduct(updatedProduct)
    }
    notifySuccess(toast, "Product updated successfully")
  }

  const handleStockAdjusted = (updatedProduct: any) => {
    dispatch(updateProduct(updatedProduct))
    if (detailProduct?.id === updatedProduct.id) {
      setDetailProduct(updatedProduct)
    }
    notifySuccess(toast, "Stock adjusted successfully")
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

  const exportProducts = searchedProducts

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          forceMount
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 data-[state=closed]:pointer-events-none sm:max-w-xl md:max-w-3xl lg:max-w-[min(96vw,1200px)]"
          onInteractOutside={(event) => {
            const target = event.target as HTMLElement | null
            if (target?.closest(`[${EXCEL_COLUMN_FILTER_POPOVER_ATTR}]`)) {
              event.preventDefault()
            }
          }}
          onPointerDownOutside={(event) => {
            const target = event.target as HTMLElement | null
            if (target?.closest(`[${EXCEL_COLUMN_FILTER_POPOVER_ATTR}]`)) {
              event.preventDefault()
            }
          }}
          onFocusOutside={(event) => {
            const target = event.target as HTMLElement | null
            if (target?.closest(`[${EXCEL_COLUMN_FILTER_POPOVER_ATTR}]`)) {
              event.preventDefault()
            }
          }}
        >
          <SheetTitle className="sr-only">Inventory</SheetTitle>

          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="relative z-10 flex shrink-0 items-center gap-3 border-b border-slate-200 bg-[#F1F4F9] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <Package className="h-5 w-5 shrink-0 text-violet-600" />
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-slate-900">Inventory</h2>
                <p className="text-xs text-slate-500">
                  {products.length} product{products.length === 1 ? "" : "s"}
                  {silentRefreshing ? " · Syncing…" : ""}
                  {error ? ` · ${error}` : ""}
                </p>
              </div>
            </div>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative hidden sm:block">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => dispatch(setSearchTerm(e.target.value))}
                  placeholder="Search products..."
                  className="h-8 w-44 border-slate-200 bg-white pl-8 pr-8 text-xs lg:w-52"
                />
                {searchTerm ? (
                  <button
                    type="button"
                    onClick={() => dispatch(setSearchTerm(""))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 bg-white px-2.5 text-xs"
                onClick={() =>
                  exportProductsToPDF(
                    exportProducts,
                    `inventory_report_${new Date().toISOString().split("T")[0]}.pdf`,
                    currency,
                  )
                }
                disabled={exportProducts.length === 0}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" />
                Export
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-8 border-slate-200 bg-white px-2.5 text-xs"
                onClick={handleRefresh}
                disabled={loading || silentRefreshing}
              >
                <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading || silentRefreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              <Button size="sm" className="h-8 px-2.5 text-xs" onClick={() => setIsProductModalOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>

          <div className="relative z-10 border-b border-slate-200 bg-white px-4 py-2 sm:hidden">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchTerm}
                onChange={(e) => dispatch(setSearchTerm(e.target.value))}
                placeholder="Search products..."
                className="h-8 border-slate-200 bg-white pl-8 pr-8 text-xs"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => dispatch(setSearchTerm(""))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="relative z-0 min-h-0 flex-1 p-4">
            {contentReady ? (
              <ProductsExcelTable
                products={products}
                searchTerm={searchTerm}
                isLoading={loading}
                hasLoaded={hasLoaded}
                hideCogs={hideCogs}
                hideStockCount={hideStockCount}
                currency={currency}
                onViewProduct={handleViewProduct}
                onEditProduct={handleEditProduct}
              />
            ) : (
              <div className="flex h-full min-h-[320px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-card">
                <div className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
                </div>
                <div className="flex-1 space-y-3 p-4">
                  {[...Array(8)].map((_, index) => (
                    <div key={index} className="h-4 animate-pulse rounded bg-slate-100" />
                  ))}
                </div>
              </div>
            )}
          </div>

          {detailProduct ? (
            <ProductDetailSlider
              portaled={false}
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
          </div>
        </SheetContent>
      </Sheet>

      <NewProductModal
        isOpen={isProductModalOpen}
        onClose={handleModalClose}
        onSuccess={handleProductAdded}
        userId={userId}
        elevated
      />

      {selectedProduct ? (
        <EditProductModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          product={selectedProduct}
          onSuccess={handleProductUpdated}
          userId={userId}
        />
      ) : null}

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
    </>
  )
}
