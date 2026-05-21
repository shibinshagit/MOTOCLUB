"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  Barcode,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Calendar,
  User,
  Receipt,
  Loader2,
  ShoppingCart,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar as CalendarComponent } from "@/components/ui/calendar"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { toast } from "@/components/ui/use-toast"
import CustomerSelectSimple from "../sales/customer-select-simple"
import ProductSelectSimple from "../sales/product-select-simple"
import NewCustomerModal from "../sales/new-customer-modal"
import NewProductModal from "../sales/new-product-modal"
import { addSale } from "@/app/actions/sale-actions"
import { getProductByBarcode } from "@/app/actions/product-actions"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { formatCurrencySync } from "@/lib/currency-utils"
import { Badge } from "@/components/ui/badge"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  wholesalePrice?: number
  total: number
}

interface NewSaleTabProps {
  userId: number
  mockMode?: boolean
}

export default function NewSaleTab({ userId, mockMode = false }: NewSaleTabProps) {
  // Get device ID from Redux
  const deviceId = useSelector(selectDeviceId)

  const router = useRouter()
  const [currency, setCurrency] = useState("QAR")
  const [date, setDate] = useState<Date>(new Date())
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string>("")
  const [status, setStatus] = useState<string>("Completed")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [products, setProducts] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      wholesalePrice: 0,
      total: 0,
    },
  ])
  const [subtotal, setSubtotal] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [taxRate, setTaxRate] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState<string>("")
  const [scanStatus, setScanStatus] = useState<"idle" | "processing" | "success" | "error">("idle")
  const [scanHistory, setScanHistory] = useState<
    {
      status: "success" | "error"
      message: string
      barcode: string
      timestamp: Date
      productName?: string
    }[]
  >([])
  const [notes, setNotes] = useState<string>("")
  const [receivedAmount, setReceivedAmount] = useState(0)

  const barcodeInputRef = useRef<HTMLInputElement>(null)

  // Modals
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)

  // Get currency on load
  useEffect(() => {
    const fetchCurrency = async () => {
      try {
        const deviceCurrency = await getDeviceCurrency(userId)
        setCurrency(deviceCurrency)
      } catch (err) {
        console.error("Error fetching currency:", err)
      }
    }
    fetchCurrency()
  }, [userId])

  // Calculate totals when products, discount, or tax rate changes
  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => {
      const productTotal = typeof product.total === "number" ? product.total : 0
      return sum + productTotal
    }, 0)

    setSubtotal(newSubtotal)

    // Calculate tax amount based on subtotal - discount
    const afterDiscount = Math.max(0, newSubtotal - discountAmount)
    const newTaxAmount = afterDiscount * (taxRate / 100)
    setTaxAmount(newTaxAmount)

    // Calculate total: subtotal - discount + tax
    const finalTotal = afterDiscount + newTaxAmount
    setTotalAmount(finalTotal)

    // Auto-set received amount based on status
    if (status === "Completed") {
      setReceivedAmount(finalTotal)
    } else if (status === "Cancelled") {
      setReceivedAmount(finalTotal) // Set to total but won't be shown
    } else if (status === "Credit") {
      // Keep current received amount or set to 0 if switching to credit
      if (receivedAmount > finalTotal) {
        setReceivedAmount(0)
      }
    }
  }, [products, discountAmount, taxRate, status])

  // Focus management and keyboard shortcuts
  useEffect(() => {
    // Focus the barcode input on initial load
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus()
    }

    // Add keyboard shortcut listener for Alt+S
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === "s") {
        e.preventDefault()
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus()
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown)

    return () => {
      window.addEventListener("keydown", handleKeyDown)
    }
  }, [])

  // Add a new product row
  const addProductRow = () => {
    setProducts([
      ...products,
      {
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        quantity: 1,
        price: 0,
        wholesalePrice: 0,
        total: 0,
      },
    ])
  }

  // Remove a product row
  const removeProductRow = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter((product) => product.id !== id))
    }
  }

  // Update product row
  const updateProductRow = (id: string, updates: Partial<ProductRow>) => {
    setProducts(
      products.map((product) => {
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
      }),
    )
  }

  // Handle product selection
  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
  ) => {
    updateProductRow(id, {
      productId,
      productName,
      price,
      wholesalePrice: wholesalePrice || 0,
      total: (products.find((p) => p.id === id)?.quantity || 1) * price,
    })

    // Automatically add a new product row if this was the last row
    const currentIndex = products.findIndex((p) => p.id === id)
    if (currentIndex === products.length - 1) {
      addProductRow()
    }
  }

  // Handle new customer added
  const handleNewCustomer = (customerId: number, customerName: string) => {
    setCustomerId(customerId)
    setCustomerName(customerName)
    setIsNewCustomerModalOpen(false)
  }

  // Handle new product added
  const handleNewProduct = (productId: number, productName: string, price: number, wholesalePrice?: number) => {
    // Find the first empty product row or the last one
    const targetRow = products.find((p) => !p.productId) || products[products.length - 1]

    if (targetRow) {
      updateProductRow(targetRow.id, {
        productId,
        productName,
        price,
        wholesalePrice: wholesalePrice || 0,
        total: targetRow.quantity * price,
      })

      // Automatically add a new product row
      addProductRow()
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
          wholesalePrice: wholesalePrice || 0,
          total: price,
        },
      ])

      // Add another empty row
      addProductRow()
    }

    setIsNewProductModalOpen(false)
  }

  // Handle barcode scanning
  const handleBarcodeInput = async () => {
    if (!barcodeInput.trim()) return

    setScanStatus("processing")

    try {
      const result = await getProductByBarcode(barcodeInput.trim(), userId)

      if (result.success && result.data) {
        // Handle found product
        const productId = result.data.id
        const productName = result.data.name
        const price = result.data.price
        const wholesalePrice = result.data.wholesale_price || 0

        // Check if product is already in the list
        const existingProduct = products.find((p) => p.productId === productId)

        if (existingProduct) {
          // Increment quantity if product already exists
          updateProductRow(existingProduct.id, {
            quantity: existingProduct.quantity + 1,
          })
        } else {
          // Add new product if it doesn't exist yet
          const emptyRow = products.find((p) => !p.productId)

          if (emptyRow) {
            // Use existing empty row
            updateProductRow(emptyRow.id, {
              productId,
              productName,
              price,
              wholesalePrice,
              quantity: 1,
              total: price,
            })

            // Add a new empty row
            addProductRow()
          } else {
            // Add new row
            setProducts([
              ...products,
              {
                id: crypto.randomUUID(),
                productId,
                productName,
                quantity: 1,
                price,
                wholesalePrice,
                total: price,
              },
            ])

            // Add a new empty row
            addProductRow()
          }
        }

        setScanStatus("success")
        setScanHistory([
          {
            status: "success",
            message: `Added ${productName} to cart`,
            barcode: barcodeInput,
            timestamp: new Date(),
            productName,
          },
          ...scanHistory.slice(0, 4),
        ])

        toast({
          title: "Product scanned successfully",
          description: `Added ${productName} to the sale`,
        })
      } else {
        // Handle product not found
        setScanStatus("error")
        setScanHistory([
          {
            status: "error",
            message: "Product not found",
            barcode: barcodeInput,
            timestamp: new Date(),
          },
          ...scanHistory.slice(0, 4),
        ])

        toast({
          title: "Product not found",
          description: "No product found with this barcode",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error scanning barcode:", error)
      setScanStatus("error")
      toast({
        title: "Error",
        description: "Failed to process barcode",
        variant: "destructive",
      })
    } finally {
      // Clear input and reset status after a delay
      setTimeout(() => {
        setBarcodeInput("")
        setScanStatus("idle")
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus()
        }
      }, 1000)
    }
  }

  // Handle barcode input change with auto-detection for barcode scanners
  const handleBarcodeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setBarcodeInput(value)

    // If input is 6+ digits, it's likely from a scanner which typically sends Enter after
    // But we'll check for rapid input of 6+ digits as an additional heuristic
    if (value.length >= 6 && /^\d+$/.test(value)) {
      // This is likely a barcode scan - no need to wait for Enter
      // Most scanners will send Enter key after scan, which will trigger handleBarcodeInput
    }
  }

  // Handle form submission
  const handleSubmit = async () => {
    // Validate device ID
    if (!deviceId) {
      toast({
        title: "Error",
        description: "Device ID not found. Please refresh the page.",
        variant: "destructive",
      })
      return
    }

    // Validate form
    const validProducts = products.filter((p) => p.productId && p.quantity > 0)

    if (validProducts.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one product with quantity greater than zero",
        variant: "destructive",
      })
      return
    }

    // Validate received amount for credit sales
    if (status === "Credit" && receivedAmount > totalAmount) {
      toast({
        title: "Error",
        description: "Received amount cannot be greater than total amount",
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
      formData.append("payment_method", paymentMethod)
      formData.append("subtotal", subtotal.toString())
      formData.append("discount", discountAmount.toString())
      formData.append("tax", taxAmount.toString())
      formData.append("tax_rate", taxRate.toString())
      formData.append("user_id", userId.toString())
      formData.append("device_id", deviceId.toString()) // Add device ID
      formData.append("received_amount", receivedAmount.toString()) // Add received amount
      formData.append("notes", notes)

      // Prepare items - only include valid products
      const items = validProducts.map((p) => ({
        product_id: p.productId,
        quantity: p.quantity,
        price: p.price,
        wholesale_price: p.wholesalePrice || 0,
      }))

      formData.append("items", JSON.stringify(items))

      // Submit sale
      const result = await addSale({
        customerId: customerId || null,
        userId: userId,
        deviceId: deviceId, // Pass device ID
        items: validProducts.map((p) => ({
          productId: p.productId,
          quantity: p.quantity,
          price: p.price,
        })),
        paymentStatus: status,
        paymentMethod: paymentMethod,
        saleDate: date?.toISOString() || new Date().toISOString(),
        notes: notes,
        discount: discountAmount,
        receivedAmount: receivedAmount, // Pass received amount
      })

      if (result.success) {
        toast({
          title: "Success",
          description: "Sale added successfully",
        })

        // Print receipt if available
        if (result.data && result.data.sale) {
          setTimeout(() => {
            printSalesReceipt(result.data.sale, result.data.items, currency)
          }, 500)
        }

        // Reset form or redirect
        resetForm()
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

  // Reset the form to initial state
  const resetForm = () => {
    setDate(new Date())
    setCustomerId(null)
    setCustomerName("")
    setStatus("Completed") // Default to Completed instead of Pending
    setPaymentMethod("Cash")
    setProducts([
      {
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        quantity: 1,
        price: 0,
        wholesalePrice: 0,
        total: 0,
      },
    ])
    setDiscountAmount(0)
    setTaxRate(0)
    setTaxAmount(0)
    setReceivedAmount(0) // Reset received amount
    setNotes("")
    setScanHistory([])
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="container mx-auto py-6 px-4">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-800">New Sale</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={resetForm} className="text-gray-600">
              <XCircle className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              {isSubmitting ? "Processing..." : "Complete Sale"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Products */}
          <div className="col-span-12 lg:col-span-8 space-y-6">
            {/* Barcode Scanner */}
            <Card className="overflow-hidden shadow-sm border-gray-200 rounded-xl">
              <CardHeader className="bg-white py-4 px-6 border-b border-gray-100">
                <CardTitle className="text-base font-medium flex items-center text-gray-800">
                  <Barcode className="h-4 w-4 mr-2 text-blue-600" />
                  Scan Products (Alt+S)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <Input
                      id="barcode-input"
                      ref={barcodeInputRef}
                      placeholder="Scan barcode or enter product code..."
                      className={`pl-10 h-11 border-gray-200 focus:border-blue-500 transition-all duration-200 ${
                        scanStatus === "processing"
                          ? "border-yellow-400 bg-yellow-50"
                          : scanStatus === "success"
                            ? "border-green-400 bg-green-50"
                            : scanStatus === "error"
                              ? "border-red-400 bg-red-50"
                              : ""
                      }`}
                      value={barcodeInput}
                      onChange={handleBarcodeInputChange}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault()
                          handleBarcodeInput()
                        }
                      }}
                    />
                    <Barcode className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />

                    {scanStatus === "processing" && (
                      <div className="absolute right-3 top-3.5">
                        <Loader2 className="animate-spin h-4 w-4 text-yellow-500" />
                      </div>
                    )}
                    {scanStatus === "success" && (
                      <CheckCircle2 className="absolute right-3 top-3.5 h-4 w-4 text-green-500" />
                    )}
                    {scanStatus === "error" && <XCircle className="absolute right-3 top-3.5 h-4 w-4 text-red-500" />}
                  </div>
                  <Button onClick={handleBarcodeInput} className="bg-blue-600 hover:bg-blue-700 h-11 px-5">
                    Scan
                  </Button>
                </div>

                {/* Scan History */}
                {scanHistory.length > 0 && (
                  <div className="mt-4 bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <p className="text-sm font-medium text-gray-600 mb-2">Recent Scans</p>
                    <div className="space-y-2">
                      {scanHistory.slice(0, 3).map((scan, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          {scan.status === "success" ? (
                            <Badge
                              variant="outline"
                              className="bg-green-50 text-green-700 border-green-200 px-2 py-0.5"
                            >
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Success
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 px-2 py-0.5">
                              <XCircle className="h-3 w-3 mr-1" />
                              Error
                            </Badge>
                          )}
                          <span className="text-gray-700">{scan.message}</span>
                          <span className="text-gray-400 text-xs ml-auto">{format(scan.timestamp, "HH:mm:ss")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Products Table */}
            <Card className="overflow-hidden shadow-sm border-gray-200 rounded-xl">
              <CardHeader className="bg-white py-4 px-6 border-b border-gray-100 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-medium flex items-center text-gray-800">
                  <ShoppingCart className="h-4 w-4 mr-2 text-blue-600" />
                  Products
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-hidden border-b border-gray-100">
                  <div className="grid grid-cols-12 gap-4 py-3 px-6 bg-gray-50 text-sm font-medium text-gray-600">
                    <div className="col-span-4">Product</div>
                    <div className="col-span-2 text-center">Quantity</div>
                    <div className="col-span-2 text-center">Price</div>
                    <div className="col-span-2 text-center">Wholesale</div>
                    <div className="col-span-1 text-center">Total</div>
                    <div className="col-span-1"></div>
                  </div>

                  <div className="max-h-[400px] overflow-y-auto">
                    {products.map((product, index) => (
                      <div
                        key={product.id}
                        className={`grid grid-cols-12 gap-4 py-3 px-6 items-center ${
                          index % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-b-0`}
                      >
                        <div className="col-span-4">
                          <ProductSelectSimple
                            value={product.productId}
                            onChange={(productId, productName, price, wholesalePrice) =>
                              handleProductSelect(product.id, productId, productName, price, wholesalePrice)
                            }
                            onAddNew={() => setIsNewProductModalOpen(true)}
                            userId={userId}
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) =>
                              updateProductRow(product.id, { quantity: Number.parseInt(e.target.value) || 0 })
                            }
                            className="text-center h-9 border-gray-200"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.price}
                            onChange={(e) =>
                              updateProductRow(product.id, { price: Number.parseFloat(e.target.value) || 0 })
                            }
                            className="text-center h-9 border-gray-200"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.wholesalePrice || 0}
                            onChange={(e) =>
                              updateProductRow(product.id, { wholesalePrice: Number.parseFloat(e.target.value) || 0 })
                            }
                            className="text-center h-9 border-gray-200"
                            readOnly
                          />
                        </div>
                        <div className="col-span-1 text-center font-medium text-gray-800">
                          {formatCurrencySync(product.total, currency)}
                        </div>
                        <div className="col-span-1 flex justify-center">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeProductRow(product.id)}
                            disabled={products.length === 1}
                            className="h-8 w-8 p-0 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}

                    {products.length === 0 && (
                      <div className="py-8 text-center text-gray-500">
                        No products added yet. Scan a barcode or add a product manually.
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-gray-50 py-4 px-6 border-t border-gray-100">
                <div className="w-full flex justify-between items-center">
                  <span className="text-sm text-gray-600">
                    {products.filter((p) => p.productId).length} product(s) added
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsNewProductModalOpen(true)}
                    className="border-blue-200 text-blue-600 hover:bg-blue-50"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    New Product
                  </Button>
                </div>
              </CardFooter>
            </Card>
          </div>

          {/* Right Column - Sale Details */}
          <div className="col-span-12 lg:col-span-4 space-y-6">
            {/* Customer Information */}
            <Card className="overflow-hidden shadow-sm border-gray-200 rounded-xl">
              <CardHeader className="bg-white py-4 px-6 border-b border-gray-100">
                <CardTitle className="text-base font-medium flex items-center text-gray-800">
                  <User className="h-4 w-4 mr-2 text-blue-600" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer" className="text-sm font-medium text-gray-700">
                      Customer
                    </Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
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
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setIsNewCustomerModalOpen(true)}
                        className="h-10 w-10 border-gray-200"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="date" className="text-sm font-medium text-gray-700">
                      Sale Date
                    </Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal border-gray-200 h-10",
                            !date && "text-gray-400",
                          )}
                        >
                          <Calendar className="mr-2 h-4 w-4 text-gray-500" />
                          {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <CalendarComponent
                          mode="single"
                          selected={date}
                          onSelect={(newDate) => newDate && setDate(newDate)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="status" className="text-sm font-medium text-gray-700">
                      Status
                    </Label>
                    <Select value={status} onValueChange={setStatus}>
                      <SelectTrigger className="border-gray-200 h-10">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Credit">Credit</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Received Amount - only show for Credit status */}
                  {status === "Credit" && (
                    <div className="space-y-2">
                      <Label htmlFor="received_amount" className="text-sm font-medium text-gray-700">
                        Received Amount
                      </Label>
                      <Input
                        id="received_amount"
                        type="number"
                        min="0"
                        max={totalAmount}
                        step="0.01"
                        value={receivedAmount}
                        onChange={(e) => setReceivedAmount(Number.parseFloat(e.target.value) || 0)}
                        className="border-gray-200 h-10"
                        placeholder="0.00"
                      />
                      <p className="text-xs text-gray-500">
                        Remaining: {formatCurrencySync(totalAmount - receivedAmount, currency)}
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="payment_method" className="text-sm font-medium text-gray-700">
                      Payment Method
                    </Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="border-gray-200 h-10">
                        <SelectValue placeholder="Select payment method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash">Cash</SelectItem>
                        <SelectItem value="Card">Card</SelectItem>
                        <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                        <SelectItem value="Credit">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sale Summary */}
            <Card className="overflow-hidden shadow-sm border-gray-200 rounded-xl sticky top-6">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-blue-700 py-4 px-6">
                <CardTitle className="text-base font-medium flex items-center text-white">
                  <Receipt className="h-4 w-4 mr-2" />
                  Sale Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium text-gray-800">{formatCurrencySync(subtotal, currency)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <Label htmlFor="discount" className="text-gray-600">
                      Discount:
                    </Label>
                    <div className="w-1/2 flex gap-2 items-center">
                      <Input
                        id="discount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                        className="text-right h-9 border-gray-200 w-full"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <Label htmlFor="tax_rate" className="text-gray-600">
                      Tax Rate (%):
                    </Label>
                    <div className="w-1/2 flex gap-2 items-center">
                      <Input
                        id="tax_rate"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
                        className="text-right h-9 border-gray-200 w-full"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Tax Amount:</span>
                    <span className="font-medium text-gray-800">{formatCurrencySync(taxAmount, currency)}</span>
                  </div>

                  <div className="flex justify-between items-center">
                    <Label htmlFor="notes" className="text-gray-600">
                      Notes:
                    </Label>
                    <div className="w-full">
                      <Input
                        id="notes"
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="text-right h-9 border-gray-200 w-full"
                      />
                    </div>
                  </div>

                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <div className="flex justify-between items-center">
                      <span className="text-blue-800 font-semibold">Total:</span>
                      <span className="text-blue-800 font-bold text-xl">
                        {formatCurrencySync(totalAmount, currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="bg-gray-50 py-4 px-6 border-t border-gray-100">
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-blue-600 hover:bg-blue-700 h-11"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Complete Sale
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      </div>

      {/* Modals */}
      <NewCustomerModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onCustomerAdded={handleNewCustomer}
        userId={userId}
      />

      <NewProductModal
        isOpen={isNewProductModalOpen}
        onClose={() => setIsNewProductModalOpen(false)}
        onProductAdded={handleNewProduct}
        userId={userId}
      />
    </div>
  )
}

