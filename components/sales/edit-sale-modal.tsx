"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle, DialogHeader } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Plus,
  Trash2,
  Loader2,
  Barcode,
  Receipt,
  User,
  CreditCard,
  CheckCircle2,
  XCircle,
  ChevronsUpDown,
  Wrench,
  Package,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import CustomerSelect from "./customer-select"
import ProductSelectSimple from "./product-select-simple"
import NewCustomerModal from "./new-customer-modal"
import NewProductModal from "./new-product-modal"
import NewServiceModal from "../services/new-service-modal"
import { getSaleDetails, updateSale } from "@/app/actions/sale-actions"
import { getProductByBarcode } from "@/app/actions/product-actions"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormAlert } from "@/components/ui/form-alert"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"
import { selectActiveStaff } from "@/store/slices/staffSlice"

import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface EditSaleModalProps {
  isOpen: boolean
  onClose: () => void
  saleId: number
  userId: number
  currency?: string
}

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  cost?: number
  stock?: number
  total: number
  originalItemId?: number // For tracking existing items
  notes?: string
  isService?: boolean // Track if this is a service
  serviceId?: number // For services
}

export default function EditSaleModal({ isOpen, onClose, saleId, userId, currency: propCurrency }: EditSaleModalProps) {
  const deviceId = useSelector(selectDeviceId)
  const activeStaff = useSelector(selectActiveStaff)

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState(propCurrency || "QAR")
  const [hasPaymentMethodColumn, setHasPaymentMethodColumn] = useState(true)

  const [date, setDate] = useState<Date>(new Date())
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string>("")
  const [status, setStatus] = useState<string>("Completed")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [products, setProducts] = useState<ProductRow[]>([])
  const [subtotal, setSubtotal] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [taxRate, setTaxRate] = useState(0)
  const [taxAmount, setTaxAmount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [barcodeInput, setBarcodeInput] = useState("")
  const [isBarcodeProcessing, setIsBarcodeProcessing] = useState(false)
  const [lastBarcodeProcessed, setLastBarcodeProcessed] = useState("")
  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [barcodeAlert, setBarcodeAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(
    null,
  )
  const [originalStatus, setOriginalStatus] = useState<string>("")
  const [scanStatus, setScanStatus] = useState<"idle" | "processing" | "success" | "error">("idle")
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const [receivedAmount, setReceivedAmount] = useState(0)

  // Staff state with Redux integration
  const [staffId, setStaffId] = useState<number | null>(null)

  // Auto-dismiss form alerts after 5 seconds
  useEffect(() => {
    if (formAlert) {
      const timer = setTimeout(() => {
        setFormAlert(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [formAlert])

  // Auto-dismiss barcode alerts after 5 seconds
  useEffect(() => {
    if (barcodeAlert) {
      const timer = setTimeout(() => {
        setBarcodeAlert(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [barcodeAlert])

  // Modals for adding new customer/product/service
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false)
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false)
  const [newProductBarcode, setNewProductBarcode] = useState("")

  const { toast } = useToast()

  // Clear form alert when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormAlert(null)
      setBarcodeAlert(null)
    }
  }, [isOpen])

  // Check if payment_method column exists
  useEffect(() => {
    const checkPaymentMethodColumn = async () => {
      try {
        const response = await fetch("/api/db-check?column=payment_method&table=sales", {
          method: "GET",
        })

        if (response.ok) {
          const data = await response.json()
          setHasPaymentMethodColumn(data.exists)
        } else {
          setHasPaymentMethodColumn(false)
        }
      } catch (error) {
        console.error("Error checking payment_method column:", error)
        setHasPaymentMethodColumn(false)
      }
    }

    if (isOpen) {
      checkPaymentMethodColumn()
    }
  }, [isOpen])

  // Fetch sale details when modal opens
  useEffect(() => {
    const fetchSaleDetails = async () => {
      if (!saleId || !isOpen) return

      try {
        setIsLoading(true)
        setFormAlert(null)
        setBarcodeAlert(null)

        // Get currency if not provided as prop
        if (!propCurrency) {
          try {
            const deviceCurrency = await getDeviceCurrency(userId)
            setCurrency(deviceCurrency)
          } catch (err) {
            console.error("Error fetching currency:", err)
          }
        }

        const result = await getSaleDetails(saleId)

        if (result.success) {
          const { sale, items } = result.data

          // Set sale data
          setDate(new Date(sale.sale_date))
          setCustomerId(sale.customer_id)
          setCustomerName(sale.customer_name || "")
          setStatus(sale.status || "Completed")
          setOriginalStatus(sale.status || "Completed")

          // Set staff information from sale data or use active staff from Redux
          if (sale.staff_id) {
            setStaffId(sale.staff_id)
          } else if (activeStaff) {
            // If no staff in sale but we have active staff, use that
            setStaffId(activeStaff.id)
            console.log("Auto-selected active staff for edit:", activeStaff.name)
          }

          // Check if payment_method exists in the sale object
          if ("payment_method" in sale) {
            setPaymentMethod(sale.payment_method || "Cash")
            setHasPaymentMethodColumn(true)
          } else {
            setPaymentMethod("Cash")
            setHasPaymentMethodColumn(false)
          }

          setTotalAmount(Number(sale.total_amount) || 0)

          // Calculate subtotal from items
          const calculatedSubtotal = items.reduce((sum: number, item: any) => sum + item.quantity * item.price, 0)
          setSubtotal(calculatedSubtotal)

          // Set tax values if available
          setTaxRate(Number(sale.tax_rate) || 0)
          setTaxAmount(Number(sale.tax) || 0)

          // Set discount amount
          setDiscountAmount(Number(sale.discount) || 0)

          // Set product rows - properly handle both products and services with actual costs
          const productRows = items.map((item: any) => {
            const isService = !!item.service_name // Check if it's a service

            return {
              id: crypto.randomUUID(),
              productId: item.product_id, // This could be either product_id or service_id
              productName: item.service_name || item.product_name, // Use service_name if available
              quantity: item.quantity,
              price: item.price,
              cost: item.actual_cost || item.cost || 0, // Use the actual cost from sale_items, not product wholesale
              stock: isService ? 999 : item.stock || 0, // Services have unlimited stock
              total: item.quantity * item.price,
              originalItemId: item.id,
              notes: item.notes || "",
              isService: isService,
              serviceId: isService ? item.product_id : undefined, // Store service ID separately
            }
          })

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
                    cost: 0,
                    stock: 0,
                    total: 0,
                    notes: "",
                    isService: false,
                  },
                ],
          )

          setReceivedAmount(Number(sale.received_amount) || (sale.status === "Credit" ? 0 : Number(sale.total_amount)))
        } else {
          setError(result.message || "Failed to load sale details")
          setFormAlert({
            type: "error",
            message: result.message || "Failed to load sale details",
          })
        }
      } catch (error) {
        console.error("Error fetching sale details:", error)
        setError("An error occurred while loading sale details")
        setFormAlert({
          type: "error",
          message: "An error occurred while loading sale details",
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchSaleDetails()
  }, [saleId, isOpen, userId, propCurrency, activeStaff])

  // Add keyboard shortcut for barcode focus
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Alt+S shortcut to focus barcode input
      if (e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault()
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus()
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  // Calculate totals whenever products or discount or tax changes
  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => sum + product.total, 0)
    setSubtotal(newSubtotal)

    // Calculate tax amount based on subtotal - discount
    const afterDiscount = Math.max(0, newSubtotal - discountAmount)
    const newTaxAmount = afterDiscount * (taxRate / 100)
    setTaxAmount(newTaxAmount)

    // Calculate total: subtotal - discount + tax
    setTotalAmount(afterDiscount + newTaxAmount)
  }, [products, discountAmount, taxRate])

  // Validate received amount when total or status changes
  useEffect(() => {
    if (status === "Credit" && receivedAmount > totalAmount) {
      setReceivedAmount(totalAmount)
    }
  }, [totalAmount, status])

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
        cost: 0,
        stock: 0,
        total: 0,
        notes: "",
        isService: false,
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

  // Handle product/service selection
  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    // Check if this is a service (stock = 999 indicates service)
    const isService = stock === 999

    updateProductRow(id, {
      productId,
      productName,
      price,
      cost: wholesalePrice || 0,
      stock: stock || 0,
      total: (products.find((p) => p.id === id)?.quantity || 1) * price,
      isService: isService,
      serviceId: isService ? productId : undefined,
    })

    // Check if we need to add a new empty row
    const hasEmptyRow = products.some((p) => p.productId === null)
    if (!hasEmptyRow) {
      addProductRow()
    }

    // Focus back on barcode input after product selection
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }, 100)
  }

  // Handle new customer added
  const handleNewCustomer = (customerId: number, customerName: string) => {
    setCustomerId(customerId)
    setCustomerName(customerName)
    setIsNewCustomerModalOpen(false)

    // Focus back on barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }, 100)
  }

  // Handle new product added
  const handleNewProduct = (
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    // Find the first empty product row or the last one
    const targetRow = products.find((p) => !p.productId) || products[products.length - 1]

    if (targetRow) {
      updateProductRow(targetRow.id, {
        productId,
        productName,
        price,
        cost: wholesalePrice || 0,
        stock: stock || 0,
        total: targetRow.quantity * price,
        isService: false,
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
          cost: wholesalePrice || 0,
          stock: stock || 0,
          total: price,
          notes: "",
          isService: false,
        },
      ])
    }

    setIsNewProductModalOpen(false)
    setIsNotFoundModalOpen(false)
    setNewProductBarcode("")

    // Focus back on barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }, 100)
  }

  // Handle new service added
  const handleNewService = (serviceId: number, serviceName: string, price: number) => {
    // Find the first empty product row or the last one
    const targetRow = products.find((p) => !p.productId) || products[products.length - 1]

    if (targetRow) {
      updateProductRow(targetRow.id, {
        productId: serviceId,
        productName: serviceName,
        price,
        cost: 0, // Services start with 0 cost but can be edited
        stock: 999, // Services don't have stock limits
        total: targetRow.quantity * price,
        isService: true,
        serviceId: serviceId,
      })
    } else {
      // If no empty row, add a new one
      setProducts([
        ...products,
        {
          id: crypto.randomUUID(),
          productId: serviceId,
          productName: serviceName,
          quantity: 1,
          price,
          cost: 0, // Services start with 0 cost but can be edited
          stock: 999, // Services don't have stock limits
          total: price,
          notes: "",
          isService: true,
          serviceId: serviceId,
        },
      ])
    }

    setIsNewServiceModalOpen(false)

    // Focus back on barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }, 100)
  }

  const handleProductScanned = (
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    // Check if stock is available
    if (stock !== undefined && stock <= 0) {
      setBarcodeAlert({
        type: "error",
        message: `${productName} is out of stock`,
      })
      return false
    }

    // Find if product already exists in the list
    const existingProductIndex = products.findIndex((p) => p.productId === productId && !p.isService)

    if (existingProductIndex >= 0) {
      // If product exists, increment quantity
      const updatedProducts = [...products]
      const product = updatedProducts[existingProductIndex]
      const newQuantity = product.quantity + 1

      // Check if new quantity exceeds stock
      if (stock !== undefined && newQuantity > stock) {
        setBarcodeAlert({
          type: "warning",
          message: `Only ${stock} units available for ${productName}`,
        })

        // Set quantity to available stock
        updatedProducts[existingProductIndex] = {
          ...product,
          quantity: stock,
          total: stock * (Number(price) || 0),
        }
      } else {
        // Update with new quantity
        updatedProducts[existingProductIndex] = {
          ...product,
          quantity: newQuantity,
          total: newQuantity * (Number(price) || 0),
        }
      }

      setProducts(updatedProducts)
      return true
    } else {
      // If product doesn't exist, add it
      const newProduct = {
        id: crypto.randomUUID(),
        productId,
        productName,
        quantity: 1,
        price,
        cost: wholesalePrice || 0,
        stock: stock || 0,
        total: price,
        notes: "",
        isService: false,
      }
      setProducts([...products, newProduct])

      // Check if we need to add a new empty row
      const hasEmptyRow = products.some((p) => p.productId === null)
      if (!hasEmptyRow) {
        addProductRow()
      }

      return true
    }
  }

  // Update the handleBarcodeInput function to auto-submit like in add sale
  const handleBarcodeInput = async (barcode: string) => {
    // Prevent processing the same barcode multiple times
    if (barcode === lastBarcodeProcessed || !barcode.trim()) return

    setLastBarcodeProcessed(barcode)
    setIsBarcodeProcessing(true)
    setBarcodeAlert(null)
    setScanStatus("processing")

    try {
      // Call the server action to get product by barcode
      const result = await getProductByBarcode(barcode.trim(), userId)

      if (result.success && result.data) {
        // Add the product to the cart using the existing function
        const added = handleProductScanned(
          result.data.id,
          result.data.name,
          result.data.price,
          result.data.wholesale_price,
          result.data.stock,
        )

        if (added) {
          setBarcodeAlert({
            type: "success",
            message: `Added ${result.data.name} to the sale`,
          })
          setScanStatus("success")
        } else {
          setBarcodeAlert({
            type: "error",
            message: "Failed to add product to cart",
          })
          setScanStatus("error")
        }
      } else {
        // Product not found
        setBarcodeAlert({
          type: "error",
          message: "No product found with this barcode",
        })

        // Save barcode for potential new product
        setNewProductBarcode(barcode)

        // Show not found modal
        setIsNotFoundModalOpen(true)
        setScanStatus("error")
      }
    } catch (error) {
      console.error("Error scanning barcode:", error)
      setBarcodeAlert({
        type: "error",
        message: "Failed to process barcode",
      })
      setScanStatus("error")
    } finally {
      // Clear the input for the next scan
      setBarcodeInput("")
      setIsBarcodeProcessing(false)

      // Reset the last processed barcode after a delay to prevent duplicate scans
      setTimeout(() => {
        setLastBarcodeProcessed("")
        setScanStatus("idle")
      }, 500)

      // Re-focus the input for the next scan
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }
  }

  // Add the timeout functionality for barcode input
  useEffect(() => {
    return () => {
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current)
      }
    }
  }, [])

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validItems = products
      .filter((p) => p.productId !== null)
      .map((p) => ({
        id: p.originalItemId, // Include the sale_item id for existing items
        productId: p.productId,
        quantity: p.quantity,
        price: p.price,
        wholesalePrice: p.cost, // Use the cost from the form (could be edited)
        cost: p.cost, // Include cost for both products and services
        notes: p.notes,
        isService: p.isService,
        serviceId: p.serviceId,
      }))

    if (validItems.length === 0) {
      setFormAlert({
        type: "error",
        message: "Please add at least one item to the sale",
      })
      return
    }

    // Validate received amount for credit sales
    if (status === "Credit" && receivedAmount > totalAmount) {
      setFormAlert({
        type: "error",
        message: `Received amount (${receivedAmount}) cannot be greater than total amount (${totalAmount})`,
      })
      return
    }

    // Add staff validation in handleSubmit:
    if (!staffId) {
      setFormAlert({
        type: "error",
        message: "Please select a staff member",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Calculate the correct received amount based on status
      let finalReceivedAmount = receivedAmount
      if (status === "Completed") {
        finalReceivedAmount = totalAmount // Full amount for completed
      } else if (status === "Cancelled") {
        finalReceivedAmount = 0 // No amount for cancelled
      } else if (status === "Pending") {
        finalReceivedAmount = 0 // No amount for pending
      }
      // For Credit status, use the entered receivedAmount

      // Prepare the sale data with payment method
      const saleData = {
        id: saleId,
        customerId: customerId || null,
        userId: userId,
        deviceId: deviceId,
        items: validItems,
        paymentStatus: status,
        paymentMethod: paymentMethod,
        saleDate: date?.toISOString() || new Date().toISOString(),
        originalStatus: originalStatus,
        discount: discountAmount,
        taxRate: taxRate,
        receivedAmount: finalReceivedAmount,
        staffId: staffId,
      }

      console.log("Updating sale data:", saleData)

      const result = await updateSale(saleData)

      if (result.success) {
        setFormAlert({
          type: "success",
          message: "Sale updated successfully",
        })

        // Close after a short delay
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setFormAlert({
          type: "error",
          message: result.message || "Failed to update the sale",
        })
      }
    } catch (error) {
      console.error("Sale update error:", error)
      setFormAlert({
        type: "error",
        message: "An unexpected error occurred",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-full max-h-[95vh] w-[98vw] h-[95vh] overflow-hidden p-0 bg-white dark:bg-gray-900">
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white p-4 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                <DialogTitle className="text-xl font-bold text-white">Edit Sale #{saleId}</DialogTitle>
              </div>
            </div>

            {/* Form alert */}
            {formAlert && (
              <div className="px-4 pt-4">
                <FormAlert type={formAlert.type} message={formAlert.message} />
              </div>
            )}

            {/* Barcode alert */}
            {barcodeAlert && (
              <div className="px-4 pt-4">
                <FormAlert type={barcodeAlert.type} message={barcodeAlert.message} />
              </div>
            )}

            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
              </div>
            ) : error ? (
              <div className="text-center py-8 text-red-500 dark:text-red-400">{error}</div>
            ) : (
              <div className="flex flex-col md:flex-row h-[calc(90vh-80px)] overflow-hidden">
                {/* Left side - Products */}
                <div className="md:w-2/3 flex flex-col h-full overflow-hidden border-r border-gray-200 dark:border-gray-700">
                  {/* Barcode scanner section */}
                  <div className="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                        <Input
                          id="barcode-input"
                          ref={barcodeInputRef}
                          placeholder="Scan barcode or search product..."
                          className={`pl-8 transition-all duration-200 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${
                            scanStatus === "processing"
                              ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                              : scanStatus === "success"
                                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                : scanStatus === "error"
                                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                                  : "border-blue-200 focus:border-blue-500 dark:border-gray-600 dark:focus:border-blue-400"
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
                        {scanStatus === "error" && (
                          <XCircle className="absolute right-2.5 top-2.5 h-4 w-4 text-red-500" />
                        )}
                      </div>
                      <Button
                        type="button"
                        onClick={() => {
                          if (barcodeInput.trim()) {
                            handleBarcodeInput(barcodeInput)
                          }
                        }}
                        disabled={isBarcodeProcessing || !barcodeInput}
                        className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Products table */}
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <h3 className="font-medium text-gray-800 dark:text-gray-200">Products & Services</h3>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsNewServiceModalOpen(true)}
                          className="flex items-center gap-1 border-green-300 hover:bg-green-50 dark:border-green-600 dark:hover:bg-green-900/20 dark:text-green-400"
                        >
                          <Wrench className="h-4 w-4 text-green-600 dark:text-green-400" /> New Service
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsNewProductModalOpen(true)}
                          className="flex items-center gap-1 border-blue-300 hover:bg-blue-50 dark:border-blue-600 dark:hover:bg-blue-900/20 dark:text-blue-400"
                        >
                          <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" /> New Product
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={addProductRow}
                          className="flex items-center gap-1 border-blue-300 hover:bg-blue-50 dark:border-blue-600 dark:hover:bg-blue-900/20 dark:text-blue-400 bg-transparent"
                        >
                          <Plus className="h-4 w-4 text-blue-600 dark:text-blue-400" /> Add Row
                        </Button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                      <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 font-medium text-sm text-blue-800 dark:text-blue-200 border-b border-gray-200 dark:border-gray-600">
                        <div className="col-span-3">Product/Service</div>
                        <div className="col-span-2">Notes</div>
                        <div className="col-span-1 text-center">Quantity</div>
                        <div className="col-span-2 text-center">Price</div>
                        <div className="col-span-2 text-center">Cost</div>
                        <div className="col-span-1 text-center">Total</div>
                        <div className="col-span-1"></div>
                      </div>

                      {products.map((product, index) => (
                        <div
                          key={product.id}
                          className={`grid grid-cols-12 gap-2 p-2 border-b border-gray-200 dark:border-gray-600 ${
                            index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                          } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors`}
                        >
                          <div className="col-span-3">
                            {product.productId && product.productName ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  {product.isService ? (
                                    <Wrench className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <Package className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                  )}
                                  <span className="truncate flex-1 font-medium text-gray-900 dark:text-gray-100">
                                    {product.productName}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
                                  onClick={() => {
                                    updateProductRow(product.id, {
                                      productId: null,
                                      productName: "",
                                      price: 0,
                                      cost: 0,
                                      stock: 0,
                                      total: 0,
                                      notes: "",
                                      isService: false,
                                      serviceId: undefined,
                                    })
                                  }}
                                >
                                  <ChevronsUpDown className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <ProductSelectSimple
                                id={`product-select-${product.id}`}
                                value={product.productId}
                                onChange={(productId, productName, price, wholesalePrice, stock) =>
                                  handleProductSelect(product.id, productId, productName, price, wholesalePrice, stock)
                                }
                                onAddNew={() => setIsNewProductModalOpen(true)}
                                onAddNewService={() => setIsNewServiceModalOpen(true)}
                                userId={userId}
                              />
                            )}
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="text"
                              value={product.notes || ""}
                              onChange={(e) => {
                                updateProductRow(product.id, { notes: e.target.value })
                              }}
                              className="h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              type="number"
                              min="1"
                              value={product.quantity}
                              onChange={(e) => {
                                const newQuantity = Number.parseInt(e.target.value) || 0
                                updateProductRow(product.id, { quantity: newQuantity })
                              }}
                              className="text-center h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
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
                              className="text-center h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            />
                          </div>
                          <div className="col-span-2">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={product.cost || 0}
                              onChange={(e) =>
                                updateProductRow(product.id, { cost: Number.parseFloat(e.target.value) || 0 })
                              }
                              className="text-center h-9 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            />
                          </div>
                          <div className="col-span-1 flex items-center justify-center font-medium text-gray-900 dark:text-gray-100">
                            {currency} {product.total.toFixed(2)}
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeProductRow(product.id)}
                              disabled={products.length === 1}
                              className="h-8 w-8 p-0 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Right side - Sale details */}
                <div className="md:w-1/3 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-800">
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="space-y-4">
                      {/* Customer and Staff in single row */}
                      <div className="grid grid-cols-1 gap-3">
                        {/* Customer - full width */}
                        <div className="space-y-1">
                          <Label
                            htmlFor="customer"
                            className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                          >
                            <User className="h-3.5 w-3.5 mr-1 text-blue-600 dark:text-blue-400" />
                            Customer
                          </Label>
                          <CustomerSelect
                            value={customerId}
                            onChange={(value, name) => {
                              setCustomerId(value)
                              if (name) setCustomerName(name)
                            }}
                            onAddNew={() => setIsNewCustomerModalOpen(true)}
                            userId={userId}
                          />
                        </div>

                        {/* Staff, Status, Date in same row */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label
                              htmlFor="staff"
                              className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                            >
                              <User className="h-3.5 w-3.5 mr-1 text-green-600 dark:text-green-400" />
                              Staff *
                            </Label>
                            <div className="h-9 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 flex items-center text-sm text-gray-900 dark:text-gray-100">
                              {activeStaff?.name || "Authenticate staff from dashboard"}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="status" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Status
                            </Label>
                            <Select value={status} onValueChange={setStatus}>
                              <SelectTrigger className="h-9 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600">
                                <SelectItem value="Completed" className="text-gray-900 dark:text-gray-100">
                                  Completed
                                </SelectItem>
                                <SelectItem value="Credit" className="text-gray-900 dark:text-gray-100">
                                  Credit
                                </SelectItem>
                                <SelectItem value="Pending" className="text-gray-900 dark:text-gray-100">
                                  Pending
                                </SelectItem>
                                <SelectItem value="Cancelled" className="text-gray-900 dark:text-gray-100">
                                  Cancelled
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1">
                            <Label htmlFor="date" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Date
                            </Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "w-full h-9 justify-start text-left font-normal bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 text-xs",
                                    !date && "text-muted-foreground",
                                  )}
                                >
                                  <CalendarIcon className="mr-1 h-3 w-3 flex-shrink-0" />
                                  <span className="truncate">{date ? format(date, "MMM dd, yyyy") : "Pick date"}</span>
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                className="w-auto p-0 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-600"
                                align="start"
                              >
                                <Calendar
                                  mode="single"
                                  selected={date}
                                  onSelect={(newDate) => newDate && setDate(newDate)}
                                  initialFocus
                                  className="dark:bg-gray-800"
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>

                        {/* Received Amount - only show for Credit status */}
                        {status === "Credit" && (
                          <div className="space-y-1">
                            <Label
                              htmlFor="received_amount"
                              className="text-sm font-medium text-gray-700 dark:text-gray-300"
                            >
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
                              className="h-9 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                              placeholder="0.00"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Remaining: {currency} {(totalAmount - receivedAmount).toFixed(2)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Payment Method - compact layout when status is Completed */}
                      {status === "Completed" && hasPaymentMethodColumn && (
                        <div className="space-y-2">
                          <Label
                            htmlFor="payment-method"
                            className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1 text-blue-600 dark:text-blue-400" />
                            Payment Method
                          </Label>
                          <RadioGroup
                            value={paymentMethod}
                            onValueChange={setPaymentMethod}
                            className="grid grid-cols-3 gap-2"
                            id="payment-method"
                          >
                            <div className="flex items-center space-x-2 bg-white dark:bg-gray-700 p-2 rounded-md border border-gray-200 dark:border-gray-600">
                              <RadioGroupItem value="Cash" id="cash" />
                              <Label htmlFor="cash" className="cursor-pointer text-gray-700 dark:text-gray-300 text-sm">
                                Cash
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 bg-white dark:bg-gray-700 p-2 rounded-md border border-gray-200 dark:border-gray-600">
                              <RadioGroupItem value="Card" id="card" />
                              <Label htmlFor="card" className="cursor-pointer text-gray-700 dark:text-gray-300 text-sm">
                                Card
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2 bg-white dark:bg-gray-700 p-2 rounded-md border border-gray-200 dark:border-gray-600">
                              <RadioGroupItem value="Online" id="online" />
                              <Label
                                htmlFor="online"
                                className="cursor-pointer text-gray-700 dark:text-gray-300 text-sm"
                              >
                                Online
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sale summary */}
                  <div className="flex-1 p-4 flex flex-col overflow-y-auto">
                    <Card className="bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
                      <CardHeader className="p-3 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-gray-700">
                        <h3 className="font-medium text-blue-800 dark:text-blue-200">Sale Summary</h3>
                      </CardHeader>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-center py-2 text-gray-700 dark:text-gray-300">
                          <span className="font-medium">Subtotal:</span>
                          <span className="text-lg">
                            {currency} {(typeof subtotal === "number" ? subtotal : 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center py-2 border-t border-gray-200 dark:border-gray-700">
                          <span className="font-medium text-gray-700 dark:text-gray-300">Discount:</span>
                          <div className="w-28">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={discountAmount}
                              onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                              className="text-right h-8 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center py-3 border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md">
                          <span className="font-bold text-blue-800 dark:text-blue-200 text-lg">Total Amount:</span>
                          <div className="font-bold text-blue-800 dark:text-blue-200 text-xl">
                            {currency} {(typeof totalAmount === "number" ? totalAmount : 0).toFixed(2)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Update Sale button */}
                    <div className="mt-4 mb-2">
                      <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white h-auto py-3"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center">
                            <Receipt className="h-4 w-4 mr-2" /> Update Sale
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
        onSuccess={handleNewProduct}
        userId={userId}
        initialBarcode={newProductBarcode}
      />

      {/* New Service Modal */}
      <NewServiceModal
        isOpen={isNewServiceModalOpen}
        onClose={() => setIsNewServiceModalOpen(false)}
        onSuccess={handleNewService}
        userId={userId}
      />

      {/* Not Found Product Modal */}
      <Dialog open={isNotFoundModalOpen} onOpenChange={setIsNotFoundModalOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">Add New Product</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <FormAlert type="error" message="No product found with this barcode" className="mb-4" />
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Would you like to add a new product with this barcode?
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                onClick={() => setIsNotFoundModalOpen(false)}
                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setIsNotFoundModalOpen(false)
                  setIsNewProductModalOpen(true)
                }}
                className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white"
              >
                Add New Product
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
