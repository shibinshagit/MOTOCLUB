"use client"

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Barcode,
  ChevronsUpDown,
  User,
  Calendar,
  Tag,
  ArrowLeft,
  Save,
  Loader2,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import CustomerSelectSimple from "@/components/sales/customer-select-simple"
import ProductSelectSimple from "@/components/sales/product-select-simple"
import DatePickerSimple from "@/components/sales/date-picker-simple"
import NewCustomerModal from "@/components/sales/new-customer-modal"
import NewProductModal from "@/components/sales/new-product-modal"
import { addSale } from "@/app/actions/sale-actions"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { getDatabaseHealth } from "@/app/actions/db-status-actions"
import { getProductByBarcode } from "@/app/actions/product-actions"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  total: number
}

interface ScanResult {
  status: "success" | "error"
  message: string
  barcode: string
  timestamp: Date
  productName?: string
}

export default function NewSalePage() {
  const router = useRouter()
  const [userId, setUserId] = useState<number>(1) // Default to 1, will be updated from localStorage
  const [currency, setCurrency] = useState("QAR") // Keep this as fallback
  const [date, setDate] = useState<Date>(new Date())
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string>("")
  const [status, setStatus] = useState<string>("Pending")
  const [products, setProducts] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      total: 0,
    },
  ])
  const [subtotal, setSubtotal] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dbStatus, setDbStatus] = useState<{ isHealthy: boolean; message: string; mockMode: boolean } | null>(null)
  const [isCheckingDb, setIsCheckingDb] = useState(false)
  const [scanStatus, setScanStatus] = useState<"idle" | "processing" | "success" | "error">("idle")
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([])
  const [debugInfo, setDebugInfo] = useState<string>("")
  const [showDebugInfo, setShowDebugInfo] = useState<boolean>(false)
  const [notFoundBarcode, setNotFoundBarcode] = useState<string>("")
  const [barcodeInput, setBarcodeInput] = useState<string>("")
  const [isBarcodeProcessing, setIsBarcodeProcessing] = useState<boolean>(false)
  const [productsCache, setProductsCache] = useState<Map<number, any>>(new Map())
  const [lastBarcodeProcessed, setLastBarcodeProcessed] = useState<string>("")
  const [lastInteractionTime, setLastInteractionTime] = useState<number>(Date.now())

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Modals for adding new customer/product
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false)

  const { toast } = useToast()

  // Get user ID from localStorage on component mount
  useEffect(() => {
    const storedUserId = localStorage.getItem("userId")
    if (storedUserId) {
      setUserId(Number.parseInt(storedUserId, 10))
    }

    // Check database health
    checkDbHealth()

    // Initialize the page
    initializePage()
  }, [])

  const initializePage = async () => {
    console.log("Initializing new sale page")
    const storedUserId = localStorage.getItem("userId")
    const currentUserId = storedUserId ? Number.parseInt(storedUserId, 10) : 1

    console.log("Current user ID:", currentUserId)
    setUserId(currentUserId)

    // Fetch currency
    try {
      const deviceCurrency = await getDeviceCurrency(currentUserId)
      setCurrency(deviceCurrency)
    } catch (err) {
      console.error("Error fetching currency:", err)
      setCurrency("QAR") // Fallback to QAR if fetch fails
    }

    // Focus the barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }, 100)
  }

  // Calculate totals whenever products or discount changes
  useEffect(() => {
    // Ensure we're summing numeric values only
    const newSubtotal = products.reduce((sum, product) => {
      const productTotal = typeof product.total === "number" ? product.total : 0
      return sum + productTotal
    }, 0)

    setSubtotal(newSubtotal)

    // Ensure discountAmount is a number
    const discount = typeof discountAmount === "number" ? discountAmount : 0
    setTotalAmount(Math.max(0, newSubtotal - discount))
  }, [products, discountAmount])

  // Set up keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+S shortcut to focus barcode input
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus()
        }
      }
    }

    // Add event listener for keyboard shortcut
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [])

  // Check database health
  const checkDbHealth = async () => {
    setIsCheckingDb(true)
    try {
      const status = await getDatabaseHealth()
      setDbStatus(status)
      console.log("Database health check result:", status)

      if (!status.isHealthy) {
        toast({
          title: "Database Connection Issue",
          description: "Operating in offline mode. Some features may be limited.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error checking database health:", error)
      setDbStatus({
        isHealthy: false,
        message: "Failed to check database health",
        mockMode: true,
      })
    } finally {
      setIsCheckingDb(false)
    }
  }

  // Add a new product row
  const addProductRow = () => {
    console.log("Adding new product row")
    setProducts([
      ...products,
      {
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        quantity: 1,
        price: 0,
        total: 0,
      },
    ])
  }

  // Remove a product row
  const removeProductRow = (id: string) => {
    if (products.length > 1) {
      console.log("Removing product row:", id)
      setProducts(products.filter((product) => product.id !== id))
    }
  }

  const updateProductRow = (id: string, updates: Partial<ProductRow>) => {
    console.log("Updating product row:", id, updates)
    const updatedProducts = products.map((product) => {
      if (product.id === id) {
        const updatedProduct = { ...product, ...updates }
        // Recalculate total if quantity or price changed
        if (updates.quantity !== undefined || updates.price !== undefined) {
          const quantity = Number(updatedProduct.quantity) || 0
          const price = Number(updatedProduct.price) || 0
          updatedProduct.total = quantity * price
        }
        return updatedProduct
      }
      return product
    })

    setProducts(updatedProducts)

    // Force immediate recalculation of totals
    const newSubtotal = updatedProducts.reduce((sum, p) => {
      const productTotal = typeof p.total === "number" ? p.total : 0
      return sum + productTotal
    }, 0)
    setSubtotal(newSubtotal)
    setTotalAmount(Math.max(0, newSubtotal - (typeof discountAmount === "number" ? discountAmount : 0)))
  }

  // Handle product selection
  const handleProductSelect = (id: string, productId: number, productName: string, price: number) => {
    console.log("Product selected:", { id, productId, productName, price })

    // Add to products cache
    setProductsCache((prev) => {
      const newCache = new Map(prev)
      newCache.set(productId, { id: productId, name: productName, price })
      return newCache
    })

    updateProductRow(id, {
      productId,
      productName,
      price,
      total: (products.find((p) => p.id === id)?.quantity || 1) * price,
    })

    // Check if we need to add a new empty row
    const hasEmptyRow = products.some((p) => p.productId === null)
    if (!hasEmptyRow) {
      addProductRow()
    }
  }

  // Handle new customer added
  const handleNewCustomer = (customerId: number, customerName: string) => {
    console.log("New customer added:", { customerId, customerName })
    setCustomerId(customerId)
    setCustomerName(customerName)
    setIsNewCustomerModalOpen(false)
  }

  // Handle new product added
  const handleNewProduct = (productId: number, productName: string, price: number) => {
    console.log("New product added:", { productId, productName, price })

    // Add to products cache
    setProductsCache((prev) => {
      const newCache = new Map(prev)
      newCache.set(productId, { id: productId, name: productName, price })
      return newCache
    })

    // Find the first empty product row or the last one
    const targetRow = products.find((p) => !p.productId) || products[products.length - 1]

    if (targetRow) {
      updateProductRow(targetRow.id, {
        productId,
        productName,
        price,
        total: targetRow.quantity * price,
      })
    } else {
      // If no empty row, add a new one
      setProducts([
        ...products,
        {
          id: crypto.randomUUID(),
          productId,
          productName,
          quantity: 1,
          price,
          total: price,
        },
      ])
    }

    setIsNewProductModalOpen(false)
    setIsNotFoundModalOpen(false) // Close the not found modal if it was open
    setNotFoundBarcode("") // Clear the not found barcode
  }

  const handleProductScanned = (productId: number, productName: string, price: number) => {
    try {
      // Add debug info
      setDebugInfo((prev) => `${prev}\nHandling product: ID=${productId}, Name=${productName}, Price=${price}`)

      // Add to products cache
      setProductsCache((prev) => {
        const newCache = new Map(prev)
        newCache.set(productId, { id: productId, name: productName, price })
        return newCache
      })

      // Find if product already exists in the list
      const existingProductIndex = products.findIndex((p) => p.productId === productId)

      setDebugInfo((prev) => `${prev}\nExisting product index: ${existingProductIndex}`)

      if (existingProductIndex >= 0) {
        // If product exists, increment quantity
        const updatedProducts = [...products]
        const product = updatedProducts[existingProductIndex]
        const newQuantity = product.quantity + 1
        const newTotal = newQuantity * (Number(price) || 0)

        setDebugInfo(
          (prev) => `${prev}\nIncreasing quantity from ${product.quantity} to ${newQuantity}, new total: ${newTotal}`,
        )

        // Update the product directly in the array
        updatedProducts[existingProductIndex] = {
          ...product,
          quantity: newQuantity,
          total: newTotal,
        }

        // Set the entire products array
        setProducts(updatedProducts)

        // Force recalculation of totals
        const newSubtotal = updatedProducts.reduce((sum, p) => {
          const productTotal = typeof p.total === "number" ? p.total : 0
          return sum + productTotal
        }, 0)
        setSubtotal(newSubtotal)
        setTotalAmount(Math.max(0, newSubtotal - (typeof discountAmount === "number" ? discountAmount : 0)))

        // Check if we need to add a new empty row
        const hasEmptyRow = updatedProducts.some((p) => p.productId === null)
        if (!hasEmptyRow) {
          const newRow = {
            id: crypto.randomUUID(),
            productId: null,
            productName: "",
            quantity: 1,
            price: 0,
            total: 0,
          }
          setProducts([...updatedProducts, newRow])
        }

        // Add to scan history
        setScanHistory((prev) => [
          {
            status: "success",
            message: `Increased quantity of ${productName} to ${newQuantity}`,
            barcode: barcodeInput,
            timestamp: new Date(),
            productName,
          },
          ...prev.slice(0, 9), // Keep only the last 10 scans
        ])

        return true
      } else {
        // If product doesn't exist, add it
        setDebugInfo((prev) => `${prev}\nAdding new product to cart`)

        const newTotal = Number(price) || 0
        const newProduct = {
          id: crypto.randomUUID(),
          productId,
          productName,
          quantity: 1,
          price,
          total: newTotal,
        }

        // If there's an empty row (no productId), update it instead of adding a new one
        const emptyRowIndex = products.findIndex((p) => p.productId === null)

        setDebugInfo((prev) => `${prev}\nEmpty row index: ${emptyRowIndex}`)

        let updatedProducts: ProductRow[] = []

        if (emptyRowIndex >= 0) {
          updatedProducts = [...products]
          updatedProducts[emptyRowIndex] = {
            ...updatedProducts[emptyRowIndex],
            productId,
            productName,
            price,
            total: newTotal,
          }

          setDebugInfo((prev) => `${prev}\nUpdating empty row with product, total: ${newTotal}`)
          setProducts(updatedProducts)
        } else {
          updatedProducts = [...products, newProduct]
          setDebugInfo((prev) => `${prev}\nAdding new row with product, total: ${newTotal}`)
          setProducts(updatedProducts)
        }

        // Force recalculation of totals
        const newSubtotal = updatedProducts.reduce((sum, p) => {
          const productTotal = typeof p.total === "number" ? p.total : 0
          return sum + productTotal
        }, 0)
        setSubtotal(newSubtotal)
        setTotalAmount(Math.max(0, newSubtotal - (typeof discountAmount === "number" ? discountAmount : 0)))

        // Add to scan history
        setScanHistory((prev) => [
          {
            status: "success",
            message: `Added ${productName} to cart`,
            barcode: barcodeInput,
            timestamp: new Date(),
            productName,
          },
          ...prev.slice(0, 9), // Keep only the last 10 scans
        ])

        return true
      }
    } catch (error) {
      console.error("Error in handleProductScanned:", error)
      setDebugInfo((prev) => `${prev}\nERROR in handleProductScanned: ${error}`)
      return false
    }
  }

  const handleBarcodeInput = async (barcode: string) => {
    // Prevent processing the same barcode multiple times
    if (barcode === lastBarcodeProcessed || !barcode.trim()) return

    setLastBarcodeProcessed(barcode)
    setIsBarcodeProcessing(true)
    setScanStatus("processing")
    setDebugInfo((prev) => `${prev}\nProcessing barcode: ${barcode}`)

    try {
      // Call the server action to get product by barcode
      const result = await getProductByBarcode(barcode, userId)

      setDebugInfo((prev) => `${prev}\nAPI response: ${JSON.stringify(result)}`)

      if (result.success && result.data) {
        setDebugInfo((prev) => `${prev}\nProduct found: ${result.data.name}`)

        // Add the product to the cart using the existing function
        const added = handleProductScanned(result.data.id, result.data.name, result.data.price)

        if (added) {
          setScanStatus("success")

          // Show success toast
          toast({
            title: "Product found",
            description: `Added ${result.data.name} to the sale`,
            variant: "default",
          })
        } else {
          setScanStatus("error")
          setDebugInfo((prev) => `${prev}\nFailed to add product to cart`)

          toast({
            title: "Error",
            description: "Failed to add product to cart",
            variant: "destructive",
          })
        }
      } else {
        setScanStatus("error")
        setDebugInfo((prev) => `${prev}\nNo product found with barcode: ${barcode}`)

        // Store the not found barcode
        setNotFoundBarcode(barcode)

        // Add to scan history
        setScanHistory((prev) => [
          {
            status: "error",
            message: "No product found with this barcode",
            barcode: barcode,
            timestamp: new Date(),
          },
          ...prev.slice(0, 9), // Keep only the last 10 scans
        ])

        // Show error toast with action button
        toast({
          title: "Product not found",
          description: (
            <div className="flex flex-col gap-2">
              <p>No product found with this barcode.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsNewProductModalOpen(true)
                }}
                className="mt-1 text-black"
              >
                Add New Product
              </Button>
            </div>
          ),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error scanning barcode:", error)
      setScanStatus("error")
      setDebugInfo((prev) => `${prev}\nError scanning barcode: ${error}`)

      // Add to scan history
      setScanHistory((prev) => [
        {
          status: "error",
          message: "Error processing barcode",
          barcode: barcode,
          timestamp: new Date(),
        },
        ...prev.slice(0, 9), // Keep only the last 10 scans
      ])

      toast({
        title: "Error",
        description: "Failed to process barcode",
        variant: "destructive",
      })
    } finally {
      // Clear the input for the next scan
      setBarcodeInput("")
      setIsBarcodeProcessing(false)

      // Reset scan status after a delay
      setTimeout(() => {
        setScanStatus("idle")
        // Reset the last processed barcode after a delay to prevent duplicate scans
        setTimeout(() => {
          setLastBarcodeProcessed("")
        }, 500)
      }, 1500)

      // Re-focus the input for the next scan
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }
  }

  // Handle form submission
  const handleSubmit = async () => {
    // Validate form
    const validProducts = products.filter((p) => p.productId && p.quantity > 0)

    if (validProducts.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one product with quantity greater than zero",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare form data
      const formData = new FormData()
      formData.append("customer_id", customerId ? customerId.toString() : "")
      formData.append("sale_date", date.toISOString())
      formData.append("total_amount", totalAmount.toString())
      formData.append("status", status)
      formData.append("user_id", userId.toString())

      // Prepare items - only include valid products
      const items = validProducts.map((p) => ({
        product_id: p.productId,
        quantity: p.quantity,
        price: p.price,
      }))

      formData.append("items", JSON.stringify(items))

      // Submit form
      const result = await addSale(formData)

      if (result.success) {
        toast({
          title: "Success",
          description: "Sale added successfully",
        })

        // Print receipt
        if (result.data && result.data.sale) {
          setTimeout(() => {
            printSalesReceipt(result.data.sale, result.data.items)
          }, 500)
        }

        // Navigate back to dashboard
        router.push("/dashboard")
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to add sale",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Add sale error:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")} className="mr-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">New Sale</h1>
        </div>

        {dbStatus && !dbStatus.isHealthy && (
          <div className="flex items-center bg-red-500/80 px-3 py-1 rounded-full text-sm text-white">
            <AlertCircle className="h-4 w-4 mr-1" />
            <span>Offline Mode</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column - Products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Barcode scanner section */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Scan Products</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                  <Input
                    id="barcode-input"
                    ref={barcodeInputRef}
                    placeholder="Scan barcode or search product..."
                    className={`pl-8 transition-all duration-200 ${
                      scanStatus === "processing"
                        ? "border-yellow-500 bg-yellow-50"
                        : scanStatus === "success"
                          ? "border-green-500 bg-green-50"
                          : scanStatus === "error"
                            ? "border-red-500 bg-red-50"
                            : "border-blue-200 focus:border-blue-500"
                    }`}
                    value={barcodeInput}
                    onChange={(e) => {
                      const value = e.target.value
                      setBarcodeInput(value)

                      if (barcodeTimeoutRef.current) {
                        clearTimeout(barcodeTimeoutRef.current)
                      }

                      if (value.trim() && !isBarcodeProcessing) {
                        barcodeTimeoutRef.current = setTimeout(() => {
                          handleBarcodeInput(value)
                        }, 300)
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        if (barcodeInput.trim()) {
                          handleBarcodeInput(barcodeInput)
                        }
                      }
                    }}
                    autoFocus
                  />
                  {scanStatus === "processing" && (
                    <div className="absolute right-2.5 top-2.5">
                      <svg
                        className="animate-spin h-4 w-4 text-yellow-500"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  )}
                  {scanStatus === "success" && (
                    <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-green-500" />
                  )}
                  {scanStatus === "error" && <XCircle className="absolute right-2.5 top-2.5 h-4 w-4 text-red-500" />}
                </div>
                <Button
                  type="button"
                  onClick={() => {
                    if (barcodeInput.trim()) {
                      handleBarcodeInput(barcodeInput)
                    }
                  }}
                  disabled={isBarcodeProcessing || !barcodeInput}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isBarcodeProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Products table */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Products</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addProductRow}
                className="flex items-center gap-1 border-blue-300 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4 text-blue-600" /> Add Product
              </Button>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-hidden">
                <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 p-2 bg-blue-50 font-medium text-sm text-blue-800 border-b border-gray-200">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-center">Price</div>
                  <div className="col-span-2 text-center">Total</div>
                  <div className="col-span-1"></div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto">
                  {products.map((product, index) => (
                    <div
                      key={product.id}
                      className={`grid grid-cols-12 gap-2 p-2 border-b border-gray-200 ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50"
                      } hover:bg-blue-50 transition-colors duration-150`}
                    >
                      <div className="col-span-5">
                        {product.productId && product.productName ? (
                          <div className="flex items-center justify-between">
                            <span className="truncate flex-1 font-medium">{product.productName}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600"
                              onClick={() => {
                                updateProductRow(product.id, {
                                  productId: null,
                                  productName: "",
                                  price: 0,
                                  total: 0,
                                })
                                setTimeout(() => {
                                  const selectElement = document.getElementById(`product-select-${product.id}`)
                                  if (selectElement) {
                                    const button = selectElement.querySelector("button")
                                    if (button) button.click()
                                  }
                                }, 100)
                              }}
                            >
                              <ChevronsUpDown className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <ProductSelectSimple
                            id={`product-select-${product.id}`}
                            value={product.productId}
                            onChange={(productId, productName, price) =>
                              handleProductSelect(product.id, productId, productName, price)
                            }
                            onAddNew={() => setIsNewProductModalOpen(true)}
                            userId={userId} // Ensure this is passed correctly
                          />
                        )}
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="1"
                          value={product.quantity}
                          onChange={(e) =>
                            updateProductRow(product.id, {
                              quantity: Number.parseInt(e.target.value) || 0,
                            })
                          }
                          className="text-center border-gray-300 focus:border-blue-500 h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={product.price}
                          onChange={(e) =>
                            updateProductRow(product.id, {
                              price: Number.parseFloat(e.target.value) || 0,
                            })
                          }
                          className="text-center border-gray-300 focus:border-blue-500 h-9"
                        />
                      </div>
                      <div className="col-span-2 flex items-center justify-center font-medium">
                        {currency} {product.total.toFixed(2)}
                      </div>
                      <div className="col-span-1 flex justify-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeProductRow(product.id)}
                          disabled={products.length === 1}
                          className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recent scans history */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Recent Scans</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-gray-500"
                onClick={() => setShowDebugInfo(!showDebugInfo)}
              >
                {showDebugInfo ? "Hide Debug" : "Show Debug"}
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-gray-600 max-h-20 overflow-y-auto">
                {scanHistory.length > 0 ? (
                  <div className="space-y-1">
                    {scanHistory.slice(0, 5).map((scan, index) => (
                      <div key={index} className="flex items-center">
                        {scan.status === "success" ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500 mr-1 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-500 mr-1 flex-shrink-0" />
                        )}
                        <span className="truncate">{scan.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span>No recent scans</span>
                )}
              </div>

              {/* Debug Info */}
              {showDebugInfo && (
                <div className="mt-2 p-2 bg-gray-100 rounded border border-gray-300 text-xs">
                  <pre className="overflow-x-auto whitespace-pre-wrap max-h-20 overflow-y-auto">{debugInfo}</pre>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - Sale details and summary */}
        <div className="space-y-6">
          {/* Customer and sale details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Sale Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customer" className="text-sm font-medium text-gray-700 flex items-center">
                  <User className="h-3.5 w-3.5 mr-1 text-blue-600" />
                  Customer
                </Label>
                <CustomerSelectSimple
                  value={customerId}
                  onChange={(value, name) => {
                    setCustomerId(value)
                    if (name) setCustomerName(name)
                  }}
                  onAddNew={() => setIsNewCustomerModalOpen(true)}
                  userId={userId}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date" className="text-sm font-medium text-gray-700 flex items-center">
                    <Calendar className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    Sale Date
                  </Label>
                  <DatePickerSimple date={date} onDateChange={setDate} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="status" className="text-sm font-medium text-gray-700 flex items-center">
                    <Tag className="h-3.5 w-3.5 mr-1 text-blue-600" />
                    Status
                  </Label>
                  <select
                    id="status"
                    className="flex h-9 w-full items-center justify-between rounded-md border border-gray-200 bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Completed">Completed</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sale summary */}
          <Card>
            <CardHeader className="pb-3 bg-blue-50 border-b border-gray-200">
              <CardTitle className="text-lg text-blue-800">Sale Summary</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between items-center py-2 text-gray-700">
                <span className="font-medium">Subtotal:</span>
                <span className="text-lg">
                  {currency} {(typeof subtotal === "number" ? subtotal : 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-t border-gray-200">
                <span className="font-medium text-gray-700">Discount:</span>
                <div className="w-28">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                    className="text-right border-gray-300 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center py-3 border-t border-gray-200 bg-blue-50 p-3 rounded-md mt-4">
                <span className="font-bold text-blue-800 text-lg">Total Amount:</span>
                <div className="font-bold text-blue-800 text-xl">
                  {currency} {(typeof totalAmount === "number" ? totalAmount : 0).toFixed(2)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="flex items-center justify-center gap-1 h-auto py-3"
              onClick={() => setIsNewCustomerModalOpen(true)}
            >
              <User className="h-4 w-4" />
              <span>New Customer</span>
            </Button>
            <Button
              variant="outline"
              className="flex items-center justify-center gap-1 h-auto py-3"
              onClick={() => setIsNewProductModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              <span>New Product</span>
            </Button>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || isCheckingDb}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white h-auto py-3"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...
                </span>
              ) : (
                <span className="flex items-center justify-center">
                  <Save className="h-4 w-4 mr-2" /> Complete Sale
                </span>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={() => router.push("/dashboard")}
              disabled={isSubmitting}
              className="w-full border-gray-300 hover:bg-gray-100"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      <NewCustomerModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onCustomerAdded={handleNewCustomer}
        userId={userId}
      />

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isNewProductModalOpen}
        onClose={() => setIsNewProductModalOpen(false)}
        onSuccess={(product) => handleNewProduct(product.id, product.name, Number(product.price) || 0)}
        userId={userId}
        initialBarcode={notFoundBarcode}
      />

      {/* Not Found Product Modal */}
      <Dialog open={isNotFoundModalOpen} onOpenChange={setIsNotFoundModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Product Not Found</AlertTitle>
              <AlertDescription>
                No product found with barcode: <span className="font-mono">{notFoundBarcode}</span>
              </AlertDescription>
            </Alert>
            <p className="text-sm text-gray-600 mb-4">Would you like to add a new product with this barcode?</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsNotFoundModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setIsNotFoundModalOpen(false)
                  setIsNewProductModalOpen(true)
                }}
                className="bg-blue-600 hover:bg-blue-700 text-black"
              >
                Add New Product
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
