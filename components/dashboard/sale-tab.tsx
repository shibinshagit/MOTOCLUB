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
import { markInventoryStale } from "@/lib/inventory-sync"
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
import { BatchAllocator } from "@/components/dashboard/batch-allocator"
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
  productVariantId?: number | null
  batchId?: number | null
  variantName?: string | null
  batchNumber?: string | null
  hasVariants?: boolean
  isBatchManaged?: boolean
  variants?: any[]
  batches?: any[]
  allocations?: any[]
  autoAllocate?: boolean
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
  customerPhone: string
  staffId: number | null
  staffName: string
  status: string
  paymentStatus?: string
  paymentMethod: string
  receivedAmount: number
  advanceAmount: number
  balanceAmount: number
  discountAmount: number
  notes: string
  shipping: SaleShippingInput
  products: ProductRow[]
  isEditMode: boolean
  editingSaleId: number | null
  originalSaleStatus: string
  isLoadingEdit?: boolean
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
  const [allocatorRowId, setAllocatorRowId] = useState<string | null>(null)
  const [originalSaleStatus, setOriginalSaleStatus] = useState<string>("")

  const [receivedAmount, setReceivedAmount] = useState(0)
  const [advanceAmount, setAdvanceAmount] = useState(0)
  const [balanceAmount, setBalanceAmount] = useState(0)
  const [deviceCurrencyState, setDeviceCurrencyState] = useState(deviceCurrency || "QAR")
  const [date, setDate] = useState<Date>(new Date())
  const [customerId, setCustomerId] = useState<number | null>(null)
  const [customerName, setCustomerName] = useState<string>("")
  const [customerPhone, setCustomerPhone] = useState<string>("")
  const [staffId, setStaffId] = useState<number | null>(null)
  const [staffName, setStaffName] = useState<string>("")
  const [status, setStatus] = useState<string>("Completed")
  const [paymentStatus, setPaymentStatus] = useState<string>("Paid")
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
      customerPhone: "",
      staffId: activeStaff?.id || null,
      staffName: activeStaff?.name || "",
      status: "Completed",
      paymentStatus: "Paid",
      paymentMethod: "Cash",
      receivedAmount: 0,
      advanceAmount: 0,
      balanceAmount: 0,
      discountAmount: 0,
      notes: "",
      shipping: { fulfillmentType: "pickup" },
      products: [createEmptyProductRow()],
      isEditMode: false,
      editingSaleId: null,
      originalSaleStatus: "",
      isLoadingEdit: false,
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
    if (draftsHydrated) return
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
  }, [saleDraftStorageKey, createEmptyDraft, draftsHydrated])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated) return
    const activeDraft = saleDrafts.find((d) => d.id === activeDraftId)
    if (!activeDraft) return

    draftSwitchingRef.current = true
    setDate(new Date(activeDraft.date || new Date().toISOString()))
    setCustomerId(activeDraft.customerId)
    setCustomerName(activeDraft.customerName || "")
    setCustomerPhone(activeDraft.customerPhone || "")
    setStaffId(activeDraft.staffId)
    setStaffName(activeDraft.staffName || "")
    setStatus(activeDraft.status || "Completed")
    setPaymentStatus(activeDraft.paymentStatus || "Paid")
    setPaymentMethod(activeDraft.paymentMethod || "Cash")
    setReceivedAmount(Number(activeDraft.receivedAmount) || 0)
    setAdvanceAmount(Number(activeDraft.advanceAmount) || 0)
    setBalanceAmount(Number(activeDraft.balanceAmount) || 0)
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

    const timeoutId = setTimeout(() => {
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
                customerPhone,
                staffId,
                staffName,
                status,
                paymentStatus,
                paymentMethod,
                receivedAmount,
                advanceAmount,
                balanceAmount,
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
    }, 400) // Debounce global draft updates to fix typing lag

    return () => clearTimeout(timeoutId)
  }, [
    activeView,
    draftsHydrated,
    activeDraftId,
    date,
    customerId,
    customerName,
    customerPhone,
    staffId,
    staffName,
    status,
    paymentStatus,
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

    const timeoutId = setTimeout(() => {
      localStorage.setItem(saleDraftStorageKey, JSON.stringify(saleDrafts))
      localStorage.setItem(`${saleDraftStorageKey}_active`, activeDraftId)
    }, 400) // Debounce blocking localStorage writes

    return () => clearTimeout(timeoutId)
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
  }, [products, discountAmount, shipping.fulfillmentType, shipping.courierPaidExtra])

  // Auto-calculate received amount based on paymentStatus and paymentMethod
  useEffect(() => {
    if (paymentStatus === "Paid" || paymentStatus === "Completed") {
      setReceivedAmount(totalAmount)
    } else if (paymentStatus === "Cancelled") {
      setReceivedAmount(0)
    } else if (paymentStatus === "Pending") {
      setReceivedAmount(0)
    }
  }, [paymentStatus, paymentMethod, totalAmount])

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
  const addProductRow = useCallback(() => {
    setProducts(prev => [
      ...prev,
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
  }, [])

  const removeProductRow = useCallback((id: string) => {
    setProducts(prev => {
      if (prev.length > 1) {
        return prev.filter((product) => product.id !== id)
      }
      return prev
    })
  }, [])

  const updateProductRow = useCallback((id: string, updates: Partial<ProductRow>) => {
    setProducts(prev => prev.map((product) => {
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
    }))
  }, [hideStockCount])

  const isProductOutOfStock = (product: ProductRow) =>
    Boolean(!hideStockCount && product.productId && !product.isService && (product.stock ?? 0) <= 0)

  const handleQuantityInputChange = useCallback((product: ProductRow, rawValue: string) => {
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

    let allocations = product.allocations || []
    let updatedPrice = product.price
    let updatedCost = product.cost || 0

    if (product.autoAllocate && product.isBatchManaged && product.batches && product.batches.length > 0) {
      allocations = []
      let remaining = safeRequested
      const sortedBatches = [...product.batches].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      for (const b of sortedBatches) {
        if (remaining <= 0) break
        const stockCount = b.stocks?.find((s: any) => Number(s.device_id) === Number(deviceId))?.stock || b.device_stock || b.stock || 0
        if (stockCount > 0) {
          const allocQty = Math.min(stockCount, remaining)
          allocations.push({ 
            batchId: b.id || b.batch_id, 
            quantity: allocQty, 
            costPrice: b.cost_price ? Number(b.cost_price) : product.cost, 
            sellingPrice: b.selling_price ? Number(b.selling_price) : (product.variants?.find((v:any) => v.id === product.productVariantId)?.price || product.price) 
          })
          remaining -= allocQty
        }
      }

      if (allocations.length > 0) {
        const totalAllocatedQty = allocations.reduce((sum, a) => sum + a.quantity, 0)
        const totalCost = allocations.reduce((sum, a) => sum + (a.costPrice || updatedCost) * a.quantity, 0)
        const totalPrice = allocations.reduce((sum, a) => sum + (a.sellingPrice || updatedPrice) * a.quantity, 0)
        updatedCost = totalCost / totalAllocatedQty
        updatedPrice = totalPrice / totalAllocatedQty
      }
    } else if (allocations.length > 0 && !product.autoAllocate) {
      // If manual, we don't automatically override allocations on quantity change,
      // but we do recalculate total based on the newly typed quantity and existing base price.
      // Alternatively, the user can open the allocator to adjust.
    }

    updateProductRow(product.id, { 
      quantity: safeRequested,
      allocations: allocations,
      price: updatedPrice,
      cost: updatedCost,
      total: updatedPrice * safeRequested
    })
  }, [hideStockCount, updateProductRow, deviceId])

  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
    productObj?: any,
  ) => {
    if (!hideStockCount && stock !== undefined && stock <= 0) {
      setBarcodeAlert({
        type: "error",
        message: `${productName} is out of stock`,
      })
    }

    // Check if this is a service (stock = 999 indicates service)
    const isService = stock === 999

    let resolvedVariantId = null
    let hasVariants = false
    let isBatchManaged = productObj?.is_batch_managed || false
    let variantName = null
    let batches = productObj?.batches || []
    let variants = productObj?.variants || []

    if (productObj?.variants && productObj.variants.length > 0) {
      hasVariants = true
      // Default-only products remain one-click. Products with choices must
      // explicitly select a variant before their variant-scoped batches load.
      const selectedVariant = productObj.variants.length === 1 ? productObj.variants[0] : null
      resolvedVariantId = selectedVariant?.id || null
      variantName = selectedVariant?.name || null
      if (selectedVariant && batches.length === 0 && selectedVariant.batches) {
        batches = selectedVariant.batches
      }
    }

    let allocations: any[] = []
    let autoAllocate = true
    let updatedPrice = price
    let updatedCost = productObj?.cost_price ?? wholesalePrice ?? productObj?.wholesale_price ?? 0

    if (isBatchManaged && resolvedVariantId && batches.length > 0) {
      // Auto Allocate initially
      let remaining = updatedPrice > 0 ? (products.find((p) => p.id === id)?.quantity || 1) : 1
      const sortedBatches = [...batches].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      for (const b of sortedBatches) {
        if (remaining <= 0) break
        const stockCount = b.stocks?.find((s: any) => Number(s.device_id) === Number(deviceId))?.stock || b.device_stock || b.stock || 0
        if (stockCount > 0) {
          const allocQty = Math.min(stockCount, remaining)
          allocations.push({ batchId: b.id || b.batch_id, quantity: allocQty, costPrice: b.cost_price ? Number(b.cost_price) : updatedCost, sellingPrice: b.selling_price ? Number(b.selling_price) : updatedPrice })
          remaining -= allocQty
        }
      }
      
      if (allocations.length > 0) {
        updatedCost = allocations[0].costPrice || updatedCost
        updatedPrice = allocations[0].sellingPrice || updatedPrice
      }
    }

    updateProductRow(id, {
      productId,
      productName,
      price: updatedPrice,
      total: updatedPrice * (products.find((p) => p.id === id)?.quantity || 1),
      stock,
      isService,
      serviceId: isService ? productId : undefined,
      productVariantId: resolvedVariantId,
      hasVariants,
      isBatchManaged,
      variantName,
      batches,
      variants,
      batchId: null,
      batchNumber: null,
      allocations,
      autoAllocate,
      cost: updatedCost,
    })

    const hasEmptyRow = products.some((p) => p.productId === null)
    if (!hasEmptyRow) {
      addProductRow()
    }
  }

  const handleNewCustomer = (customerId: number, customerName: string, customerObj?: any) => {
    setCustomerId(customerId)
    setCustomerName(customerName)
    setCustomerPhone(customerObj?.phone || "")
    
    // Automatically populate the address fields if the created customer has them
    if (customerObj) {
      setShipping((prev) => ({
        ...prev,
        shippingAddress: customerObj.address || prev.shippingAddress,
        shippingCity: customerObj.city || prev.shippingCity,
        shippingPincode: customerObj.pincode || prev.shippingPincode,
        shippingLandmark: customerObj.landmark || prev.shippingLandmark,
        shippingAddressType: customerObj.address_type || prev.shippingAddressType,
      }))
    }
    
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
            cost: result.data.cost_price ?? result.data.wholesale_price ?? 0,
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
    setCustomerPhone("")
    if (activeStaff) {
      setStaffId(activeStaff.id)
      setStaffName(activeStaff.name)
    }
    setStatus("Completed")
    setPaymentStatus("Paid")
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
                customerPhone: "",
                staffId: activeStaff?.id || null,
                staffName: activeStaff?.name || "",
                status: "Completed",
                paymentStatus: "Paid",
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
  const loadSaleForEdit = async (saleId: number, targetDraftId: string) => {
    const requestId = ++editLoadRequestRef.current
    try {
      setFormAlert(null)
      setBarcodeAlert(null)

      const result = await getSaleDetails(saleId)
      if (requestId !== editLoadRequestRef.current) return

      if (result.success && result.data) {
        const { sale, items } = result.data

        // Set staff information
        let resolvedStaffId = null
        let resolvedStaffName = ""
        if (sale.staff_id) {
          resolvedStaffId = sale.staff_id
          resolvedStaffName = sale.staff_name || ""
        } else if (activeStaff) {
          resolvedStaffId = activeStaff.id
          resolvedStaffName = activeStaff.name
        }

        const resolvedPaymentMethod = "payment_method" in sale ? (sale.payment_method || "Cash") : "Cash"

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
            productVariantId: item.product_variant_id,
            variantName: item.variant_name,
            batchId: item.batch_id,
            batchNumber: item.batch_number,
            isBatchManaged: item.is_batch_managed,
            allocations: item.allocations || [],
          }
        })

        let parsedReceivedAmount = Number(sale.received_amount) || 0
        if (!sale.received_amount && (sale.payment_status === "Paid" || sale.payment_status === "Completed" || sale.status === "Completed")) {
          // Fallback for very old records that didn't store received_amount properly
          parsedReceivedAmount = Number(sale.total_amount)
        }
        
        const parsedAdvanceAmount = Number(sale.advance_amount) || 0
        const parsedBalanceAmount = Number(sale.balance_amount) || 0
        const mappedShipping = mapSaleShippingFromRecord(sale)

        const finalProducts = productRows.length > 0 ? productRows : [createEmptyProductRow()]

        // Force update the draft to prevent hydration loop from resetting it to empty
        setSaleDrafts((prev) =>
          prev.map((draft) =>
            draft.id === targetDraftId
              ? {
                  ...draft,
                  date: new Date(sale.sale_date).toISOString(),
                  customerId: sale.customer_id,
                  customerName: sale.customer_name || sale.customer_name_override || "",
                  customerPhone: sale.customer_phone || sale.customer_phone_override || "",
                  status: sale.status || "Completed",
                  paymentStatus: sale.payment_status || "Paid",
                  originalSaleStatus: sale.status || "Completed",
                  staffId: resolvedStaffId,
                  staffName: resolvedStaffName,
                  paymentMethod: resolvedPaymentMethod,
                  discountAmount: Number(sale.discount) || 0,
                  products: finalProducts,
                  receivedAmount: parsedReceivedAmount,
                  advanceAmount: parsedAdvanceAmount,
                  balanceAmount: parsedBalanceAmount,
                  shipping: mappedShipping,
                  isEditMode: true,
                  editingSaleId: saleId,
                  name: `Edit #${saleId}`,
                  isLoadingEdit: false,
                }
              : draft
          )
        )

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

    const finalStaffId = staffId || activeStaff?.id
    if (!finalStaffId) {
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
        variantId: p.productVariantId,
        batchId: p.batchId,
        allocations: p.allocations,
      }))

    if (validItems.length === 0) {
      setFormAlert({
        type: "error",
        message: "Please add at least one item to the sale",
      })
      return
    }

    if (paymentStatus === "Credit" && receivedAmount > totalAmount) {
      setFormAlert({
        type: "error",
        message: "Received amount cannot be greater than total amount",
      })
      return
    }

    if (paymentStatus === "Credit" && !customerId) {
      setFormAlert({
        type: "error",
        message: "Please select a customer for a credit sale.",
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
          paymentStatus: paymentStatus,
          paymentMethod: paymentMethod,
          saleDate: date?.toISOString() || new Date().toISOString(),
          status: status,
          originalStatus: originalSaleStatus,
          discount: discountAmount,
          receivedAmount: receivedAmount,
          advanceAmount: advanceAmount,
          balanceAmount: balanceAmount,
          staffId: finalStaffId,
          ...shipping,
        }

        const result = await updateSale(saleData)

        if (result.success) {
          markInventoryStale(dispatch)
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
          staffId: finalStaffId || null,
          userId: userId,
          deviceId: deviceId,
          items: validItems,
          status: status,
          paymentStatus: paymentStatus,
          paymentMethod: paymentMethod,
          saleDate: date?.toISOString() || new Date().toISOString(),
          notes: notes,
          discount: discountAmount,
          receivedAmount: receivedAmount,
          advanceAmount: advanceAmount,
          balanceAmount: balanceAmount,
          ...shipping,
        }

        const result = await addSale(saleData)

        if (result.success) {
          markInventoryStale(dispatch)
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
    
    let targetDraftId = activeDraftId
    const existingDraft = saleDrafts.find((draft) => draft.isEditMode && draft.editingSaleId === sale.id)
    if (existingDraft) {
      targetDraftId = existingDraft.id
      draftSwitchingRef.current = true
      setActiveDraftId(existingDraft.id)
      setPendingEditSaleId(sale.id)
      setPendingEditDraftId(existingDraft.id)
    } else {
      const newEditDraft = createEmptyDraft(`Edit #${sale.id}`)
      newEditDraft.isEditMode = true
      newEditDraft.editingSaleId = sale.id
      newEditDraft.originalSaleStatus = "Completed"
      newEditDraft.isLoadingEdit = true
      targetDraftId = newEditDraft.id
      draftSwitchingRef.current = true
      setSaleDrafts((prev) => [...prev, newEditDraft])
      setActiveDraftId(newEditDraft.id)
      setPendingEditSaleId(sale.id)
      setPendingEditDraftId(newEditDraft.id)
    }

    if (activeView === "info") {
      switchView("entry")
    }
    loadSaleForEdit(sale.id, targetDraftId)
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
      newEditDraft.isLoadingEdit = true
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
    if (pendingEditSaleId && pendingEditDraftId && draftsHydrated) {
      loadSaleForEdit(pendingEditSaleId, pendingEditDraftId)
      setPendingEditSaleId(null)
      setPendingEditDraftId("")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEditSaleId, pendingEditDraftId, draftsHydrated])

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
        markInventoryStale(dispatch)
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

  // Calculate remaining amount based on total and received, for all payment methods
  const getRemainingAmount = (sale: any) => {
    if (sale.payment_status === "Paid" || sale.payment_status === "Completed") {
      return 0
    }
    
    // Use explicit balance_amount from DB if available and > 0
    if (sale.balance_amount !== undefined && sale.balance_amount !== null) {
      const balance = Number(sale.balance_amount)
      if (balance > 0) return balance
    }

    // Fallback for legacy records
    const total = Number(sale.total_amount) || 0
    const received = Number(sale.received_amount) || 0
    return Math.max(0, total - received)
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
    if (activeView === "entry") {
      // A completed sale must not leave stale entry tabs behind. Start the
      // cashier on one clean draft so tabs cannot accumulate after checkout.
      const freshDraft = createEmptyDraft("Draft 1")
      draftSwitchingRef.current = true
      setSaleDrafts([freshDraft])
      setActiveDraftId(freshDraft.id)
      setIsEditMode(false)
      setEditingSaleId(null)
      setOriginalSaleStatus("")
      setPendingEditSaleId(null)
      setPendingEditDraftId("")
      clearEditSaleParamFromUrl()
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

  const memoizedProductTable = useMemo(() => (
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
                <div className="flex flex-col">
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
                          isBatchManaged: false,
                          allocations: [],
                          autoAllocate: true,
                          batchId: null,
                          batchNumber: null,
                        })
                        setBarcodeAlert(null)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {(!product.isService || (product.variants && product.variants.length > 0)) && (
                    <div className="mt-1.5 ml-6 flex flex-col sm:flex-row gap-2">
                      {product.variants && product.variants.length > 0 && (
                        <select
                          className="h-7 text-[10px] sm:text-xs bg-white border border-gray-300 rounded-md px-1.5 w-full max-w-[120px]"
                          value={product.productVariantId || ""}
                          onChange={(e) => {
                            const vId = e.target.value
                            const v = product.variants?.find((vx: any) => String(vx.id) === vId)
                            if (v) {
                              let newAllocations: any[] = []
                              let newPrice = v.price ? Number(v.price) : product.price
                              let newCost = v.cost_price ? Number(v.cost_price) : product.cost
                              let newTotal = newPrice * product.quantity

                              if (product.isBatchManaged && v.batches && v.batches.length > 0) {
                                let remaining = product.quantity
                                const sortedBatches = [...v.batches].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                for (const b of sortedBatches) {
                                  if (remaining <= 0) break
                                  const stockCount = b.stocks?.find((s: any) => Number(s.device_id) === Number(deviceId))?.stock || b.device_stock || b.stock || 0
                                  if (stockCount > 0) {
                                    const allocQty = Math.min(stockCount, remaining)
                                    newAllocations.push({ 
                                      batchId: b.id || b.batch_id, 
                                      quantity: allocQty, 
                                      costPrice: b.cost_price ? Number(b.cost_price) : newCost, 
                                      sellingPrice: b.selling_price ? Number(b.selling_price) : newPrice 
                                    })
                                    remaining -= allocQty
                                  }
                                }

                                if (newAllocations.length > 0) {
                                  const totalAllocatedQty = newAllocations.reduce((sum, a) => sum + a.quantity, 0)
                                  const totalCost = newAllocations.reduce((sum, a) => sum + (a.costPrice || newCost) * a.quantity, 0)
                                  const totalPrice = newAllocations.reduce((sum, a) => sum + (a.sellingPrice || newPrice) * a.quantity, 0)
                                  newCost = totalCost / totalAllocatedQty
                                  newPrice = totalPrice / totalAllocatedQty
                                  newTotal = newPrice * product.quantity
                                }
                              }

                              updateProductRow(product.id, {
                                productVariantId: v.id,
                                variantName: v.name,
                                batchId: null,
                                batchNumber: null,
                                price: newPrice,
                                cost: newCost,
                                total: newTotal,
                                batches: v.batches || [],
                                allocations: newAllocations,
                                autoAllocate: true
                              })
                            }
                          }}
                        >
                          <option value="" disabled>Select Variant</option>
                          {product.variants.map((v: any) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      )}
                      {product.isBatchManaged && product.batches && product.batches.length > 0 && (
                        <div className="flex flex-col gap-1 w-full max-w-[200px]">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] sm:text-xs px-2 flex justify-between items-center bg-blue-50/30 border-blue-200 text-blue-800 hover:bg-blue-100/50 w-full"
                            onClick={() => setAllocatorRowId(product.id)}
                            disabled={product.variants && product.variants.length > 1 && !product.productVariantId}
                          >
                            <span className="truncate">
                              {product.allocations?.length ? `Allocated (${product.allocations.reduce((sum, a) => sum + a.quantity, 0)})` : 'Allocate Batches'}
                            </span>
                            <span className="ml-1 opacity-70">
                              {product.autoAllocate ? '(Auto)' : '(Manual)'}
                            </span>
                          </Button>
                          {product.allocations && product.allocations.length > 0 && (
                            <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                              {product.allocations.map((a, idx) => {
                                const b = product.batches?.find(bx => String(bx.id || bx.batch_id) === String(a.batchId))
                                return <div key={idx}>{b?.batch_no || 'Unknown'}: {a.quantity} qty</div>
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <ProductSelectSimple
                  id={`product-select-${product.id}`}
                  value={product.productId}
                  onChange={(productId, productName, price, wholesalePrice, stock, productObj) =>
                    handleProductSelect(product.id, productId, productName, price, wholesalePrice, stock, productObj)
                  }
                  onAddNew={() => setIsNewProductModalOpen(true)}
                  onAddNewService={() => setIsNewServiceModalOpen(true)}
                  userId={userId}
                  error={
                    products.filter((p) => p.productId === product.productId).length > 1
                      ? "Duplicate item"
                      : undefined
                  }
                />
              )}
            </div>
            <div className="col-span-2">
              <Input
                value={product.notes}
                onChange={(e) => updateProductRow(product.id, { notes: e.target.value })}
                className="h-8 text-xs bg-white border-gray-300 text-gray-900"
                placeholder="Optional notes..."
                disabled={!product.productId}
              />
            </div>
            <div className="col-span-1">
              <Input
                type="number"
                min="1"
                step="1"
                value={product.quantity || ""}
                onChange={(e) => handleQuantityInputChange(product, e.target.value)}
                className="h-8 text-xs text-center bg-white border-gray-300 text-gray-900"
                disabled={!product.productId}
              />
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={product.price || ""}
                  onChange={(e) => updateProductRow(product.id, { price: Number.parseFloat(e.target.value) || 0 })}
                  className="h-8 text-xs text-right pr-6 bg-white border-gray-300 text-gray-900"
                  disabled={!product.productId}
                />
                <span className="absolute right-2 top-2 text-[10px] text-gray-400">{deviceCurrencyState}</span>
              </div>
            </div>
            <div className="col-span-2 text-center text-xs text-gray-500 relative group">
              {product.productId ? (
                <div className="cursor-help w-full">
                  {showCost ? (
                    <span className="font-medium text-gray-900">
                      {deviceCurrencyState} {formatCurrency(product.cost || 0)}
                    </span>
                  ) : (
                    <>
                      <span className="text-gray-400 tracking-widest group-hover:hidden">••••••</span>
                      <span className="hidden group-hover:inline-block font-medium">
                        {deviceCurrencyState} {formatCurrency(product.cost || 0)}
                      </span>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <div className="col-span-1 text-right font-medium text-xs text-gray-900">
              {product.productId ? (
                <>
                  {deviceCurrencyState} {formatCurrency(product.total)}
                </>
              ) : null}
            </div>
            <div className="col-span-1 flex justify-center">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeProductRow(product.id)}
                disabled={products.length === 1}
                className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {/* Mobile table rows */}
      <div className="lg:hidden">
        {products.map((product, index) => (
          <div
            key={product.id}
            className={`flex flex-col p-3 border-b border-gray-200 ${
              index % 2 === 0 ? "bg-white" : "bg-gray-50"
            }`}
          >
            <div className="mb-2">
              <Label className="text-[10px] text-gray-500 mb-1 block">Product/Service</Label>
              {product.productId && product.productName ? (
                <div className="flex flex-col">
                  <div className="flex items-center justify-between bg-gray-100 p-2 rounded-md">
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
                          isBatchManaged: false,
                          allocations: [],
                          autoAllocate: true,
                          batchId: null,
                          batchNumber: null,
                        })
                        setBarcodeAlert(null)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {(!product.isService || (product.variants && product.variants.length > 0)) && (
                    <div className="mt-2 flex flex-row gap-2">
                      {product.variants && product.variants.length > 0 && (
                        <select
                          className="h-8 text-xs bg-white border border-gray-300 rounded-md px-2 flex-1"
                          value={product.productVariantId || ""}
                          onChange={(e) => {
                            const vId = e.target.value
                            const v = product.variants?.find((vx: any) => String(vx.id) === vId)
                            if (v) {
                              let newAllocations: any[] = []
                              let newPrice = v.price ? Number(v.price) : product.price
                              let newCost = v.cost_price ? Number(v.cost_price) : product.cost
                              let newTotal = newPrice * product.quantity

                              if (product.isBatchManaged && v.batches && v.batches.length > 0) {
                                let remaining = product.quantity
                                const sortedBatches = [...v.batches].sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                                for (const b of sortedBatches) {
                                  if (remaining <= 0) break
                                  const stockCount = b.stocks?.find((s: any) => Number(s.device_id) === Number(deviceId))?.stock || b.device_stock || b.stock || 0
                                  if (stockCount > 0) {
                                    const allocQty = Math.min(stockCount, remaining)
                                    newAllocations.push({ 
                                      batchId: b.id || b.batch_id, 
                                      quantity: allocQty, 
                                      costPrice: b.cost_price ? Number(b.cost_price) : newCost, 
                                      sellingPrice: b.selling_price ? Number(b.selling_price) : newPrice 
                                    })
                                    remaining -= allocQty
                                  }
                                }

                                if (newAllocations.length > 0) {
                                  const totalAllocatedQty = newAllocations.reduce((sum, a) => sum + a.quantity, 0)
                                  const totalCost = newAllocations.reduce((sum, a) => sum + (a.costPrice || newCost) * a.quantity, 0)
                                  const totalPrice = newAllocations.reduce((sum, a) => sum + (a.sellingPrice || newPrice) * a.quantity, 0)
                                  newCost = totalCost / totalAllocatedQty
                                  newPrice = totalPrice / totalAllocatedQty
                                  newTotal = newPrice * product.quantity
                                }
                              }

                              updateProductRow(product.id, {
                                productVariantId: v.id,
                                variantName: v.name,
                                batchId: null,
                                batchNumber: null,
                                price: newPrice,
                                cost: newCost,
                                total: newTotal,
                                batches: v.batches || [],
                                allocations: newAllocations,
                                autoAllocate: true
                              })
                            }
                          }}
                        >
                          <option value="" disabled>Select Variant</option>
                          {product.variants.map((v: any) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      )}
                      {product.isBatchManaged && product.batches && product.batches.length > 0 && (
                        <div className="flex flex-col gap-1 flex-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs px-2 flex justify-between items-center bg-blue-50/30 border-blue-200 text-blue-800 hover:bg-blue-100/50 w-full"
                            onClick={() => setAllocatorRowId(product.id)}
                            disabled={product.variants && product.variants.length > 1 && !product.productVariantId}
                          >
                            <span className="truncate">
                              {product.allocations?.length ? `Allocated (${product.allocations.reduce((sum, a) => sum + a.quantity, 0)})` : 'Allocate Batches'}
                            </span>
                          </Button>
                          {product.allocations && product.allocations.length > 0 && (
                            <div className="text-[11px] text-gray-500 mt-0.5 leading-tight">
                              {product.allocations.map((a, idx) => {
                                const b = product.batches?.find(bx => String(bx.id || bx.batch_id) === String(a.batchId))
                                return <div key={idx}>{b?.batch_no || 'Unknown'}: {a.quantity} qty</div>
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <ProductSelectSimple
                  id={`product-select-mobile-${product.id}`}
                  value={product.productId}
                  onChange={(productId, productName, price, wholesalePrice, stock, productObj) =>
                    handleProductSelect(product.id, productId, productName, price, wholesalePrice, stock, productObj)
                  }
                  onAddNew={() => setIsNewProductModalOpen(true)}
                  onAddNewService={() => setIsNewServiceModalOpen(true)}
                  userId={userId}
                  error={
                    products.filter((p) => p.productId === product.productId).length > 1
                      ? "Duplicate"
                      : undefined
                  }
                />
              )}
            </div>

            <div className="mb-2">
              <Label className="text-[10px] text-gray-500 mb-1 block">Notes</Label>
              <Input
                value={product.notes}
                onChange={(e) => updateProductRow(product.id, { notes: e.target.value })}
                className="h-8 text-xs bg-white border-gray-300 text-gray-900"
                placeholder="Optional notes..."
                disabled={!product.productId}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <Label className="text-[10px] text-gray-500 mb-1 block">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={product.quantity || ""}
                  onChange={(e) => handleQuantityInputChange(product, e.target.value)}
                  className="h-8 text-xs bg-white border-gray-300 text-gray-900"
                  disabled={!product.productId}
                />
              </div>
              <div>
                <Label className="text-[10px] text-gray-500 mb-1 block">Price</Label>
                <div className="relative">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={product.price || ""}
                    onChange={(e) => updateProductRow(product.id, { price: Number.parseFloat(e.target.value) || 0 })}
                    className="h-8 text-xs pr-8 bg-white border-gray-300 text-gray-900"
                    disabled={!product.productId}
                  />
                  <span className="absolute right-2 top-2 text-[10px] text-gray-400">{deviceCurrencyState}</span>
                </div>
              </div>
            </div>

            {product.productId && (
              <div className="mb-2">
                <Label className="text-[10px] text-gray-500 mb-1 block">Ref Price (Cost)</Label>
                <div className="text-xs text-gray-700 bg-gray-100 p-1.5 rounded relative group cursor-help w-full">
                  {showCost ? (
                    <span className="font-medium">
                      {deviceCurrencyState} {formatCurrency(product.cost || 0)}
                    </span>
                  ) : (
                    <>
                      <span className="text-gray-400 tracking-widest group-hover:hidden">••••••</span>
                      <span className="hidden group-hover:inline-block font-medium">
                        {deviceCurrencyState} {formatCurrency(product.cost || 0)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
              <div>
                <Label className="text-[10px] text-gray-500 block">Total</Label>
                <div className="font-medium text-sm text-gray-900">
                  {product.productId ? (
                    <>
                      {deviceCurrencyState} {formatCurrency(product.total)}
                    </>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div>
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
          </div>
        ))}
      </div>
    </div>
  ), [products, showCost, deviceCurrencyState, hideStockCount, updateProductRow, removeProductRow, addProductRow, handleQuantityInputChange, handleProductSelect, setAllocatorRowId, setIsNewServiceModalOpen])

  const currentActiveDraft = saleDrafts.find(d => d.id === activeDraftId)
  const isDraftLoading = currentActiveDraft?.isLoadingEdit || false

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
                  {isDraftLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 bg-white">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                      <p className="text-gray-500 font-medium">Loading sale details...</p>
                    </div>
                  ) : (
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
                          {/* Barcode scanner removed per user request */}

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
                                onClick={addProductRow}
                                className="flex items-center gap-1 border-gray-300 text-gray-900 hover:bg-gray-50 h-7 text-xs bg-transparent"
                              >
                                <Plus className="h-3 w-3" />
                                Add
                              </Button>
                            </div>
                          </div>
                          {memoizedProductTable}
                        </div>
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
                                  initialCustomerName={customerName}
                                  onChange={(value, name, obj) => {
                                    setCustomerId(value)
                                    if (name) setCustomerName(name)
                                    if (obj?.phone) setCustomerPhone(obj.phone)
                                  }}
                                  onAddNew={() => setIsNewCustomerModalOpen(true)}
                                  userId={userId}
                                  showAddNewButton={false}
                                />
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
                                      <DatePickerField date={date} onDateChange={(d) => d && setDate(d)} />
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Payment Section */}
                              <div className="space-y-3 pt-3 border-t border-gray-200 mt-3">
                                <h3 className="text-sm font-semibold text-gray-900 flex items-center">
                                  <CreditCard className="h-4 w-4 mr-2 text-blue-500" />
                                  Payment Details
                                </h3>
                                
                                <div className="space-y-1">
                                  <Label className="text-xs font-medium text-gray-900">
                                    Payment Method
                                  </Label>
                                  <select
                                    className="flex h-8 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                                    value={paymentMethod}
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                  >
                                    <option value="Cash">Cash</option>
                                    <option value="Card">Card</option>
                                    <option value="Bank Transfer">Bank Transfer</option>
                                    <option value="UPI">UPI</option>
                                    <option value="COD">Cash on Delivery (COD)</option>
                                  </select>
                                </div>

                                <div className="flex flex-col sm:flex-row gap-2">
                                  <div className="flex flex-col space-y-1 flex-1">
                                    <Label className="text-xs font-medium text-gray-900">
                                      {paymentMethod === "COD" ? "Advance Amount Collected" : "Amount Paid"}
                                    </Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      max={totalAmount}
                                      step="0.01"
                                      value={paymentMethod === "COD" ? advanceAmount : receivedAmount}
                                      onChange={(e) => {
                                        const val = Number.parseFloat(e.target.value) || 0
                                        if (paymentMethod === "COD") {
                                          setAdvanceAmount(val)
                                          setReceivedAmount(val)
                                          setBalanceAmount(totalAmount - val)
                                        } else {
                                          setReceivedAmount(val)
                                          setBalanceAmount(totalAmount - val)
                                        }
                                      }}
                                      className="h-8 text-xs bg-white border-gray-300 text-gray-900"
                                      placeholder="0.00"
                                    />
                                  </div>

                                  <div className="flex flex-col space-y-1 flex-1">
                                    <Label className="text-xs font-medium text-gray-900">
                                      Payment Status
                                    </Label>
                                    <select
                                      className="flex h-8 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
                                      value={paymentStatus}
                                      onChange={(e) => setPaymentStatus(e.target.value)}
                                    >
                                      <option value="Paid">Paid</option>
                                      <option value="Pending">Pending</option>
                                      <option value="Credit">Credit</option>
                                    </select>
                                  </div>
                                </div>

                                <div className="flex justify-between items-center bg-gray-50 p-2 rounded-md border border-gray-200">
                                  <span className="text-xs font-medium text-gray-700">Balance Amount:</span>
                                  <span className={`text-xs font-bold ${balanceAmount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {deviceCurrencyState} {balanceAmount.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                                <SaleShippingSection
                                  deviceId={deviceId}
                                  value={shipping}
                                  onChange={setShipping}
                                  customerAddress={customerAddress}
                                  currency={deviceCurrencyState}
                                  className="mt-2"
                                  isJobCard={originalSaleStatus === "Pending"}
                                  customerName={customerName}
                                  customerPhone={customerPhone}
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
                  
      {allocatorRowId && (() => {
        const row = products.find(p => p.id === allocatorRowId)
        if (!row) return null
        return (
          <BatchAllocator
            isOpen={true}
            onClose={() => setAllocatorRowId(null)}
            productName={row.productName}
            requiredQty={row.quantity}
            batches={row.batches || []}
            initialAllocations={row.allocations || []}
            deviceId={deviceId || 0}
            onSave={(allocations, autoAllocate) => {
              const totalAllocatedQty = allocations.reduce((sum: any, a: any) => sum + a.quantity, 0)
              let newCost = row.cost
              let newPrice = row.price
              
              if (allocations.length > 0 && totalAllocatedQty > 0) {
                const totalCost = allocations.reduce((sum: any, a: any) => sum + (a.costPrice || row.cost) * a.quantity, 0)
                newCost = totalCost / totalAllocatedQty
                
                const totalPrice = allocations.reduce((sum: any, a: any) => sum + (a.sellingPrice || row.price) * a.quantity, 0)
                newPrice = totalPrice / totalAllocatedQty
              }

              updateProductRow(row.id, { 
                allocations, 
                autoAllocate,
                cost: newCost,
                price: newPrice,
                total: newPrice * row.quantity
              })
            }}
          />
        )
      })()}
    
                    </CardContent>
                  )}
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
        onSuccess={(product) =>
          handleNewProduct(product.id, product.name, product.price, product.wholesale_price, product.stock)
        }
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
