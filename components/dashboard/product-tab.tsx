"use client"

import type React from "react"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Plus, Search, X, RefreshCw, Package, Download, Building2, Filter, Eye, EyeOff } from "lucide-react"
import { getProducts, deleteProduct } from "@/app/actions/product-actions"
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
import { Input } from "@/components/ui/input"
import NewProductModal from "../sales/new-product-modal"
import ViewProductModal from "../products/view-product-modal"
import EditProductModal from "../products/edit-product-modal"
import AdjustStockModal from "../products/adjust-stock-modal"
import { printBarcodeSticker } from "@/lib/barcode-utils"
import { FormAlert } from "@/components/ui/form-alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useNotification } from "@/components/ui/global-notification"
import { exportProductsToPDF } from "@/lib/pdf-export-utils"
import { useSelector, useDispatch } from "react-redux"
import type { RootState, AppDispatch } from "@/store/store"
import {
  setLoading,
  setProducts,
  addProduct,
  updateProduct,
  removeProduct,
  setSearchTerm,
  setError,
  clearProducts,
} from "@/store/slices/productSlice"
import ProductActionPopup from "../products/product-action-popup"
import { selectDeviceCurrency } from "@/store/slices/deviceSlice"

interface ProductTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
}

export default function ProductTab({ userId, isAddModalOpen = false, onModalClose }: ProductTabProps) {
  const dispatch = useDispatch<AppDispatch>()
  const { products, searchTerm, isLoading, lastUpdated, error } = useSelector((state: RootState) => state.product)
  const currency = useSelector(selectDeviceCurrency)

  const [isProductModalOpen, setIsProductModalOpen] = useState(isAddModalOpen)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isAdjustStockModalOpen, setIsAdjustStockModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string>("All")
  const [selectedCompany, setSelectedCompany] = useState<string>("All")
  const [filterSearch, setFilterSearch] = useState<string>("")
  const [privacyMode, setPrivacyMode] = useState<boolean>(true) // Default to privacy ON
  const [popupState, setPopupState] = useState<{
    isOpen: boolean
    product: any | null
    position: { x: number; y: number }
  }>({
    isOpen: false,
    product: null,
    position: { x: 0, y: 0 },
  })
  const [filterMode, setFilterMode] = useState<"category" | "company">("category")

  const { showNotification } = useNotification()

  // Auto-dismiss messages
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [errorMessage])

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [successMessage])

  // Update modal state when prop changes
  useEffect(() => {
    if (isAddModalOpen) {
      setIsProductModalOpen(true)
    }
  }, [isAddModalOpen])

  // Get unique categories from products (sorted by product count)
  const categories = useMemo(() => {
    const categoryCount = products.reduce(
      (acc, product) => {
        const category = product.category || "Uncategorized"
        acc[category] = (acc[category] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const sortedCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .map(([category]) => category)

    return ["All", ...sortedCategories]
  }, [products])

  // Get unique companies from products (sorted by product count)
  const companies = useMemo(() => {
    const companyCount = products.reduce(
      (acc, product) => {
        const company = product.company_name || "No Company"
        acc[company] = (acc[company] || 0) + 1
        return acc
      },
      {} as Record<string, number>,
    )

    const sortedCompanies = Object.entries(companyCount)
      .sort(([, a], [, b]) => b - a)
      .map(([company]) => company)

    return ["All", ...sortedCompanies]
  }, [products])

  // Filter categories/companies based on search
  const filteredItems = useMemo(() => {
    const items = filterMode === "category" ? categories : companies
    if (!filterSearch.trim()) return items
    return items.filter((item) => item.toLowerCase().includes(filterSearch.toLowerCase()))
  }, [categories, companies, filterMode, filterSearch])

  // Filter products based on search, category, and company
  const filteredProducts = useMemo(() => {
    let filtered = products

    // Filter by category
    if (selectedCategory !== "All") {
      filtered = filtered.filter((product) => (product.category || "Uncategorized") === selectedCategory)
    }

    // Filter by company
    if (selectedCompany !== "All") {
      filtered = filtered.filter((product) => (product.company_name || "No Company") === selectedCompany)
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (product) =>
          product.name.toLowerCase().includes(searchLower) ||
          product.category?.toLowerCase().includes(searchLower) ||
          product.company_name?.toLowerCase().includes(searchLower) ||
          product.barcode?.toLowerCase().includes(searchLower) ||
          product.shelf?.toLowerCase().includes(searchLower) ||
          product.id.toString().includes(searchLower),
      )
    }

    return filtered
  }, [products, searchTerm, selectedCategory, selectedCompany])

  // Get count for current filter items
  const getItemCount = useCallback(
    (item: string) => {
      if (item === "All") return products.length
      if (filterMode === "category") {
        return products.filter((p) => (p.category || "Uncategorized") === item).length
      } else {
        return products.filter((p) => (p.company_name || "No Company") === item).length
      }
    },
    [products, filterMode],
  )

  // Fetch products function
  const fetchProducts = useCallback(async () => {
    if (!userId) return

    try {
      dispatch(setLoading(true))

      // Fetch products
      const result = await getProducts(userId)
      if (result.success) {
        dispatch(setProducts(result.data))
        dispatch(setError(null))
      } else {
        dispatch(setProducts([]))
        dispatch(setError(result.message || "Failed to load products"))
        setErrorMessage(result.message || "Failed to load products")
      }
    } catch (error) {
      console.error("Error fetching products:", error)
      dispatch(setProducts([]))
      dispatch(setError("Failed to load products. Please try again later."))
      setErrorMessage("Failed to load products. Please try again later.")
    } finally {
      dispatch(setLoading(false))
    }
  }, [userId, dispatch])

  // Initial load
  useEffect(() => {
    if (products.length === 0) {
      fetchProducts()
    }
  }, [fetchProducts, products.length])

  // Manual refresh - clear Redux and refetch
  const handleRefresh = () => {
    dispatch(clearProducts())
    setSelectedCategory("All")
    setSelectedCompany("All")
    fetchProducts()
  }

  // Handle filter mode change
  const handleFilterModeChange = (mode: "category" | "company") => {
    setFilterMode(mode)
    setFilterSearch("")
    if (mode === "category") {
      setSelectedCompany("All")
    } else {
      setSelectedCategory("All")
    }
  }

  // Handle item selection
  const handleItemSelect = (item: string) => {
    if (filterMode === "category") {
      setSelectedCategory(item)
      setSelectedCompany("All")
    } else {
      setSelectedCompany(item)
      setSelectedCategory("All")
    }
  }

  const handleProductClick = (product: any, event: React.MouseEvent) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    setPopupState({
      isOpen: true,
      product,
      position: {
        x: event.clientX,
        y: event.clientY,
      },
    })
  }

  const handleViewProduct = (product: any) => {
    setSelectedProduct(product)
    setIsViewModalOpen(true)
  }

  const handleEditProduct = (product: any) => {
    setSelectedProduct(product)
    setIsEditModalOpen(true)
  }

  const handleAdjustStock = (product: any) => {
    setSelectedProduct(product)
    setIsAdjustStockModalOpen(true)
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
        setSuccessMessage("Product deleted successfully")
        showNotification("success", "Product deleted successfully")
        dispatch(removeProduct(selectedProduct.id))
      } else {
        setErrorMessage(result.message || "Failed to delete product")
        showNotification("error", result.message || "Failed to delete product")
      }
    } catch (error) {
      console.error("Delete product error:", error)
      setErrorMessage("An unexpected error occurred")
      showNotification("error", "An unexpected error occurred")
    } finally {
      setIsDeleting(false)
      setIsDeleteModalOpen(false)
    }
  }

  const handleModalClose = () => {
    setIsProductModalOpen(false)
    if (onModalClose) onModalClose()
  }

  const handleProductAdded = (product: any) => {
    dispatch(addProduct(product))
    setSuccessMessage("Product added successfully")
  }

  const handleProductUpdated = (updatedProduct: any) => {
    dispatch(updateProduct(updatedProduct))
    setSuccessMessage("Product updated successfully")
  }

  const handleStockAdjusted = (updatedProduct: any) => {
    dispatch(updateProduct(updatedProduct))
    setSuccessMessage("Stock adjusted successfully")
  }

  const handleClearSearch = () => {
    dispatch(setSearchTerm(""))
  }

  const handleSearchChange = (value: string) => {
    dispatch(setSearchTerm(value))
  }

 return (
    <div className="flex flex-col lg:flex-row h-full gap-4">
      {/* Main Products Area - Full width on mobile, 75% on desktop */}
      <div className="flex-1 space-y-4">
        {/* Header with Search */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 rounded-xl p-4 text-white shadow-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <Package className="h-6 w-6 flex-shrink-0" />
              <h1 className="text-lg sm:text-xl font-semibold">Product Management</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setPrivacyMode(!privacyMode)}
                size="sm"
                variant="secondary"
                className={`${
                  privacyMode
                    ? "bg-red-500/20 hover:bg-red-500/30 text-red-100 border-red-300/30"
                    : "bg-green-500/20 hover:bg-green-500/30 text-green-100 border-green-300/30"
                } backdrop-blur-sm transition-all`}
              >
                {privacyMode ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                {privacyMode ? "Privacy On" : "Privacy Off"}
              </Button>
              <Button
                onClick={() =>
                  exportProductsToPDF(
                    filteredProducts,
                    `products_report_${new Date().toISOString().split("T")[0]}.pdf`,
                    currency,
                  )
                }
                size="sm"
                variant="secondary"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm text-xs sm:text-sm"
                disabled={filteredProducts.length === 0}
              >
                <Download className="h-4 w-4 mr-1 flex-shrink-0" />
                <span className="hidden sm:inline">Export</span>
              </Button>
              <Button
                onClick={handleRefresh}
                size="sm"
                variant="secondary"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm text-xs sm:text-sm"
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1 flex-shrink-0 ${isLoading ? "animate-spin" : ""}`} />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              {/* Mobile Add Product Button */}
              <Button
                onClick={() => setIsProductModalOpen(true)}
                size="sm"
                variant="secondary"
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm text-xs sm:text-sm lg:hidden"
              >
                <Plus className="h-4 w-4 mr-1 flex-shrink-0" />
                <span className="hidden sm:inline">Add Product</span>
              </Button>
            </div>
          </div>

          {/* Search in Header */}
          <div className="relative max-w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/70 flex-shrink-0" />
            <Input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-10 pr-10 h-9 text-sm bg-white/10 border-white/20 text-white placeholder:text-white/70 focus:bg-white/20 backdrop-blur-sm w-full"
            />
            {searchTerm && (
              <button
                onClick={handleClearSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 hover:text-white transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Mobile Filter Section */}
        <div className="lg:hidden bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
          {/* Filter Mode Tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1 mb-4">
            <button
              onClick={() => handleFilterModeChange("category")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                filterMode === "category"
                  ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <Filter className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Categories</span>
              <span className="sm:hidden">Cat.</span>
            </button>
            <button
              onClick={() => handleFilterModeChange("company")}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                filterMode === "company"
                  ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
              }`}
            >
              <Building2 className="h-4 w-4 flex-shrink-0" />
              <span className="hidden sm:inline">Companies</span>
              <span className="sm:hidden">Co.</span>
            </button>
          </div>

          {/* Filter Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <Input
              type="text"
              placeholder={`Search ${filterMode === "category" ? "categories" : "companies"}...`}
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="pl-8 pr-8 h-8 text-xs border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
            />
            {filterSearch && (
              <button
                onClick={() => setFilterSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Filter Items - Horizontal Scrollable on Mobile */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {filteredItems.map((item) => {
              const count = getItemCount(item)
              const isSelected = filterMode === "category" ? selectedCategory === item : selectedCompany === item

              return (
                <button
                  key={item}
                  onClick={() => handleItemSelect(item)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex-shrink-0 ${
                    isSelected
                      ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                      : "bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600"
                  }`}
                >
                  <span className="truncate max-w-24">
                    {item === "All"
                      ? `All ${filterMode === "category" ? "Cat." : "Co."}`
                      : item || `No ${filterMode === "category" ? "Cat." : "Co."}`}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded-full ${
                      isSelected
                        ? "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200"
                        : "bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Error and Success Messages */}
        {errorMessage && (
          <FormAlert
            variant="destructive"
            title="Error"
            message={errorMessage}
            onDismiss={() => setErrorMessage(null)}
          />
        )}

        {successMessage && (
          <FormAlert
            variant="success"
            title="Success"
            message={successMessage}
            onDismiss={() => setSuccessMessage(null)}
          />
        )}

        {/* Products Table/List - Responsive */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Product
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Retail Price
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Wholesale Price
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Stock
                  </th>
                  <th className="text-left p-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading && products.length === 0 ? (
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i}>
                      <td className="p-3">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-4 w-20" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-4 w-12" />
                      </td>
                      <td className="p-3">
                        <Skeleton className="h-6 w-20" />
                      </td>
                    </tr>
                  ))
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500 dark:text-gray-400">
                      {searchTerm || selectedCategory !== "All" || selectedCompany !== "All"
                        ? "No products found"
                        : "No products available"}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr
                      key={product.id}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                      onClick={(e) => handleProductClick(product, e)}
                    >
                      <td className="p-3">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-gray-100 text-sm">{product.name}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {product.company_name || "No company"}
                          </div>
                          {product.shelf && (
                            <div className="text-xs text-gray-400 dark:text-gray-500">Shelf: {product.shelf}</div>
                          )}
                          <div className="text-xs text-gray-400 dark:text-gray-500">
                            {product.barcode || product.id}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          {product.category || "Uncategorized"}
                        </span>
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {currency} {Number(product.price).toFixed(2)}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {privacyMode ? (
                          <span className="text-gray-400 dark:text-gray-500">***</span>
                        ) : (
                          `${currency} ${Number(product.wholesale_price || 0).toFixed(2)}`
                        )}
                      </td>
                      <td className="p-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                        {privacyMode ? <span className="text-gray-400 dark:text-gray-500">***</span> : product.stock}
                      </td>
                      <td className="p-3">
                        {privacyMode ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            *** Status
                          </span>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                              product.stock === 0
                                ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                                : product.stock <= 5
                                  ? "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200"
                                  : "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                            }`}
                          >
                            {product.stock === 0 ? "Out of Stock" : product.stock <= 5 ? "Low Stock" : "In Stock"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile List View */}
          <div className="lg:hidden">
            {isLoading && products.length === 0 ? (
              <div className="space-y-4 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-6 w-20" />
                    </div>
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-20" />
                      <div className="flex justify-between">
                        <Skeleton className="h-4 w-16" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                {searchTerm || selectedCategory !== "All" || selectedCompany !== "All"
                  ? "No products found"
                  : "No products available"}
              </div>
            ) : (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredProducts.map((product) => (
                  <div
                    key={product.id}
                    className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
                    onClick={(e) => handleProductClick(product, e)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm truncate">
                          {product.name}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {product.company_name || "No company"}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {product.barcode || product.id}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-4">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            product.stock === 0
                              ? "bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200"
                              : product.stock <= 5
                                ? "bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200"
                                : "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
                          }`}
                        >
                          {product.stock === 0 ? "Out of Stock" : product.stock <= 5 ? "Low Stock" : "In Stock"}
                        </span>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                          {product.category || "Uncategorized"}
                        </span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Retail</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {currency} {Number(product.price).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Wholesale</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">
                          {currency} {Number(product.wholesale_price || 0).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Stock</p>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{product.stock}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Sidebar - Hidden on mobile */}
      <div className="hidden lg:block w-80">
        <Card className="border-gray-200 dark:border-gray-700 shadow-sm h-full bg-white dark:bg-gray-800">
          <CardContent className="p-4 space-y-4">
            {/* Add Product Button */}
            <Button
              onClick={() => setIsProductModalOpen(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 dark:from-blue-700 dark:to-blue-800 dark:hover:from-blue-800 dark:hover:to-blue-900 h-9 text-sm shadow-md"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Product
            </Button>

            {/* Filter Mode Tabs */}
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => handleFilterModeChange("category")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  filterMode === "category"
                    ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                <Filter className="h-4 w-4" />
                Categories
              </button>
              <button
                onClick={() => handleFilterModeChange("company")}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all ${
                  filterMode === "company"
                    ? "bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-sm"
                    : "text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                }`}
              >
                <Building2 className="h-4 w-4" />
                Companies
              </button>
            </div>

            {/* Filter Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <Input
                type="text"
                placeholder={`Search ${filterMode === "category" ? "categories" : "companies"}...`}
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                className="pl-8 pr-8 h-8 text-xs border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
              />
              {filterSearch && (
                <button
                  onClick={() => setFilterSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Filter Items List */}
            <div className="max-h-96 overflow-y-auto space-y-1">
              {filteredItems.map((item) => {
                const count = getItemCount(item)
                const isSelected = filterMode === "category" ? selectedCategory === item : selectedCompany === item

                return (
                  <button
                    key={item}
                    onClick={() => handleItemSelect(item)}
                    className={`w-full flex items-center justify-between p-2 rounded-md text-left transition-all text-sm ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700 border border-transparent text-gray-700 dark:text-gray-300"
                    }`}
                  >
                    <span className="font-medium truncate">
                      {item === "All"
                        ? `All ${filterMode === "category" ? "Categories" : "Companies"}`
                        : item || `No ${filterMode === "category" ? "Category" : "Company"}`}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ml-2 ${
                        isSelected
                          ? "bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-200"
                          : "bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <NewProductModal
        isOpen={isProductModalOpen}
        onClose={handleModalClose}
        onSuccess={handleProductAdded}
        userId={userId}
      />

      {selectedProduct && (
        <ViewProductModal
          isOpen={isViewModalOpen}
          onClose={() => setIsViewModalOpen(false)}
          product={selectedProduct}
          onAdjustStock={() => {
            setIsViewModalOpen(false)
            setIsAdjustStockModalOpen(true)
          }}
          currency={currency}
          privacyMode={privacyMode}
        />
      )}

      {selectedProduct && (
        <EditProductModal
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          product={selectedProduct}
          onSuccess={handleProductUpdated}
          userId={userId}
        />
      )}

      {selectedProduct && (
        <AdjustStockModal
          isOpen={isAdjustStockModalOpen}
          onClose={() => setIsAdjustStockModalOpen(false)}
          product={selectedProduct}
          userId={userId}
          currency={currency}
          onSuccess={handleStockAdjusted}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <AlertDialogContent>
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
      
      {/* Product Action Popup */}
      <ProductActionPopup
        isOpen={popupState.isOpen}
        onClose={() => setPopupState((prev) => ({ ...prev, isOpen: false }))}
        product={popupState.product}
        position={popupState.position}
        onView={() => handleViewProduct(popupState.product)}
        onEdit={() => handleEditProduct(popupState.product)}
        onAdjustStock={() => handleAdjustStock(popupState.product)}
        onPrint={() => printBarcodeSticker(popupState.product, currency)}
        onDelete={() => handleDeleteProduct(popupState.product)}
      />
    </div>
  )
}