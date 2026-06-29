"use client"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Check, ChevronsUpDown, Plus, Loader2, Search, X, Package, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { getProducts } from "@/app/actions/product-actions"
import { getDeviceServices } from "@/app/actions/service-actions"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"

interface ProductSelectSimpleProps {
  id?: string
  value: number | null
  onChange: (value: number, name: string, price: number, wholesalePrice?: number, stock?: number) => void
  onAddNew: () => void
  onAddNewService?: () => void
  userId?: number
  refreshTrigger?: boolean
  onRefreshComplete?: () => void
  usePriceType?: "retail" | "wholesale"
  allowServices?: boolean
  searchBufferSize?: number
}

// Helper: truncate names
const truncateName = (name: string) => {
  if (name.length > 30) return name.substring(0, 27) + "..."
  return name
}

// Debounce hook
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// Helper: normalize string for search
const normalize = (str: string) =>
  (str || "").toLowerCase().replace(/\s+/g, "").trim()

export default function ProductSelectSimple({
  id,
  value,
  onChange,
  onAddNew,
  onAddNewService,
  userId = 1,
  refreshTrigger = false,
  onRefreshComplete,
  usePriceType = "retail",
  allowServices = true,
  searchBufferSize = 50,
}: ProductSelectSimpleProps) {
  const deviceId = useSelector(selectDeviceId)
  const [open, setOpen] = useState(false)
  const [services, setServices] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [localSearchTerm, setLocalSearchTerm] = useState("")
  const [isServiceMode, setIsServiceMode] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState<any>(null)
  const [hasSearched, setHasSearched] = useState(false)

  const debouncedSearchTerm = useDebounce(localSearchTerm, 300)

  // Fetch services on mount
  useEffect(() => {
    if (allowServices && services.length === 0) {
      fetchServices()
    }
  }, [allowServices])

  // Search products
  useEffect(() => {
    if (debouncedSearchTerm.trim() !== "" && !isServiceMode && open) {
      searchProducts(debouncedSearchTerm)
      setHasSearched(true)
    } else if (debouncedSearchTerm.trim() === "" && !isServiceMode) {
      setProducts([])
      setHasSearched(false)
    }
  }, [debouncedSearchTerm, isServiceMode, open, userId])

  // Refresh trigger
  useEffect(() => {
    if (refreshTrigger) {
      if (allowServices) fetchServices()
      if (debouncedSearchTerm.trim() !== "" && !isServiceMode) {
        searchProducts(debouncedSearchTerm)
      }
      if (onRefreshComplete) onRefreshComplete()
    }
  }, [refreshTrigger, onRefreshComplete, allowServices, debouncedSearchTerm, isServiceMode])

  // Handle selected product - FIXED: Added proper dependency and cleanup
  useEffect(() => {
    if (value) {
      if (isServiceMode) {
        const service = services.find((s) => s.id === value)
        if (service && (!selectedProduct || selectedProduct.id !== value)) {
          setSelectedProduct(service)
        }
      } else {
        const product = products.find((p) => p.id === value)
        if (product && (!selectedProduct || selectedProduct.id !== value)) {
          setSelectedProduct(product)
        } else if (!hasSearched && (!selectedProduct || selectedProduct.id !== value)) {
          fetchSelectedProduct(value)
        }
      }
    } else {
      setSelectedProduct(null)
    }
  }, [value, products, services, isServiceMode, hasSearched, selectedProduct])

  // Search products with normalization
  const searchProducts = async (searchTerm: string) => {
    if (loading) return
    try {
      setLoading(true)

      const searchNorm = normalize(searchTerm)

      // Try backend API
      let result = await getProducts(userId, searchBufferSize, searchTerm)

      // If no backend result → client-side filtering
      if (!result.success || result.data.length === 0) {
        const broadResult = await getProducts(userId, searchBufferSize * 2, "")

        if (broadResult.success && broadResult.data.length > 0) {
          const filteredProducts = broadResult.data.filter((product: any) => {
            return (
              normalize(String(product.name)).includes(searchNorm) ||
              normalize(String(product.company_name)).includes(searchNorm) ||
              (product.barcode && normalize(String(product.barcode)).includes(searchNorm))
            )
          })

          result = {
            success: true,
            data: filteredProducts.slice(0, searchBufferSize),
          }
        }
      }

      if (result.success) {
        setProducts(result.data)
      } else {
        console.error("Failed to search products:", result.message)
        setProducts([])
      }
    } catch (error) {
      console.error("Error searching products:", error)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const fetchSelectedProduct = async (productId: number) => {
    try {
      const result = await getProducts(userId, 1, productId.toString())
      if (result.success && result.data.length > 0) {
        const product = result.data[0]
        setSelectedProduct(product)
        
        // Also update the parent with the correct product details
        const finalPrice = usePriceType === "wholesale" && product.wholesale_price ? product.wholesale_price : product.price
        onChange(Number(product.id), String(product.name), Number(finalPrice), product.wholesale_price != null ? Number(product.wholesale_price) : undefined, product.stock != null ? Number(product.stock) : undefined)
      }
    } catch (error) {
      console.error("Error fetching selected product:", error)
    }
  }

  const fetchServices = async () => {
    if (!deviceId || !allowServices) return
    try {
      const result = await getDeviceServices(deviceId)
      if (result.success) {
        setServices(result.data)
      } else {
        console.error("Failed to load services:", result.message)
      }
    } catch (error) {
      console.error("Error fetching services:", error)
    }
  }

  const items = isServiceMode ? services : products

  const filteredItems =
    isServiceMode && localSearchTerm.trim() !== ""
      ? services.filter(
          (item) =>
            normalize(item.name).includes(normalize(localSearchTerm)) ||
            (item.category && normalize(item.category).includes(normalize(localSearchTerm)))
        )
      : items

  const handleItemSelect = (
    itemId: number,
    itemName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number
  ) => {
    const selectedItem = items.find(item => item.id === itemId)
    
    // Use the actual item data from the list to ensure consistency
    if (selectedItem) {
      setSelectedProduct(selectedItem)
    } else {
      // Fallback to the passed data
      setSelectedProduct({
        id: itemId,
        name: itemName,
        price,
        wholesale_price: wholesalePrice,
        stock,
      })
    }

    if (isServiceMode) {
      onChange(itemId, itemName, price, 0, 999)
    } else {
      const finalPrice = usePriceType === "wholesale" && wholesalePrice ? wholesalePrice : price
      onChange(itemId, itemName, finalPrice, wholesalePrice, stock)
    }

    setOpen(false)
    setLocalSearchTerm("")
  }

  const handleDialogOpen = () => {
    setOpen(true)
    // Reset search when opening dialog to show recent products
    if (!isServiceMode && !localSearchTerm) {
      searchProducts("")
    }
  }

  const handleDialogClose = () => {
    setOpen(false)
    setLocalSearchTerm("")
    setProducts([])
    setHasSearched(false)
  }

  const handleAddNew = () => {
    setOpen(false)
    if (isServiceMode && onAddNewService) onAddNewService()
    else onAddNew()
  }

  const handleModeSwitch = (checked: boolean) => {
    setIsServiceMode(checked)
    setLocalSearchTerm("")
    setProducts([])
    setHasSearched(false)
    setSelectedProduct(null) // Clear selection when switching modes
  }

  return (
    <div className="relative w-full">
      <Button
        id={id}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between h-9 bg-white border-gray-300 text-gray-900"
        type="button"
        onClick={handleDialogOpen}
      >
        <div className="flex items-center min-w-0 flex-1">
          {selectedProduct ? (
            <>
              {isServiceMode || (selectedProduct && "category" in selectedProduct) ? (
                <Wrench className="mr-2 h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <Package className="mr-2 h-4 w-4 text-blue-600 flex-shrink-0" />
              )}
              <span className="truncate" title={selectedProduct.name}>
                {truncateName(selectedProduct.name)}
              </span>
            </>
          ) : (
            <>
              {isServiceMode ? (
                <Wrench className="mr-2 h-4 w-4 text-green-600 flex-shrink-0" />
              ) : (
                <Package className="mr-2 h-4 w-4 text-blue-600 flex-shrink-0" />
              )}
              <span className="truncate">Select {isServiceMode ? "service" : "product"}...</span>
            </>
          )}
        </div>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md p-0 gap-0 bg-white border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 p-4 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              Select {isServiceMode ? "Service" : "Product"}
            </h2>
          </div>

          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder={`Search ${isServiceMode ? "services" : "products"}...`}
                  className="pl-9 bg-white border-gray-300 text-gray-900"
                  value={localSearchTerm}
                  onChange={(e) => setLocalSearchTerm(e.target.value)}
                  autoFocus
                />
                {localSearchTerm && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setLocalSearchTerm("")}
                  >
                    <X className="h-3 w-3" />
                    <span className="sr-only">Clear search</span>
                  </Button>
                )}
              </div>

              {allowServices && (
                <div className="flex items-center space-x-2">
                  <Switch id="service-mode" checked={isServiceMode} onCheckedChange={handleModeSwitch} />
                  <Label
                    htmlFor="service-mode"
                    className="flex items-center gap-2 cursor-pointer text-gray-700"
                  >
                    {isServiceMode ? (
                      <>
                        <Wrench className="h-4 w-4 text-green-600" />
                        <span>Services</span>
                      </>
                    ) : (
                      <>
                        <Package className="h-4 w-4 text-blue-600" />
                        <span>Products</span>
                      </>
                    )}
                  </Label>
                </div>
              )}
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto bg-white">
            {loading ? (
              <div className="py-8 text-center">
                <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-600" />
                <p className="text-sm text-gray-500 mt-2">
                  Searching {isServiceMode ? "services" : "products"}...
                </p>
              </div>
            ) : !hasSearched && !isServiceMode && localSearchTerm.trim() === "" ? (
              <div className="p-4 text-center">
                <Search className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">Start typing to search products...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-center">
                <p className="py-3 text-sm text-gray-500">
                  No {isServiceMode ? "services" : "products"} found.
                </p>
              </div>
            ) : (
              <div className="p-1">
                <div className="text-xs font-medium text-gray-500 px-3 py-2">
                  {isServiceMode ? "Services" : "Products"} ({filteredItems.length}
                  {!isServiceMode && filteredItems.length === searchBufferSize ? "+" : ""})
                </div>
                <div>
                  {filteredItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={cn(
                        "relative flex w-full cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm outline-none hover:bg-gray-100 text-left text-gray-900 font-normal",
                        value === item.id && "bg-blue-50"
                      )}
                      onClick={() =>
                        handleItemSelect(
                          item.id,
                          item.name,
                          item.price,
                          isServiceMode ? 0 : item.wholesale_price,
                          isServiceMode ? 999 : item.stock
                        )
                      }
                    >
                      <Check className={cn("mr-2 h-4 w-4", value === item.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex items-center gap-2 flex-1">
                        {isServiceMode ? (
                          <Wrench className="h-4 w-4 text-green-600 flex-shrink-0" />
                        ) : (
                          <Package className="h-4 w-4 text-blue-600 flex-shrink-0" />
                        )}
                        <div className="flex flex-col flex-1 min-w-0">
                          <span className="text-gray-900 truncate" title={item.name}>
                            {item.name}
                          </span>
                          <span className="text-xs text-gray-500 truncate">
                            {!isServiceMode && item.company_name && `Company: ${item.company_name} • `}
                            Price: {item.price}
                            {!isServiceMode && item.wholesale_price > 0 && ` • Wholesale: ${item.wholesale_price}`}
                            {!isServiceMode && item.barcode && ` • Barcode: ${item.barcode}`}
                            {!isServiceMode && ` • Stock: ${item.stock || 0}`}
                            {isServiceMode && item.category && ` • Category: ${item.category}`}
                          </span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 p-4 bg-gray-50">
            <Button
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-100 bg-transparent"
              onClick={handleAddNew}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add New {isServiceMode ? "Service" : "Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
