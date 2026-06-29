"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2, CreditCard, Banknote, Globe, X } from "lucide-react"
import { createPurchase } from "@/app/actions/purchase-actions"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormAlert } from "@/components/ui/form-alert"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import ProductSelectSimple from "../sales/product-select-simple"
import NewProductModal from "../sales/new-product-modal"
import SupplierAutocomplete from "./supplier-autocomplete"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { useDispatch } from "react-redux"
import { addProduct } from "@/store/slices/productSlice"

interface NewPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  userId: number
  deviceId: number
  currency?: string
  onPurchaseAdded?: () => void
}

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  total: number
  wholesalePrice?: number
}

export default function NewPurchaseModal({
  isOpen,
  onClose,
  userId,
  deviceId,
  currency = "AED",
  onPurchaseAdded,
}: NewPurchaseModalProps) {
  const dispatch = useDispatch()
  const [localCurrency, setLocalCurrency] = useState(currency)
  const [date, setDate] = useState<Date>(new Date())
  const [supplier, setSupplier] = useState("")
  const [status, setStatus] = useState<string>("Credit")
  const [purchaseStatus, setPurchaseStatus] = useState<string>("Delivered")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [receivedAmount, setReceivedAmount] = useState<number>(0)
  const [products, setProducts] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      total: 0,
      wholesalePrice: 0,
    },
  ])
  const [subtotal, setSubtotal] = useState(0)
  const [taxRate, setTaxRate] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [activeProductRowId, setActiveProductRowId] = useState<string | null>(null)

  // Modals for adding new product
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)

  const { toast } = useToast()

  // Get device currency when modal opens
  useEffect(() => {
    const fetchCurrency = async () => {
      if (!isOpen) return

      try {
        const deviceCurrency = await getDeviceCurrency(userId)
        setLocalCurrency(deviceCurrency)
      } catch (err) {
        console.error("Error fetching currency:", err)
        setLocalCurrency("QAR") // Fallback
      }
    }

    fetchCurrency()
  }, [isOpen, userId])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setDate(new Date())
      setSupplier("")
      setStatus("Credit")
      setPurchaseStatus("Delivered")
      setPaymentMethod("Cash")
      setReceivedAmount(0)
      setProducts([
        {
          id: crypto.randomUUID(),
          productId: null,
          productName: "",
          quantity: 1,
          price: 0,
          total: 0,
          wholesalePrice: 0,
        },
      ])
      setSubtotal(0)
      setTaxRate(0)
      setTaxAmount(0)
      setDiscountAmount(0)
      setTotalAmount(0)
      setFormAlert(null)
      setActiveProductRowId(null)
    }
  }, [isOpen])

  // Calculate totals whenever products, tax rate, or discount changes
  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => sum + product.total, 0)
    setSubtotal(newSubtotal)

    const newTaxAmount = newSubtotal * (taxRate / 100)
    setTaxAmount(newTaxAmount)

    // Ensure we're working with numbers
    const newTotalAmount = Number(newSubtotal) + Number(newTaxAmount) - Number(discountAmount)
    setTotalAmount(newTotalAmount)

    // Auto-adjust received amount based on status
    if (status === "Paid") {
      setReceivedAmount(newTotalAmount)
    } else if (status === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [products, taxRate, discountAmount, status])

  // Handle status change
  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus)
    if (newStatus === "Paid") {
      setReceivedAmount(totalAmount)
    } else if (newStatus === "Cancelled") {
      setReceivedAmount(0)
    }
  }

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
        total: 0,
        wholesalePrice: 0,
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
            updatedProduct.total = updatedProduct.quantity * updatedProduct.price
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
    // Use wholesale price if available, otherwise use the provided price
    const priceToUse = wholesalePrice || price

    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse, // Use wholesale price for purchases
      wholesalePrice,
      total: (products.find((p) => p.id === id)?.quantity || 1) * priceToUse,
    })
  }

  // Track which row is opening the add product modal
  const handleAddNewFromRow = (rowId: string) => {
    setActiveProductRowId(rowId)
    setIsNewProductModalOpen(true)
  }

  // Handle new product added
