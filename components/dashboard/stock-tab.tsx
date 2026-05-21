"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  History,
  Package,
  Search,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  RefreshCw,
  Loader2,
  Plus,
  Minus,
  Eye,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Package2,
  SlidersHorizontal,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { getProducts, adjustProductStock } from "@/app/actions/product-actions"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { formatCurrency } from "@/lib/utils"
import ViewProductModal from "../products/view-product-modal"
import AdjustStockModal from "../products/adjust-stock-modal"
import { exportStockToPDF } from "@/lib/pdf-export-utils"

interface StockTabProps {
  userId: number
  mockMode?: boolean
}

export default function StockTab({ userId, mockMode = false }: StockTabProps) {
  const [products, setProducts] = useState<any[]>([])
  const [filteredProducts, setFilteredProducts] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortField, setSortField] = useState<string>("name")
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc")
  const [stockFilter, setStockFilter] = useState<string>("out")
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [viewModalOpen, setViewModalOpen] = useState(false)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [quickAdjustProduct, setQuickAdjustProduct] = useState<any>(null)
  const [quickAdjustAmount, setQuickAdjustAmount] = useState<string>("1")
  const [isQuickAdjusting, setIsQuickAdjusting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    product: any
  }>({ show: false, x: 0, y: 0, product: null })
  const quickAdjustInputRef = useRef<HTMLInputElement>(null)
  const [currency, setCurrency] = useState<string>("QAR")

  const { toast } = useToast()

  // Fetch device currency
  useEffect(() => {
    const fetchCurrency = async () => {
      try {
        const deviceCurrency = await getDeviceCurrency(userId)
        setCurrency(deviceCurrency || "QAR")
      } catch (error) {
        console.error("Error fetching device currency:", error)
        setCurrency("QAR") // Default to QAR on error
      }
    }

    fetchCurrency()
  }, [userId])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu({ show: false, x: 0, y: 0, product: null })
    }

    if (contextMenu.show) {
      document.addEventListener("click", handleClickOutside)
      return () => document.removeEventListener("click", handleClickOutside)
    }
  }, [contextMenu.show])

  // Fetch products
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setIsLoading(true)
        setError(null)

        if (mockMode) {
          setProducts([])
          return
        }

        // Determine what to fetch based on current filter and search
        const searchQueryValue = searchQuery.trim()
        let limit = undefined

        // Remove the 5-item limit for "all" - show all products
        if (!searchQueryValue && stockFilter === "out") {
          limit = undefined // Fetch all out of stock products
        } else if (!searchQueryValue && stockFilter !== "all") {
          limit = undefined // Fetch all products matching the filter
        }
        // For "all" stock filter, don't set any limit - show all products

        const response = await getProducts(userId, limit, searchQueryValue)
        if (response.success) {
          setProducts(response.data)
        } else {
          setError(response.message || "Failed to load products")
          toast({
            title: "Error",
            description: response.message || "Failed to load products",
            variant: "destructive",
          })
        }
      } catch (error) {
        console.error("Error fetching products:", error)
        setError("An unexpected error occurred. Please try again later.")
        toast({
          title: "Error",
          description: "An unexpected error occurred. Please try again later.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchProducts()
  }, [userId, toast, mockMode, stockFilter, searchQuery])

  // Filter and sort products
  useEffect(() => {
    let result = [...products]

    // Apply search filter - this now works on already fetched data
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      result = result.filter(
        (product) =>
          product.name?.toLowerCase().includes(query) ||
          product.barcode?.toLowerCase().includes(query) ||
          product.category?.toLowerCase().includes(query),
      )
    }

    // Apply stock filter - this now works on already fetched data
    if (stockFilter !== "all") {
      if (stockFilter === "low") {
        result = result.filter((product) => {
          const stock = Number.parseInt(product.stock) || 0
          return stock > 0 && stock <= 5
        })
      } else if (stockFilter === "out") {
        result = result.filter((product) => {
          const stock = Number.parseInt(product.stock) || 0
          return stock <= 0
        })
      } else if (stockFilter === "in") {
        result = result.filter((product) => {
          const stock = Number.parseInt(product.stock) || 0
          return stock > 5
        })
      }
    }

    // Apply sorting
    result.sort((a, b) => {
      let valueA, valueB

      if (sortField === "name") {
        valueA = (a.name || "").toLowerCase()
        valueB = (b.name || "").toLowerCase()
      } else if (sortField === "category") {
        valueA = (a.category || "").toLowerCase()
        valueB = (b.category || "").toLowerCase()
      } else if (sortField === "price") {
        valueA = Number.parseFloat(a.price) || 0
        valueB = Number.parseFloat(b.price) || 0
      } else if (sortField === "stock") {
        valueA = Number.parseInt(a.stock) || 0
        valueB = Number.parseInt(b.stock) || 0
      } else {
        valueA = a[sortField] || ""
        valueB = b[sortField] || ""
      }

      if (valueA < valueB) return sortDirection === "asc" ? -1 : 1
      if (valueA > valueB) return sortDirection === "asc" ? 1 : -1
      return 0
    })

    setFilteredProducts(result)
  }, [products, searchQuery, sortField, sortDirection, stockFilter])

  // Handle sort toggle
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortField(field)
      setSortDirection("asc")
    }
  }

  // Get stock status badge
  const getStockStatus = (stock: number) => {
    if (stock <= 0) {
      return (
        <Badge className="bg-red-500 hover:bg-red-600 text-white font-medium text-xs px-3 py-1 rounded-md">
          Out of Stock
        </Badge>
      )
    } else if (stock < 5) {
      return (
        <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-medium text-xs px-3 py-1 rounded-md">
          Low Stock
        </Badge>
      )
    } else {
      return (
        <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-xs px-3 py-1 rounded-md">
          In Stock
        </Badge>
      )
    }
  }

  // Handle product row click for context menu
  const handleProductClick = (e: React.MouseEvent, product: any) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      product: product,
    })
  }

  // Handle quick stock adjustment
  const handleQuickAdjust = async (product: any, type: "increase" | "decrease") => {
    if (!quickAdjustAmount || isNaN(Number.parseInt(quickAdjustAmount)) || Number.parseInt(quickAdjustAmount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid quantity greater than zero",
        variant: "destructive",
      })
      return
    }

    // For decrease, check if we have enough stock
    if (type === "decrease" && Number.parseInt(quickAdjustAmount) > product.stock) {
      toast({
        title: "Error",
        description: "Cannot decrease more than current stock",
        variant: "destructive",
      })
      return
    }

    setIsQuickAdjusting(true)
    setQuickAdjustProduct(product)

    try {
      const formData = new FormData()
      formData.append("product_id", product.id.toString())
      formData.append("quantity", quickAdjustAmount)
      formData.append("type", type)
      formData.append("notes", `Quick ${type} from stock management`)
      formData.append("user_id", userId.toString())

      const result = await adjustProductStock(formData)

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        })

        // Update the product in the local state
        setProducts((prevProducts) =>
          prevProducts.map((p) =>
            p.id === product.id
              ? {
                  ...p,
                  stock:
                    type === "increase"
                      ? Number.parseInt(p.stock) + Number.parseInt(quickAdjustAmount)
                      : Number.parseInt(p.stock) - Number.parseInt(quickAdjustAmount),
                }
              : p,
          ),
        )

        setQuickAdjustAmount("1")
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to adjust stock",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Quick adjust stock error:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsQuickAdjusting(false)
      setQuickAdjustProduct(null)
    }
  }

  // Handle view product
  const handleViewProduct = (product: any) => {
    setSelectedProduct(product)
    setViewModalOpen(true)
    setContextMenu({ show: false, x: 0, y: 0, product: null })
  }

  // Handle adjust stock
  const handleAdjustStock = (product: any) => {
    setSelectedProduct(product)
    setAdjustModalOpen(true)
    setContextMenu({ show: false, x: 0, y: 0, product: null })
  }

  // Update refresh button to refetch data
  const handleRefresh = async () => {
    setIsLoading(true)
    try {
      const searchQueryValue = searchQuery.trim()
      let limit = undefined

      if (!searchQueryValue && stockFilter === "out") {
        limit = undefined
      } else if (!searchQueryValue && stockFilter !== "all") {
        limit = undefined
      }
      // For "all" stock filter, don't set any limit

      const response = await getProducts(userId, limit, searchQueryValue)
      if (response.success) {
        setProducts(response.data)
      }
    } catch (error) {
      console.error("Refresh error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Get summary stats
  const getSummaryStats = () => {
    const totalProducts = products.length
    const outOfStock = products.filter((p) => Number.parseInt(p.stock) <= 0).length
    const lowStock = products.filter((p) => {
      const stock = Number.parseInt(p.stock)
      return stock > 0 && stock <= 5
    }).length
    const inStock = products.filter((p) => Number.parseInt(p.stock) > 5).length

    return { totalProducts, outOfStock, lowStock, inStock }
  }

  const stats = getSummaryStats()

  // Toggle sidebar for mobile view
  const toggleSidebar = () => {
    setShowSidebar(!showSidebar)
  }

  // Get empty state messages based on filter
  const getEmptyStateMessages = () => {
    let title = "No products available"
    let description = "Start by adding your first product to the inventory"

    if (searchQuery) {
      title = "No products match your search"
      description = `No products match your search for "${searchQuery}"`
    } else {
      switch (stockFilter) {
        case "out":
          title = "No out of stock products found"
          description = "All products are currently in stock"
          break
        case "low":
          title = "No low stock products found"
          description = "No products have low stock levels"
          break
        case "in":
          title = "No in stock products found"
          description = "No products have sufficient stock"
          break
        case "all":
          title = "No products available"
          description = "Start by adding your first product to the inventory"
          break
        default:
          title = "No products available"
          description = "Start by adding your first product to the inventory"
          break
      }
    }

    return { title, description }
  }

  const emptyStateMessages = getEmptyStateMessages()

  return (
    <div className="relative">
      {/* Mobile toggle button - only visible on small screens */}
      <div className="lg:hidden fixed bottom-4 right-4 z-30">
        <Button
          onClick={toggleSidebar}
          className="h-12 w-12 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 flex items-center justify-center"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {/* Context Menu */}
      {contextMenu.show && (
        <div
          className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-2 min-w-[160px]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleQuickAdjust(contextMenu.product, "increase")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center gap-2"
            disabled={isQuickAdjusting}
          >
            <Plus className="h-4 w-4" />
            Increase Stock
          </button>
          <button
            onClick={() => handleQuickAdjust(contextMenu.product, "decrease")}
            className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 flex items-center gap-2"
            disabled={isQuickAdjusting || Number.parseInt(contextMenu.product?.stock || "0") <= 0}
          >
            <Minus className="h-4 w-4" />
            Decrease Stock
          </button>
          <button
            onClick={() => handleViewProduct(contextMenu.product)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 flex items-center gap-2"
          >
            <Eye className="h-4 w-4" />
            View Details
          </button>
          <button
            onClick={() => handleAdjustStock(contextMenu.product)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex items-center gap-2"
          >
            <History className="h-4 w-4" />
            Adjust Stock
          </button>
        </div>
      )}

      {/* Main container with 70/30 split */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left side - Product listing (70%) */}
        <div className={`w-full ${showSidebar ? "lg:w-[70%]" : "lg:w-full"}`}>
          <Card className="overflow-hidden rounded-2xl shadow-xl border-0 bg-white dark:bg-gray-800">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 p-4 text-white">
              <div className="flex flex-row items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                    <BarChart3 className="h-5 w-5 text-white" />
                  </div>
                  <CardTitle className="text-xl font-bold">Stock Management</CardTitle>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      exportStockToPDF(products, `stock_report_${new Date().toISOString().split("T")[0]}.pdf`, currency)
                    }
                    className="h-8 gap-2 rounded-lg bg-white/20 text-white border-white/30 hover:bg-white/30 transition-all font-medium text-xs"
                    disabled={isLoading || products.length === 0}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="lucide lucide-download"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span className="hidden sm:inline">Export</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRefresh}
                    className="h-8 gap-2 rounded-lg bg-white/20 text-white border-white/30 hover:bg-white/30 transition-all font-medium text-xs"
                    disabled={isLoading}
                  >
                    {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                    <span className="hidden sm:inline">Refresh</span>
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={toggleSidebar}
                    className="h-8 gap-2 rounded-lg bg-white/20 text-white border-white/30 hover:bg-white/30 transition-all font-medium text-xs lg:hidden"
                  >
                    <SlidersHorizontal className="h-3 w-3" />
                    <span className="hidden sm:inline">Filters</span>
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="flex flex-col items-center gap-4">
                    <div className="relative">
                      <div className="h-16 w-16 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
                      <div className="absolute top-0 left-0 h-16 w-16 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
                    </div>
                    <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">Loading products...</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500">
                      Please wait while we fetch your inventory
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div className="p-8 text-center rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 my-4 mx-6">
                  <AlertTriangle className="h-12 w-12 text-red-500 dark:text-red-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Error Loading Products</h3>
                  <p>{error}</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="p-20 text-center bg-white dark:bg-gray-800 rounded-2xl">
                  <Package className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  {searchQuery ? (
                    <>
                      <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {emptyStateMessages.title}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-6">{emptyStateMessages.description}</p>
                    </>
                  ) : (
                    <>
                      <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        {emptyStateMessages.title}
                      </h3>
                      <p className="text-gray-500 dark:text-gray-400 mb-6">{emptyStateMessages.description}</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                        <th
                          className="px-6 py-3 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group"
                          onClick={() => handleSort("name")}
                        >
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Product
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {sortField === "name" &&
                                (sortDirection === "asc" ? (
                                  <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ))}
                            </div>
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group"
                          onClick={() => handleSort("category")}
                        >
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Category
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {sortField === "category" &&
                                (sortDirection === "asc" ? (
                                  <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ))}
                            </div>
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group"
                          onClick={() => handleSort("price")}
                        >
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Retail Price
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {sortField === "price" &&
                                (sortDirection === "asc" ? (
                                  <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ))}
                            </div>
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Wholesale Price
                          </div>
                        </th>
                        <th
                          className="px-6 py-3 text-left cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors group"
                          onClick={() => handleSort("stock")}
                        >
                          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Stock
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                              {sortField === "stock" &&
                                (sortDirection === "asc" ? (
                                  <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                ))}
                            </div>
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Other Devices
                          </div>
                        </th>
                        <th className="px-6 py-3 text-left">
                          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                            Status
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {filteredProducts.map((product, index) => (
                        <tr
                          key={product.id}
                          className={`hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200 cursor-pointer ${
                            index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50/50 dark:bg-gray-700/50"
                          }`}
                          onClick={(e) => handleProductClick(e, product)}
                        >
                          <td className="px-6 py-3">
                            <div className="flex flex-col">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{product.name}</div>
                              {product.barcode && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 font-mono">
                                  {product.barcode}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="inline-flex h-5 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700 px-2 text-xs font-medium text-gray-800 dark:text-gray-200">
                              {product.category || "Uncategorized"}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {formatCurrency(Number.parseFloat(product.price) || 0, currency)}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-medium text-gray-700 dark:text-gray-300">
                              {formatCurrency(Number.parseFloat(product.wholesale_price) || 0, currency)}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div
                              className={`text-lg font-bold ${
                                Number.parseInt(product.stock) <= 0
                                  ? "text-red-600 dark:text-red-400"
                                  : Number.parseInt(product.stock) <= 5
                                    ? "text-amber-600 dark:text-amber-400"
                                    : "text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {product.stock}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-semibold text-blue-600 dark:text-blue-300">
                              {Number.parseInt(product.other_devices_stock || 0)}
                            </div>
                          </td>
                          <td className="px-6 py-3">{getStockStatus(Number.parseInt(product.stock) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right side - Summary, Search, and Filters (30%) */}
        {showSidebar && (
          <div className="w-full lg:w-[30%] lg:sticky lg:top-4 lg:self-start lg:max-h-screen lg:overflow-y-auto">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl p-4 shadow-lg border border-gray-100 dark:border-gray-700">
              {/* Section Title */}
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-bold text-gray-800 dark:text-gray-200">Inventory Summary</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSidebar}
                  className="lg:hidden h-6 w-6 p-0 rounded-full"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>

              {/* Summary Cards - Even More Compact */}
              <div className="space-y-2 mb-4">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 rounded-lg p-3 text-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setStockFilter("all")}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-blue-100">Total Products</p>
                      <p className="text-xl font-bold mt-0.5">{stats.totalProducts}</p>
                      <p className="text-xs text-blue-200 mt-0.5">Click to view all</p>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <Package2 className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>

                <div
                  className="bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-emerald-600 dark:to-emerald-700 rounded-lg p-3 text-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setStockFilter("in")}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-emerald-100">In Stock</p>
                      <p className="text-xl font-bold mt-0.5">{stats.inStock}</p>
                      <p className="text-xs text-emerald-200 mt-0.5">Click to view in stock</p>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>

                <div
                  className="bg-gradient-to-r from-amber-500 to-amber-600 dark:from-amber-600 dark:to-amber-700 rounded-lg p-3 text-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setStockFilter("low")}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-amber-100">Low Stock</p>
                      <p className="text-xl font-bold mt-0.5">{stats.lowStock}</p>
                      <p className="text-xs text-amber-200 mt-0.5">Click to view low stock</p>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <AlertTriangle className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>

                <div
                  className="bg-gradient-to-r from-red-500 to-red-600 dark:from-red-600 dark:to-red-700 rounded-lg p-3 text-white shadow-md cursor-pointer hover:scale-105 transition-transform"
                  onClick={() => setStockFilter("out")}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-red-100">Out of Stock</p>
                      <p className="text-xl font-bold mt-0.5">{stats.outOfStock}</p>
                      <p className="text-xs text-red-200 mt-0.5">Click to view out of stock</p>
                    </div>
                    <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
                      <TrendingDown className="h-4 w-4 text-white" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Search */}
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Search Products</h4>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                  <Input
                    placeholder="Name, barcode or category..."
                    className="pl-9 h-9 rounded-lg border-gray-200 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 shadow-sm text-sm text-gray-900 dark:text-gray-100"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* View Product Modal */}
      {selectedProduct && (
        <ViewProductModal
          isOpen={viewModalOpen}
          onClose={() => setViewModalOpen(false)}
          product={selectedProduct}
          onAdjustStock={() => {
            setViewModalOpen(false)
            setAdjustModalOpen(true)
          }}
          currency={currency}
          userId={userId}
        />
      )}

      {/* Adjust Stock Modal */}
      {selectedProduct && (
        <AdjustStockModal
          isOpen={adjustModalOpen}
          onClose={() => {
            setAdjustModalOpen(false)
            // Refresh the products list after adjustment
            handleRefresh()
          }}
          product={selectedProduct}
          userId={userId}
          currency={currency}
        />
      )}
    </div>
  )
}
