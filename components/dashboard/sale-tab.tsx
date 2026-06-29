"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { format, subMonths, addMonths, startOfMonth, endOfMonth, isSameMonth, isAfter } from "date-fns"
import {
  Loader2,
  Plus,
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
  Edit,
  X,
} from "lucide-react"
import { getUserSales, deleteSale, addSale, getSaleDetails, updateSale } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import ViewSaleModal from "@/components/sales/view-sale-modal"
import SalesExcelTable from "@/components/sales/sales-excel-table"
import { SalesViewFlip, type SalesViewMode } from "@/components/sales/sales-view-flip"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSelector, useDispatch } from "react-redux"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import {
  selectSales,
  selectSalesLoading,
  selectSalesError,
  selectSalesCurrency,
  setSales,
  setLoading,
  setError,
  setCurrency,
  removeSale,
  resetSalesState,
} from "@/store/slices/salesSlice"
import CustomerSelectSimple from "@/components/sales/customer-select-simple"
import ProductSelectSimple from "@/components/sales/product-select-simple"
import { DatePickerField } from "@/components/ui/date-picker-field"
import NewCustomerModal from "@/components/sales/new-customer-modal"
import NewProductModal from "@/components/sales/new-product-modal"
import NewServiceModal from "@/components/services/new-service-modal"
import { getProductByBarcode } from "@/app/actions/product-actions"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormAlert } from "@/components/ui/form-alert"
import { selectActiveStaff } from "@/store/slices/staffSlice"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"
import { useConfirm } from "@/hooks/use-confirm"
import { printSalesReceipt } from "@/lib/receipt-utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import SaleShippingSection from "@/components/sales/sale-shipping-section"
import { getCustomerById } from "@/app/actions/customer-actions"
import { mapSaleShippingFromRecord, type SaleShippingInput } from "@/lib/sale-shipping"

