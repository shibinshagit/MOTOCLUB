"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2, CreditCard, Banknote, Globe, X } from "lucide-react"
import { getPurchaseDetails, updatePurchase } from "@/app/actions/purchase-actions"
import { getDeviceCurrency, getDeviceDefaultCourierPct } from "@/app/actions/dashboard-actions"
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
import { allocatePurchaseCosts, calculatePurchaseCourierCharge } from "@/lib/purchase-courier"
import { markInventoryStale } from "@/lib/inventory-sync"

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
  variantId?: number | null
  batchId?: number | null
  productName: string
  quantity: number
  quantityInput?: string
  price: number
  priceInput?: string
  total: number
  originalItemId?: number
  wholesalePrice?: number
  taxPercentage: number
  taxPercentageInput?: string
  taxAmount: number
  lineTotal: number
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
  const [products, setProducts] = useState<ProductRow[]>([])
  
  const [discountAmount, setDiscountAmount] = useState(0)
  const [courierChargePercentage, setCourierChargePercentage] = useState<number>(0)
  const [courierChargePercentageInput, setCourierChargePercentageInput] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [customCourierCharge, setCustomCourierCharge] = useState<number | null>(null)
  const [isEditingCourier, setIsEditingCourier] = useState(false)
  const [courierInputVal, setCourierInputVal] = useState("")
  
  // Calculate totals synchronously during render to avoid double-renders and blinking inputs
  const subtotal = useMemo(() => products.reduce((sum, product) => sum + (product.quantity * product.price), 0), [products])
  const taxAmount = useMemo(() => products.reduce((sum, product) => sum + product.taxAmount, 0), [products])
  const autoCourierCharge = useMemo(
    () => calculatePurchaseCourierCharge(subtotal, courierChargePercentage),
    [subtotal, courierChargePercentage]
  )
  const courierCharge = customCourierCharge !== null ? customCourierCharge : autoCourierCharge
  const totalAmount = useMemo(() => Number(subtotal) + Number(taxAmount) - Number(discountAmount) + Number(courierCharge), [subtotal, taxAmount, discountAmount, courierCharge])

  const purchaseItemsWithAllocations = useMemo(() => {
    const costAllocations = allocatePurchaseCosts(products, courierCharge, discountAmount)
    return products.map((item, idx) => {
      const allocation = costAllocations[idx]
      return {
        ...item,
        allocationPercentage: allocation ? allocation.allocationPercentage : 0,
        allocatedCourier: allocation ? allocation.courierCharge : 0,
        allocatedDiscount: allocation ? allocation.discountAmount : 0,
        finalCost: allocation ? allocation.lineTotalCost : item.lineTotal,
      }
    })
  }, [products, courierCharge, discountAmount, subtotal, courierChargePercentage])

  const allocationMap = useMemo(() => {
    const map = new Map<string, { allocationPercentage: number; allocatedCourier: number; allocatedDiscount: number; finalCost: number }>()
    purchaseItemsWithAllocations.forEach(item => {
      map.set(item.id, {
        allocationPercentage: item.allocationPercentage,
        allocatedCourier: item.allocatedCourier,
        allocatedDiscount: item.allocatedDiscount,
        finalCost: item.finalCost,
      })
    })
    return map
  }, [purchaseItemsWithAllocations])

  const [formAlert, setFormAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [activeProductRowId, setActiveProductRowId] = useState<string | null>(null)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)

  // Reset form state when modal closes or purchaseId changes
  const resetForm = useCallback(() => {
    setDate(new Date())
    setSupplier("")
    setStatus("Credit")
    setPurchaseStatus("Delivered")
    setPaymentMethod("Cash")
    setReceivedAmount(0)
    setProducts([])
    setDiscountAmount(0)
    setCourierChargePercentage(0)
    setCourierChargePercentageInput("")
    setCustomCourierCharge(null)
    setIsEditingCourier(false)
    setCourierInputVal("")
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
      const [currencyResult, purchaseResult, courierRateResult] = await Promise.allSettled([
        getDeviceCurrency(deviceId),
        getPurchaseDetails(purchaseId),
        getDeviceDefaultCourierPct(deviceId),
      ])

      if (currencyResult.status === 'fulfilled') {
        setLocalCurrency(currencyResult.value)
      } else {
        setLocalCurrency("QAR")
      }

      if (purchaseResult.status === 'rejected') {
        throw purchaseResult.reason
      }

      const result = purchaseResult.value
      if (!result.success) {
        throw new Error(result.message || "Failed to load purchase details")
      }

      const { purchase, items } = result.data!

      setDate(new Date(purchase.purchase_date))
      setSupplier(purchase.supplier || "")
      setCourierChargePercentage(courierRateResult.status === "fulfilled" ? courierRateResult.value : 0)

      const lineTotalsBeforeDiscount = items.reduce(
        (sum: number, item: any) => sum + Number(item.line_total ?? (item.quantity * item.price)),
        0,
      )
      const savedDiscount = purchase.discount !== undefined && purchase.discount !== null ? Number(purchase.discount) : NaN
      setDiscountAmount(!isNaN(savedDiscount) ? savedDiscount : Math.max(0, lineTotalsBeforeDiscount + Number(purchase.courier_charge || 0) - Number(purchase.total_amount || 0)))

      const statusMap: Record<string, string> = {
        "Pending": "Credit",
        "Received": "Paid",
        "Partial": "Cancelled"
      }
      setStatus(statusMap[purchase.status] || purchase.status || "Credit")
      
      setPurchaseStatus(purchase.purchase_status || "Delivered")
      setPaymentMethod(purchase.payment_method || "Cash")
      setReceivedAmount(Number(purchase.received_amount) || 0)

      const productRows = items.map((item: any) => ({
        id: crypto.randomUUID(),
        productId: item.product_id,
        variantId: item.product_variant_id,
        batchId: item.batch_id,
        productName: item.product_name,
        quantity: item.quantity,
        price: item.price,
        total: item.quantity * item.price,
        originalItemId: item.id,
        wholesalePrice: item.wholesale_price || item.price,
        taxPercentage: item.tax_percentage || 0,
        taxAmount: item.tax_amount || 0,
        lineTotal: item.line_total || (item.quantity * item.price),
      }))

      setProducts(productRows)

      const initialSubtotal = productRows.reduce((sum: number, product: any) => sum + product.total, 0)
      const calculatedPct = courierRateResult.status === "fulfilled" ? courierRateResult.value : 0
      const calculatedAutoCourier = calculatePurchaseCourierCharge(initialSubtotal, calculatedPct)
      const savedCourier = Number(purchase.courier_charge) || 0
      if (Math.abs(savedCourier - calculatedAutoCourier) > 0.01) {
        setCustomCourierCharge(savedCourier)
      } else {
        setCustomCourierCharge(null)
      }

    } catch (error) {
      console.error("Error fetching purchase details:", error)
      const errorMessage = error instanceof Error ? error.message : "An error occurred while loading purchase details"
      setError(errorMessage)
      notifyError(toast, errorMessage)
    } finally {
      setIsLoading(false)
      isLoadingRef.current = false
    }
  }, [purchaseId, isOpen, deviceId, toast])

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

  // Form submission
  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) {
      return
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

      const items = purchaseItemsWithAllocations.map(p => ({
        id: p.originalItemId,
        product_id: p.productId,
        variant_id: p.variantId || null,
        batch_id: p.batchId || null,
        quantity: p.quantity,
        price: p.price,
        tax_percentage: p.taxPercentage || 0,
        tax_amount: p.taxAmount || 0,
        line_total: p.lineTotal,
        courier_charge: p.allocatedCourier,
        discount: p.allocatedDiscount,
      }))

      formData.append("items", JSON.stringify(items))
      formData.append("courier_charge", courierCharge.toString())
      formData.append("courier_charge_percentage", courierChargePercentage.toString())
      formData.append("discount", discountAmount.toString())

      const result = await updatePurchase(formData)

      if (result.success) {
        notifySuccess(toast, "Purchase updated successfully")
        markInventoryStale(dispatch)
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
    purchaseItemsWithAllocations,
    courierCharge,
    courierChargePercentage,
    discountAmount,
    toast,
    onPurchaseUpdated,
    onClose,
  ])

  // Update product row
  const updateProductRow = useCallback((id: string, updates: Partial<ProductRow>) => {
    setProducts((prev) =>
      prev.map((product) => {
        if (product.id === id) {
          const updatedProduct = { ...product, ...updates }
          if (updates.quantity !== undefined || updates.price !== undefined) {
            updatedProduct.total = updatedProduct.quantity * updatedProduct.price
          }
          if (updates.taxPercentage !== undefined || updates.quantity !== undefined || updates.price !== undefined) {
            updatedProduct.taxAmount = updatedProduct.quantity * updatedProduct.price * (updatedProduct.taxPercentage / 100)
            updatedProduct.lineTotal = updatedProduct.total + updatedProduct.taxAmount
          }
          return updatedProduct
        }
        return product
      })
    )
  }, [])

  // Handle product selection
  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    _stock?: number,
    productObj?: any,
  ) => {
    const priceToUse = wholesalePrice || price
    const defaultTaxPercentage = productObj?.tax_percentage || 0
    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse,
      wholesalePrice,
      taxPercentage: defaultTaxPercentage,
      total: (products.find((p) => p.id === id)?.quantity || 1) * priceToUse,
    })
  }

  const handleAddNewFromRow = (rowId: string) => {
    setActiveProductRowId(rowId)
    setIsNewProductModalOpen(true)
  }

  const handleNewProduct = (newProduct: any) => {
    if (!activeProductRowId) return
    handleProductSelect(
      activeProductRowId,
      newProduct.id,
      newProduct.name,
      newProduct.wholesale_price || newProduct.price || 0,
      newProduct.wholesale_price,
      newProduct.stock || 0,
      newProduct,
    )
    setIsNewProductModalOpen(false)
    setActiveProductRowId(null)
  }

  // Remove product row
  const removeProductRow = useCallback((id: string) => {
    setProducts((prev) => prev.length > 1 ? prev.filter((product) => product.id !== id) : prev)
  }, [])

  // Add product row
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
        taxPercentage: 0,
        taxAmount: 0,
        lineTotal: 0,
      },
    ])
  }

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
                        <Select value={status} onValueChange={(val) => setStatus(val)}>
                          <SelectTrigger className="h-9 mt-1 bg-white border-gray-300 text-gray-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-gray-200">
                            <SelectItem value="Credit">Credit</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
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
                        <div className="flex justify-between items-center text-sm">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-600 font-medium">Courier Charge:</span>
                              {!isEditingCourier && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCourierInputVal(courierCharge.toFixed(2))
                                    setIsEditingCourier(true)
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-800 underline font-medium focus:outline-none"
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                            {subtotal > 0 && courierChargePercentage > 0 && (
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                {courierChargePercentage}% of {localCurrency}{subtotal.toFixed(2)} · distributed to {purchaseItemsWithAllocations.length} item(s)
                              </p>
                            )}
                          </div>
                          {isEditingCourier ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-gray-900 text-xs font-semibold mr-0.5">{localCurrency}</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={courierInputVal}
                                onChange={(e) => setCourierInputVal(e.target.value)}
                                className="w-20 h-7 text-xs text-center bg-white border-gray-300 text-gray-900 focus:ring-1 focus:ring-blue-500"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const parsed = parseFloat(courierInputVal)
                                  if (!isNaN(parsed) && parsed >= 0) {
                                    setCustomCourierCharge(parsed)
                                  }
                                  setIsEditingCourier(false)
                                }}
                                className="text-xs px-1.5 py-0.5 text-white bg-blue-600 hover:bg-blue-700 rounded font-medium focus:outline-none"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCustomCourierCharge(null)
                                  setIsEditingCourier(false)
                                }}
                                className="text-xs px-1.5 py-0.5 text-gray-600 hover:text-gray-900 bg-gray-100 hover:bg-gray-200 rounded font-medium focus:outline-none"
                              >
                                Reset
                              </button>
                            </div>
                          ) : (
                            <span className="text-gray-900">
                              {localCurrency} {courierCharge.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-gray-600">Discount:</span>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                            className="w-16 h-7 text-xs text-center bg-white border-gray-300 text-gray-900"
                          />
                        </div>
                        <div className="flex justify-between font-bold text-blue-600 border-t border-gray-200 pt-2">
                          <span>Grand Total:</span>
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
                    <div className="sticky top-0 z-10 grid grid-cols-[38fr_9fr_16fr_9fr_11fr_12fr_5fr] gap-2 p-2 bg-blue-50 font-medium text-sm text-blue-800 border-b border-gray-200">
                      <div className="min-w-0">Product</div>
                      <div className="min-w-0">Qty</div>
                      <div className="min-w-0">Cost</div>
                      <div className="min-w-0">Tax %</div>
                      <div className="min-w-0">Tax Amt</div>
                      <div className="min-w-0">Line Total</div>
                      <div className="min-w-0"></div>
                    </div>

                    {products.map((product, index) => (
                      <div key={product.id}>
                      <div
                        key={product.id}
                        className={`grid grid-cols-[38fr_9fr_16fr_9fr_11fr_12fr_5fr] gap-2 p-2 items-center border-b border-gray-200 ${
                          index % 2 === 0 ? "bg-white" : "bg-gray-50"
                        } hover:bg-blue-50 transition-colors`}
                      >
                        <div className="min-w-0">
                          <ProductSelectSimple
                            value={product.productId}
                            onChange={(productId, productName, price, wholesalePrice, stock, productObj) =>
                              handleProductSelect(product.id, productId, productName, price, wholesalePrice, stock, productObj)
                            }
                            onAddNew={() => handleAddNewFromRow(product.id)}
                            userId={userId}
                            usePriceType="wholesale"
                            allowServices={false}
                          />
                        </div>
                        <div className="min-w-0">
                          <Input
                            type="number"
                            min="1"
                            value={product.quantityInput !== undefined ? product.quantityInput : product.quantity}
                            onChange={(e) =>
                              updateProductRow(product.id, { quantityInput: e.target.value, quantity: Number.parseInt(e.target.value) || 1 })
                            }
                            className="h-9 border-slate-300 w-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.priceInput !== undefined ? product.priceInput : product.price}
                            onChange={(e) =>
                              updateProductRow(product.id, { priceInput: e.target.value, price: Number.parseFloat(e.target.value) || 0 })
                            }
                            placeholder="0.00"
                            className="h-9 border-slate-300 w-full"
                          />
                        </div>
                        <div className="min-w-0">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={product.taxPercentageInput !== undefined ? product.taxPercentageInput : product.taxPercentage}
                            onChange={(e) => {
                              const val = e.target.value
                              const numValue = Number.parseFloat(val) || 0
                              if (numValue >= 0 && numValue <= 100) {
                                updateProductRow(product.id, { taxPercentageInput: val, taxPercentage: numValue })
                              }
                            }}
                            className="h-9 border-slate-300 w-full"
                          />
                        </div>
                        <div className="min-w-0 text-sm text-gray-600 truncate">
                          {localCurrency} {product.taxAmount.toFixed(2)}
                        </div>
                        <div className="min-w-0 font-medium text-gray-900 truncate">
                          {localCurrency} {product.lineTotal.toFixed(2)}
                        </div>
                        <div className="w-8 shrink-0 flex justify-center">
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
                      {allocationMap.has(product.id) && (
                        <div className="grid grid-cols-[38fr_62fr] gap-2 px-2 py-1 text-xs bg-purple-50 text-purple-900 border-b border-gray-200">
                          <div></div>
                          <div className="flex gap-4 items-center">
                            <span>Original: {localCurrency} {product.lineTotal.toFixed(2)}</span>
                            <span>Allocation: {allocationMap.get(product.id)!.allocationPercentage.toFixed(2)}%</span>
                            <span>Courier: {localCurrency} {allocationMap.get(product.id)!.allocatedCourier.toFixed(2)}</span>
                            <span className="font-semibold">Final Cost: {localCurrency} {allocationMap.get(product.id)!.finalCost.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
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