// Handle new product added
  const handleNewProduct = (product: any) => {
    // Ensure product has a valid numeric id (convert string to number if needed)
    const productId = typeof product.id === 'string' ? parseInt(product.id, 10) : product.id

    // Create a normalized product object with consistent id type
    const normalizedProduct = {
      ...product,
      id: productId,
    }

    // First, add the product to Redux store
    dispatch(addProduct(normalizedProduct))

    // Show success notification
    notifySuccess(toast, `Product "${product.name}" added successfully`)

    // Find the target row - either the active row or first empty row
    const targetRowId = activeProductRowId || products.find((p) => !p.productId)?.id || products[products.length - 1].id

    // Use wholesale price if available, otherwise use retail price
    const priceToUse = product.wholesale_price || product.price

    // Close the modal first to allow ProductSelectSimple to re-render with new data
    setIsNewProductModalOpen(false)
    setActiveProductRowId(null)

    // Use setTimeout to ensure Redux state is updated before updating the product row
    setTimeout(() => {
      // Update the target row with the new product
      updateProductRow(targetRowId, {
        productId: productId,
        productName: product.name,
        price: priceToUse,
        wholesalePrice: product.wholesale_price,
        total: (products.find((p) => p.id === targetRowId)?.quantity || 1) * priceToUse,
      })
    }, 100)
  }
  
  // Handle form submission
  const handleSubmit = async () => {
    setFormAlert(null) // Clear any previous alerts
    
    // Validate form
    if (!supplier) {
      setFormAlert({
        type: "error",
        message: "Please select a supplier",
      })
      return
    }

    if (!products.every((p) => p.productId && p.quantity > 0)) {
      setFormAlert({
        type: "error",
        message: "Please select products and ensure quantities are greater than zero",
      })
      return
    }

    if (status === "Paid" && !paymentMethod) {
      setFormAlert({
        type: "error",
        message: "Please select a payment method",
      })
      return
    }

    // Validate received amount
    if (receivedAmount > totalAmount) {
      setFormAlert({
        type: "error",
        message: "Received amount cannot be greater than total amount",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare form data
      const formData = new FormData()
      formData.append("supplier", supplier)
      formData.append("purchase_date", date.toISOString())
      formData.append("total_amount", totalAmount.toString())
      formData.append("status", status)
      formData.append("purchase_status", purchaseStatus)
      formData.append("payment_method", paymentMethod)
      formData.append("user_id", userId.toString())
      formData.append("device_id", deviceId.toString())
      formData.append("received_amount", receivedAmount.toString())

      // Prepare items
      const items = products.map((p) => ({
        product_id: p.productId,
        quantity: p.quantity,
        price: p.price,
      }))

      formData.append("items", JSON.stringify(items))

      // Submit form
      const result = await createPurchase(formData)

      if (result.success) {
        notifySuccess(toast, "Purchase added successfully")
        // Call the callback if provided
        if (onPurchaseAdded) {
          onPurchaseAdded()
        }
        // Close after a short delay to show the success message
        setTimeout(() => {
          onClose()
        }, 500)
      } else {
        setFormAlert({
          type: "error",
          message: result.message || "Failed to add purchase",
        })
        notifyError(toast, result.message || "Failed to add purchase")
      }
    } catch (error) {
      console.error("Add purchase error:", error)
      setFormAlert({
        type: "error",
        message: "An unexpected error occurred",
      })
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0 bg-white border-gray-200 [&>button]:hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 text-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add New Purchase</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="text-white hover:bg-white/20"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Form Alert */}
          {formAlert && (
            <div className="px-4 pt-2">
              <FormAlert type={formAlert.type} message={formAlert.message} />
            </div>
          )}

          <div className="flex h-[calc(95vh-120px)] overflow-hidden">
            {/* Left side - Form fields (compact) */}
            <div className="w-80 border-r border-gray-200 p-4 overflow-y-auto bg-gray-50">
              <div className="space-y-3">
                {/* Supplier */}
                <div>
                  <Label className="text-sm font-medium text-gray-700">Supplier</Label>
                  <p className="mt-0.5 text-xs text-gray-500">Registered suppliers only</p>
                  <SupplierAutocomplete
                    value={supplier}
                    onChange={setSupplier}
                    userId={userId}
                    placeholder="Select supplier"
                    className="h-9 mt-1"
                  />
                </div>

                {/* Date and Payment Status */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Date</Label>
                    <DatePickerField date={date} onDateChange={(d) => d && setDate(d)} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Payment Status</Label>
                    <Select value={status} onValueChange={handleStatusChange}>
                      <SelectTrigger className="h-9 mt-1 bg-white border-gray-300 text-gray-900">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white border-gray-200">
                        <SelectItem value="Credit">Credit</SelectItem>
                        <SelectItem value="Paid">Paid</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Purchase Status */}
                <div>
                  <Label className="text-sm font-medium text-gray-700">Purchase Status</Label>
                  <Select value={purchaseStatus} onValueChange={setPurchaseStatus}>
                    <SelectTrigger className="h-9 mt-1 bg-white border-gray-300 text-gray-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-white border-gray-200">
                      <SelectItem value="Delivered">Delivered</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Ordered">Ordered</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment Method - only show when status is Paid */}
                {status === "Paid" && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Payment Method</Label>
                    <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Cash" id="cash" />
                        <Label htmlFor="cash" className="text-sm cursor-pointer text-gray-700">
                          <Banknote className="h-3 w-3 inline mr-1" />
                          Cash
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Card" id="card" />
                        <Label htmlFor="card" className="text-sm cursor-pointer text-gray-700">
                          <CreditCard className="h-3 w-3 inline mr-1" />
                          Card
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="Online" id="online" />
                        <Label htmlFor="online" className="text-sm cursor-pointer text-gray-700">
                          <Globe className="h-3 w-3 inline mr-1" />
                          Online
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                )}

                {/* Received Amount - only show for Credit */}
                {status === "Credit" && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Received Amount</Label>
                    <Input
                      type="number"
                      min="0"
                      max={totalAmount}
                      step="0.01"
                      value={receivedAmount}
                      onChange={(e) => setReceivedAmount(Number.parseFloat(e.target.value) || 0)}
                      className="h-9 mt-1 bg-white border-gray-300 text-gray-900"
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* Calculation Summary */}
                <div className="border-t border-gray-200 pt-3 mt-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Subtotal:</span>
                      <span>
                        {localCurrency} {subtotal.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Tax (%):</span>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(Number.parseFloat(e.target.value) || 0)}
                        className="w-16 h-7 text-xs text-center bg-white border-gray-300"
                      />
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Tax Amount:</span>
                      <span>
                        {localCurrency} {taxAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-600">Discount:</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                        className="w-16 h-7 text-xs text-center bg-white border-gray-300"
                      />
                    </div>
                    <div className="flex justify-between font-bold text-green-600 border-t border-gray-200 pt-2">
                      <span>Total:</span>
                      <span>
                        {localCurrency} {totalAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Submit Button */}
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-green-600 hover:bg-green-700 text-white h-10 mt-4"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Adding...
                    </>
                  ) : (
                    "Add Purchase"
                  )}
                </Button>
              </div>
            </div>

            {/* Right side - Products table */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-3 bg-gray-100 border-b border-gray-200">
                <h3 className="font-medium text-gray-800">Products</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addProductRow}
                  className="flex items-center gap-1 h-8 border-green-300 text-green-600 hover:bg-green-50"
                >
                  <Plus className="h-3 w-3" /> Add Product
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 p-2 bg-green-50 font-medium text-sm text-green-800 border-b border-gray-200">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-center">Price</div>
                  <div className="col-span-2 text-center">Total</div>
                  <div className="col-span-1"></div>
                </div>

                {products.map((product, index) => (
                  <div
                    key={product.id}
                    className={`grid grid-cols-12 gap-2 p-2 items-center border-b border-gray-200 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } hover:bg-green-50 transition-colors`}
                  >
                    <div className="col-span-5">
                      <ProductSelectSimple
                        value={product.productId}
                        onChange={(productId, productName, price, wholesalePrice) =>
                          handleProductSelect(product.id, productId, productName, price, wholesalePrice)
                        }
                        onAddNew={() => handleAddNewFromRow(product.id)}
                        userId={userId}
                        usePriceType="wholesale"
                        allowServices={false}
                      />
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        min="1"
                        value={product.quantity}
                        onChange={(e) =>
                          updateProductRow(product.id, { quantity: Number.parseInt(e.target.value) || 1 })
                        }
                        className="text-center h-9 bg-white border-gray-300 text-gray-900"
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
                        className="text-center h-9 bg-white border-gray-300 text-gray-900"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-center font-medium text-gray-900">
                      {localCurrency} {product.total.toFixed(2)}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProductRow(product.id)}
                        disabled={products.length === 1}
                        className="h-8 w-8"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isNewProductModalOpen}
        onClose={() => {
          setIsNewProductModalOpen(false)
          setActiveProductRowId(null)
        }}
        onSuccess={handleNewProduct}
        userId={userId}
      />
    </>
  )
}