interface SaleTabProps {
  userId: number
  isAddModalOpen?: boolean
  onModalClose?: () => void
  mode?: "entry" | "info"
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

interface SaleDraftSnapshot {
  id: string
  name: string
  updatedAt: number
  date: string
  customerId: number | null
  customerName: string
  staffId: number | null
  staffName: string
  status: string
  paymentMethod: string
  receivedAmount: number
  discountAmount: number
  notes: string
  shipping: SaleShippingInput
  products: ProductRow[]
  isEditMode: boolean
  editingSaleId: number | null
  originalSaleStatus: string
}

function getMonthRange(month: Date) {
  const normalized = startOfMonth(month)
  return {
    from: format(startOfMonth(normalized), "yyyy-MM-dd"),
    to: format(endOfMonth(normalized), "yyyy-MM-dd"),
    label: format(normalized, "MMMM yyyy"),
  }
}

function serializeSaleRecord(sale: any) {
  return {
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
  }
}

export default function SaleTab({ userId, isAddModalOpen = false, onModalClose, mode = "entry" }: SaleTabProps) {
  // Redux state
  const dispatch = useDispatch()
  const deviceId = useSelector(selectDeviceId)
  const deviceCurrency = useSelector(selectDeviceCurrency)
  const activeStaff = useSelector(selectActiveStaff)
  const { isValueHidden } = useStaffRestrictions()
  const hideCogs = isValueHidden("cogs")
  const hideStockCount = isValueHidden("stock_count")

  // Sales data from Redux
  const sales = useSelector(selectSales)
  const isLoading = useSelector(selectSalesLoading)
  const error = useSelector(selectSalesError)
  const currency = useSelector(selectSalesCurrency)

  const [salesViewMonth, setSalesViewMonth] = useState(() => startOfMonth(new Date()))
  const [salesListLoaded, setSalesListLoaded] = useState(false)
  const [activeView, setActiveView] = useState<SalesViewMode>(mode === "info" ? "info" : "entry")

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
  const [shipping, setShipping] = useState<SaleShippingInput>({ fulfillmentType: "pickup" })
  const [customerAddress, setCustomerAddress] = useState("")
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
  // Cost is hidden by default so customers don't accidentally see it while billing.
  const [showCost, setShowCost] = useState(false)

  // Local state
  const [isDeleting, setIsDeleting] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  // Use refs to track device changes and in-flight list requests
  const activeDeviceIdRef = useRef<number | null>(null)
  const salesFetchRequestRef = useRef(0)

  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  useEffect(() => {
    setActiveView(mode === "info" ? "info" : "entry")
  }, [mode])

  const switchView = useCallback(
    (view: SalesViewMode) => {
      setActiveView(view)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", "sale")
      params.set("salesView", view === "info" ? "list" : "entry")
      const nextQuery = params.toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const clearEditSaleParamFromUrl = useCallback(() => {
    try {
      const url = new URL(window.location.href)
      if (!url.searchParams.has("editSaleId")) return
      url.searchParams.delete("editSaleId")
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`)
    } catch (error) {
      console.error("Failed to clear editSaleId from URL:", error)
    }
  }, [])

  const [autoPrint, setAutoPrint] = useState(() => {
    const saved = localStorage.getItem("autoPrintReceipt")
    return saved === "true"
  })
  const [showPrintConfirm, setShowPrintConfirm] = useState(false)
  const [lastSaleResult, setLastSaleResult] = useState<any>(null)
  const [rememberChoice, setRememberChoice] = useState(false)
  const [saleDrafts, setSaleDrafts] = useState<SaleDraftSnapshot[]>([])
  const [activeDraftId, setActiveDraftId] = useState<string>("")
  const [draftsHydrated, setDraftsHydrated] = useState(false)
  const [pendingEditSaleId, setPendingEditSaleId] = useState<number | null>(null)
  const [pendingEditDraftId, setPendingEditDraftId] = useState<string>("")
  const lastClosedEditSaleIdRef = useRef<number | null>(null)
  const editLoadRequestRef = useRef(0)
  const draftSwitchingRef = useRef(false)

  const createEmptyProductRow = useCallback(
    (): ProductRow => ({
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      cost: 0,
      stock: 0,
      total: 0,
      notes: "",
    }),
    [],
  )

  const createEmptyDraft = useCallback(
    (label?: string): SaleDraftSnapshot => ({
      id: crypto.randomUUID(),
      name: label || "New Sale",
      updatedAt: Date.now(),
      date: new Date().toISOString(),
      customerId: null,
      customerName: "",
      staffId: activeStaff?.id || null,
      staffName: activeStaff?.name || "",
      status: "Completed",
      paymentMethod: "Cash",
      receivedAmount: 0,
      discountAmount: 0,
      notes: "",
      shipping: { fulfillmentType: "pickup" },
      products: [createEmptyProductRow()],
      isEditMode: false,
      editingSaleId: null,
      originalSaleStatus: "",
    }),
    [activeStaff?.id, activeStaff?.name, createEmptyProductRow],
  )

  const saleDraftStorageKey = useMemo(() => {
    return `sale_entry_drafts_${deviceId || userId || "default"}`
  }, [deviceId, userId])

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  useEffect(() => {
    if (activeView !== "entry") return
    try {
      const rawDrafts = localStorage.getItem(saleDraftStorageKey)
      const rawActiveId = localStorage.getItem(`${saleDraftStorageKey}_active`)
      if (rawDrafts) {
        const parsed = JSON.parse(rawDrafts) as SaleDraftSnapshot[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSaleDrafts(parsed)
          const validActiveId = parsed.some((d) => d.id === rawActiveId) ? String(rawActiveId) : parsed[0].id
          setActiveDraftId(validActiveId)
          setDraftsHydrated(true)
          return
        }
      }
    } catch (error) {
      console.error("Failed to restore sale drafts:", error)
    }

    const initialDraft = createEmptyDraft("Draft 1")
    setSaleDrafts([initialDraft])
    setActiveDraftId(initialDraft.id)
    setDraftsHydrated(true)
  }, [activeView, saleDraftStorageKey, createEmptyDraft])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated) return
    const activeDraft = saleDrafts.find((d) => d.id === activeDraftId)
    if (!activeDraft) return

    draftSwitchingRef.current = true
    setDate(new Date(activeDraft.date || new Date().toISOString()))
    setCustomerId(activeDraft.customerId)
    setCustomerName(activeDraft.customerName || "")
    setStaffId(activeDraft.staffId)
    setStaffName(activeDraft.staffName || "")
    setStatus(activeDraft.status || "Completed")
    setPaymentMethod(activeDraft.paymentMethod || "Cash")
    setReceivedAmount(Number(activeDraft.receivedAmount) || 0)
    setDiscountAmount(Number(activeDraft.discountAmount) || 0)
    setNotes(activeDraft.notes || "")
    setShipping(activeDraft.shipping || { fulfillmentType: "pickup" })
    setProducts(
      Array.isArray(activeDraft.products) && activeDraft.products.length > 0 ? activeDraft.products : [createEmptyProductRow()],
    )
    setIsEditMode(Boolean(activeDraft.isEditMode))
    setEditingSaleId(activeDraft.editingSaleId || null)
    setOriginalSaleStatus(activeDraft.originalSaleStatus || "")
    setFormAlert(null)
    setBarcodeAlert(null)

    setTimeout(() => {
      draftSwitchingRef.current = false
    }, 0)
  }, [activeView, draftsHydrated, activeDraftId, saleDrafts, createEmptyProductRow])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated || !activeDraftId) return
    if (draftSwitchingRef.current) return

    const computedName = isEditMode
      ? `Edit #${editingSaleId || ""}`.trim()
      : customerName?.trim()
        ? customerName.trim()
        : "New Sale"

    setSaleDrafts((prev) =>
      prev.map((draft) =>
        draft.id === activeDraftId
          ? {
              ...draft,
              name: computedName,
              updatedAt: Date.now(),
              date: date?.toISOString() || new Date().toISOString(),
              customerId,
              customerName,
              staffId,
              staffName,
              status,
              paymentMethod,
              receivedAmount,
              discountAmount,
              notes,
              shipping,
              products,
              isEditMode,
              editingSaleId,
              originalSaleStatus,
            }
          : draft,
      ),
    )
  }, [
    activeView,
    draftsHydrated,
    activeDraftId,
    date,
    customerId,
    customerName,
    staffId,
    staffName,
    status,
    paymentMethod,
    receivedAmount,
    discountAmount,
    notes,
    shipping,
    products,
    isEditMode,
    editingSaleId,
    originalSaleStatus,
  ])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated) return
    localStorage.setItem(saleDraftStorageKey, JSON.stringify(saleDrafts))
    localStorage.setItem(`${saleDraftStorageKey}_active`, activeDraftId)
  }, [activeView, draftsHydrated, saleDrafts, activeDraftId, saleDraftStorageKey])

  // Device change handling
  useEffect(() => {
    if (deviceId && deviceId !== activeDeviceIdRef.current) {
      activeDeviceIdRef.current = deviceId
      dispatch(resetSalesState())
      setSalesListLoaded(false)
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

  useEffect(() => {
    if (!customerId) {
      setCustomerAddress("")
      return
    }

    getCustomerById(customerId).then((result) => {
      if (result.success) {
        setCustomerAddress(result.data?.address || "")
      }
    })
  }, [customerId])

  // Calculate totals whenever products or discount changes
  // Calculate totals whenever products or discount changes
  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => {
      const productTotal = typeof product.total === "number" ? product.total : 0
      return sum + productTotal
    }, 0)
    setSubtotal(newSubtotal)
    const discount = typeof discountAmount === "number" ? discountAmount : 0
    const courierExtra =
      shipping.fulfillmentType === "ship" ? Number(shipping.courierPaidExtra) || 0 : 0
    const finalTotal = Math.max(0, newSubtotal - discount + courierExtra)
    setTotalAmount(finalTotal)
    
    // FIXED: Handle received amount based on status
    if (status === "Completed") {
      setReceivedAmount(finalTotal) // Full payment
    } else if (status === "Cancelled") {
      setReceivedAmount(0) // No payment for cancelled
    } else if (status === "Credit") {
      // For credit sales, keep current received amount but validate
      // If received amount was previously set to full total, reset to 0
      if (receivedAmount === 0 || receivedAmount === finalTotal) {
        setReceivedAmount(0) // Default to completely credit (no payment)
      } else if (receivedAmount > finalTotal) {
        setReceivedAmount(0) // Invalid amount, reset to 0
      }
      // Otherwise keep the partial payment amount
    } else if (status === "Pending") {
      setReceivedAmount(0) // No payment for pending
    }
  }, [products, discountAmount, status, shipping.fulfillmentType, shipping.courierPaidExtra])


  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "AED",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const applySalesMonth = useCallback((month: Date) => {
    setSalesViewMonth(startOfMonth(month))
  }, [])

  const fetchSalesForMonth = useCallback(
    async (month: Date) => {
      if (!deviceId) {
        dispatch(setError("Device ID not found"))
        return
      }

      const requestId = ++salesFetchRequestRef.current
      const { from, to } = getMonthRange(month)

      dispatch(setLoading(true))
      dispatch(setError(null))

      try {
        const result = await getUserSales(deviceId, { dateFrom: from, dateTo: to })
        if (requestId !== salesFetchRequestRef.current) return

        if (result.success) {
          dispatch(setSales(result.data.map(serializeSaleRecord)))
        } else {
          dispatch(setSales([]))
          dispatch(setError(result.message || "Failed to load sales"))
        }
      } catch (fetchError) {
        console.error("Fetch sales error:", fetchError)
        if (requestId !== salesFetchRequestRef.current) return
        dispatch(setSales([]))
        dispatch(setError("An error occurred while loading sales"))
      } finally {
        if (requestId === salesFetchRequestRef.current) {
          dispatch(setLoading(false))
          setSalesListLoaded(true)
        }
      }
    },
    [deviceId, dispatch],
  )

  useEffect(() => {
    if (activeView !== "info" || !deviceId) return
    setSalesListLoaded(false)
    fetchSalesForMonth(salesViewMonth)
  }, [activeView, deviceId, salesViewMonth, fetchSalesForMonth])

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
          !hideStockCount &&
          updatedProduct.stock !== undefined &&
          updatedProduct.quantity > updatedProduct.stock
        ) {
          updatedProduct.quantity = updatedProduct.stock
          setBarcodeAlert(
            updatedProduct.stock <= 0
              ? {
                  type: "error",
                  message: `${updatedProduct.productName || "Selected product"} is out of stock`,
                }
              : {
                  type: "warning",
                  message: `Only ${updatedProduct.stock} units available for ${updatedProduct.productName}`,
                },
          )
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

  const isProductOutOfStock = (product: ProductRow) =>
    Boolean(!hideStockCount && product.productId && !product.isService && (product.stock ?? 0) <= 0)

  const handleQuantityInputChange = (product: ProductRow, rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10)
    const requestedQuantity = Number.isFinite(parsed) ? parsed : 0

    if (isProductOutOfStock(product)) {
      setBarcodeAlert({
        type: "error",
        message: `${product.productName || "Selected product"} is out of stock`,
      })
      updateProductRow(product.id, { quantity: 0 })
      return
    }

    const safeRequested = Math.max(requestedQuantity, 1)
    if (!hideStockCount && !product.isService && product.stock !== undefined && safeRequested > product.stock) {
      setBarcodeAlert({
        type: "warning",
        message: `Only ${product.stock} units available for ${product.productName}`,
      })
      updateProductRow(product.id, { quantity: product.stock })
      return
    }

    updateProductRow(product.id, { quantity: safeRequested })
  }

  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
  ) => {
    if (!hideStockCount && stock !== undefined && stock <= 0) {
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

  const handleBarcodeInput = async (barcode: string) => {
    if (barcode === lastBarcodeProcessed || !barcode.trim()) return

    setLastBarcodeProcessed(barcode)
    setIsBarcodeProcessing(true)
    setScanStatus("processing")
    setBarcodeAlert(null)

    try {
      const result = await getProductByBarcode(barcode, userId)

      if (result.success && result.data) {
        const existingProductIndex = products.findIndex((p) => p.productId === result.data.id && !p.isService)

        if (existingProductIndex >= 0) {
          const updatedProducts = [...products]
          const product = updatedProducts[existingProductIndex]
          const newQuantity = product.quantity + 1

          if (result.data.stock !== undefined && newQuantity > result.data.stock) {
            setBarcodeAlert({
              type: "warning",
              message: `Only ${result.data.stock} units available for ${result.data.name}`,
            })
            updatedProducts[existingProductIndex] = {
              ...product,
              quantity: result.data.stock,
              total: result.data.stock * (Number(result.data.price) || 0),
            }
          } else {
            updatedProducts[existingProductIndex] = {
              ...product,
              quantity: newQuantity,
              total: newQuantity * (Number(result.data.price) || 0),
            }
          }

          setProducts(updatedProducts)
        } else {
          const emptyRowIndex = products.findIndex((p) => p.productId === null)
          const newProduct = {
            id: crypto.randomUUID(),
            productId: result.data.id,
            productName: result.data.name,
            quantity: 1,
            price: result.data.price,
            cost: result.data.wholesale_price || 0,
            stock: result.data.stock || 0,
            total: result.data.price,
            notes: "",
            isService: false,
          }

          if (emptyRowIndex >= 0) {
            const updatedProducts = [...products]
            updatedProducts[emptyRowIndex] = {
              ...updatedProducts[emptyRowIndex],
              ...newProduct,
            }
            setProducts(updatedProducts)
          } else {
            setProducts([...products, newProduct])
          }
        }

        setScanStatus("success")
        setBarcodeAlert({
          type: "success",
          message: `Added ${result.data.name} to the sale`,
        })
      } else {
        setScanStatus("error")
        setBarcodeAlert({
          type: "error",
          message: "No product found with this barcode",
        })
      }
    } catch (error) {
      console.error("Error scanning barcode:", error)
      setScanStatus("error")
      setBarcodeAlert({
        type: "error",
        message: "Failed to process barcode",
      })
    } finally {
      setBarcodeInput("")
      setIsBarcodeProcessing(false)

      setTimeout(() => {
        setScanStatus("idle")
        setTimeout(() => {
          setLastBarcodeProcessed("")
        }, 500)
      }, 1500)
    }
  }

  const resetAddSaleForm = () => {
    // Invalidate any in-flight edit-load response so cancel always wins.
    editLoadRequestRef.current += 1
    const resetDate = new Date()
    const resetProducts = [createEmptyProductRow()]
    setDate(new Date())
    setCustomerId(null)
    setCustomerName("")
    if (activeStaff) {
      setStaffId(activeStaff.id)
      setStaffName(activeStaff.name)
    }
    setStatus("Completed")
    setPaymentMethod("Cash")
    setProducts(resetProducts)
    setDiscountAmount(0)
    setReceivedAmount(0)
    setNotes("")
    setShipping({ fulfillmentType: "pickup" })
    setCustomerAddress("")
    setFormAlert(null)
    setBarcodeAlert(null)
    setIsEditMode(false)
    setEditingSaleId(null)
    setOriginalSaleStatus("")
    setPendingEditSaleId(null)
    setPendingEditDraftId("")
    clearEditSaleParamFromUrl()

    if (activeView === "entry" && activeDraftId) {
      setSaleDrafts((prev) =>
        prev.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                name: "New Sale",
                updatedAt: Date.now(),
                date: resetDate.toISOString(),
                customerId: null,
                customerName: "",
                staffId: activeStaff?.id || null,
                staffName: activeStaff?.name || "",
                status: "Completed",
                paymentMethod: "Cash",
                receivedAmount: 0,
                discountAmount: 0,
                notes: "",
                shipping: { fulfillmentType: "pickup" },
                products: resetProducts,
                isEditMode: false,
                editingSaleId: null,
                originalSaleStatus: "",
              }
            : draft,
        ),
      )
    }
  }

  // Load sale data for editing
  const loadSaleForEdit = async (saleId: number) => {
    const requestId = ++editLoadRequestRef.current
    try {
      setFormAlert(null)
      setBarcodeAlert(null)

      const result = await getSaleDetails(saleId)
      if (requestId !== editLoadRequestRef.current) return

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
        setShipping(mapSaleShippingFromRecord(sale))

        setIsEditMode(true)
        setEditingSaleId(saleId)

        setFormAlert({
          type: "success",
          message: `Loaded sale #${saleId} for editing`,
        })
      } else {
        if (requestId !== editLoadRequestRef.current) return
        setFormAlert({
          type: "error",
          message: result.message || "Failed to load sale details",
        })
      }
    } catch (error) {
      if (requestId !== editLoadRequestRef.current) return
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
          ...shipping,
        }

        const result = await updateSale(saleData)

        if (result.success) {
          setFormAlert({
            type: "success",
            message: "Sale updated successfully",
          })

          setTimeout(() => {
            finalizeDraftAfterSave()
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
          ...shipping,
        }

        const result = await addSale(saleData)

        if (result.success) {
          setFormAlert({
            type: "success",
            message: "Sale completed successfully",
          })

          if (result.data && result.data.sale) {
            setLastSaleResult(result.data)
            if (autoPrint) {
              setTimeout(() => {
                printSalesReceipt(result.data.sale, result.data.items)
                finalizeDraftAfterSave()
              }, 500)
            } else {
              setShowPrintConfirm(true)
            }
          } else {
            setTimeout(() => {
              finalizeDraftAfterSave()
            }, 1500)
          }
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
    // User explicitly requested edit again; clear last closed guard.
    lastClosedEditSaleIdRef.current = null
    if (activeView === "info") {
      switchView("entry")
      loadSaleForEdit(sale.id)
      return
    }
    loadSaleForEdit(sale.id)
  }

  // Handle print invoice from view modal
  const handlePrintInvoiceFromView = (saleId: number) => {
    router.push(`/invoice/sale/${saleId}`)
  }

  useEffect(() => {
    if (!searchParams.get("editSaleId")) return
    if (activeView === "entry") return
    switchView("entry")
  }, [searchParams, activeView, switchView])

  useEffect(() => {
    if (activeView !== "entry") return
    const editSaleIdRaw = searchParams.get("editSaleId")
    if (!editSaleIdRaw) return
    const editSaleId = Number(editSaleIdRaw)
    if (!editSaleId || Number.isNaN(editSaleId)) return
    if (!draftsHydrated) return
    if (lastClosedEditSaleIdRef.current && lastClosedEditSaleIdRef.current === editSaleId) {
      clearEditSaleParamFromUrl()
      return
    }
    if (isEditMode && editingSaleId === editSaleId) {
      clearEditSaleParamFromUrl()
      return
    }

    const existingDraft = saleDrafts.find((draft) => draft.isEditMode && draft.editingSaleId === editSaleId)
    if (existingDraft) {
      draftSwitchingRef.current = true
      setActiveDraftId(existingDraft.id)
      setPendingEditSaleId(editSaleId)
      setPendingEditDraftId(existingDraft.id)
    } else {
      const newEditDraft = createEmptyDraft(`Edit #${editSaleId}`)
      newEditDraft.isEditMode = true
      newEditDraft.editingSaleId = editSaleId
      newEditDraft.originalSaleStatus = "Completed"
      draftSwitchingRef.current = true
      setSaleDrafts((prev) => [...prev, newEditDraft])
      setActiveDraftId(newEditDraft.id)
      setPendingEditSaleId(editSaleId)
      setPendingEditDraftId(newEditDraft.id)
    }

    const params = new URLSearchParams(searchParams.toString())
    params.delete("editSaleId")
    const nextQuery = params.toString()
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    clearEditSaleParamFromUrl()
  }, [
    activeView,
    searchParams,
    router,
    pathname,
    draftsHydrated,
    saleDrafts,
    createEmptyDraft,
    isEditMode,
    editingSaleId,
    clearEditSaleParamFromUrl,
  ])

  useEffect(() => {
    if (!pendingEditSaleId || !pendingEditDraftId) return
    if (activeDraftId !== pendingEditDraftId) return

    loadSaleForEdit(pendingEditSaleId)
    setPendingEditSaleId(null)
    setPendingEditDraftId("")
  }, [activeDraftId, pendingEditSaleId, pendingEditDraftId])

  // Handle delete sale from view modal
  const handleDeleteSaleFromView = async (saleId: number) => {
    if (!deviceId) {
      notifyError(toast, "Device ID not found")
      return
    }

    try {
      setIsDeleting(true)
      const result = await deleteSale(saleId, deviceId)

      if (result.success) {
        dispatch(removeSale(saleId))
        setIsViewSaleModalOpen(false)
        setSelectedSaleId(null)
        notifySuccess(toast, "Sale deleted successfully")
        if (activeView === "info") {
          fetchSalesForMonth(salesViewMonth)
        }
      } else {
        notifyError(toast, result.message || "Failed to delete sale")
        throw new Error(result.message || "Failed to delete sale")
      }
    } catch (error) {
      console.error("Delete sale error:", error)
      notifyError(toast, "An unexpected error occurred")
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

  const handleCreateDraftTab = () => {
    if (activeView !== "entry") return
    const draftIndex = saleDrafts.length + 1
    const newDraft = createEmptyDraft(`Draft ${draftIndex}`)
    draftSwitchingRef.current = true
    setSaleDrafts((prev) => [...prev, newDraft])
    setActiveDraftId(newDraft.id)
  }

  const handleSwitchDraftTab = (draftId: string) => {
    if (activeView !== "entry" || draftId === activeDraftId) return
    draftSwitchingRef.current = true
    setActiveDraftId(draftId)
  }

  const handleRemoveDraftTab = async (draftId: string, askConfirmation = true) => {
    if (activeView !== "entry") return
    if (askConfirmation) {
      const shouldClose = await confirm("Are you sure to close this sale tab?")
      if (!shouldClose) return
    }
    const removingDraft = saleDrafts.find((draft) => draft.id === draftId)
    if (removingDraft?.isEditMode || (editingSaleId && removingDraft?.editingSaleId === editingSaleId)) {
      lastClosedEditSaleIdRef.current = Number(removingDraft?.editingSaleId || editingSaleId || 0) || null
      setIsEditMode(false)
      setEditingSaleId(null)
      setOriginalSaleStatus("")
      setPendingEditSaleId(null)
      setPendingEditDraftId("")
      clearEditSaleParamFromUrl()
    }
    setSaleDrafts((prev) => {
      const targetIndex = prev.findIndex((draft) => draft.id === draftId)
      if (targetIndex === -1) return prev

      if (prev.length === 1) {
        const replacement = createEmptyDraft("Draft 1")
        draftSwitchingRef.current = true
        setActiveDraftId(replacement.id)
        setIsEditMode(false)
        setEditingSaleId(null)
        setOriginalSaleStatus("")
        setPendingEditSaleId(null)
        setPendingEditDraftId("")
        clearEditSaleParamFromUrl()
        return [replacement]
      }

      const remainingDrafts = prev.filter((draft) => draft.id !== draftId)

      if (draftId === activeDraftId) {
        const fallbackIndex = Math.max(0, targetIndex - 1)
        const nextActiveId = remainingDrafts[fallbackIndex]?.id || remainingDrafts[0].id
        draftSwitchingRef.current = true
        setActiveDraftId(nextActiveId)
      }

      return remainingDrafts
    })
  }

  const finalizeDraftAfterSave = () => {
    setFormAlert(null)
    setShowPrintConfirm(false)
    setLastSaleResult(null)
    if (activeView === "entry" && activeDraftId) {
      void handleRemoveDraftTab(activeDraftId, false)
      return
    }
    resetAddSaleForm()
  }

  const handleCancelEditCurrent = () => {
    if (isEditMode && activeDraftId) {
      handleRemoveDraftTab(activeDraftId, false)
      return
    }
    resetAddSaleForm()
  }

  const periodLabel = getMonthRange(salesViewMonth).label
  const isCurrentMonth = isSameMonth(salesViewMonth, new Date())
  const canGoNextMonth = !isCurrentMonth

  const goToPreviousMonth = () => applySalesMonth(subMonths(salesViewMonth, 1))
  const goToNextMonth = () => {
    const nextMonth = startOfMonth(addMonths(salesViewMonth, 1))
    if (isAfter(nextMonth, startOfMonth(new Date()))) return
    applySalesMonth(nextMonth)
  }
  const goToCurrentMonth = () => applySalesMonth(startOfMonth(new Date()))

  const salesListView = (
    <SalesExcelTable
      key={periodLabel}
      sales={sales}
      periodLabel={periodLabel}
      isCurrentMonth={isCurrentMonth}
      canGoNextMonth={canGoNextMonth}
      onPreviousMonth={goToPreviousMonth}
      onNextMonth={goToNextMonth}
      onCurrentMonth={goToCurrentMonth}
      isLoading={isLoading}
      error={error}
      hasLoadedSales={salesListLoaded}
      hideCogs={hideCogs}
      formatCurrency={formatCurrency}
      getPaymentMethodDisplay={getPaymentMethodDisplay}
      getRemainingAmount={getRemainingAmount}
      onViewSale={handleViewSale}
      onEditSale={handleEditSale}
    />
  )

  const salesEntryView = (
    <div className="min-h-[calc(100vh-100px)] bg-gray-50 text-gray-900 p-2 sm:p-3">
      <div className="mb-4">
        <div className="mt-4">
            {activeView === "entry" && (
              <div className="mb-2 rounded-lg border border-gray-200 bg-white p-2">
                <div className="flex items-center gap-2 overflow-x-auto">
                  {saleDrafts.map((draft, index) => (
                    <div
                      key={draft.id}
                      className={`h-8 shrink-0 inline-flex items-center rounded-md border ${
                        draft.id === activeDraftId
                          ? draft.isEditMode
                            ? "bg-orange-500 text-white border-orange-500"
                            : "bg-primary text-primary-foreground border-primary"
                          : draft.isEditMode
                            ? "bg-orange-50 text-orange-700 border-orange-200"
                            : "bg-background text-foreground border-input"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSwitchDraftTab(draft.id)}
                        className="px-3 h-8 text-xs font-medium whitespace-nowrap"
                      >
                        {draft.name?.trim() ? draft.name : `Draft ${index + 1}`}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveDraftTab(draft.id)
                        }}
                        className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-sm ${
                          draft.id === activeDraftId
                            ? draft.isEditMode
                              ? "hover:bg-white/20"
                              : "hover:bg-primary-foreground/20"
                            : draft.isEditMode
                              ? "hover:bg-orange-100"
                              : "hover:bg-black/10"
                        }`}
                        aria-label={`Remove ${(draft.name?.trim() ? draft.name : `Draft ${index + 1}`)}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleCreateDraftTab}
                    className="h-8 shrink-0 text-xs border-dashed"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    New Tab
                  </Button>
                </div>
              </div>
            )}
            {/* Sales Tab Content - FIXED SCROLL LAYOUT */}
            <div className="flex flex-col xl:flex-row gap-3 h-full">
              {/* Main Sale Form Section - FIXED SCROLL */}
              <div className="flex-1 xl:w-3/4 flex flex-col min-h-0">
                <Card className="flex-1 overflow-hidden bg-white border-gray-200 shadow-sm flex flex-col">
                  <CardContent className="p-0 h-full flex flex-col">
                    
                    {/* Fixed Header Section */}
                    <div className="flex-shrink-0">
                      {/* Edit mode indicator */}
                      {isEditMode && (
                        <div className="p-2 bg-orange-50 border-b border-orange-200">
                          <div className="flex items-center gap-2">
                            <Edit className="h-4 w-4 text-orange-600" />
                            <span className="text-sm font-medium text-orange-800">
                              Editing Sale #{editingSaleId}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Alerts */}
                      {(formAlert || barcodeAlert) && (
                        <div
                          className="p-2 border-b border-gray-200 bg-gray-50"
                          role="status"
                          aria-live="polite"
                        >
                          {formAlert && <FormAlert type={formAlert.type} message={formAlert.message} />}
                          {barcodeAlert && <FormAlert type={barcodeAlert.type} message={barcodeAlert.message} />}
                        </div>
                      )}
                    </div>

                    {/* Scrollable Content Area */}
                    <div className="flex-1 overflow-hidden flex flex-col">
                      <div className="flex flex-col lg:flex-row h-full">
                        {/* Products section */}
                        <div className="flex-1 lg:w-[70%] flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200">
                          {/* Barcode scanner */}
                          <div className="p-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                              <div className="relative flex-1">
                                <Barcode className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                                <Input
                                  aria-label="Scan barcode or search product"
                                  autoComplete="off"
                                  spellCheck={false}
                                  placeholder="Scan barcode or search product..."
                                  className={`pl-8 h-9 bg-white border-gray-300 text-gray-900 placeholder-gray-500 transition-all duration-200 ${
                                    scanStatus === "processing"
                                      ? "border-yellow-500 bg-yellow-50"
                                      : scanStatus === "success"
                                        ? "border-green-500 bg-green-50"
                                        : scanStatus === "error"
                                          ? "border-red-500 bg-red-50"
                                          : "border-gray-300 focus:border-blue-500"
                                  }`}
                                  value={barcodeInput}
                                  onChange={(e) => {
                                    setBarcodeInput(e.target.value)
                                    if (e.target.value.trim() && !isBarcodeProcessing) {
                                      setTimeout(() => {
                                        handleBarcodeInput(e.target.value)
                                      }, 300)
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                      e.preventDefault()
                                      if (barcodeInput.trim()) {
                                        handleBarcodeInput(e.target.value)
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
                                Add
                              </Button>
                            </div>
                          </div>

                          {/* Products table header */}
                          <div className="flex items-center justify-between p-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                            <h3 className="font-medium text-sm text-gray-800">Products & Services</h3>
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsNewCustomerModalOpen(true)}
                                className="flex items-center gap-1 text-purple-600 border-purple-300 hover:bg-purple-50 h-7 text-xs"
                              >
                                <User className="h-3 w-3" />
                                <span className="hidden sm:inline">Customer</span>
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsNewServiceModalOpen(true)}
                                className="flex items-center gap-1 text-green-600 border-green-300 hover:bg-green-50 h-7 text-xs"
                              >
                                <Wrench className="h-3 w-3" />
                                <span className="hidden sm:inline">Service</span>
                              </Button>

                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setIsNewProductModalOpen(true)}
                                className="flex items-center gap-1 text-blue-600 border-blue-300 hover:bg-blue-50 h-7 text-xs"
                              >
                                <Plus className="h-3 w-3" />
                                <span className="hidden sm:inline">Product</span>
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addProductRow}
                                className="flex items-center gap-1 border-gray-300 text-gray-900 hover:bg-gray-50 h-7 text-xs bg-transparent"
                              >
                                <Plus className="h-3 w-3" />
                                <span className="hidden sm:inline">Row</span>
                              </Button>
                            </div>
                          </div>

                          {/* Products table - scrollable area */}
                          <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
                            {/* Desktop table header */}
                            <div className="hidden lg:block sticky top-0 z-10 min-w-[800px]">
                              <div className="grid grid-cols-12 gap-1 p-2 bg-gray-100 font-medium text-xs text-gray-700 border-b border-gray-200">
                                <div className="col-span-3">Product/Service</div>
                                <div className="col-span-2">Notes</div>
                                <div className="col-span-1 text-center">Qty</div>
                                <div className="col-span-2 text-center">Price</div>
                                <div className="col-span-2 text-center">
                                  <button
                                    type="button"
                                    onClick={() => setShowCost((prev) => !prev)}
                                    className="inline-flex items-center justify-center gap-1 hover:text-gray-900 transition-colors"
                                    title={showCost ? "Hide reference price" : "Show reference price"}
                                  >
                                    Ref
                                    {showCost ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                  </button>
                                </div>
                                <div className="col-span-1 text-center">Total</div>
                                <div className="col-span-1"></div>
                              </div>
                            </div>
                            {/* Desktop table rows */}
                            <div className="hidden lg:block min-w-[800px]">
                              {products.map((product, index) => (
                                <div
                                  key={product.id}
                                  className={`grid grid-cols-12 gap-1 p-2 items-center border-b border-gray-200 ${
                                    index % 2 === 0 ? "bg-white" : "bg-gray-50"
                                  } hover:bg-gray-100 transition-colors duration-150`}
                                >
                                  <div className="col-span-3">
                                    {product.productId && product.productName ? (
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 flex-1">
                                          {product.isService ? (
                                            <Wrench className="h-4 w-4 text-green-600 flex-shrink-0" />
                                          ) : (
                                            <div className="h-4 w-4 flex-shrink-0" />
                                          )}
                                          <span className="truncate flex-1 font-medium text-xs text-gray-900">
                                            {product.productName}
                                          </span>
                                          {isProductOutOfStock(product) && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                              OOS
                                            </span>
                                          )}
                                        </div>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-6 w-6 p-0 text-gray-400 hover:text-blue-500"
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
                                      className="text-xs h-7 bg-white border-gray-300 text-gray-900"
                                    />
                                  </div>
                                  <div className="col-span-1">
                                    <Input
                                      type="number"
                                      min={isProductOutOfStock(product) ? "0" : "1"}
                                      value={product.quantity}
                                      onChange={(e) => handleQuantityInputChange(product, e.target.value)}
                                      className={`text-center h-7 text-xs bg-white text-gray-900 ${
                                        isProductOutOfStock(product)
                                          ? "border-red-400"
                                          : "border-gray-300"
                                      }`}
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
                                      className="text-center h-7 text-xs bg-white border-gray-300 text-gray-900"
                                    />
                                  </div>
                                  <div className="col-span-2">
                                    {showCost ? (
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
                                        className="text-center h-7 text-xs bg-white border-gray-300 text-gray-900"
                                      />
                                    ) : (
                                      <div
                                        className="relative group"
                                        title={`${product.cost || 0}`}
                                      >
                                        <Input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          readOnly
                                          value={product.cost || 0}
                                          className="text-center h-7 text-xs bg-white border-gray-300 text-transparent group-hover:text-gray-900 group-focus-within:text-gray-900 transition-colors"
                                        />
                                        <span className="absolute inset-0 flex items-center justify-center text-gray-500 tracking-widest pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity">
                                          ****
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div className="col-span-1 flex items-center justify-center font-medium text-xs text-gray-900">
                                    {deviceCurrencyState} {product.total.toFixed(2)}
                                  </div>
                                  <div className="col-span-1 flex justify-center">
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => removeProductRow(product.id)}
                                      disabled={products.length === 1}
                                      className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
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
                                  className={`p-3 border-b border-gray-200 ${
                                    index % 2 === 0 ? "bg-white" : "bg-gray-50"
                                  }`}
                                >
                                  {/* Product Selection */}
                                  <div className="mb-3">
                                    <Label className="text-xs font-medium text-gray-700 mb-1 block">
                                      Product/Service
                                    </Label>
                                    {product.productId && product.productName ? (
                                      <div className="flex items-center justify-between p-2 bg-gray-100 rounded">
                                        <div className="flex items-center gap-2">
                                          {product.isService && (
                                            <Wrench className="h-4 w-4 text-green-600" />
                                          )}
                                          <span className="text-sm font-medium text-gray-900">
                                            {product.productName}
                                          </span>
                                          {isProductOutOfStock(product) && (
                                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700">
                                              OOS
                                            </span>
                                          )}
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
                                    <Label className="text-xs font-medium text-gray-700 mb-1 block">
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
                                      <Label className="text-xs font-medium text-gray-700 mb-1 block">
                                        Qty
                                      </Label>
                                      <Input
                                        type="number"
                                        min={isProductOutOfStock(product) ? "0" : "1"}
                                        value={product.quantity}
                                        onChange={(e) => handleQuantityInputChange(product, e.target.value)}
                                        className={`text-center h-8 text-sm ${
                                          isProductOutOfStock(product)
                                            ? "border-red-400"
                                            : ""
                                        }`}
                                      />
                                      {isProductOutOfStock(product) && (
                                        <p className="mt-1 text-[10px] text-red-600">Out of stock</p>
                                      )}
                                    </div>
                                    <div>
                                      <Label className="text-xs font-medium text-gray-700 mb-1 block">
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
                                      <Label className="text-xs font-medium text-gray-700 mb-1 flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => setShowCost((prev) => !prev)}
                                          className="inline-flex items-center gap-1"
                                          title={showCost ? "Hide reference price" : "Show reference price"}
                                        >
                                          Ref
                                          {showCost ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                        </button>
                                      </Label>
                                      {showCost ? (
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
                                      ) : (
                                        <div
                                          className="relative group"
                                          title={`${product.cost || 0}`}
                                        >
                                          <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            readOnly
                                            value={product.cost || 0}
                                            className="text-center h-8 text-sm text-transparent group-hover:text-gray-900 group-focus-within:text-gray-900 group-active:text-gray-900 transition-colors"
                                          />
                                          <span className="absolute inset-0 flex items-center justify-center text-gray-500 tracking-widest pointer-events-none group-hover:opacity-0 group-focus-within:opacity-0 group-active:opacity-0 transition-opacity">
                                            ****
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Total and Delete */}
                                  <div className="flex items-center justify-between">
                                    <div className="text-sm font-medium text-gray-900">
                                      Total: {deviceCurrencyState} {product.total.toFixed(2)}
                                    </div>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => removeProductRow(product.id)}
                                      disabled={products.length === 1}
                                      className="text-red-500 hover:text-red-700"
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
                        <div className="w-full lg:w-[30%] flex flex-col bg-white min-h-0">
                          <div className="p-3 border-b border-gray-200 overflow-y-auto flex-1">
                            <div className="space-y-3">
                              {/* Customer */}
                              <div className="space-y-1">
                                <Label className="text-xs font-medium flex items-center text-gray-900">
                                  <User className="h-3 w-3 mr-1 text-blue-500" />
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
                                  showAddNewButton={false}
                                />
                              </div>

                              {/* Status */}
                              <div className="space-y-1">
                                <Label htmlFor="status" className="text-xs font-medium text-gray-900">
                                  Status
                                </Label>
                                <select
                                  id="status"
                                  className="flex h-8 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
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
                                  <Label className="text-xs font-medium flex items-center text-gray-900">
                                    <Users className="h-3 w-3 mr-1 text-green-500" />
                                    Staff *
                                  </Label>
                                  <div className="h-8 rounded-md border border-gray-300 bg-white px-2 text-xs flex items-center text-gray-700">
                                    {activeStaff?.name || "Authenticate staff from dashboard header"}
                                  </div>
                                </div>

                                <div className="flex flex-col space-y-1 flex-1">
                                  <Label className="text-xs font-medium flex items-center text-gray-900">
                                    <Calendar className="h-3 w-3 mr-1 text-blue-500" />
                                    Date
                                  </Label>
                                  <div className="[&_button]:text-gray-900 [&_button]:[&_button]:bg-white [&_button]:[&_button]:border-gray-300 [&_button]:">
                                    <div className="">
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
                                    className="text-xs font-medium text-gray-900"
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
                                    className="h-8 text-xs bg-white border-gray-300 text-gray-900"
                                    placeholder="0.00"
                                  />
                                  <p className="text-xs text-gray-500">
                                    Remaining: {deviceCurrencyState} {(totalAmount - receivedAmount).toFixed(2)}
                                  </p>
                                </div>
                              )}

                              {/* Payment Method for Completed - responsive grid */}
                              {status === "Completed" && (
                                <div className="space-y-1">
                                  <Label className="text-xs font-medium flex items-center text-gray-900">
                                    <CreditCard className="h-3 w-3 mr-1 text-blue-500" />
                                    Payment Method
                                  </Label>
                                  <RadioGroup
                                    value={paymentMethod}
                                    onValueChange={setPaymentMethod}
                                    className="grid grid-cols-1 sm:grid-cols-3 gap-1"
                                  >
                                    <div className="flex items-center space-x-1 bg-gray-50 p-1 rounded-md border border-gray-200">
                                      <RadioGroupItem value="Cash" id="cash" className="h-3 w-3" />
                                      <Label htmlFor="cash" className="cursor-pointer text-xs text-gray-900">
                                        Cash
                                      </Label>
                                    </div>
                                    <div className="flex items-center space-x-1 bg-gray-50 p-1 rounded-md border border-gray-200">
                                      <RadioGroupItem value="Card" id="card" className="h-3 w-3" />
                                      <Label htmlFor="card" className="cursor-pointer text-xs text-gray-900">
                                        Card
                                      </Label>
                                    </div>
                                    <div className="flex items-center space-x-1 bg-gray-50 p-1 rounded-md border border-gray-200">
                                      <RadioGroupItem value="Online" id="online" className="h-3 w-3" />
                                      <Label
                                        htmlFor="online"
                                        className="cursor-pointer text-xs text-gray-900"
                                      >
                                        Online
                                      </Label>
                                    </div>
                                  </RadioGroup>
                                </div>
                              )}

                              <SaleShippingSection
                                deviceId={deviceId}
                                value={shipping}
                                onChange={setShipping}
                                customerAddress={customerAddress}
                                currency={deviceCurrencyState}
                                className="mt-2"
                              />
                            </div>
                          </div>

                          {/* Sale summary */}
                          <div className="p-3 flex flex-col border-t border-gray-200 bg-gray-50">
                            <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
                              <div className="p-3 space-y-2">
                                <div className="flex justify-between items-center py-1">
                                  <span className="font-medium text-xs text-gray-900">Subtotal:</span>
                                  <span className="text-sm text-gray-900">
                                    {deviceCurrencyState} {(typeof subtotal === "number" ? subtotal : 0).toFixed(2)}
                                  </span>
                                </div>

                                <div className="flex justify-between items-center py-1 border-t border-gray-200">
                                  <span className="font-medium text-xs text-gray-900">Discount:</span>
                                  <div className="w-20">
                                    <Input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={discountAmount}
                                      onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                                      className="text-right h-7 text-xs bg-white border-gray-300 text-gray-900"
                                    />
                                  </div>
                                </div>

                                {shipping.fulfillmentType === "ship" &&
                                Number(shipping.courierPaidExtra) > 0 ? (
                                  <div className="flex justify-between items-center py-1 border-t border-gray-200">
                                    <span className="font-medium text-xs text-gray-900">Courier charge:</span>
                                    <span className="text-sm text-emerald-700">
                                      + {deviceCurrencyState}{" "}
                                      {Number(shipping.courierPaidExtra || 0).toFixed(2)}
                                    </span>
                                  </div>
                                ) : null}

                                {shipping.fulfillmentType === "ship" &&
                                (Number(shipping.expenseCourier) > 0 ||
                                  Number(shipping.expensePacking) > 0) ? (
                                  <div className="rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-800">
                                    Shipping costs (expense): courier{" "}
                                    {deviceCurrencyState} {Number(shipping.expenseCourier || 0).toFixed(2)}
                                    {" · "}
                                    packing {deviceCurrencyState}{" "}
                                    {Number(shipping.expensePacking || 0).toFixed(2)}
                                  </div>
                                ) : null}

                                <div className="flex justify-between items-center py-2 border-t border-gray-200 bg-blue-50 p-2 rounded-md">
                                  <span className="font-bold text-blue-700 text-sm">Total:</span>
                                  <div className="font-bold text-blue-700 text-lg">
                                    {deviceCurrencyState} {(typeof totalAmount === "number" ? totalAmount : 0).toFixed(2)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Complete Sale button - FIXED POSITION */}
                            <div className="mt-3">
                              <Button
                                onClick={handleSubmitSale}
                                disabled={isSubmitting}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-auto py-2"
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

                              <div className="mt-2 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-2 py-1">
                                <label htmlFor="auto-print" className="text-xs text-gray-700">
                                  Auto‑print receipt
                                </label>
                                <input
                                  id="auto-print"
                                  type="checkbox"
                                  checked={autoPrint}
                                  onChange={(e) => {
                                    setAutoPrint(e.target.checked)
                                    localStorage.setItem("autoPrintReceipt", e.target.checked ? "true" : "false")
                                  }}
                                  className="h-4 w-4 accent-blue-600"
                                  aria-label="Toggle auto-print receipt"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-[calc(100vh-100px)] bg-background p-2 sm:p-3">
      <SalesViewFlip activeView={activeView} listView={salesListView} entryView={salesEntryView} />

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
          handleEditSale({ id: saleData.id })
        }}
        onDelete={handleDeleteSaleFromView}
        onPrintInvoice={handlePrintInvoiceFromView}
      />

      {/* Print Receipt Confirmation Dialog */}
      {showPrintConfirm && lastSaleResult && (
        <Dialog
          open={showPrintConfirm}
          onOpenChange={(open) => {
            setShowPrintConfirm(open)
            if (!open) {
              finalizeDraftAfterSave()
            }
          }}
        >
          <DialogContent className="max-w-sm bg-white border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-gray-900">Print Receipt?</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="text-sm text-gray-700">
                Sale completed successfully. Would you like to print the receipt?
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPrintConfirm(false)
                    finalizeDraftAfterSave()
                  }}
                  className="border-gray-300 text-gray-700"
                >
                  Skip Print
                </Button>
                <Button
                  onClick={() => {
                    printSalesReceipt(lastSaleResult.sale, lastSaleResult.items)
                    setShowPrintConfirm(false)
                    finalizeDraftAfterSave()
                    if (rememberChoice) {
                      setAutoPrint(true)
                      localStorage.setItem("autoPrintReceipt", "true")
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Print Receipt
                </Button>
              </div>
              <div className="flex items-center mt-2">
                <input
                  type="checkbox"
                  id="remember-choice"
                  checked={rememberChoice}
                  onChange={(e) => setRememberChoice(e.target.checked)}
                  className="mr-2"
                />
                <Label htmlFor="remember-choice" className="text-xs text-gray-700">
                  Remember my choice (enable auto-print)
                </Label>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
      {ConfirmDialog}
    </div>
  )
}
