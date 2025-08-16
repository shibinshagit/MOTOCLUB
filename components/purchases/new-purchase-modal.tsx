"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
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
import { useNotification } from "@/components/ui/global-notification"
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
  const isSubmittingRef = useRef(false) // Prevent double submissions
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
  const [taxRate, setTaxRate] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [activeProductRowId, setActiveProductRowId] = useState<string | null>(null)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)

  const { showNotification } = useNotification()

  // Memoize calculations to prevent unnecessary recalculations
  const { subtotal, taxAmount, totalAmount } = useMemo(() => {
    const newSubtotal = products.reduce((sum, product) => sum + product.total, 0)
    const newTaxAmount = newSubtotal * (taxRate / 100)
    const newTotalAmount = newSubtotal + newTaxAmount - discountAmount
    
    return {
      subtotal: newSubtotal,
      taxAmount: newTaxAmount,
      totalAmount: newTotalAmount
    }
  }, [products, taxRate, discountAmount])

  // Get device currency only once when modal opens (with caching)
  useEffect(() => {
    let isMounted = true
    
    const fetchCurrency = async () => {
      if (!isOpen) return

      try {
        const deviceCurrency = await getDeviceCurrency(userId)
        if (isMounted) {
          setLocalCurrency(deviceCurrency)
        }
      } catch (err) {
        console.error("Error fetching currency:", err)
        if (isMounted) {
          setLocalCurrency("QAR") // Fallback
        }
      }
    }

    fetchCurrency()
    
    return () => {
      isMounted = false
    }
  }, [isOpen, userId])

  // Reset form when modal closes - optimized with useCallback
  const resetForm = useCallback(() => {
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
    setTaxRate(0)
    setDiscountAmount(0)
    setFormAlert(null)
    setActiveProductRowId(null)
    isSubmittingRef.current = false
  }, [])

  useEffect(() => {
    if (!isOpen) {
      resetForm()
    }
  }, [isOpen, resetForm])

  // Auto-adjust received amount based on status - optimized
  useEffect(() => {
    if (status === "Paid") {
      setReceivedAmount(totalAmount)
    } else if (status === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [status, totalAmount])

  // Handle status change - memoized
  const handleStatusChange = useCallback((newStatus: string) => {
    setStatus(newStatus)
    if (newStatus === "Paid") {
      setReceivedAmount(totalAmount)
    } else if (newStatus === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [totalAmount])

  // Add a new product row - memoized
  const addProductRow = useCallback(() => {
    setProducts(prev => [
      ...prev,
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
  }, [])

  // Remove a product row - memoized
  const removeProductRow = useCallback((id: string) => {
    setProducts(prev => prev.length > 1 ? prev.filter((product) => product.id !== id) : prev)
  }, [])

  // Update product row - optimized with useCallback
  const updateProductRow = useCallback((id: string, updates: Partial<ProductRow>) => {
    setProducts(prev => prev.map((product) => {
      if (product.id === id) {
        const updatedProduct = { ...product, ...updates }
        // Recalculate total if quantity or price changed
        if (updates.quantity !== undefined || updates.price !== undefined) {
          updatedProduct.total = updatedProduct.quantity * updatedProduct.price
        }
        return updatedProduct
      }
      return product
    }))
  }, [])

  // Handle product selection - memoized
  const handleProductSelect = useCallback((
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
  ) => {
    const priceToUse = wholesalePrice || price
    const quantity = products.find((p) => p.id === id)?.quantity || 1
    
    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse,
      wholesalePrice,
      total: quantity * priceToUse,
    })
  }, [products, updateProductRow])

  // Track which row is opening the add product modal - memoized
  const handleAddNewFromRow = useCallback((rowId: string) => {
    setActiveProductRowId(rowId)
    setIsNewProductModalOpen(true)
  }, [])

  // Handle new product added - optimized
  const handleNewProduct = useCallback((product: any) => {
    // First, add the product to Redux store
    dispatch(addProduct(product))

    // Show success notification
    showNotification("success", `Product "${product.name}" added successfully`)

    // Find the target row - either the active row or first empty row
    const targetRowId = activeProductRowId || 
      products.find((p) => !p.productId)?.id || 
      products[products.length - 1].id

    // Use wholesale price if available, otherwise use retail price
    const priceToUse = product.wholesale_price || product.price
    const quantity = products.find((p) => p.id === targetRowId)?.quantity || 1

    // Update the target row with the new product
    updateProductRow(targetRowId, {
      productId: product.id,
      productName: product.name,
      price: priceToUse,
      wholesalePrice: product.wholesale_price,
      total: quantity * priceToUse,
    })

    // Close the modal and reset active row
    setIsNewProductModalOpen(false)
    setActiveProductRowId(null)
  }, [activeProductRowId, products, updateProductRow, dispatch, showNotification])

  // Validation function - memoized
  const validateForm = useMemo(() => {
    if (!supplier) {
      return { isValid: false, message: "Please enter a supplier name" }
    }

    if (!products.every((p) => p.productId && p.quantity > 0)) {
      return { 
        isValid: false, 
        message: "Please select products and ensure quantities are greater than zero" 
      }
    }

    if (status === "Paid" && !paymentMethod) {
      return { isValid: false, message: "Please select a payment method" }
    }

    if (receivedAmount > totalAmount) {
      return { 
        isValid: false, 
        message: "Received amount cannot be greater than total amount" 
      }
    }

    return { isValid: true, message: "" }
  }, [supplier, products, status, paymentMethod, receivedAmount, totalAmount])

  // Handle form submission - optimized
  const handleSubmit = useCallback(async () => {
    // Prevent double submission
    if (isSubmittingRef.current) return
    
    setFormAlert(null) // Clear any previous alerts
    
    // Validate form and show validation messages
    if (!validateForm.isValid) {
      setFormAlert({
        type: "error",
        message: validateForm.message,
      })
      return
    }

    isSubmittingRef.current = true
    setIsSubmitting(true)

    try {
      // Prepare form data more efficiently
      const items = products
        .filter(p => p.productId) // Only include valid products
        .map((p) => ({
          product_id: p.productId,
          quantity: p.quantity,
          price: p.price,
        }))

      const formData = new FormData()
      // Add all fields at once
      const fields = {
        supplier,
        purchase_date: date.toISOString(),
        total_amount: totalAmount.toString(),
        status,
        purchase_status: purchaseStatus,
        payment_method: paymentMethod,
        user_id: userId.toString(),
        device_id: deviceId.toString(),
        received_amount: receivedAmount.toString(),
        items: JSON.stringify(items),
      }

      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value)
      })

      // Submit form
      const result = await createPurchase(formData)

      if (result.success) {
        showNotification("success", "Purchase added successfully")
        
        // Call the callback if provided
        onPurchaseAdded?.()
        
        // Close modal immediately - no delay needed
        onClose()
      } else {
        const errorMessage = result.message || "Failed to add purchase"
        setFormAlert({
          type: "error",
          message: errorMessage,
        })
        showNotification("error", errorMessage)
      }
    } catch (error) {
      console.error("Add purchase error:", error)
      const errorMessage = "An unexpected error occurred"
      setFormAlert({
        type: "error",
        message: errorMessage,
      })
      showNotification("error", errorMessage)
    } finally {
      setIsSubmitting(false)
      isSubmittingRef.current = false
    }
  }, [
    validateForm, 
    supplier, 
    date, 
    totalAmount, 
    status, 
    purchaseStatus, 
    paymentMethod, 
    userId, 
    deviceId, 
    receivedAmount, 
    products, 
    showNotification, 
    onPurchaseAdded, 
    onClose
  ])

  // Close handler - memoized
  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      onClose()
    }
  }, [isSubmitting, onClose])

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          {/* Header */}
          <div className="bg-gradient-to-r from-green-600 to-green-700 dark:from-green-700 dark:to-green-800 text-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add New Purchase</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                disabled={isSubmitting}
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
            <div className="w-80 border-r border-gray-200 dark:border-gray-700 overflow-hidden bg-gray-50 dark:bg-gray-800 flex flex-col">
              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-3">
                  {/* Supplier */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Supplier</Label>
                    <SupplierAutocomplete
                      value={supplier}
                      onChange={setSupplier}
                      userId={userId}
                      placeholder="Supplier name"
                      className="h-9 mt-1"
                    />
                  </div>

                  {/* Date and Payment Status */}
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Date</Label>
                      <DatePickerField date={date} onDateChange={setDate} />
                    </div>
                    <div>
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment Status</Label>
                      <Select value={status} onValueChange={handleStatusChange}>
                        <SelectTrigger className="h-9 mt-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                          <SelectItem value="Credit">Credit</SelectItem>
                          <SelectItem value="Paid">Paid</SelectItem>
                          <SelectItem value="Cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Purchase Status */}
                  <div>
                    <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Purchase Status</Label>
                    <Select value={purchaseStatus} onValueChange={setPurchaseStatus}>
                      <SelectTrigger className="h-9 mt-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
                        <SelectItem value="Delivered">Delivered</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Ordered">Ordered</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Payment Method - only show when status is Paid */}
                  {status === "Paid" && (
                    <div>
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Payment Method</Label>
                      <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="mt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Cash" id="cash" />
                          <Label htmlFor="cash" className="text-sm cursor-pointer text-gray-700 dark:text-gray-300">
                            <Banknote className="h-3 w-3 inline mr-1" />
                            Cash
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Card" id="card" />
                          <Label htmlFor="card" className="text-sm cursor-pointer text-gray-700 dark:text-gray-300">
                            <CreditCard className="h-3 w-3 inline mr-1" />
                            Card
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="Online" id="online" />
                          <Label htmlFor="online" className="text-sm cursor-pointer text-gray-700 dark:text-gray-300">
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
                      <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">Received Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        max={totalAmount}
                        step="0.01"
                        value={receivedAmount}
                        onChange={(e) => setReceivedAmount(Number.parseFloat(e.target.value) || 0)}
                        className="h-9 mt-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                        placeholder="0.00"
                      />
                    </div>
                  )}

                  {/* Calculation Summary */}
                  <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>Subtotal:</span>
                        <span>
                          {localCurrency} {subtotal.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Tax (%):</span>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={taxRate}
                          onChange={(e) => setTaxRate(Number.parseFloat(e.target.value) || 0)}
                          className="w-16 h-7 text-xs text-center bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                        />
                      </div>
                      <div className="flex justify-between text-gray-600 dark:text-gray-400">
                        <span>Tax Amount:</span>
                        <span>
                          {localCurrency} {taxAmount.toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">Discount:</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                          className="w-16 h-7 text-xs text-center bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600"
                        />
                      </div>
                      <div className="flex justify-between font-bold text-green-600 dark:text-green-400 border-t border-gray-200 dark:border-gray-700 pt-2">
                        <span>Total:</span>
                        <span>
                          {localCurrency} {totalAmount.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Fixed Submit Button at Bottom */}
              <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800">
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-800 text-white h-10"
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
              <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h3 className="font-medium text-gray-800 dark:text-gray-200">Products</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addProductRow}
                  disabled={isSubmitting}
                  className="flex items-center gap-1 h-8 border-green-300 dark:border-green-600 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-50"
                >
                  <Plus className="h-3 w-3" /> Add Product
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto">
                <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 p-2 bg-green-50 dark:bg-green-900/30 font-medium text-sm text-green-800 dark:text-green-200 border-b border-gray-200 dark:border-gray-700">
                  <div className="col-span-5">Product</div>
                  <div className="col-span-2 text-center">Quantity</div>
                  <div className="col-span-2 text-center">Price</div>
                  <div className="col-span-2 text-center">Total</div>
                  <div className="col-span-1"></div>
                </div>

                {products.map((product, index) => (
                  <div
                    key={product.id}
                    className={`grid grid-cols-12 gap-2 p-2 items-center border-b border-gray-200 dark:border-gray-700 ${
                      index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                    } hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors`}
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
                        disabled={isSubmitting}
                        className="text-center h-9 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 disabled:opacity-50"
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
                        disabled={isSubmitting}
                        className="text-center h-9 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      />
                    </div>
                    <div className="col-span-2 flex items-center justify-center font-medium text-gray-900 dark:text-gray-100">
                      {localCurrency} {product.total.toFixed(2)}
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeProductRow(product.id)}
                        disabled={products.length === 1 || isSubmitting}
                        className="h-8 w-8 disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4 text-red-500 dark:text-red-400" />
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

