"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, Loader2, CreditCard, Banknote, Globe, X, ChevronDown } from "lucide-react"
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
  quantityInput?: string
  price: number
  priceInput?: string
  total: number
  wholesalePrice?: number
  taxPercentage: number
  taxPercentageInput?: string
  taxAmount: number
  lineTotal: number
  variants: PurchaseVariant[]
}

interface PurchaseVariant {
  id: number
  name: string
  quantity: number
  quantityInput?: string
  price: number
  priceInput?: string
  taxPercentage: number
  taxPercentageInput?: string
  taxAmount: number
  lineTotal: number
  msp?: number | null
  mrp?: number | null
  stock?: number
  shelf?: string | null
  barcode?: string | null
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
      id: "default-1",
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      total: 0,
      wholesalePrice: 0,
      taxPercentage: 0,
      taxAmount: 0,
      lineTotal: 0,
      variants: [],
    },
  ])
  
  const [discountAmount, setDiscountAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Calculate totals synchronously during render to avoid double-renders and blinking inputs
  const subtotal = useMemo(() => products.reduce((sum, product) => sum + (product.quantity * product.price), 0), [products])
  const taxAmount = useMemo(() => products.reduce((sum, product) => sum + product.taxAmount, 0), [products])
  const totalAmount = useMemo(() => Number(subtotal) + Number(taxAmount) - Number(discountAmount), [subtotal, taxAmount, discountAmount])

  const [formAlert, setFormAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
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
      taxPercentage: 0,
      taxAmount: 0,
      lineTotal: 0,
      variants: [],
        },
      ])
      
      
      setDiscountAmount(0)
      setFormAlert(null)
      setActiveProductRowId(null)
    }
  }, [isOpen])

  // Only auto-adjust received amount based on status when totals change
  useEffect(() => {
    if (status === "Paid") {
      setReceivedAmount(totalAmount)
    } else if (status === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [totalAmount, status])

  // Handle status change
  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus)
    if (newStatus === "Paid") {
      setReceivedAmount(totalAmount)
    } else if (newStatus === "Cancelled") {
      setReceivedAmount(0)
    }
  }

  // Remove product row
  const removeProductRow = useCallback((id: string) => {
    setProducts((prev) => prev.length > 1 ? prev.filter((product) => product.id !== id) : prev)
  }, [])

  // Update product row
  const updateProductRow = useCallback((id: string, updates: Partial<ProductRow>) => {
    setProducts((prev) =>
      prev.map((product) => {
        if (product.id === id) {
          const updatedProduct = { ...product, ...updates }
          // Recalculate total if quantity or price changed
          if (updates.quantity !== undefined || updates.price !== undefined) {
            updatedProduct.total = updatedProduct.quantity * updatedProduct.price
          }
          // Recalculate tax amount and line total if tax percentage, quantity, or price changed
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
    // Use wholesale price if available, otherwise use the provided price
    const priceToUse = wholesalePrice || price
    const defaultTaxPercentage = productObj?.tax_percentage || 0

    const sourceVariants = Array.isArray(productObj?.variants) ? productObj.variants : []
    const variants = sourceVariants.map((variant: any, index: number) => ({
      id: Number(variant.id),
      name: String(variant.name || (index === 0 ? "Default" : "Variant")),
      // A single Default variant preserves the existing one-quantity UI.
      quantity: 0,
      price: Number(variant.cost_price ?? variant.wholesale_price ?? priceToUse ?? 0),
      taxPercentage: defaultTaxPercentage,
      taxAmount: 0,
      lineTotal: 0,
      msp: variant.msp != null ? Number(variant.msp) : null,
      mrp: variant.mrp != null ? Number(variant.mrp) : null,
      stock: Number(variant.stock || 0),
      shelf: variant.shelf || null,
      barcode: variant.barcode || null,
    }))
    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse, // Use wholesale price for purchases
      priceInput: undefined,
      wholesalePrice,
      taxPercentage: defaultTaxPercentage,
      taxPercentageInput: undefined,
      total: variants.length > 1 ? 0 : (products.find((p) => p.id === id)?.quantity || 1) * priceToUse,
      variants,
    })
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
      taxPercentage: 0,
      taxAmount: 0,
      lineTotal: 0,
      variants: [],
      },
    ])
  }

  const updateVariant = useCallback((rowId: string, variantId: number, updates: Partial<PurchaseVariant>) => {
    setProducts(current => current.map(row => {
      if (row.id !== rowId) return row
      const variants = row.variants.map(variant => {
        if (variant.id === variantId) {
          const updatedVariant = { ...variant, ...updates }
          // Recalculate tax amount and line total if tax percentage, quantity, or price changed
          if (updates.taxPercentage !== undefined || updates.quantity !== undefined || updates.price !== undefined) {
            updatedVariant.taxAmount = updatedVariant.quantity * updatedVariant.price * (updatedVariant.taxPercentage / 100)
            updatedVariant.lineTotal = (updatedVariant.quantity * updatedVariant.price) + updatedVariant.taxAmount
          }
          return updatedVariant
        }
        return variant
      })
      const total = variants.reduce((sum, variant) => sum + variant.quantity * variant.price, 0)
      return { ...row, variants, total }
    }))
  }, [])

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

    const purchaseItems = products.flatMap((p) => {
      if (!p.productId) return []
      // Multi-variant products submit one item per entered variant. Default-only
      // products intentionally retain the old product-row quantity and cost fields.
      if (p.variants.length > 1) {
        return p.variants.filter(v => v.quantity > 0).map(v => {
          const taxPercentage = v.taxPercentage || 0
          const taxAmount = v.quantity * v.price * (taxPercentage / 100)
          const lineTotal = (v.quantity * v.price) + taxAmount
          return { product_id: p.productId, variant_id: v.id, quantity: v.quantity, price: v.price, tax_percentage: taxPercentage, tax_amount: taxAmount, line_total: lineTotal }
        })
      }
      const taxPercentage = p.taxPercentage || 0
      const taxAmount = p.quantity * p.price * (taxPercentage / 100)
      const lineTotal = (p.quantity * p.price) + taxAmount
      return p.quantity > 0 ? [{ product_id: p.productId, variant_id: p.variants[0]?.id, quantity: p.quantity, price: p.price, tax_percentage: taxPercentage, tax_amount: taxAmount, line_total: lineTotal }] : []
    })

    if (purchaseItems.length === 0) {
      setFormAlert({
        type: "error",
        message: "Please select products and enter a quantity greater than zero",
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
      formData.append("items", JSON.stringify(purchaseItems))

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
                <div className="sticky top-0 z-10 grid grid-cols-[38fr_9fr_16fr_9fr_11fr_12fr_5fr] gap-2 p-2 bg-green-50 font-medium text-sm text-green-800 border-b border-gray-200">
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
                  {product.variants.length <= 1 && (
                  <div
                    key={product.id}
                    className={`grid grid-cols-[38fr_9fr_16fr_9fr_11fr_12fr_5fr] gap-2 p-2 items-center border-b border-gray-200 ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } hover:bg-green-50 transition-colors`}
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
                    <div className="min-w-0 flex justify-center">
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
                  )}
                  {product.variants.length > 1 && (
                    <div className="mx-2 mb-3 overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                      <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                        <ChevronDown className="h-4 w-4" />
                        Variants <span className="font-normal text-emerald-700">({product.variants.length})</span>
                      </div>
                      <div className="grid grid-cols-[28fr_8fr_14fr_8fr_10fr_12fr_10fr_10fr] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                        <div className="min-w-0">Variant</div>
                        <div className="min-w-0">Qty</div>
                        <div className="min-w-0">Cost</div>
                        <div className="min-w-0">Tax %</div>
                        <div className="min-w-0">Tax Amt</div>
                        <div className="min-w-0">Line Total</div>
                        <div className="min-w-0">MSP</div>
                        <div className="min-w-0">MRP</div>
                      </div>
                      {product.variants.map(variant => (
                        <div key={variant.id} className="grid grid-cols-[28fr_8fr_14fr_8fr_10fr_12fr_10fr_10fr] gap-2 items-center border-b border-gray-100 px-3 py-2 last:border-b-0">
                          <div className="min-w-0"><p className="truncate text-sm font-medium text-gray-900">{variant.name}</p><p className="truncate text-[11px] text-gray-500">Stock: {variant.stock || 0}{variant.shelf ? ` · ${variant.shelf}` : ""}{variant.barcode ? ` · ${variant.barcode}` : ""}</p></div>
                          <div className="min-w-0">
                            <Input type="number" min="0" className="h-8 border-slate-300 w-full" value={variant.quantityInput !== undefined ? variant.quantityInput : (variant.quantity || "")} placeholder="0" onChange={e => updateVariant(product.id, variant.id, { quantityInput: e.target.value, quantity: Math.max(0, Number.parseInt(e.target.value) || 0) })} />
                          </div>
                          <div className="min-w-0">
                            <Input type="number" min="0" step="0.01" className="h-8 border-slate-300 w-full" value={variant.priceInput !== undefined ? variant.priceInput : variant.price} placeholder="0.00" onChange={e => updateVariant(product.id, variant.id, { priceInput: e.target.value, price: Number.parseFloat(e.target.value) || 0 })} />
                          </div>
                          <div className="min-w-0">
                            <Input type="number" min="0" max="100" step="0.01" className="h-8 border-slate-300 w-full" value={variant.taxPercentageInput !== undefined ? variant.taxPercentageInput : variant.taxPercentage} onChange={e => {
                              const val = e.target.value
                              const numValue = Number.parseFloat(val) || 0
                              if (numValue >= 0 && numValue <= 100) {
                                updateVariant(product.id, variant.id, { taxPercentageInput: val, taxPercentage: numValue })
                              }
                            }} />
                          </div>
                          <div className="min-w-0 text-xs text-gray-600 truncate">{localCurrency} {variant.taxAmount.toFixed(2)}</div>
                          <div className="min-w-0 text-xs font-medium text-gray-900 truncate">{localCurrency} {variant.lineTotal.toFixed(2)}</div>
                          <div className="min-w-0 rounded bg-gray-50 px-1 py-2 text-xs text-gray-600 truncate">{variant.msp ?? "–"}</div>
                          <div className="min-w-0 rounded bg-gray-50 px-1 py-2 text-xs text-gray-600 truncate">{variant.mrp ?? "–"}</div>
                        </div>
                      ))}
                    </div>
                  )}
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

