"use client"

import { useState, useEffect, useCallback } from "react"
import { getProductsToPurchase } from "@/app/actions/sale-actions"
import { Loader2, Package, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { useToast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"

interface ProductsToPurchaseTabProps {
  deviceId: number
  globalDateRange?: { from?: string; to?: string }
}

export default function ProductsToPurchaseTab({ deviceId, globalDateRange }: ProductsToPurchaseTabProps) {
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const { toast } = useToast()

  const fetchProducts = useCallback(async () => {
    if (!deviceId) return
    setLoading(true)
    try {
      const res = await getProductsToPurchase(deviceId, {
        dateFrom: globalDateRange?.from,
        dateTo: globalDateRange?.to,
      })
      if (res.success && res.data) {
        setProducts(res.data)
      } else {
        toast({ title: "Error", description: res.message || "Failed to load products", variant: "destructive" })
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [deviceId, globalDateRange, toast])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const filteredProducts = products.filter((p) => {
    const search = searchTerm.toLowerCase()
    return (
      (p.product_name || "").toLowerCase().includes(search) ||
      (p.variant_sku || "").toLowerCase().includes(search) ||
      (p.variant_name || "").toLowerCase().includes(search)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">Products to Purchase</h2>
        <Button onClick={fetchProducts} variant="outline" size="sm" disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            placeholder="Search products..."
            className="pl-8 bg-white"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <Card className="border-gray-200">
        <CardContent className="p-0">
          <div className="overflow-x-auto rounded-md">
            <table className="w-full text-sm text-left text-gray-600">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase text-gray-700">
                <tr>
                  <th className="px-4 py-3">Product Name</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3 text-right">Required Qty</th>
                  <th className="px-4 py-3 text-right">Current Stock</th>
                  <th className="px-4 py-3 text-right">Adjusted Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-gray-400" />
                    </td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      <div className="flex flex-col items-center justify-center">
                        <Package className="h-8 w-8 text-gray-300 mb-2" />
                        No products found for the selected period.
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p, idx) => {
                    const required = Number(p.required_quantity) || 0
                    const current = Number(p.current_stock) || 0
                    const adjusted = current - required
                    return (
                      <tr key={`${p.product_id}-${p.product_variant_id || 'base'}-${idx}`} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900">
                          {p.product_name}
                          {p.variant_name && p.variant_name.toLowerCase() !== "default" && (
                            <span className="text-gray-500 ml-1 block text-xs md:inline md:text-sm">
                              - {p.variant_name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {p.variant_sku || "-"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-rose-600">
                          {required}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {current}
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${adjusted < 0 ? "text-rose-600" : "text-emerald-600"}`}>
                          {adjusted}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
