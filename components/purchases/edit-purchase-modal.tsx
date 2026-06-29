"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2, CreditCard, Banknote, Globe, X } from "lucide-react"
import { getPurchaseDetails, updatePurchase } from "@/app/actions/purchase-actions"
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

interface EditPurchaseModalProps {
  isOpen: boolean
  onClose: () => void
  purchaseId: number
  userId: number
  deviceId: number
  currency?: string
  onPurchaseUpdated?: () => void
}

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  total: number
  originalItemId?: number
  wholesalePrice?: number
}

export default function EditPurchaseModal({
  isOpen,
  onClose,
  purchaseId,
  userId,
  deviceId,
  currency = "AED",
  onPurchaseUpdated,
}: EditPurchaseModalProps) {
  const dispatch = useDispatch()
  const { toast } = useToast()
  
  // Refs to track loading states and prevent duplicate requests
  const isLoadingRef = useRef(false)
  const isSubmittingRef = useRef(false)
  const lastPurchaseIdRef = useRef<number | null>(null)
  
  // Form state
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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

  // Memoized calculations to prevent unnecessary recalculations
  const calculations = useMemo(() => {
    const subtotal = products.reduce((sum, product) => sum + product.total, 0)
    const taxAmount = subtotal * (taxRate / 100)
    const totalAmount = Number(subtotal) + Number(taxAmount) - Number(discountAmount)
    
    return { subtotal, taxAmount, totalAmount }
  }, [products, taxRate, discountAmount])

  const { subtotal, taxAmount, totalAmount } = calculations

  // Reset form state when modal closes or purchaseId changes
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
    setError(null)
  }, [])

  // Optimized purchase details fetching with duplicate request prevention
  const fetchPurchaseDetails = useCallback(async () => {
    if (!purchaseId || !isOpen || isLoadingRef.current || lastPurchaseIdRef.current === purchaseId) {
      return
    }

    isLoadingRef.current = true
    lastPurchaseIdRef.current = purchaseId
    setIsLoading(true)
    setError(null)

    try {
      // Fetch currency and purchase details in parallel
      const [currencyResult, purchaseResult] = await Promise.allSettled([
        getDeviceCurrency(userId),
        getPurchaseDetails(purchaseId)
      ])

      // Handle currency result
      if (currencyResult.status === 'fulfilled') {
        setLocalCurrency(currencyResult.value)
      } else {
        console.error("Error fetching currency:", currencyResult.reason)
        setLocalCurrency("QAR") // Fallback
      }

      // Handle purchase result
      if (purchaseResult.status === 'rejected') {
        throw purchaseResult.reason
      }

      const result = purchaseResult.value
      if (!result.success) {
        throw new Error(result.message || "Failed to load purchase details")
      }

      const { purchase, items } = result.data!

      // Set purchase data
      setDate(new Date(purchase.purchase_date))
      setSupplier(purchase.supplier || "")

      // Map old status values to new ones
      const statusMap: Record<string, string> = {
        "Pending": "Credit",
        "Received": "Paid",
        "Partial": "Cancelled"
      }
      setStatus(statusMap[purchase.status] || purchase.status || "Credit")
      
      setPurchaseStatus(purchase.purchase_status || "Delivered")
      setPaymentMethod(purchase.payment_method || "Cash")
      setReceivedAmount(Number(purchase.received_amount) || 0)

      // Calculate subtotal from items
      const calculatedSubtotal = items.reduce((sum: number, item: any) => sum + item.quantity * item.price, 0)

      // Estimate tax and discount
      if (calculatedSubtotal > 0) {
        const estimatedTaxAmount = Math.round((purchase.total_amount - calculatedSubtotal) * 100) / 100
        if (estimatedTaxAmount > 0) {
          setTaxRate(Math.round((estimatedTaxAmount / calculatedSubtotal) * 100 * 100) / 100)
          setDiscountAmount(0)
        } else {
          setTaxRate(0)
          setDiscountAmount(Math.abs(estimatedTaxAmount))
        }
      }

      // Set product rows with optimized mapping
      const productRows = items.map((item: any) => ({
        id: crypto.randomUUID(),
        productId: item.product_id,
        productName: item.product_name,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
        originalItemId: item.id,
        wholesalePrice: item.wholesale_price || item.price,
      }))

      setProducts(
        productRows.length > 0
          ? productRows
          : [
              {
                id: crypto.randomUUID(),
                productId: null,
                productName: "",
                quantity: 1,
                price: 0,
                total: 0,
                wholesalePrice: 0,
              },
            ]
      )

    } catch (error) {
      console.error("Error fetching purchase details:", error)
      const errorMessage = error instanceof Error ? error.message : "An error occurred while loading purchase details"
      setError(errorMessage)
      notifyError(toast, errorMessage)
    } finally {
      setIsLoading(false)
      isLoadingRef.current = false
    }
  }, [purchaseId, isOpen, userId, toast])

  // Fetch purchase details when modal opens or purchaseId changes
  useEffect(() => {
    if (isOpen && purchaseId) {
      fetchPurchaseDetails()
    }
  }, [isOpen, purchaseId, fetchPurchaseDetails])

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetForm()
      setIsLoading(true)
      lastPurchaseIdRef.current = null
      isLoadingRef.current = false
      isSubmittingRef.current = false
    }
  }, [isOpen, resetForm])

  // Auto-adjust received amount based on status with debouncing
  useEffect(() => {
    if (status === "Paid") {
      setReceivedAmount(totalAmount)
    } else if (status === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [status, totalAmount])

  // Optimized status change handler
  const handleStatusChange = useCallback((newStatus: string) => {
    setStatus(newStatus)
    // Received amount will be auto-adjusted by the useEffect above
  }, [])

  // Optimized product row operations
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

  const removeProductRow = useCallback((id: string) => {
    setProducts(prev => prev.length > 1 ? prev.filter(product => product.id !== id) : prev)
  }, [])

  const updateProductRow = useCallback((id: string, updates: Partial<ProductRow>) => {
    setProducts(prev =>
      prev.map(product => {
        if (product.id === id) {
          const updatedProduct = { ...product, ...updates }
          if (updates.quantity !== undefined || updates.price !== undefined) {
            updatedProduct.total = updatedProduct.quantity * updatedProduct.price
          }
          return updatedProduct
        }
        return product
      })
    )
  }, [])

  // Optimized product selection handler
  const handleProductSelect = useCallback((
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
  ) => {
    const priceToUse = wholesalePrice || price
    const currentQuantity = products.find(p => p.id === id)?.quantity || 1

    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse,
      wholesalePrice,
      total: currentQuantity * priceToUse,
    })
  }, [products, updateProductRow])

  // Modal handlers
  const handleAddNewFromRow = useCallback((rowId: string) => {
    setActiveProductRowId(rowId)
    setIsNewProductModalOpen(true)
  }, [])

  const handleNewProduct = useCallback((product: any) => {
    dispatch(addProduct(product))
    notifySuccess(toast, `Product "${product.name}" added successfully`)

    const targetRowId = activeProductRowId || products.find(p => !p.productId)?.id || products[products.length - 1].id
    const priceToUse = product.wholesale_price || product.price

    updateProductRow(targetRowId, {
      productId: product.id,
      productName: product.name,
      price: priceToUse,
      wholesalePrice: product.wholesale_price,
      total: (products.find(p => p.id === targetRowId)?.quantity || 1) * priceToUse,
    })

    setIsNewProductModalOpen(false)
    setActiveProductRowId(null)
  }, [dispatch, toast, activeProductRowId, products, updateProductRow])

  // Form validation
  const validateForm = useCallback(() => {
    if (!supplier) {
      return "Please select a supplier"
    }

    if (!products.every(p => p.productId && p.quantity > 0)) {
      return "Please select products and ensure quantities are greater than zero"
    }

    if (status === "Paid" && !paymentMethod) {
      return "Please select a payment method"
    }

    if (receivedAmount > totalAmount) {
      return "Received amount cannot be greater than total amount"
    }

    return null
  }, [supplier, products, status, paymentMethod, receivedAmount, totalAmount])

  // Optimized form submission with duplicate prevention
  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) {
      return // Prevent duplicate submissions
    }

    const validationError = validateForm()
    if (validationError) {
      setFormAlert({ type: "error", message: validationError })
      return
    }

    isSubmittingRef.current = true
    setIsSubmitting(true)
    setFormAlert(null)

    try {
      let finalReceivedAmount = receivedAmount
      if (status === "Paid") {
        finalReceivedAmount = totalAmount
      } else if (status === "Cancelled") {
        finalReceivedAmount = 0
      }

      const formData = new FormData()
      formData.append("id", purchaseId.toString())
      formData.append("supplier", supplier)
      formData.append("purchase_date", date.toISOString())
      formData.append("total_amount", totalAmount.toString())
      formData.append("status", status)
      formData.append("purchase_status", purchaseStatus)
      formData.append("payment_method", paymentMethod)
      formData.append("user_id", userId.toString())
      formData.append("device_id", deviceId.toString())
      formData.append("received_amount", finalReceivedAmount.toString())

      const items = products.map(p => ({
        id: p.originalItemId,
        product_id: p.productId,
        quantity: p.quantity,
        price: p.price,
      }))

      formData.append("items", JSON.stringify(items))

      const result = await updatePurchase(formData)

      if (result.success) {
        notifySuccess(toast, "Purchase updated successfully")
        onPurchaseUpdated?.()
        setTimeout(() => {
          onClose()
        }, 500)
      } else {
        const errorMessage = result.message || "Failed to update purchase"
        setFormAlert({ type: "error", message: errorMessage })
        notifyError(toast, errorMessage)
      }
    } catch (error) {
      console.error("Update purchase error:", error)
      const errorMessage = "An unexpected error occurred"
      setFormAlert({ type: "error", message: errorMessage })
      notifyError(toast, errorMessage)
    } finally {
      setIsSubmitting(false)
      isSubmittingRef.current = false
    }
  }, [
    validateForm,
    receivedAmount,
    status,
    totalAmount,
    purchaseId,
    supplier,
    date,
    purchaseStatus,
    paymentMethod,
    userId,
    deviceId,
    products,
    toast,
    onPurchaseUpdated,
    onClose,
  ])

  // Memoized close handler
  const handleClose = useCallback(() => {
    if (!isSubmitting && !isLoading) {
      onClose()
    }
  }, [isSubmitting, isLoading, onClose])

  return (
    <>
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-5xl max-h-[95vh] overflow-hidden p-0 bg-white border-gray-200 [&>button]:hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Edit Purchase</h2>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleClose} 
                className="text-white hover:bg-white/20 h-8 w-8"
                disabled={isSubmitting || isLoading}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Loading State */}
          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-2 text-gray-600">Loading purchase details...</span>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-500">{error}</div>
          ) : (
            <>
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
                        <div className="flex justify-between font-bold text-blue-600 border-t border-gray-200 pt-2">
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
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 mt-4"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...
                        </>
                      ) : (
                        "Update Purchase"
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
                      className="flex items-center gap-1 h-8 border-blue-300 text-blue-600 hover:bg-blue-50"
                    >
                      <Plus className="h-3 w-3" /> Add Product
                    </Button>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 p-2 bg-blue-50 font-medium text-sm text-blue-800 border-b border-gray-200">
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
                        } hover:bg-blue-50 transition-colors`}
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
            </>
          )}
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
