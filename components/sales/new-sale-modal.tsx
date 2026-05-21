"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
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
  Receipt,
  User,
  Calendar,
  CreditCard,
  Users,
  Wrench,
  X,
  Loader2,
} from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import CustomerSelectSimple from "./customer-select-simple"
import ProductSelectSimple from "./product-select-simple"
import { DatePickerField } from "@/components/ui/date-picker-field"
import NewCustomerModal from "./new-customer-modal"
import NewProductModal from "./new-product-modal"
import NewServiceModal from "../services/new-service-modal"
import { addSale } from "@/app/actions/sale-actions"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { checkDatabaseHealth } from "@/lib/db"
import { getProductByBarcode } from "@/app/actions/product-actions"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormAlert } from "@/components/ui/form-alert"
import { useSelector } from "react-redux"
import { selectDeviceId } from "@/store/slices/deviceSlice"
import { selectActiveStaff } from "@/store/slices/staffSlice"

interface NewSaleModalProps {
  isOpen: boolean
  onClose: () => void
  userId: number
  currency?: string
}

interface SaleItem {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  cost: number
  notes: string
  itemType: "product" | "service"
}

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  cost: number // renamed from wholesalePrice
  stock?: number
  total: number
  notes?: string // added notes field
}

interface ScanResult {
  status: "success" | "error"
  message: string
  barcode: string
  timestamp: Date
  productName?: string
}

interface ProductSelectSimpleProps {
  id?: string
  value: number | null
  onChange: (value: number, name: string, price: number, wholesalePrice?: number, stock?: number) => void
  onAddNew: () => void
  userId?: number
}

