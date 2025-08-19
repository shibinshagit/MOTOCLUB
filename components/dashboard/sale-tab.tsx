"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { format } from "date-fns"
import {
  Search,
  Loader2,
  Plus,
  Filter,
  RefreshCw,
  Calendar,
  User,
  XCircle,
  CreditCard,
  AlertCircle,
  Barcode,
  Trash2,
  CheckCircle2,
  ChevronsUpDown,
  Users,
  Wrench,
  Save,
  Settings,
  Eye,
  EyeOff,
  CalendarDays,
  Edit,
  X,
  Pencil,
} from "lucide-react"
import { getUserSales, deleteSale, addSale, getSaleDetails, updateSale } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import ViewSaleModal from "@/components/sales/view-sale-modal"
import { useRouter } from "next/navigation"
import { useSelector, useDispatch } from "react-redux"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import {
  selectSales,
  selectFilteredSales,
  selectSalesLoading,
  selectSalesRefreshing,
  selectSalesSilentRefreshing,
  selectSalesLastUpdated,
  selectSalesFetchedTime,
  selectSalesNeedsRefresh,
  selectSalesError,
  selectSalesSearchTerm,
  selectSalesStatusFilter,
  selectSalesPaymentMethodFilter,
  selectSalesDateFromFilter,
  selectSalesDateToFilter,
  selectSalesMinAmountFilter,
  selectSalesMaxAmountFilter,
  selectSalesShowFilters,
  selectSalesCurrency,
  setSales,
  updateSalesData,
  setFilteredSales,
  setLoading,
  setSilentRefreshing,
  setNeedsRefresh,
  forceClearSales,
  setError,
  setSearchTerm,
  setDateFromFilter,
  setDateToFilter,
  setStatusFilter,
  setPaymentMethodFilter,
  setCurrency,
  clearFilters,
  removeSale,
  resetSalesState,
} from "@/store/slices/salesSlice"
import CustomerSelectSimple from "@/components/sales/customer-select-simple"
import ProductSelectSimple from "@/components/sales/product-select-simple"
import { DatePickerField } from "@/components/ui/date-picker-field"
import NewCustomerModal from "@/components/sales/new-customer-modal"
import NewProductModal from "@/components/sales/new-product-modal"
import NewServiceModal from "@/components/services/new-service-modal"
import { getProductByBarcode, getProducts } from "@/app/actions/product-actions"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormAlert } from "@/components/ui/form-alert"
import { selectActiveStaff } from "@/store/slices/staffSlice"
import StaffHeaderDropdown from "../dashboard/staff-header-dropdown"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface SaleTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
}

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  cost: number
  stock?: number
  total: number
  notes?: string
  originalItemId?: number
  isService?: boolean
  serviceId?: number
}

interface ScanResult {
  status: "success" | "error"
  message: string
  barcode: string
  timestamp: Date
  productName?: string
}

const STALE_TIME = 5 * 60 * 1000 // 5 minutes in milliseconds

