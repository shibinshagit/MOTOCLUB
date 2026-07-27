"use client"
import React, { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Check, ChevronsUpDown, Plus, Loader2, Search, X, Package, Wrench, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { getProducts } from "@/app/actions/product-actions"
import { getDeviceServices } from "@/app/actions/service-actions"
import { getCategories } from "@/app/actions/category-actions"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"

interface ProductSelectSimpleProps {
  id?: string
  value: number | null
  onChange: (value: number, name: string, price: number, wholesalePrice?: number, stock?: number, productObj?: any) => void
  onAddNew?: () => void
  onAddNewService?: () => void
  userId?: number
  refreshTrigger?: boolean
  onRefreshComplete?: () => void
  usePriceType?: "retail" | "wholesale"
  allowServices?: boolean
  searchBufferSize?: number
  error?: string
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

function ProductSelectSimple({
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
  error,
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
  const [categories, setCategories] = useState<any[]>([])
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null)
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)

  const debouncedSearchTerm = useDebounce(localSearchTerm, 300)

  // Fetch services on mount
  useEffect(() => {
    if (allowServices && services.length === 0) {
      fetchServices()
    }
  }, [allowServices])

  // Fetch categories when dialog opens
  useEffect(() => {
    if (open && !isServiceMode) {
      fetchCategories()
    }
  }, [open, isServiceMode])

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

  // Reload products when category changes
  useEffect(() => {
    if (open && !isServiceMode) {
      if (debouncedSearchTerm.trim() !== "") {
        searchProducts(debouncedSearchTerm)
      } else if (selectedCategoryId !== null) {
        // Load products for selected category even without search term
        searchProducts("")
        setHasSearched(true)
      }
    }
  }, [selectedCategoryId])

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

      // Try backend API with category filter
      let result = await getProducts(userId, searchBufferSize, searchTerm, selectedCategoryId)

      // If no backend result → client-side filtering
      if (!result.success || result.data.length === 0) {
        const broadResult = await getProducts(userId, searchBufferSize * 2, "", selectedCategoryId)

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
        onChange(Number(product.id), String(product.name), Number(finalPrice), product.wholesale_price != null ? Number(product.wholesale_price) : undefined, product.stock != null ? Number(product.stock) : undefined, product)
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

  const fetchCategories = async () => {
    setLoadingCategories(true)
    try {
      const result = await getCategories(userId)
      if (result.success && result.data) {
        setCategories(result.data)
      } else {
        console.error("Failed to load categories:", result.message)
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
    } finally {
      setLoadingCategories(false)
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
    stock?: number,
    fullItem?: any
  ) => {
    const selectedItem = fullItem || items.find(item => item.id === itemId)
    
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
      onChange(itemId, itemName, price, 0, 999, selectedItem)
    } else {
      const finalPrice = usePriceType === "wholesale" && wholesalePrice ? wholesalePrice : price
      onChange(itemId, itemName, finalPrice, wholesalePrice, stock, selectedItem)
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
    setSelectedCategoryId(null)
  }

  const handleAddNew = () => {
    setOpen(false)
    if (isServiceMode && onAddNewService) onAddNewService()
    else if (onAddNew) onAddNew()
  }

  const handleModeSwitch = (checked: boolean) => {
    setIsServiceMode(checked)
    setLocalSearchTerm("")
    setProducts([])
    setHasSearched(false)
    setSelectedCategoryId(null)
    setSelectedProduct(null) // Clear selection when switching modes
  }

  const handleCategoryChange = (value: string) => {
    let newCategoryId: number | null = null;
    if (value !== "all") {
      newCategoryId = Number(value);
    }
    setSelectedCategoryId(newCategoryId);
    setCategoryOpen(false);

    // Clear currently selected product in the modal if it doesn't belong to the new category bounds
    if (selectedProduct && newCategoryId !== null) {
      if (selectedProduct.category_id !== newCategoryId) {
        setSelectedProduct(null);
      }
    }
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
      {error && <p className="text-sm font-medium text-destructive mt-1">{error}</p>}

      <Dialog open={open} onOpenChange={handleDialogClose}>
        <DialogContent className="sm:max-w-md p-0 gap-0 bg-white border border-gray-200">
          <div className="flex items-center justify-between border-b border-gray-200 p-4 bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">
              Select {isServiceMode ? "Service" : "Product"}
            </h2>
          </div>

          <div className="p-4 border-b border-gray-200 bg-white">
            <div className="space-y-3">
              {!isServiceMode && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium text-gray-700 whitespace-nowrap">Category</Label>
                  <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryOpen}
                        disabled={loadingCategories}
                        className="w-full justify-between h-9 bg-white border-gray-300 text-gray-900 overflow-hidden font-normal"
                      >
                        <span className="truncate text-left w-full flex-1">
                          {selectedCategoryId
                            ? (() => {
                                const cat = categories.find(c => c.id === selectedCategoryId);
                                return cat ? (cat.parent_name ? `${cat.parent_name} › ${cat.name}` : cat.name) : "All Categories";
                              })()
                            : "All Categories"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[350px] max-w-[90vw] p-0 bg-white border-gray-200" align="start">
                      <Command className="max-h-[300px]">
                        <CommandInput placeholder="Search categories..." className="h-9" />
                        <CommandEmpty>No categories found.</CommandEmpty>
                        <CommandList>
                          <CommandGroup>
                            <CommandItem
                              value="all"
                              onSelect={() => handleCategoryChange("all")}
                              className="cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedCategoryId === null ? "opacity-100" : "opacity-0"
                                )}
                              />
                              All Categories
                            </CommandItem>
                            {categories.map((category) => {
                              const label = category.parent_name ? `${category.parent_name} › ${category.name}` : category.name;
                              return (
                                <CommandItem
                                  key={category.id}
                                  value={label}
                                  onSelect={() => handleCategoryChange(category.id.toString())}
                                  className="cursor-pointer"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedCategoryId === category.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {label}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              )}
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
            ) : !hasSearched && !isServiceMode && localSearchTerm.trim() === "" && selectedCategoryId === null ? (
              <div className="p-4 text-center">
                <Search className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">Start typing to search products...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-4 text-center">
                <Tag className="h-8 w-8 mx-auto text-gray-400 mb-2" />
                <p className="py-3 text-sm text-gray-500">
                  {!isServiceMode && selectedCategoryId
                    ? `No products found in this category.`
                    : `No ${isServiceMode ? "services" : "products"} found.`}
                </p>
              </div>
            ) : (
              <div className="p-1">
                <div className="text-xs font-medium text-gray-500 px-3 py-2">
                  {isServiceMode ? "Services" : "Products"} ({filteredItems.length}
                  {!isServiceMode && filteredItems.length === searchBufferSize ? "+" : ""})
                  {!isServiceMode && selectedCategoryId && categories.find(c => c.id === selectedCategoryId) && (
                    <span className="ml-2 text-gray-400">
                      in {categories.find(c => c.id === selectedCategoryId)?.name}
                    </span>
                  )}
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
                          item.price ?? item.msp ?? 0,
                          isServiceMode ? 0 : (item.wholesale_price ?? item.cost_price ?? 0),
                          isServiceMode ? 999 : (item.stock ?? 0)
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
                            Price: {item.price ?? item.msp ?? 0}
                            {!isServiceMode && (item.wholesale_price || item.cost_price) && ` • Wholesale/Cost: ${item.wholesale_price ?? item.cost_price ?? 0}`}
                            {!isServiceMode && item.barcode && ` • Barcode: ${item.barcode}`}
                            {!isServiceMode && ` • Stock: ${item.stock ?? 0}`}
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

export default React.memo(ProductSelectSimple, (prev, next) => {
  return prev.value === next.value && 
         prev.userId === next.userId && 
         prev.refreshTrigger === next.refreshTrigger &&
         prev.usePriceType === next.usePriceType &&
         prev.allowServices === next.allowServices &&
         prev.error === next.error
})