export default function NewSaleModal({ isOpen, onClose, userId, currency: propCurrency }: NewSaleModalProps) {
  // Get device ID and staff data from Redux
  const deviceId = useSelector(selectDeviceId)
  const activeStaff = useSelector(selectActiveStaff)

  // ... existing state ...
  const [receivedAmount, setReceivedAmount] = useState(0)
  const [currency, setCurrency] = useState(propCurrency || "QAR") // Default to QAR or use prop
  const [date, setDate] = useState<Date>(new Date())
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string>("")
  const [staffId, setStaffId] = useState<number | null>(null)
  const [status, setStatus] = useState<string>("Completed") // Default to Completed
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash") // Default payment method
  const [products, setProducts] = useState<ProductRow[]>([
    {
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      cost: 0, // renamed from wholesalePrice
      stock: 0,
      total: 0,
      notes: "", // added notes
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
  const [barcodeInput, setBarcodeInput] = useState<string>("")
  const [isBarcodeProcessing, setIsBarcodeProcessing] = useState<boolean>(false)
  const [productsCache, setProductsCache] = useState<Map<number, any>>(new Map())
  const [lastBarcodeProcessed, setLastBarcodeProcessed] = useState<string>("")
  const [lastInteractionTime, setLastInteractionTime] = useState<number>(Date.now())
  const [notes, setNotes] = useState<string>("")
  const [hasPaymentMethodColumn, setHasPaymentMethodColumn] = useState<boolean>(true)
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [barcodeAlert, setBarcodeAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(
    null,
  )
  const [isNotFoundModalOpen, setIsNotFoundModalOpen] = useState(false)
  const [newProductBarcode, setNewProductBarcode] = useState<string>("")

  // Form state
  const [items, setItems] = useState<SaleItem[]>([
    {
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      cost: 0,
      notes: "",
      itemType: "product",
    },
  ])

  // Calculated values
  const [deviceCurrency, setDeviceCurrency] = useState(currency)

  // UI state
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false)

  const barcodeInputRef = useRef<HTMLInputElement>(null)
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { toast } = useToast()

  // Get device currency on mount
  useEffect(() => {
    const fetchCurrency = async () => {
      try {
        const fetchedCurrency = await getDeviceCurrency(userId)
        setDeviceCurrency(fetchedCurrency)
      } catch (error) {
        console.error("Error fetching currency:", error)
      }
    }

    if (userId) {
      fetchCurrency()
    }
  }, [userId])

  // Calculate totals whenever items or discount changes
  useEffect(() => {
    const newSubtotal = items.reduce((sum, item) => {
      return sum + item.quantity * item.price
    }, 0)

    setSubtotal(newSubtotal)
    const newTotal = Math.max(0, newSubtotal - discountAmount)
    setTotalAmount(newTotal)

    // Auto-set received amount based on payment status
    if (status === "Completed") {
      setReceivedAmount(newTotal)
    } else if (status === "Cancelled" || status === "Pending") {
      setReceivedAmount(0)
    }
    // For Credit, keep the manually entered received amount
  }, [items, discountAmount, status])

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: deviceCurrency,
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Add new item row
  const addItemRow = () => {
    setItems([
      ...items,
      {
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        quantity: 1,
        price: 0,
        cost: 0,
        notes: "",
        itemType: "product",
      },
    ])
  }

  // Remove item row
  const removeItemRow = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter((item) => item.id !== id))
    }
  }

  // Update item
  const updateItem = (id: string, updates: Partial<SaleItem>) => {
    setItems(
      items.map((item) => {
        if (item.id === id) {
          return { ...item, ...updates }
        }
        return item
      }),
    )
  }

  // Handle product selection
  const handleProductSelect = (id: string, productId: number, productName: string, price: number, cost = 0) => {
    updateItem(id, {
      productId,
      productName,
      price,
      cost,
      itemType: "product",
    })

    // Add new empty row if this was the last empty row
    const hasEmptyRow = items.some((item) => !item.productId)
    if (!hasEmptyRow) {
      addItemRow()
    }
  }

  // Handle service selection
  const handleServiceSelect = (id: string, serviceId: number, serviceName: string, price: number, cost = 0) => {
    updateItem(id, {
      productId: serviceId,
      productName: serviceName,
      price,
      cost,
      itemType: "service",
    })

    // Add new empty row if this was the last empty row
    const hasEmptyRow = items.some((item) => !item.productId)
    if (!hasEmptyRow) {
      addItemRow()
    }
  }

  // Handle new customer added
  const handleNewCustomer = (customerId: number, customerName: string) => {
    setCustomerId(customerId)
    setCustomerName(customerName)
    setIsNewCustomerModalOpen(false)
  }

  // Handle new product added
  const handleNewProduct = (productId: number, productName: string, price: number) => {
    // Find the first empty product row or add a new one
    const emptyRow = items.find((item) => !item.productId)
    if (emptyRow) {
      handleProductSelect(emptyRow.id, productId, productName, price)
    } else {
      const newId = crypto.randomUUID()
      setItems([
        ...items,
        {
          id: newId,
          productId,
          productName,
          quantity: 1,
          price,
          cost: 0,
          notes: "",
          itemType: "product",
        },
      ])
    }
    setIsNewProductModalOpen(false)
  }

  // Handle new service added
  const handleNewService = (serviceId: number, serviceName: string, price: number) => {
    // Find the first empty service row or add a new one
    const emptyRow = items.find((item) => !item.productId)
    if (emptyRow) {
      handleServiceSelect(emptyRow.id, serviceId, serviceName, price)
    } else {
      const newId = crypto.randomUUID()
      setItems([
        ...items,
        {
          id: newId,
          productId: serviceId,
          productName: serviceName,
          quantity: 1,
          price,
          cost: 0,
          notes: "",
          itemType: "service",
        },
      ])
    }
    setIsNewServiceModalOpen(false)
  }

  // Reset form
  const resetForm = () => {
    setCustomerId(null)
    setCustomerName("")
    setStaffId(null)
    setDate(new Date())
    setPaymentMethod("Cash")
    setStatus("Completed")
    setReceivedAmount(0)
    setDiscountAmount(0)
    setNotes("")
    setItems([
      {
        id: crypto.randomUUID(),
        productId: null,
        productName: "",
        quantity: 1,
        price: 0,
        cost: 0,
        notes: "",
        itemType: "product",
      },
    ])
  }

  // Handle form submission
  const handleSubmit = async () => {
    // Validate form
    const validItems = items.filter((item) => item.productId && item.quantity > 0)

    if (validItems.length === 0) {
      toast({
        title: "Error",
        description: "Please add at least one item with quantity greater than zero",
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
      // Prepare sale data
      const saleData = {
        customerId,
        userId,
        deviceId: userId, // Using userId as deviceId for now
        saleDate: date.toISOString(),
        paymentMethod,
        paymentStatus: status,
        receivedAmount:
          status === "Completed" ? totalAmount : status === "Pending" || status === "Cancelled" ? 0 : receivedAmount,
        discount: discountAmount,
        notes,
        items: validItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
          cost: item.cost,
          notes: item.notes,
        })),
      }

      const result = await addSale(saleData)

      if (result.success) {
        toast({
          title: "Success",
          description: "Sale added successfully",
        })

        // Print receipt if requested
        if (result.data && result.data.sale) {
          setTimeout(() => {
            printSalesReceipt(result.data.sale, result.data.items)
          }, 500)
        }

        resetForm()
        onClose()
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

  // Check database health when modal opens
  useEffect(() => {
    if (isOpen) {
      console.log("NewSaleModal opened, checking DB health")
      checkDbHealth()
    }
  }, [isOpen])

  // Reset form when modal opens and set active staff
  useEffect(() => {
    if (isOpen) {
      console.log("NewSaleModal opened, resetting form with userId:", userId)
      setDate(new Date())
      setCustomerId(null)
      setCustomerName("")

      // Auto-select active staff from Redux
      if (activeStaff) {
        setStaffId(activeStaff.id)
        console.log("Auto-selected active staff:", activeStaff.name)
      } else {
        setStaffId(null)
      }

      setStatus("Completed") // Default to Completed
      setPaymentMethod("Cash") // Default to Cash
      setProducts([
        {
          id: crypto.randomUUID(),
          productId: null,
          productName: "",
          quantity: 1,
          price: 0,
          cost: 0, // renamed from wholesalePrice
          stock: 0,
          total: 0,
          notes: "", // added notes
        },
      ])
      setDiscountAmount(0)
      setReceivedAmount(0) // Reset received amount
      setScanHistory([])
      setBarcodeInput("")
      setProductsCache(new Map())
      setLastBarcodeProcessed("")
      setLastInteractionTime(Date.now())
      setNotes("")
      setFormAlert(null)
      setBarcodeAlert(null)

      // Fetch currency if not provided as prop
      if (!propCurrency) {
        const fetchCurrency = async () => {
          try {
            const deviceCurrency = await getDeviceCurrency(userId)
            setCurrency(deviceCurrency)
          } catch (err) {
            console.error("Error fetching currency:", err)
          }
        }
        fetchCurrency()
      }

      // Focus the barcode input when the modal opens
      setTimeout(() => {
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus()
        }
      }, 100)
    }
  }, [isOpen, userId, propCurrency, activeStaff])

  // Calculate totals whenever products or discount changes
  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => {
      const productTotal = typeof product.total === "number" ? product.total : 0
      return sum + productTotal
    }, 0)

    setSubtotal(newSubtotal)

    // Ensure discountAmount is a number
    const discount = typeof discountAmount === "number" ? discountAmount : 0
    const finalTotal = Math.max(0, newSubtotal - discount)
    setTotalAmount(finalTotal)

    // Auto-set received amount based on status
    if (status === "Completed") {
      setReceivedAmount(finalTotal)
    } else if (status === "Cancelled") {
      setReceivedAmount(finalTotal)
    } else if (status === "Credit") {
      if (receivedAmount > finalTotal) {
        setReceivedAmount(0)
      }
    } else if (status === "Pending") {
      setReceivedAmount(0) // No payment for pending
    }
  }, [products, discountAmount, status])

  // Set up focus management
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

    // Add event listener for keyboard shortcut
    document.addEventListener("keydown", handleKeyDown)

    return () => {
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen])

  // Check database health
  const checkDbHealth = async () => {
    setIsCheckingDb(true)
    try {
      const status = await checkDatabaseHealth()
      setDbStatus(status)
      console.log("Database health check result:", status)

      if (!status.isHealthy) {
        setFormAlert({
          type: "warning",
          message: "Database connection issue. Operating in offline mode. Some features may be limited.",
        })
      }
    } catch (error) {
      console.error("Error checking database health:", error)
      setDbStatus({
        isHealthy: false,
        message: "Failed to check database health",
        mockMode: true,
      })
      setFormAlert({
        type: "warning",
        message: "Failed to check database health. Operating in offline mode.",
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
        cost: 0, // renamed from wholesalePrice
        stock: 0,
        total: 0,
        notes: "", // added notes
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

  // Update the updateProductRow function to better handle stock validation
  const updateProductRow = (id: string, updates: Partial<ProductRow>) => {
    console.log("Updating product row:", id, updates)
    const updatedProducts = products.map((product) => {
      if (product.id === id) {
        const updatedProduct = { ...product, ...updates }

        // Check if quantity exceeds stock
        if (
          updates.quantity !== undefined &&
          updatedProduct.stock !== undefined &&
          updatedProduct.quantity > updatedProduct.stock
        ) {
          // Set quantity to available stock
          updatedProduct.quantity = updatedProduct.stock

          // Show alert about insufficient stock
          setBarcodeAlert({
            type: "warning",
            message: `Only ${updatedProduct.stock} units available for ${updatedProduct.productName}`,
          })
        }

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
  const handleProductSelect2 = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    console.log("Product selected:", { id, productId, productName, price, wholesalePrice, stock })

    // Add to products cache
    setProductsCache((prev) => {
      const newCache = new Map(prev)
      newCache.set(productId, { id: productId, name: productName, price, wholesalePrice, stock })
      return newCache
    })

    // Check if stock is available
    if (stock !== undefined && stock <= 0) {
      setBarcodeAlert({
        type: "error",
        message: `${productName} is out of stock`,
      })
    }

    updateProductRow(id, {
      productId,
      productName,
      price,
      cost: wholesalePrice,
      stock,
      total: (products.find((p) => p.id === id)?.quantity || 1) * price,
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
  const handleNewCustomer2 = (customerId: number, customerName: string) => {
    console.log("New customer added:", { customerId, customerName })
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
  const handleNewProduct2 = (
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    console.log("New product added:", { productId, productName, price, wholesalePrice, stock })

    // Add to products cache
    setProductsCache((prev) => {
      const newCache = new Map(prev)
      newCache.set(productId, { id: productId, name: productName, price, wholesalePrice, stock })
      return newCache
    })

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
          notes: "", // added notes
        },
      ])
    }

    setIsNewProductModalOpen(false)
    setIsNotFoundModalOpen(false) // Close the not found modal if it was open
    setNewProductBarcode("") // Clear the barcode for new product

    // Focus back on barcode input
    setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus()
      }
    }, 100)
  }

  // Handle new service added
  const handleNewService2 = (serviceId: number, serviceName: string, price: number) => {
    console.log("New service added:", { serviceId, serviceName, price })

    // Find the first empty product row or the last one
    const targetRow = products.find((p) => !p.productId) || products[products.length - 1]

    if (targetRow) {
      updateProductRow(targetRow.id, {
        productId: serviceId,
        productName: serviceName,
        price,
        cost: 0,
        stock: 999, // Services don't have stock limits
        total: targetRow.quantity * price,
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
          cost: 0,
          stock: 999, // Services don't have stock limits
          total: price,
          notes: "", // added notes
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

  // Update the handleProductScanned function to better handle stock validation
  const handleProductScanned = (
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    try {
      // Check if stock is available
      if (stock !== undefined && stock <= 0) {
        setBarcodeAlert({
          type: "error",
          message: `${productName} is out of stock`,
        })
        return false
      }

      // Add to products cache
      setProductsCache((prev) => {
        const newCache = new Map(prev)
        newCache.set(productId, { id: productId, name: productName, price, wholesalePrice, stock })
        return newCache
      })

      // Find if product already exists in the list
      const existingProductIndex = products.findIndex((p) => p.productId === productId)

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
            cost: 0,
            stock: 0,
            total: 0,
            notes: "", // added notes
          }
          setProducts([...updatedProducts, newRow])
        }

        // Add to scan history
        setScanHistory((prev) => [
          {
            status: "success",
            message: `Increased quantity of ${productName} to ${newQuantity > stock ? stock : newQuantity}`,
            barcode: barcodeInput,
            timestamp: new Date(),
            productName,
          },
          ...prev.slice(0, 9), // Keep only the last 10 scans
        ])

        return true
      } else {
        // If product doesn't exist, add it
        const newTotal = Number(price) || 0
        const newProduct = {
          id: crypto.randomUUID(),
          productId,
          productName,
          quantity: 1,
          price,
          cost: wholesalePrice || 0, // Use provided wholesale price or default to 0
          stock: stock || 0,
          total: newTotal,
          notes: "", // added notes
        }

        // If there's an empty row (no productId), update it instead of adding a new one
        const emptyRowIndex = products.findIndex((p) => p.productId === null)

        let updatedProducts: ProductRow[] = []

        if (emptyRowIndex >= 0) {
          updatedProducts = [...products]
          updatedProducts[emptyRowIndex] = {
            ...updatedProducts[emptyRowIndex],
            productId,
            productName,
            price,
            cost: wholesalePrice || 0, // Use provided wholesale price or default to 0
            stock: stock || 0,
            total: newTotal,
            notes: "", // added notes
          }

          setProducts(updatedProducts)
        } else {
          updatedProducts = [...products, newProduct]
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

        // Add a new empty row if needed
        const hasEmptyRow = updatedProducts.some((p) => p.productId === null)
        if (!hasEmptyRow) {
          const newRow = {
            id: crypto.randomUUID(),
            productId: null,
            productName: "",
            quantity: 1,
            price: 0,
            cost: 0,
            stock: 0,
            total: 0,
            notes: "", // added notes
          }
          setProducts([...updatedProducts, newRow])
        }

        return true
      }
    } catch (error) {
      console.error("Error in handleProductScanned:", error)
      return false
    }
  }

  const handleBarcodeInput = async (barcode: string) => {
    // Prevent processing the same barcode multiple times
    if (barcode === lastBarcodeProcessed || !barcode.trim()) return

    setLastBarcodeProcessed(barcode)
    setIsBarcodeProcessing(true)
    setScanStatus("processing")
    setBarcodeAlert(null) // Clear any previous barcode alerts

    try {
      // Call the server action to get product by barcode
      const result = await getProductByBarcode(barcode, userId)

      if (result.success && result.data) {
        // Add the product to the cart using the existing function
        // Pass the wholesale_price and stock to handleProductScanned
        const added = handleProductScanned(
          result.data.id,
          result.data.name,
          result.data.price,
          result.data.wholesale_price,
          result.data.stock,
        )

        if (added) {
          setScanStatus("success")
          setBarcodeAlert({
            type: "success",
            message: `Added ${result.data.name} to the sale`,
          })
        } else {
          setScanStatus("error")
          setBarcodeAlert({
            type: "error",
            message: "Failed to add product to cart",
          })
        }
      } else {
        setScanStatus("error")

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

        // Set barcode alert
        setBarcodeAlert({
          type: "error",
          message: "No product found with this barcode",
        })

        // Save barcode for potential new product
        setNewProductBarcode(barcode)

        // Show not found modal
        setIsNotFoundModalOpen(true)
      }
    } catch (error) {
      console.error("Error scanning barcode:", error)
      setScanStatus("error")

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

      setBarcodeAlert({
        type: "error",
        message: "Failed to process barcode",
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
  const handleSubmit2 = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate device ID
    if (!deviceId) {
      setFormAlert({
        type: "error",
        message: "Device ID not found. Please refresh the page.",
      })
      return
    }

    // Add this validation before the existing validations:
    if (!staffId) {
      setFormAlert({
        type: "error",
        message: "Please select a staff member",
      })
      return
    }

    const validItems = products
      .filter((p) => p.productId !== null)
      .map((p) => ({
        productId: p.productId,
        quantity: p.quantity,
        price: p.price,
        cost: p.cost || 0, // renamed from wholesalePrice
        notes: p.notes || "",
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
        message: "Received amount cannot be greater than total amount",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Prepare the sale data with device ID and received amount
      const saleData = {
        customerId: customerId || null,
        staffId: staffId || null, // Add staff ID
        userId: userId,
        deviceId: deviceId, // Add device ID
        items: validItems,
        paymentStatus: status,
        paymentMethod: paymentMethod,
        saleDate: date?.toISOString() || new Date().toISOString(),
        notes: notes,
        discount: discountAmount,
        receivedAmount: receivedAmount, // Add received amount
      }

      console.log("Submitting sale data:", saleData)

      const result = await addSale(saleData)

      if (result.success) {
        setFormAlert({
          type: "success",
          message: "Sale completed successfully",
        })

        // Print receipt if available
        if (result.data && result.data.sale) {
          setTimeout(() => {
            printSalesReceipt(result.data.sale, result.data.items)
          }, 500)
        }

        // Reset the form for a fresh sale
        setTimeout(() => {
          // Reset form state but keep active staff selected
          setDate(new Date())
          setCustomerId(null)
          setCustomerName("")
          // Keep staff selected from Redux
          if (activeStaff) {
            setStaffId(activeStaff.id)
          }
          setStatus("Completed")
          setPaymentMethod("Cash")
          setProducts([
            {
              id: crypto.randomUUID(),
              productId: null,
              productName: "",
              quantity: 1,
              price: 0,
              cost: 0, // renamed from wholesalePrice
              stock: 0,
              total: 0,
              notes: "", // added notes
            },
          ])
          setDiscountAmount(0)
          setReceivedAmount(0) // Reset received amount
          setScanHistory([])
          setBarcodeInput("")
          setProductsCache(new Map())
          setLastBarcodeProcessed("")
          setLastInteractionTime(Date.now())
          setNotes("")
          setFormAlert(null)
          setBarcodeAlert(null)

          // Focus the barcode input
          if (barcodeInputRef.current) {
            barcodeInputRef.current.focus()
          }
        }, 1500)
      } else {
        setFormAlert({
          type: "error",
          message: result.message || "Failed to complete the sale",
        })
      }
    } catch (error) {
      console.error("Sale submission error:", error)
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
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-full max-h-[95vh] w-[98vw] h-[95vh] overflow-hidden p-0 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <div className="flex h-full flex-col">
            {/* Header with title and status bar */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 text-white p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Receipt className="mr-2 h-6 w-6" />
                  <h2 className="text-xl font-bold">New Sale</h2>
                </div>
                <div className="flex items-center gap-3">
                  {dbStatus && !dbStatus.isHealthy && (
                    <div className="flex items-center bg-red-500/80 px-3 py-1 rounded-full text-sm">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      <span>Offline Mode</span>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8 text-white hover:bg-white/20 rounded-full"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
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

            {/* Main content area - two column layout */}
            <div className="flex flex-col md:flex-row h-[calc(100vh-120px)] overflow-hidden">
              {/* Left column - Products list (larger) */}
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
                        className={`pl-8 transition-all duration-200 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 ${
                          scanStatus === "processing"
                            ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                            : scanStatus === "success"
                              ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                              : scanStatus === "error"
                                ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                                : "border-blue-200 dark:border-blue-600 focus:border-blue-500 dark:focus:border-blue-400"
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
                        className="flex items-center gap-1 border-green-300 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 text-green-600 dark:text-green-400"
                      >
                        <Wrench className="h-4 w-4" /> New Service
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsNewProductModalOpen(true)}
                        className="flex items-center gap-1 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      >
                        <Plus className="h-4 w-4" /> New Product
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addProductRow}
                        className="flex items-center gap-1 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400 bg-transparent"
                      >
                        <Plus className="h-4 w-4" /> Add Row
                      </Button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    <div className="sticky top-0 z-10 grid grid-cols-12 gap-2 p-2 bg-blue-50 dark:bg-blue-900/30 font-medium text-sm text-blue-800 dark:text-blue-200 border-b border-gray-200 dark:border-gray-700">
                      <div className="col-span-3">Product/Service</div>
                      <div className="col-span-2">Notes</div>
                      <div className="col-span-1 text-center">Qty</div>
                      <div className="col-span-2 text-center">Price</div>
                      <div className="col-span-2 text-center">Cost</div>
                      <div className="col-span-1 text-center">Total</div>
                      <div className="col-span-1"></div>
                    </div>

                    {products.map((product, index) => (
                      <div
                        key={product.id}
                        className={`grid grid-cols-12 gap-2 p-2 items-center border-b border-gray-200 dark:border-gray-700 ${
                          index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-800"
                        } hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors duration-150`}
                      >
                        <div className="col-span-3">
                          {product.productId && product.productName ? (
                            <div className="flex items-center justify-between">
                              <span className="truncate flex-1 font-medium text-gray-900 dark:text-gray-100">
                                {product.productName}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                onClick={() => {
                                  updateProductRow(product.id, {
                                    productId: null,
                                    productName: "",
                                    price: 0,
                                    cost: 0,
                                    stock: 0,
                                    total: 0,
                                    notes: "",
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
                              onChange={(productId, productName, price, wholesalePrice, stock) =>
                                handleProductSelect2(product.id, productId, productName, price, wholesalePrice, stock)
                              }
                              onAddNew={() => setIsNewProductModalOpen(true)}
                              onAddNewService={() => setIsNewServiceModalOpen(true)}
                              userId={userId}
                            />
                          )}
                        </div>
                        <div className="col-span-2">
                          <Input
                            placeholder="Notes..."
                            value={product.notes || ""}
                            onChange={(e) => updateProductRow(product.id, { notes: e.target.value })}
                            className="text-sm border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div className="col-span-1">
                          <Input
                            type="number"
                            min="1"
                            value={product.quantity}
                            onChange={(e) => {
                              const newQuantity = Number.parseInt(e.target.value) || 0
                              // Check if quantity exceeds stock
                              if (product.stock !== undefined && newQuantity > product.stock) {
                                setBarcodeAlert({
                                  type: "warning",
                                  message: `Only ${product.stock} units available for ${product.productName}`,
                                })
                                // Set to max available stock
                                updateProductRow(product.id, { quantity: product.stock })
                              } else {
                                updateProductRow(product.id, { quantity: newQuantity })
                              }
                            }}
                            className="text-center border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                            className="text-center border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                        <div className="col-span-2">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={product.cost || 0}
                            onChange={(e) =>
                              updateProductRow(product.id, {
                                cost: Number.parseFloat(e.target.value) || 0,
                              })
                            }
                            className="text-center border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                            className="h-8 w-8 p-0 text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right column - Sale details and summary */}
              <div className="md:w-1/3 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-gray-800">
                {/* Customer and sale details */}
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <div className="space-y-4">
                    {/* Customer - full width */}
                    <div className="space-y-1">
                      <Label
                        htmlFor="customer"
                        className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                      >
                        <User className="h-3.5 w-3.5 mr-1 text-blue-600 dark:text-blue-400" />
                        Customer
                      </Label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <div className="relative">
                            <CustomerSelectSimple
                              value={customerId}
                              onChange={(value, name) => {
                                setCustomerId(value)
                                if (name) setCustomerName(name)
                              }}
                              onAddNew={() => setIsNewCustomerModalOpen(true)}
                              userId={userId}
                              className="bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsNewCustomerModalOpen(true)}
                          className="flex items-center gap-1 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-10 text-blue-600 dark:text-blue-400"
                        >
                          <Plus className="h-4 w-4" /> New
                        </Button>
                      </div>
                    </div>

                    {/* Staff, Status, Date in same row */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label
                          htmlFor="staff"
                          className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                        >
                          <Users className="h-3.5 w-3.5 mr-1 text-green-600 dark:text-green-400" />
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
                        <select
                          id="status"
                          className="flex h-9 w-full items-center justify-between rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          <option value="Completed">Completed</option>
                          <option value="Credit">Credit</option>
                          <option value="Pending">Pending</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <Label
                          htmlFor="date"
                          className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center"
                        >
                          <Calendar className="h-3.5 w-3.5 mr-1 text-blue-600 dark:text-blue-400" />
                          Date
                        </Label>
                        <DatePickerField date={date} onDateChange={setDate} />
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
                          className="border-gray-200 dark:border-gray-600 h-9 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          placeholder="0.00"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Remaining: {currency} {(totalAmount - receivedAmount).toFixed(2)}
                        </p>
                      </div>
                    )}

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
                            <Label htmlFor="online" className="cursor-pointer text-gray-700 dark:text-gray-300 text-sm">
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
                  <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col">
                    <div className="p-2 bg-blue-50 dark:bg-blue-900/30 border-b border-gray-200 dark:border-gray-700"></div>

                    <div className="p-4 space-y-3">
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
                            className="text-right border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center py-3 border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/30 p-3 rounded-md">
                        <span className="font-bold text-blue-800 dark:text-blue-200 text-lg">Total Amount:</span>
                        <div className="font-bold text-blue-800 dark:text-blue-200 text-xl">
                          {currency} {(typeof totalAmount === "number" ? totalAmount : 0).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Complete Sale button */}
                  <div className="mt-4 mb-2">
                    <Button
                      onClick={handleSubmit2}
                      disabled={isSubmitting || isCheckingDb}
                      className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-800 text-white h-auto py-3"
                    >
                      {isSubmitting ? (
                        <span className="flex items-center justify-center">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...
                        </span>
                      ) : (
                        <span className="flex items-center justify-center">
                          <Receipt className="h-4 w-4 mr-2" /> Complete Sale
                        </span>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Customer Modal */}
      <NewCustomerModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onCustomerAdded={(customerId, customerName) => {
          setCustomerId(customerId)
          setCustomerName(customerName)
          setIsNewCustomerModalOpen(false)

          // Focus back on barcode input
          setTimeout(() => {
            if (barcodeInputRef.current) {
              barcodeInputRef.current.focus()
            }
          }, 100)
        }}
        userId={userId}
      />

      {/* New Product Modal */}
      <NewProductModal
        isOpen={isNewProductModalOpen}
        onClose={() => setIsNewProductModalOpen(false)}
        onSuccess={handleNewProduct2}
        userId={userId}
        initialBarcode={newProductBarcode}
      />

      {/* New Service Modal */}
      <NewServiceModal
        isOpen={isNewServiceModalOpen}
        onClose={() => setIsNewServiceModalOpen(false)}
        onSuccess={handleNewService2}
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