export default function SaleTab({ userId, isAddModalOpen = false, onModalClose }: SaleTabProps) {
  // Redux state
  const dispatch = useDispatch()
  const deviceId = useSelector(selectDeviceId)
  const deviceCurrency = useSelector(selectDeviceCurrency)
  const activeStaff = useSelector(selectActiveStaff)

  // Sales data from Redux
  const sales = useSelector(selectSales)
  const filteredSales = useSelector(selectFilteredSales)
  const isLoading = useSelector(selectSalesLoading)
  const isRefreshing = useSelector(selectSalesRefreshing)
  const isSilentRefreshing = useSelector(selectSalesSilentRefreshing)
  const lastUpdated = useSelector(selectSalesLastUpdated)
  const fetchedTime = useSelector(selectSalesFetchedTime)
  const needsRefresh = useSelector(selectSalesNeedsRefresh)
  const error = useSelector(selectSalesError)

  // Filter states from Redux
  const searchTerm = useSelector(selectSalesSearchTerm)
  const statusFilter = useSelector(selectSalesStatusFilter)
  const paymentMethodFilter = useSelector(selectSalesPaymentMethodFilter)
  const dateFromFilter = useSelector(selectSalesDateFromFilter)
  const dateToFilter = useSelector(selectSalesDateToFilter)
  const minAmountFilter = useSelector(selectSalesMinAmountFilter)
  const maxAmountFilter = useSelector(selectSalesMaxAmountFilter)
  const showFilters = useSelector(selectSalesShowFilters)
  const currency = useSelector(selectSalesCurrency)

  // Privacy mode state - enabled by default
  const [privacyMode, setPrivacyMode] = useState(true)

  // Date range picker modal state
  const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState(false)
  const [tempDateFrom, setTempDateFrom] = useState<Date | null>(null)
  const [tempDateTo, setTempDateTo] = useState<Date | null>(null)

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editingSaleId, setEditingSaleId] = useState<number | null>(null)
  const [originalSaleStatus, setOriginalSaleStatus] = useState<string>("")

  // Add Sale Form State
  const [receivedAmount, setReceivedAmount] = useState(0)
  const [deviceCurrencyState, setDeviceCurrencyState] = useState(deviceCurrency || "QAR")
  const [date, setDate] = useState<Date>(new Date())
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string>("")
  const [staffId, setStaffId] = useState<number | null>(null)
  const [staffName, setStaffName] = useState<string>("")
  const [status, setStatus] = useState<string>("Completed")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [products, setProducts] = useState<ProductRow[]>([
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
    },
  ])
  const [subtotal, setSubtotal] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [totalAmount, setTotalAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [scanStatus, setScanStatus] = useState<"idle" | "processing" | "success" | "error">("idle")
  const [scanHistory, setScanHistory] = useState<ScanResult[]>([])
  const [barcodeInput, setBarcodeInput] = useState<string>("")
  const [isBarcodeProcessing, setIsBarcodeProcessing] = useState<boolean>(false)
  const [lastBarcodeProcessed, setLastBarcodeProcessed] = useState<string>("")
  const [notes, setNotes] = useState<string>("")
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [barcodeAlert, setBarcodeAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(
    null,
  )

  // Modals
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)
  const [isNewServiceModalOpen, setIsNewServiceModalOpen] = useState(false)
  const [isViewSaleModalOpen, setIsViewSaleModalOpen] = useState(false)
  const [selectedSaleId, setSelectedSaleId] = useState<number | null>(null)

  // Local state
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set())

  // Use refs to track fetch state and prevent duplicate calls
  const initializationRef = useRef({
    hasInitialized: false,
    currentDeviceId: null as number | null,
    lastFetchTime: 0,
    isCurrentlyFetching: false,
  })

  // Debounce timer for barcode input
  const barcodeTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { toast } = useToast()
  const router = useRouter()

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Device change handling
  useEffect(() => {
    if (deviceId && deviceId !== initializationRef.current.currentDeviceId) {
      dispatch(resetSalesState())
      initializationRef.current = {
        hasInitialized: false,
        currentDeviceId: deviceId,
        lastFetchTime: 0,
        isCurrentlyFetching: false,
      }
    }
  }, [deviceId, dispatch])

  // Update currency when device currency changes
  useEffect(() => {
    if (deviceCurrency && deviceCurrency !== currency) {
      dispatch(setCurrency(deviceCurrency))
      setDeviceCurrencyState(deviceCurrency)
    }
  }, [deviceCurrency, currency, dispatch])

  // Auto-select active staff
  useEffect(() => {
    if (activeStaff && !isEditMode) {
      setStaffId(activeStaff.id)
      setStaffName(activeStaff.name)
    }
  }, [activeStaff, isEditMode])

  // Calculate totals whenever products or discount changes
  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => {
      const productTotal = typeof product.total === "number" ? product.total : 0
      return sum + productTotal
    }, 0)
    setSubtotal(newSubtotal)
    const discount = typeof discountAmount === "number" ? discountAmount : 0
    const finalTotal = Math.max(0, newSubtotal - discount)
    setTotalAmount(finalTotal)
    if (status === "Completed") {
      setReceivedAmount(finalTotal)
    } else if (status === "Cancelled") {
      setReceivedAmount(finalTotal)
    } else if (status === "Credit") {
      if (receivedAmount > finalTotal) {
        setReceivedAmount(0)
      }
    } else if (status === "Pending") {
      setReceivedAmount(0)
    }
  }, [products, discountAmount, status])

  // Check if data is stale
  const isDataStale = useMemo(() => {
    if (!fetchedTime) return true
    return Date.now() - fetchedTime > STALE_TIME
  }, [fetchedTime])

  // Update needsRefresh when data becomes stale
  useEffect(() => {
    if (fetchedTime && isDataStale && !needsRefresh) {
      dispatch(setNeedsRefresh(true))
    }
  }, [fetchedTime, isDataStale, needsRefresh, dispatch])

  // Format currency with the device's currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "AED",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Set today's date filter on initial load - but don't fetch, just set the filter
  useEffect(() => {
    const today = new Date()
    const formattedDate = format(today, "yyyy-MM-dd")
    if (!dateFromFilter && !dateToFilter) {
      dispatch(setDateFromFilter(formattedDate))
      dispatch(setDateToFilter(formattedDate))
    }
  }, [dateFromFilter, dateToFilter, dispatch])

  // Centralized fetch function with proper duplicate prevention
  const fetchSalesFromAPI = useCallback(
    async (silent = false) => {
      if (!deviceId) {
        dispatch(setError("Device ID not found"))
        return
      }
      if (initializationRef.current.isCurrentlyFetching) {
        return
      }
      const now = Date.now()
      if (now - initializationRef.current.lastFetchTime < 1000) {
        return
      }
      try {
        initializationRef.current.isCurrentlyFetching = true
        initializationRef.current.lastFetchTime = now
        if (!silent) {
          dispatch(setLoading(true))
        } else {
          dispatch(setSilentRefreshing(true))
        }
        dispatch(setError(null))
        const result = await getUserSales(deviceId)
        if (result.success) {
          const serializedData = result.data.map((sale: any) => ({
            ...sale,
            sale_date:
              sale.sale_date && typeof sale.sale_date === "object" && sale.sale_date !== null
                ? sale.sale_date.toISOString()
                : sale.sale_date || "",
            created_at:
              sale.created_at && typeof sale.created_at === "object" && sale.created_at !== null
                ? sale.created_at.toISOString()
                : sale.created_at || "",
            updated_at:
              sale.updated_at && typeof sale.updated_at === "object" && sale.updated_at !== null
                ? sale.updated_at.toISOString()
                : sale.updated_at || "",
          }))
          if (silent) {
            dispatch(updateSalesData(serializedData))
          } else {
            dispatch(setSales(serializedData))
          }
          initializationRef.current.hasInitialized = true
        } else {
          dispatch(setError(result.message || "Failed to load sales"))
        }
      } catch (error) {
        console.error("Fetch sales error:", error)
        dispatch(setError("An error occurred while loading sales"))
      } finally {
        dispatch(setLoading(false))
        dispatch(setSilentRefreshing(false))
        initializationRef.current.isCurrentlyFetching = false
      }
    },
    [deviceId, dispatch],
  )

  // Single initialization effect (optimized)
  useEffect(() => {
    if (
      deviceId &&
      !initializationRef.current.hasInitialized &&
      initializationRef.current.currentDeviceId === deviceId
    ) {
      initializationRef.current.hasInitialized = true // Set before fetch to prevent double fetch
      fetchSalesFromAPI(false)
    }
  }, [deviceId, fetchSalesFromAPI])

  // Silent refresh effect (unchanged)
  useEffect(() => {
    if (
      deviceId &&
      initializationRef.current.hasInitialized &&
      isDataStale &&
      !isSilentRefreshing &&
      !isLoading &&
      !initializationRef.current.isCurrentlyFetching
    ) {
      const now = Date.now()
      if (now - initializationRef.current.lastFetchTime > 120000) {
        fetchSalesFromAPI(true)
      }
    }
  }, [deviceId, isDataStale, isSilentRefreshing, isLoading, fetchSalesFromAPI])

  // Client-side filtering function (optimized)
  const applyClientSideFilters = useCallback(() => {
    if (!sales || sales.length === 0) {
      dispatch(setFilteredSales([]))
      return
    }

    let filtered = [...sales]

    // Date filtering
    if (dateFromFilter || dateToFilter) {
      filtered = filtered.filter((sale) => {
        const saleDate = new Date(sale.sale_date)
        saleDate.setHours(0, 0, 0, 0)

        if (dateFromFilter) {
          const fromDate = new Date(dateFromFilter)
          fromDate.setHours(0, 0, 0, 0)
          if (saleDate < fromDate) return false
        }

        if (dateToFilter) {
          const toDate = new Date(dateToFilter)
          toDate.setHours(23, 59, 59, 999)
          if (saleDate > toDate) return false
        }

        return true
      })
    }

    // Search filter
    if (searchTerm && searchTerm.trim() !== "") {
      const searchLower = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (sale) =>
          (sale.customer_name?.toLowerCase() || "").includes(searchLower) ||
          sale.id.toString().includes(searchLower) ||
          (sale.status?.toLowerCase() || "").includes(searchLower) ||
          sale.total_amount.toString().includes(searchLower),
      )
    }

    // Status filter
    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((sale) => (sale.status?.toLowerCase() || "") === statusFilter.toLowerCase())
    }

    // Payment method filter
    if (paymentMethodFilter && paymentMethodFilter !== "all") {
      filtered = filtered.filter((sale) => {
        const paymentMethod = sale.payment_method || "cash"
        return paymentMethod.toLowerCase() === paymentMethodFilter.toLowerCase()
      })
    }

    // Amount range filter
    if (minAmountFilter) {
      const minAmount = Number(minAmountFilter)
      if (!isNaN(minAmount)) {
        filtered = filtered.filter((sale) => Number(sale.total_amount) >= minAmount)
      }
    }

    if (maxAmountFilter) {
      const maxAmount = Number(maxAmountFilter)
      if (!isNaN(maxAmount)) {
        filtered = filtered.filter((sale) => Number(sale.total_amount) <= maxAmount)
      }
    }

    dispatch(setFilteredSales(filtered))
  }, [
    sales,
    searchTerm,
    statusFilter,
    paymentMethodFilter,
    dateFromFilter,
    dateToFilter,
    minAmountFilter,
    maxAmountFilter,
    dispatch,
  ])

  useEffect(() => {
    applyClientSideFilters()
  }, [applyClientSideFilters])

  // Handle modal state from parent
  useEffect(() => {
    // setIsNewSaleModalOpen(isAddModalOpen)
  }, [isAddModalOpen])

  // Handle new sale modal close
  const handleNewSaleModalClose = () => {
    // setIsNewSaleModalOpen(false)
    if (onModalClose) {
      onModalClose()
    }
    // Force refresh after adding new sale
    handleForcedRefresh()
  }

  // Add Sale Form Functions
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
      },
    ])
  }

  const removeProductRow = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter((product) => product.id !== id))
    }
  }

  const updateProductRow = (id: string, updates: Partial<ProductRow>) => {
    const updatedProducts = products.map((product) => {
      if (product.id === id) {
        const updatedProduct = { ...product, ...updates }

        if (
          updates.quantity !== undefined &&
          updatedProduct.stock !== undefined &&
          updatedProduct.quantity > updatedProduct.stock
        ) {
          updatedProduct.quantity = updatedProduct.stock
          setBarcodeAlert({
            type: "warning",
            message: `Only ${updatedProduct.stock} units available for ${updatedProduct.productName}`,
          })
        }

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
  }

  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    if (stock !== undefined && stock <= 0) {
      setBarcodeAlert({
        type: "error",
        message: `${productName} is out of stock`,
      })
    }

    // Check if this is a service (stock = 999 indicates service)
    const isService = stock === 999

    updateProductRow(id, {
      productId,
      productName,
      price,
      cost: wholesalePrice,
      stock,
      total: (products.find((p) => p.id === id)?.quantity || 1) * price,
      isService: isService,
      serviceId: isService ? productId : undefined,
    })

    const hasEmptyRow = products.some((p) => p.productId === null)
    if (!hasEmptyRow) {
      addProductRow()
    }
  }

  const handleNewCustomer = (customerId: number, customerName: string) => {
    setCustomerId(customerId)
    setCustomerName(customerName)
    setIsNewCustomerModalOpen(false)
  }

  const handleNewProduct = (
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
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
  }

  const handleNewService = (serviceId: number, serviceName: string, price: number) => {
    const targetRow = products.find((p) => !p.productId) || products[products.length - 1]

    if (targetRow) {
      updateProductRow(targetRow.id, {
        productId: serviceId,
        productName: serviceName,
        price,
        cost: 0,
        stock: 999,
        total: targetRow.quantity * price,
        isService: true,
        serviceId: serviceId,
      })
    } else {
      setProducts([
        ...products,
        {
          id: crypto.randomUUID(),
          productId: serviceId,
          productName: serviceName,
          quantity: 1,
          price,
          cost: 0,
          stock: 999,
          total: price,
          notes: "",
          isService: true,
          serviceId: serviceId,
        },
      ])
    }

    setIsNewServiceModalOpen(false)
  }

  // FIXED: Enhanced barcode input handler to support both barcode and product name search
  // Replace the handleBarcodeInput function in your SaleTab component with this fixed version

  const handleBarcodeInput = async (input: string) => {
    if (!input || input.trim().length === 0) {
      setBarcodeAlert({
        type: "warning",
        message: "Please enter a barcode or product name",
      })
      return
    }

    // Prevent duplicate processing
    if (input === lastBarcodeProcessed || isBarcodeProcessing) {
      return
    }

    setLastBarcodeProcessed(input)
    setIsBarcodeProcessing(true)
    setScanStatus("processing")
    setBarcodeAlert(null)

    try {
      let result = null
      let searchAttempted = false

      // First try barcode search
      try {
        result = await getProductByBarcode(input.trim())
        if (result.success && result.data) {
          console.log("Barcode search successful:", result.data)
        }
      } catch (error) {
        console.log("Barcode search failed:", error.message)
      }

      // If barcode search fails or returns no results, try product name search using getProducts
      if (!result || !result.success || !result.data) {
        try {
          searchAttempted = true
          // Use getProducts with search functionality instead of non-existent searchProducts
          const searchResult = await getProducts(userId, 10, input.trim()) // limit to 10 results

          if (searchResult.success && searchResult.data && searchResult.data.length > 0) {
            // Use the first match from product name search
            const product = searchResult.data[0]
            result = {
              success: true,
              data: {
                id: product.id,
                name: product.name,
                price: product.price || 0,
                wholesale_price: product.wholesale_price || 0,
                stock: product.stock || 0,
              },
            }
            console.log("Product name search successful:", result.data)
          }
        } catch (error) {
          console.log("Product search failed:", error.message)
        }
      }

      // Process the result if we found a product
      if (result && result.success && result.data) {
        const productData = result.data

        // Check if product already exists in the cart
        const existingProductIndex = products.findIndex(
          (p) => p.productId === productData.id && !p.isService,
        )

        if (existingProductIndex >= 0) {
          // Product exists, increase quantity
          const updatedProducts = [...products]
          const existingProduct = updatedProducts[existingProductIndex]
          const newQuantity = existingProduct.quantity + 1

          // Check stock availability
          if (productData.stock !== undefined && productData.stock > 0 && newQuantity > productData.stock) {
            setBarcodeAlert({
              type: "warning",
              message: `Only ${productData.stock} units available for ${productData.name}`,
            })

            // Set to maximum available stock
            updatedProducts[existingProductIndex] = {
              ...existingProduct,
              quantity: productData.stock,
              total: productData.stock * (Number(productData.price) || 0),
            }
          } else {
            // Update quantity normally
            updatedProducts[existingProductIndex] = {
              ...existingProduct,
              quantity: newQuantity,
              total: newQuantity * (Number(productData.price) || 0),
            }
          }

          setProducts(updatedProducts)
        } else {
          // Add as new product
          const newProduct = {
            id: crypto.randomUUID(),
            productId: productData.id,
            productName: productData.name,
            quantity: 1,
            price: Number(productData.price) || 0,
            cost: Number(productData.wholesale_price) || 0,
            stock: Number(productData.stock) || 0,
            total: Number(productData.price) || 0,
            notes: "",
            isService: false,
          }

          // Find empty row or add new row
          const emptyRowIndex = products.findIndex((p) => p.productId === null)

          if (emptyRowIndex >= 0) {
            // Replace empty row
            const updatedProducts = [...products]
            updatedProducts[emptyRowIndex] = {
              ...updatedProducts[emptyRowIndex],
              ...newProduct,
            }
            setProducts(updatedProducts)
          } else {
            // Add new row
            setProducts([...products, newProduct])
          }
        }

        setScanStatus("success")
        setBarcodeAlert({
          type: "success",
          message: `Added ${productData.name} to the sale`,
        })
      } else {
        // No product found
        setScanStatus("error")
        setBarcodeAlert({
          type: "error",
          message: searchAttempted
            ? `No product found matching "${input}"`
            : `No product found with barcode "${input}"`,
        })
      }
    } catch (error) {
      console.error("Error processing barcode/search:", error)
      setScanStatus("error")
      setBarcodeAlert({
        type: "error",
        message: `Search failed: ${error.message || "Please try again"}`,
      })
    } finally {
      // Clear input and reset states
      setBarcodeInput("")
      setIsBarcodeProcessing(false)

      // Reset status after delay
      setTimeout(() => {
        setScanStatus("idle")
        setTimeout(() => {
          setLastBarcodeProcessed("")
        }, 500)
      }, 2000)
    }
  }

  // Debounced barcode input handler
  const handleBarcodeInputChange = (value: string) => {
    setBarcodeInput(value)

    // Clear existing timeout
    if (barcodeTimeoutRef.current) {
      clearTimeout(barcodeTimeoutRef.current)
    }

    // Set new timeout for auto-search
    if (value.trim() && !isBarcodeProcessing) {
      barcodeTimeoutRef.current = setTimeout(() => {
        handleBarcodeInput(value)
      }, 300)
    }
  }

  const resetAddSaleForm = () => {
    setDate(new Date())
    setCustomerId(null)
    setCustomerName("")
    if (activeStaff) {
      setStaffId(activeStaff.id)
      setStaffName(activeStaff.name)
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
        cost: 0,
        stock: 0,
        total: 0,
        notes: "",
      },
    ])
    setDiscountAmount(0)
    setReceivedAmount(0)
    setNotes("")
    setFormAlert(null)
    setBarcodeAlert(null)
    setIsEditMode(false)
    setEditingSaleId(null)
    setOriginalSaleStatus("")
  }

  // Load sale data for editing
  const loadSaleForEdit = async (saleId: number) => {
    try {
      setFormAlert(null)
      setBarcodeAlert(null)

      const result = await getSaleDetails(saleId)

      if (result.success) {
        const { sale, items } = result.data

        // Set sale data
        setDate(new Date(sale.sale_date))
        setCustomerId(sale.customer_id)
        setCustomerName(sale.customer_name || "")
        setStatus(sale.status || "Completed")
        setOriginalSaleStatus(sale.status || "Completed")

        // Set staff information
        if (sale.staff_id) {
          setStaffId(sale.staff_id)
          setStaffName(sale.staff_name || "")
        } else if (activeStaff) {
          setStaffId(activeStaff.id)
          setStaffName(activeStaff.name)
        }

        // Set payment method
        if ("payment_method" in sale) {
          setPaymentMethod(sale.payment_method || "Cash")
        } else {
          setPaymentMethod("Cash")
        }

        setTotalAmount(Number(sale.total_amount) || 0)
        setDiscountAmount(Number(sale.discount) || 0)

        // Set product rows with actual costs
        const productRows = items.map((item: any) => {
          const isService = !!item.service_name

          return {
            id: crypto.randomUUID(),
            productId: item.product_id,
            productName: item.service_name || item.product_name,
            quantity: item.quantity,
            price: item.price,
            cost: item.actual_cost || item.cost || 0,
            stock: isService ? 999 : item.stock || 0,
            total: item.quantity * item.price,
            originalItemId: item.id,
            notes: item.notes || "",
            isService: isService,
            serviceId: isService ? item.product_id : undefined,
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

        setIsEditMode(true)
        setEditingSaleId(saleId)

        setFormAlert({
          type: "success",
          message: `Loaded sale #${saleId} for editing`,
        })
      } else {
        setFormAlert({
          type: "error",
          message: result.message || "Failed to load sale details",
        })
      }
    } catch (error) {
      console.error("Error loading sale for edit:", error)
      setFormAlert({
        type: "error",
        message: "An error occurred while loading sale details",
      })
    }
  }

  const handleSubmitSale = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!deviceId) {
      setFormAlert({
        type: "error",
        message: "Device ID not found. Please refresh the page.",
      })
      return
    }

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
        id: p.originalItemId, // Include for edit mode
        productId: p.productId,
        quantity: p.quantity,
        price: p.price,
        cost: p.cost || 0,
        notes: p.notes || "",
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

    if (status === "Credit" && receivedAmount > totalAmount) {
      setFormAlert({
        type: "error",
        message: "Received amount cannot be greater than total amount",
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (isEditMode && editingSaleId) {
        // Update existing sale
        const saleData = {
          id: editingSaleId,
          customerId: customerId || null,
          userId: userId,
          deviceId: deviceId,
          items: validItems,
          paymentStatus: status,
          paymentMethod: paymentMethod,
          saleDate: date?.toISOString() || new Date().toISOString(),
          originalStatus: originalSaleStatus,
          discount: discountAmount,
          receivedAmount: receivedAmount,
          staffId: staffId,
        }

        const result = await updateSale(saleData)

        if (result.success) {
          setFormAlert({
            type: "success",
            message: "Sale updated successfully",
          })

          setTimeout(() => {
            resetAddSaleForm()
            setFormAlert(null)
            // Reset fetch state to force refresh
            initializationRef.current.hasInitialized = false
            fetchSalesFromAPI(false)
          }, 1500)
        } else {
          setFormAlert({
            type: "error",
            message: result.message || "Failed to update the sale",
          })
        }
      } else {
        // Add new sale
        const saleData = {
          customerId: customerId || null,
          staffId: staffId || null,
          userId: userId,
          deviceId: deviceId,
          items: validItems,
          paymentStatus: status,
          paymentMethod: paymentMethod,
          saleDate: date?.toISOString() || new Date().toISOString(),
          notes: notes,
          discount: discountAmount,
          receivedAmount: receivedAmount,
        }

        const result = await addSale(saleData)

        if (result.success) {
          setFormAlert({
            type: "success",
            message: "Sale completed successfully",
          })

          if (result.data && result.data.sale) {
            setTimeout(() => {
              printSalesReceipt(result.data.sale, result.data.items)
            }, 500)
          }

          setTimeout(() => {
            resetAddSaleForm()
            setFormAlert(null)
            // Reset fetch state to force refresh
            initializationRef.current.hasInitialized = false
            fetchSalesFromAPI(false)
          }, 1500)
        } else {
          setFormAlert({
            type: "error",
            message: result.message || "Failed to complete the sale",
          })
        }
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

  // Handle view sale - now called when clicking on a sale row
  const handleViewSale = (sale: any) => {
    setSelectedSaleId(sale.id)
    setIsViewSaleModalOpen(true)
  }

  // Handle edit sale - load sale data into form
  const handleEditSale = (sale: any) => {
    loadSaleForEdit(sale.id)
  }

  // Handle print invoice from view modal
  const handlePrintInvoiceFromView = (saleId: number) => {
    router.push(`/invoice/sale/${saleId}`)
  }

  // Handle delete sale from view modal
  const handleDeleteSaleFromView = async (saleId: number) => {
    if (!deviceId) {
      toast({
        title: "Error",
        description: "Device ID not found",
        variant: "destructive",
      })
      return
    }

    try {
      setIsDeleting(true)
      const result = await deleteSale(saleId, deviceId)

      if (result.success) {
        dispatch(removeSale(saleId))
        toast({
          title: "Success",
          description: "Sale deleted successfully",
        })
        // Force refresh after deletion
        initializationRef.current.hasInitialized = false
        fetchSalesFromAPI(false)
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to delete sale",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Delete sale error:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
    }
  }

  // Get payment method display value
  const getPaymentMethodDisplay = (sale: any) => {
    if (sale.payment_method === undefined || sale.payment_method === null) {
      return "Cash"
    }
    return sale.payment_method || "Cash"
  }

  // Calculate remaining amount for credit sales
  const getRemainingAmount = (sale: any) => {
    if (sale.status === "Credit") {
      const total = Number(sale.total_amount) || 0
      const received = Number(sale.received_amount) || 0
      return Math.max(0, total - received)
    }
    return 0
  }

  // Check if any filters are active
  const hasActiveFilters =
    searchTerm ||
    statusFilter !== "all" ||
    paymentMethodFilter !== "all" ||
    dateFromFilter ||
    dateToFilter ||
    minAmountFilter ||
    maxAmountFilter

  // Check if today filter is active
  const isTodayFilterActive = () => {
    const today = format(new Date(), "yyyy-MM-dd")
    return dateFromFilter === today && dateToFilter === today
  }

  // Check if custom date range is active
  const isCustomDateRangeActive = () => {
    return dateFromFilter && dateToFilter && !isTodayFilterActive()
  }

  // Get custom date range display text
  const getCustomDateRangeText = () => {
    if (dateFromFilter && dateToFilter) {
      const fromDate = new Date(dateFromFilter)
      const toDate = new Date(dateToFilter)

      if (dateFromFilter === dateToFilter) {
        return format(fromDate, "MMM d")
      } else {
        return `${format(fromDate, "MMM d")} - ${format(toDate, "MMM d")}`
      }
    }
    return "Custom"
  }

  // FIXED: Handle forced refresh - properly reset state
  const handleForcedRefresh = () => {
    console.log("Forced refresh initiated...")

    // Clear all data and filters
    dispatch(forceClearSales())
    dispatch(clearFilters())

    // Reset local state
    setExpandedCards(new Set())

    // Reset initialization state
    initializationRef.current.hasInitialized = false
    initializationRef.current.isCurrentlyFetching = false
    initializationRef.current.lastFetchTime = 0

    // Force fetch new data
    fetchSalesFromAPI(false)

    toast({
      title: "Refreshed",
      description: "Sales data has been refreshed and filters cleared",
    })
  }

  // Handle clear all filters
  const handleClearAllFilters = () => {
    dispatch(clearFilters())
    toast({
      title: "Filters Cleared",
      description: "All filters have been removed",
    })
  }

  // Handle Today filter - just set the date filter, no API call
  const handleTodayFilter = () => {
    const today = new Date()
    const formattedDate = format(today, "yyyy-MM-dd")

    // Clear other filters but keep the sales data
    dispatch(setSearchTerm(""))
    dispatch(setStatusFilter("all"))
    dispatch(setPaymentMethodFilter("all"))

    // Set today's date
    dispatch(setDateFromFilter(formattedDate))
    dispatch(setDateToFilter(formattedDate))

    toast({
      title: "Today's Sales",
      description: `Showing sales for ${format(today, "MMMM d, yyyy")}`,
    })
  }

  // Handle custom date range
  const handleCustomDateRange = () => {
    setTempDateFrom(dateFromFilter ? new Date(dateFromFilter) : new Date())
    setTempDateTo(dateToFilter ? new Date(dateToFilter) : new Date())
    setIsDateRangeModalOpen(true)
  }

  // Apply custom date range - just set the filters, no API call
  const applyCustomDateRange = () => {
    if (tempDateFrom && tempDateTo) {
      const fromDateStr = format(tempDateFrom, "yyyy-MM-dd")
      const toDateStr = format(tempDateTo, "yyyy-MM-dd")

      dispatch(setDateFromFilter(fromDateStr))
      dispatch(setDateToFilter(toDateStr))

      toast({
        title: "Date Range Applied",
        description: `Showing sales from ${format(tempDateFrom, "MMM d")} to ${format(tempDateTo, "MMM d")}`,
      })
    }
    setIsDateRangeModalOpen(false)
  }

  // Handle status filter
  const handleStatusFilter = () => {
    const statuses = ["all", "completed", "credit", "pending", "cancelled"]
    const currentIndex = statuses.indexOf(statusFilter || "all")
    const nextIndex = (currentIndex + 1) % statuses.length
    const nextStatus = statuses[nextIndex]

    dispatch(setStatusFilter(nextStatus))

    toast({
      title: "Status Filter",
      description: `Showing ${nextStatus === "all" ? "all" : nextStatus} sales`,
    })
  }

  // Handle payment method filter
  const handlePaymentMethodFilter = () => {
    const methods = ["all", "cash", "card", "online"]
    const currentIndex = methods.indexOf(paymentMethodFilter || "all")
    const nextIndex = (currentIndex + 1) % methods.length
    const nextMethod = methods[nextIndex]

    dispatch(setPaymentMethodFilter(nextMethod))

    toast({
      title: "Payment Filter",
      description: `Showing ${nextMethod === "all" ? "all" : nextMethod} payments`,
    })
  }

  // Skeleton loading component
  const SalesTableSkeleton = () => (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center space-x-2 p-2">
          <Skeleton className="h-3 w-8 bg-gray-300 dark:bg-gray-600" />
          <Skeleton className="h-3 w-16 bg-gray-300 dark:bg-gray-600" />
          <Skeleton className="h-3 w-12 bg-gray-300 dark:bg-gray-600" />
        </div>
      ))}
    </div>
  )

  // Privacy mode display value
  const getPrivacyValue = () => (
    <div className="flex items-center justify-center">
      <EyeOff className="h-4 w-4 text-gray-400" />
    </div>
  )

  // Mobile Card Component
  const SaleCard = ({
    sale,
    index,
    isEditing = false,
  }: {
    sale: any
    index: number
    isEditing?: boolean
  }) => {
    const isExpanded = expandedCards.has(sale.id)
    const remainingAmount = getRemainingAmount(sale)

    return (
      <Card
        className={`
        mb-2 overflow-hidden border
        ${isEditing
          ? "border-yellow-400 ring-2 ring-yellow-300 dark:ring-yellow-600 bg-yellow-50 dark:bg-yellow-900/40"
          : "border-gray-200 dark:border-gray-600"}
        hover:shadow-md transition-all duration-200
        bg-white dark:bg-gray-800
      `}
      >
        <CardContent className="p-0">
          {/* Main card content */}
          <div className="p-3">
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400">#{sale.id}</span>
                <Badge
                  variant="outline"
                  className={
                    sale.sale_type === "service"
                      ? "bg-green-50 dark:bg-green-900 text-green-600 dark:text-green-300 border-green-200 dark:border-green-600 text-xs"
                      : "bg-blue-50 dark:bg-blue-900 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-600 text-xs"
                  }
                >
                  {sale.sale_type === "service" ? "Service" : "Product"}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={`text-xs ${
                    sale.status === "Completed"
                      ? "bg-green-50 dark:bg-green-900 text-green-600 dark:text-green-300 border-green-200 dark:border-green-600"
                      : sale.status === "Credit"
                        ? "bg-orange-50 dark:bg-orange-900 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-600"
                        : sale.status === "Cancelled"
                          ? "bg-red-50 dark:bg-red-900 text-red-600 dark:text-red-300 border-red-200 dark:border-red-600"
                          : "bg-yellow-50 dark:bg-yellow-900 text-yellow-600 dark:text-yellow-300 border-yellow-200 dark:border-yellow-600"
                  }`}
                >
                  {sale.status}
                </Badge>
              </div>
            </div>

            {/* Customer and amount */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1">
                <User className="h-3 w-3 text-gray-400" />
                <span className="text-xs font-medium text-gray-600 dark:text-gray-200 truncate max-w-[100px]">
                  {sale.customer_name || "Walk-in"}
                </span>
              </div>
              <div className="text-xs font-bold text-gray-900 dark:text-gray-100">
                {privacyMode ? getPrivacyValue() : formatCurrency(Number(sale.total_amount))}
              </div>
            </div>

            {/* Date and payment */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <Calendar className="h-3 w-3" />
                {format(new Date(sale.sale_date), "MMM d")}
              </div>
              <Badge
                variant="outline"
                className="bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 text-xs"
              >
                {getPaymentMethodDisplay(sale)}
              </Badge>
            </div>

            {/* FIXED: Action buttons with better responsive layout */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  handleViewSale(sale)
                }}
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-3 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
              >
                <Eye className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline lg:hidden xl:inline">View</span>
              </Button>
              <Button
                onClick={(e) => {
                  e.stopPropagation()
                  handleEditSale(sale)
                }}
                variant="ghost"
                size="sm"
                className="text-xs h-7 px-3 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
              >
                <Edit className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline lg:hidden xl:inline">Edit</span>
              </Button>
            </div>

            {sale.status === "Credit" && remainingAmount > 0 && (
              <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                Remaining: {privacyMode ? getPrivacyValue() : formatCurrency(remainingAmount)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (barcodeTimeoutRef.current) {
        clearTimeout(barcodeTimeoutRef.current)
      }
    }
  }, [])

  // --- UI STARTS HERE ---
  return (
    <div className="min-h-[calc(100vh-100px)] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 p-2 sm:p-3">
      <div className="flex flex-col xl:flex-row gap-3 h-full">
        {/* Main Sale Form Section */}
        <div className="flex-1 xl:w-3/4 flex flex-col min-h-0">
          <Card className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 min-h-0 relative">
            {/* --- EDIT MODE BANNER --- */}
            {isEditMode && (
              <div className="absolute top-0 left-0 w-full z-20 bg-yellow-100 dark:bg-yellow-900/80 border-b border-yellow-400 dark:border-yellow-700 flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200 font-semibold text-sm">
                  <Pencil className="h-4 w-4" />
                  Edit Mode: Updating Sale #{editingSaleId}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-yellow-800 dark:text-yellow-200 hover:bg-yellow-200/40 dark:hover:bg-yellow-800/40"
                  onClick={resetAddSaleForm}
                  aria-label="Exit Edit Mode"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            )}
            <CardContent className="flex-1 flex flex-col p-0 h-full min-h-0 pt-10">
              <div className="flex flex-col lg:flex-row h-full min-h-0">
                {/* Products section */}
                <div className="flex-1 lg:w-[70%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 dark:border-gray-700 min-h-0 overflow-y-auto">
                  {/* Barcode scanner and product table (unchanged) */}
                  <div className="p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <div className="relative flex-1">
                        <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Scan barcode or search product name..."
                          className={`pl-8 h-9 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 transition-all duration-200 ${
                            scanStatus === "processing"
                              ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20"
                              : scanStatus === "success"
                                ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                                : scanStatus === "error"
                                  ? "border-red-500 bg-red-50 dark:bg-red-900/20"
                                  : "border-gray-300 dark:border-gray-600 focus:border-blue-500 dark:focus:border-blue-400"
                          }`}
                          value={barcodeInput}
                          onChange={(e) => handleBarcodeInputChange(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              if (barcodeInput.trim()) {
                                handleBarcodeInput(barcodeInput)
                              }
                            }
                          }}
                        />
                        {scanStatus === "processing" && (
                          <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-yellow-500" />
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
                        size="sm"
                        className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-4 sm:px-6"
                      >
                        {isBarcodeProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                  </div>

                  {/* Products table header */}
                  <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-sm text-gray-800 dark:text-gray-200">Products & Services</h3>
                    <div className="flex flex-wrap gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsNewServiceModalOpen(true)}
                        className="flex items-center gap-1 text-green-600 dark:text-green-400 border-green-300 dark:border-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 h-7 text-xs"
                      >
                        <Wrench className="h-3 w-3" />
                        <span className="hidden sm:inline">Service</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsNewProductModalOpen(true)}
                        className="flex items-center gap-1 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-7 text-xs"
                      >
                        <Plus className="h-3 w-3" />
                        <span className="hidden sm:inline">Product</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addProductRow}
                        className="flex items-center gap-1 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 h-7 text-xs bg-transparent"
                      >
                        <Plus className="h-3 w-3" />
                        <span className="hidden sm:inline">Row</span>
                      </Button>
                    </div>
                  </div>

                  {/* Products table - responsive */}
                  <div className="flex-1 overflow-x-auto overflow-y-auto">
                    {/* Desktop table header */}
                    <div className="hidden lg:block sticky top-0 z-10 min-w-[800px]">
                      <div className="grid grid-cols-12 gap-1 p-2 bg-gray-100 dark:bg-gray-700 font-medium text-xs text-gray-700 dark:text-gray-200 border-b border-gray-200 dark:border-gray-600">
                        <div className="col-span-3">Product/Service</div>
                        <div className="col-span-2">Notes</div>
                        <div className="col-span-1 text-center">Qty</div>
                        <div className="col-span-2 text-center">Price</div>
                        <div className="col-span-2 text-center">{privacyMode ? "****" : "Cost"}</div>
                        <div className="col-span-1 text-center">Total</div>
                        <div className="col-span-1"></div>
                      </div>
                    </div>

                    {/* Desktop table rows */}
                    <div className="hidden lg:block min-w-[800px]">
                      {products.map((product, index) => (
                        <div
                          key={product.id}
                          className={`grid grid-cols-12 gap-1 p-2 items-center border-b border-gray-200 dark:border-gray-700 ${
                            index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700"
                          } hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors duration-150`}
                        >
                          <div className="col-span-3">
                            {product.productId && product.productName ? (
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-1">
                                  {product.isService ? (
                                    <Wrench className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                  ) : (
                                    <div className="h-4 w-4 flex-shrink-0" />
                                  )}
                                  <span className="truncate flex-1 font-medium text-xs text-gray-900 dark:text-gray-200">
                                    {product.productName}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400"
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
                                  <ChevronsUpDown className="h-3 w-3" />
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
                              placeholder="Notes..."
                              value={product.notes || ""}
                              onChange={(e) => updateProductRow(product.id, { notes: e.target.value })}
                              className="text-xs h-7 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div className="col-span-1">
                            <Input
                              type="number"
                              min="1"
                              value={product.quantity}
                              onChange={(e) => {
                                const newQuantity = Number.parseInt(e.target.value) || 0
                                if (product.stock !== undefined && newQuantity > product.stock) {
                                  setBarcodeAlert({
                                    type: "warning",
                                    message: `Only ${product.stock} units available for ${product.productName}`,
                                  })
                                  updateProductRow(product.id, { quantity: product.stock })
                                } else {
                                  updateProductRow(product.id, { quantity: newQuantity })
                                }
                              }}
                              className="text-center h-7 text-xs bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
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
                              className="text-center h-7 text-xs bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div className="col-span-2">
                            {privacyMode ? (
                              <div className="flex items-center justify-center h-7">
                                <EyeOff className="h-3 w-3 text-gray-400" />
                              </div>
                            ) : (
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
                                className="text-center h-7 text-xs bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                              />
                            )}
                          </div>
                          <div className="col-span-1 flex items-center justify-center font-medium text-xs text-gray-900 dark:text-gray-200">
                            {deviceCurrencyState} {product.total.toFixed(2)}
                          </div>
                          <div className="col-span-1 flex justify-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeProductRow(product.id)}
                              disabled={products.length === 1}
                              className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 dark:hover:text-red-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Mobile card layout */}
                    <div className="lg:hidden">
                      {products.map((product, index) => (
                        <div
                          key={product.id}
                          className={`p-3 border-b border-gray-200 dark:border-gray-700 ${
                            index % 2 === 0 ? "bg-white dark:bg-gray-800" : "bg-gray-50 dark:bg-gray-700"
                          }`}
                        >
                          {/* Product Selection */}
                          <div className="mb-3">
                            <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                              Product/Service
                            </Label>
                            {product.productId && product.productName ? (
                              <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-gray-600 rounded">
                                <div className="flex items-center gap-2">
                                  {product.isService && (
                                    <Wrench className="h-4 w-4 text-green-600 dark:text-green-400" />
                                  )}
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-200">
                                    {product.productName}
                                  </span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0"
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
                                  <ChevronsUpDown className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <ProductSelectSimple
                                id={`product-select-mobile-${product.id}`}
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

                          {/* Notes */}
                          <div className="mb-3">
                            <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                              Notes
                            </Label>
                            <Input
                              placeholder="Notes..."
                              value={product.notes || ""}
                              onChange={(e) => updateProductRow(product.id, { notes: e.target.value })}
                              className="text-sm h-8"
                            />
                          </div>

                          {/* Quantity, Price, Cost row */}
                          <div className="grid grid-cols-3 gap-2 mb-3">
                            <div>
                              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                Qty
                              </Label>
                              <Input
                                type="number"
                                min="1"
                                value={product.quantity}
                                onChange={(e) => {
                                  const newQuantity = Number.parseInt(e.target.value) || 0
                                  if (product.stock !== undefined && newQuantity > product.stock) {
                                    setBarcodeAlert({
                                      type: "warning",
                                      message: `Only ${product.stock} units available for ${product.productName}`,
                                    })
                                    updateProductRow(product.id, { quantity: product.stock })
                                  } else {
                                    updateProductRow(product.id, { quantity: newQuantity })
                                  }
                                }}
                                className="text-center h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                Price
                              </Label>
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
                                className="text-center h-8 text-sm"
                              />
                            </div>
                            <div>
                              <Label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                                {privacyMode ? "****" : "Cost"}
                              </Label>
                              {privacyMode ? (
                                <div className="flex items-center justify-center h-8 bg-gray-100 dark:bg-gray-600 rounded border">
                                  <EyeOff className="h-3 w-3 text-gray-400" />
                                </div>
                              ) : (
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
                                  className="text-center h-8 text-sm"
                                />
                              )}
                            </div>
                          </div>

                          {/* Total and Delete */}
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium text-gray-900 dark:text-gray-200">
                              Total: {deviceCurrencyState} {product.total.toFixed(2)}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProductRow(product.id)}
                              disabled={products.length === 1}
                              className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sale details section */}
                <div className="w-full lg:w-[30%] flex flex-col bg-white dark:bg-gray-800 min-h-0 max-h-[600px] lg:max-h-none">
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700 overflow-y-auto flex-1">
                    <div className="space-y-3">
                      {/* Customer */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium flex items-center text-gray-900 dark:text-gray-200">
                          <User className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
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

                      {/* Status */}
                      <div className="space-y-1">
                        <Label htmlFor="status" className="text-xs font-medium text-gray-900 dark:text-gray-200">
                          Status
                        </Label>
                        <select
                          id="status"
                          className="flex h-8 w-full items-center justify-between rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                          value={status}
                          onChange={(e) => setStatus(e.target.value)}
                        >
                          <option value="Completed">Completed</option>
                          <option value="Credit">Credit</option>
                          <option value="Pending">Pending</option>
                          <option value="Cancelled">Cancelled</option>
                        </select>
                      </div>

                      {/* Staff and Date - responsive layout */}
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="flex flex-col space-y-1 flex-1">
                          <Label className="text-xs font-medium flex items-center text-gray-900 dark:text-gray-200">
                            <Users className="h-3 w-3 mr-1 text-green-500 dark:text-green-400" />
                            Staff *
                          </Label>
                          <StaffHeaderDropdown userId={userId} showInSaleModal={true} />
                        </div>

                        <div className="flex flex-col space-y-1 flex-1">
                          <Label className="text-xs font-medium flex items-center text-gray-900 dark:text-gray-200">
                            <Calendar className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                            Date
                          </Label>
                          <div className="[&_button]:text-gray-900 [&_button]:dark:text-gray-100 [&_button]:bg-white [&_button]:dark:bg-gray-700 [&_button]:border-gray-300 [&_button]:dark:border-gray-600">
                            <div className="dark:text-white">
                              <DatePickerField date={date} onDateChange={setDate} />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Received Amount for Credit */}
                      {status === "Credit" && (
                        <div className="space-y-1">
                          <Label
                            htmlFor="received_amount"
                            className="text-xs font-medium text-gray-900 dark:text-gray-200"
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
                            className="h-8 text-xs bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100"
                            placeholder="0.00"
                          />
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Remaining: {deviceCurrencyState} {(totalAmount - receivedAmount).toFixed(2)}
                          </p>
                        </div>
                      )}

                      {/* Payment Method for Completed - responsive grid */}
                      {status === "Completed" && (
                        <div className="space-y-1">
                          <Label className="text-xs font-medium flex items-center text-gray-900 dark:text-gray-200">
                            <CreditCard className="h-3 w-3 mr-1 text-blue-500 dark:text-blue-400" />
                            Payment Method
                          </Label>
                          <RadioGroup
                            value={paymentMethod}
                            onValueChange={setPaymentMethod}
                            className="grid grid-cols-1 sm:grid-cols-3 gap-1"
                          >
                            <div className="flex items-center space-x-1 bg-gray-50 dark:bg-gray-700 p-1 rounded-md border border-gray-200 dark:border-gray-600">
                              <RadioGroupItem value="Cash" id="cash" className="h-3 w-3" />
                              <Label htmlFor="cash" className="cursor-pointer text-xs text-gray-900 dark:text-gray-200">
                                Cash
                              </Label>
                            </div>
                            <div className="flex items-center space-x-1 bg-gray-50 dark:bg-gray-700 p-1 rounded-md border border-gray-200 dark:border-gray-600">
                              <RadioGroupItem value="Card" id="card" className="h-3 w-3" />
                              <Label htmlFor="card" className="cursor-pointer text-xs text-gray-900 dark:text-gray-200">
                                Card
                              </Label>
                            </div>
                            <div className="flex items-center space-x-1 bg-gray-50 dark:bg-gray-700 p-1 rounded-md border border-gray-200 dark:border-gray-600">
                              <RadioGroupItem value="Online" id="online" className="h-3 w-3" />
                              <Label htmlFor="online" className="cursor-pointer text-xs text-gray-900 dark:text-gray-200">
                                Online
                              </Label>
                            </div>
                          </RadioGroup>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sale summary */}
                  <div className="p-3 flex flex-col">
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm flex flex-col">
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between items-center py-1">
                          <span className="font-medium text-xs text-gray-900 dark:text-gray-200">Subtotal:</span>
                          <span className="text-sm text-gray-900 dark:text-gray-100">
                            {deviceCurrencyState} {(typeof subtotal === "number" ? subtotal : 0).toFixed(2)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center py-1 border-t border-gray-200 dark:border-gray-600">
                          <span className="font-medium text-xs text-gray-900 dark:text-gray-200">Discount:</span>
                          <div className="w-20">
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={discountAmount}
                              onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                              className="text-right h-7 text-xs bg-white dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center py-2 border-t border-gray-200 dark:border-gray-600 bg-blue-50 dark:bg-blue-900/30 p-2 rounded-md">
                          <span className="font-bold text-blue-700 dark:text-blue-300 text-sm">Total:</span>
                          <div className="font-bold text-blue-700 dark:text-blue-300 text-lg">
                            {deviceCurrencyState} {(typeof totalAmount === "number" ? totalAmount : 0).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Complete Sale button */}
                    <div className="mt-3 flex gap-2">
                      <Button
                        onClick={handleSubmitSale}
                        disabled={isSubmitting}
                        className={`w-full bg-blue-600 hover:bg-blue-700 text-white h-auto py-2 ${
                          isEditMode ? "ring-2 ring-yellow-400 dark:ring-yellow-600" : ""
                        }`}
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center">
                            <Save className="h-4 w-4 mr-2" /> {isEditMode ? "Update Sale" : "Complete Sale"}
                          </span>
                        )}
                      </Button>
                      {isEditMode && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={resetAddSaleForm}
                          disabled={isSubmitting}
                          className="w-full border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 h-auto py-2"
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right side - Summary and Sales List - unchanged */}
        <div className="w-full xl:w-1/4 flex flex-col space-y-3 min-h-0">
          {/* Summary Cards - responsive grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-2">
            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-2">
                <div className="text-center">
                  <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    {privacyMode
                      ? getPrivacyValue()
                      : formatCurrency(filteredSales.reduce((sum, sale) => sum + Number(sale.total_amount), 0))}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Total Sales</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-2">
                <div className="text-center">
                  <div className="text-sm font-bold text-green-600 dark:text-green-400">
                    {privacyMode
                      ? getPrivacyValue()
                      : formatCurrency(
                          filteredSales.reduce((sum, sale) => {
                            if (sale.status === "Credit") {
                              return sum + Number(sale.received_amount || 0)
                            } else if (sale.status === "Completed") {
                              return sum + Number(sale.total_amount)
                            }
                            return sum
                          }, 0),
                        )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Received</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-2">
                <div className="text-center">
                  <div className="text-sm font-bold text-orange-600 dark:text-orange-400">
                    {privacyMode
                      ? getPrivacyValue()
                      : formatCurrency(
                          filteredSales.reduce((sum, sale) => {
                            if (sale.status === "Credit") {
                              return sum + getRemainingAmount(sale)
                            }
                            return sum
                          }, 0),
                        )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Remaining</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-2">
                <div className="text-center">
                  <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
                    {privacyMode
                      ? getPrivacyValue()
                      : formatCurrency(
                          filteredSales.reduce((sum, sale) => {
                            // Calculate profit as total - cost (assuming cost is available in sale data)
                            const saleProfit = Number(sale.total_amount) - (Number(sale.total_cost) || 0)
                            return sum + saleProfit
                          }, 0),
                        )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Profit</div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-2">
                <div className="text-center">
                  <div className="text-sm font-bold text-purple-600 dark:text-purple-400">
                    {privacyMode
                      ? getPrivacyValue()
                      : formatCurrency(
                          filteredSales.reduce((sum, sale) => {
                            // Calculate COGS (Cost of Goods Sold)
                            return sum + (Number(sale.total_cost) || 0)
                          }, 0),
                        )}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center justify-center gap-1">
                    <Settings className="h-3 w-3" />
                    COGS
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
              <CardContent className="p-2">
                <div className="text-center">
                  <Button
                    onClick={() => setPrivacyMode(!privacyMode)}
                    variant="ghost"
                    size="sm"
                    className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {privacyMode ? (
                      <EyeOff className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    )}
                    <div className="text-xs text-gray-500 dark:text-gray-400">Privacy</div>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search and Controls */}
          <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <CardContent className="p-2">
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3 w-3 text-gray-400" />
                  <Input
                    type="search"
                    placeholder="Search sales..."
                    className="pl-7 h-7 text-xs bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                    value={searchTerm}
                    onChange={(e) => dispatch(setSearchTerm(e.target.value))}
                  />
                </div>

                {/* Control buttons - responsive layout */}
                <div className="flex flex-col sm:flex-row xl:flex-col gap-1">
                  <div className="flex gap-1">
                    <Button
                      onClick={handleForcedRefresh}
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs bg-transparent border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 h-7"
                      disabled={isRefreshing || isLoading}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${isRefreshing || isLoading ? "animate-spin" : ""}`} />
                      <span className="hidden sm:inline xl:inline">Refresh</span>
                    </Button>

                    <Button
                      onClick={handleStatusFilter}
                      variant="outline"
                      size="sm"
                      className={`flex-1 text-xs h-7 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent ${
                        statusFilter !== "all"
                          ? "border-blue-500 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      <Filter className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline xl:inline">
                        {statusFilter === "all" ? "All" : statusFilter?.charAt(0).toUpperCase() + statusFilter?.slice(1)}
                      </span>
                    </Button>
                  </div>

                  {/* Quick date filters - responsive layout */}
                  <div className="flex gap-1">
                    <Button
                      onClick={handleTodayFilter}
                      variant="outline"
                      size="sm"
                      className={`flex-1 text-xs h-6 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent ${
                        isTodayFilterActive()
                          ? "border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      Today
                    </Button>
                    <Button
                      onClick={handleCustomDateRange}
                      variant="outline"
                      size="sm"
                      className={`flex-1 text-xs h-6 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent ${
                        isCustomDateRangeActive()
                          ? "border-purple-500 dark:border-purple-400 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      <CalendarDays className="h-3 w-3 mr-1" />
                      <span className="hidden sm:inline xl:inline">
                        {isCustomDateRangeActive() ? getCustomDateRangeText() : "Custom"}
                      </span>
                    </Button>
                    <Button
                      onClick={handlePaymentMethodFilter}
                      variant="outline"
                      size="sm"
                      className={`flex-1 text-xs h-6 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent ${
                        paymentMethodFilter !== "all"
                          ? "border-orange-500 dark:border-orange-400 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                          : "border-gray-300 dark:border-gray-600"
                      }`}
                    >
                      <span className="hidden sm:inline xl:inline">
                        {paymentMethodFilter === "all"
                          ? "All Pay"
                          : paymentMethodFilter?.charAt(0).toUpperCase() + paymentMethodFilter?.slice(1)}
                      </span>
                      <span className="sm:hidden xl:hidden">Pay</span>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sales List - responsive height */}
          <Card className="flex-1 overflow-hidden bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 min-h-[300px] xl:min-h-0">
            <CardContent className="p-0 h-full flex flex-col">
              {/* Fixed Header */}
              <div className="p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-900 dark:text-gray-200">
                    {filteredSales.length} {filteredSales.length === 1 ? "Sale" : "Sales"}
                  </span>
                  {lastUpdated && (
                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="hidden sm:inline">Updated: {format(new Date(lastUpdated), "HH:mm")}</span>
                      {(isRefreshing || isSilentRefreshing) && <Loader2 className="h-3 w-3 animate-spin" />}
                    </div>
                  )}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="flex-1 overflow-y-auto">
                {isLoading && sales.length === 0 ? (
                  <div className="p-3">
                    <SalesTableSkeleton />
                  </div>
                ) : error ? (
                  <div className="text-center py-4 text-red-500 dark:text-red-400 text-xs p-3">
                    <div className="flex items-center justify-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      <span>{error}</span>
                    </div>
                  </div>
                ) : filteredSales.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400 text-xs p-3">
                    {hasActiveFilters ? "No sales found matching your filters" : "No sales found"}
                  </div>
                ) : (
                  <div className="p-2">
                    {filteredSales.slice(0, 20).map((sale, index) => (
                      <SaleCard
                        key={sale.id}
                        sale={sale}
                        index={index}
                        isEditing={isEditMode && editingSaleId === sale.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Date Range Modal */}
      <Dialog open={isDateRangeModalOpen} onOpenChange={setIsDateRangeModalOpen}>
        <DialogContent className="max-w-md bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="text-gray-900 dark:text-gray-100">Select Date Range</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-900 dark:text-gray-200">From Date</Label>
              <div className="[&_button]:text-gray-900 [&_button]:dark:text-gray-100 [&_button]:bg-white [&_button]:dark:bg-gray-700 [&_button]:border-gray-300 [&_button]:dark:border-gray-600">
                <DatePickerField date={tempDateFrom} onDateChange={setTempDateFrom} />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-900 dark:text-gray-200">To Date</Label>
              <div className="[&_button]:text-gray-900 [&_button]:dark:text-gray-100 [&_button]:bg-white [&_button]:dark:bg-gray-700 [&_button]:border-gray-300 [&_button]:dark:border-gray-600">
                <DatePickerField date={tempDateTo} onDateChange={setTempDateTo} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setIsDateRangeModalOpen(false)}
                className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Cancel
              </Button>
              <Button
                onClick={applyCustomDateRange}
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={!tempDateFrom || !tempDateTo}
              >
                Apply Range
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
        onSuccess={handleNewProduct}
        userId={userId}
      />

      <NewServiceModal
        isOpen={isNewServiceModalOpen}
        onClose={() => setIsNewServiceModalOpen(false)}
        onSuccess={handleNewService}
        userId={userId}
      />

      <ViewSaleModal
        isOpen={isViewSaleModalOpen}
        onClose={() => {
          setIsViewSaleModalOpen(false)
          setSelectedSaleId(null)
        }}
        saleId={selectedSaleId}
        currency={currency || "AED"}
        onEdit={(saleData) => {
          setIsViewSaleModalOpen(false)
          loadSaleForEdit(saleData.id)
        }}
        onDelete={handleDeleteSaleFromView}
        onPrintInvoice={handlePrintInvoiceFromView}
      />
    </div>
  )
}

