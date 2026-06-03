"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { getProducts, updateProductPlatformStatus } from "@/app/actions/product-actions"
import { Loader2, RefreshCw, Store, Search } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

type PlatformKey = "amazon" | "flipkart" | "meesho" | "own_ecom"
type PlatformStatus = "not_listed" | "active" | "archived"

const PLATFORM_OPTIONS: { key: PlatformKey; label: string }[] = [
  { key: "amazon", label: "Amazon" },
  { key: "flipkart", label: "Flipkart" },
  { key: "meesho", label: "Meesho" },
  { key: "own_ecom", label: "Own Ecom" },
]

const STATUS_OPTIONS: { key: PlatformStatus; label: string }[] = [
  { key: "not_listed", label: "Not Listed" },
  { key: "active", label: "Active" },
  { key: "archived", label: "Archived" },
]

interface PlatformTabProps {
  userId: number
}

export default function PlatformTab({ userId }: PlatformTabProps) {
  const { toast } = useToast()
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [platformFilter, setPlatformFilter] = useState<"all" | PlatformKey>("all")
  const [statusFilter, setStatusFilter] = useState<"all" | PlatformStatus>("active")
  const [updatingKey, setUpdatingKey] = useState<string | null>(null)

  const fetchProducts = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      const result = await getProducts(userId)
      if (result.success) {
        setProducts(result.data || [])
      } else {
        toast({ title: "Error", description: result.message || "Failed to load products", variant: "destructive" })
      }
    } catch {
      toast({ title: "Error", description: "Failed to load products", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [userId, toast])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const filteredProducts = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return products.filter((product) => {
      if (search) {
        const matchesSearch =
          product.name?.toLowerCase().includes(search) ||
          product.barcode?.toLowerCase().includes(search) ||
          String(product.id).includes(search)
        if (!matchesSearch) return false
      }

      if (platformFilter !== "all" && statusFilter !== "all") {
        return (product[`${platformFilter}_status`] || "not_listed") === statusFilter
      }

      if (platformFilter !== "all") return true

      if (statusFilter !== "all") {
        return PLATFORM_OPTIONS.some((platform) => (product[`${platform.key}_status`] || "not_listed") === statusFilter)
      }

      return true
    })
  }, [products, searchTerm, platformFilter, statusFilter])

  const updateStatus = async (productId: number, platform: PlatformKey, status: PlatformStatus) => {
    const key = `${productId}-${platform}`
    setUpdatingKey(key)
    try {
      const result = await updateProductPlatformStatus(productId, platform, status, userId)
      if (!result.success) {
        toast({
          title: "Update failed",
          description: result.message || "Failed to update platform status",
          variant: "destructive",
        })
        return
      }

      setProducts((prev) =>
        prev.map((product) =>
          product.id === productId
            ? {
                ...product,
                [`${platform}_status`]: status,
              }
            : product,
        ),
      )
    } finally {
      setUpdatingKey(null)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Marketplace Management</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Track product status in Amazon, Flipkart, Meesho, and your own ecommerce store.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={fetchProducts}
              className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, barcode, or ID"
                className="pl-8 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
              />
            </div>
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value as "all" | PlatformKey)}
              className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Platforms</option>
              {PLATFORM_OPTIONS.map((platform) => (
                <option key={platform.key} value={platform.key}>
                  {platform.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | PlatformStatus)}
              className="h-10 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="all">All Status</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status.key} value={status.key}>
                  {status.label}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <Store className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No products found for this filter.
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      Product
                    </th>
                    {PLATFORM_OPTIONS.map((platform) => (
                      <th
                        key={platform.key}
                        className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase"
                      >
                        {platform.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-900">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                      <td className="px-4 py-3 text-sm">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{product.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          #{product.id} {product.barcode ? `• ${product.barcode}` : ""}
                        </div>
                      </td>
                      {PLATFORM_OPTIONS.map((platform) => {
                        const currentStatus = (product[`${platform.key}_status`] || "not_listed") as PlatformStatus
                        const key = `${product.id}-${platform.key}`
                        return (
                          <td key={platform.key} className="px-4 py-3">
                            <select
                              value={currentStatus}
                              disabled={updatingKey === key}
                              onChange={(e) =>
                                updateStatus(product.id, platform.key, e.target.value as PlatformStatus)
                              }
                              className="h-8 w-full min-w-[120px] rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 text-xs text-gray-900 dark:text-gray-100"
                            >
                              {STATUS_OPTIONS.map((status) => (
                                <option key={status.key} value={status.key}>
                                  {status.label}
                                </option>
                              ))}
                            </select>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
