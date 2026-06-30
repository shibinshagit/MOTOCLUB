"use client"

import type React from "react"
import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { format, subMonths, addMonths, startOfMonth, endOfMonth, isSameMonth, isAfter } from "date-fns"
import {
  Loader2,
  Plus,
  Calendar,
  Trash2,
  Save,
  Edit,
  X,
  CreditCard,
  Banknote,
  Globe,
  ChevronsUpDown,
} from "lucide-react"
import {
  getUserPurchases,
  getPurchaseDetails,
  createPurchase,
  updatePurchase,
  deletePurchase,
} from "@/app/actions/purchase-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import ViewPurchaseModal from "@/components/purchases/view-purchase-modal"
import PurchaseExcelTable from "@/components/purchases/purchase-excel-table"
import { PurchaseViewFlip, type PurchaseViewMode } from "@/components/purchases/purchase-view-flip"
import SupplierAutocomplete from "@/components/purchases/supplier-autocomplete"
import ProductSelectSimple from "@/components/sales/product-select-simple"
import NewProductModal from "@/components/sales/new-product-modal"
import { DatePickerField } from "@/components/ui/date-picker-field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { FormAlert } from "@/components/ui/form-alert"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useSelector, useDispatch } from "react-redux"
import type { AppDispatch } from "@/store/store"
import { selectDeviceId, selectDeviceCurrency } from "@/store/slices/deviceSlice"
import { markInventoryStale } from "@/lib/inventory-sync"
import { getSuppliers as getRegisteredSuppliers } from "@/app/actions/supplier-actions"
import { useConfirm } from "@/hooks/use-confirm"

interface PurchaseTabProps {
  userId: number
  mode?: "entry" | "info"
}

interface ProductRow {
  id: string
  productId: number | null
  productName: string
  quantity: number
  price: number
  total: number
  wholesalePrice?: number
  originalItemId?: number
}

interface PurchaseDraftSnapshot {
  id: string
  name: string
  updatedAt: number
  date: string
  supplier: string
  status: string
  purchaseStatus: string
  paymentMethod: string
  receivedAmount: number
  taxRate: number
  discountAmount: number
  products: ProductRow[]
  isEditMode: boolean
  editingPurchaseId: number | null
}

function getMonthRange(month: Date) {
  const normalized = startOfMonth(month)
  return {
    from: format(startOfMonth(normalized), "yyyy-MM-dd"),
    to: format(endOfMonth(normalized), "yyyy-MM-dd"),
    label: format(normalized, "MMMM yyyy"),
  }
}

function serializePurchaseRecord(purchase: any) {
  return {
    ...purchase,
    purchase_date:
      purchase.purchase_date && typeof purchase.purchase_date === "object" && purchase.purchase_date !== null
        ? purchase.purchase_date.toISOString()
        : purchase.purchase_date || "",
    created_at:
      purchase.created_at && typeof purchase.created_at === "object" && purchase.created_at !== null
        ? purchase.created_at.toISOString()
        : purchase.created_at || "",
    updated_at:
      purchase.updated_at && typeof purchase.updated_at === "object" && purchase.updated_at !== null
        ? purchase.updated_at.toISOString()
        : purchase.updated_at || "",
  }
}

function normalizePaymentStatus(status: string) {
  return status === "Partial" ? "Cancelled" : status
}

export default function PurchaseTab({ userId, mode = "entry" }: PurchaseTabProps) {
  const dispatch = useDispatch<AppDispatch>()
  const deviceId = useSelector(selectDeviceId)
  const deviceCurrency = useSelector(selectDeviceCurrency)

  const [purchases, setPurchases] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [purchasesListLoaded, setPurchasesListLoaded] = useState(false)
  const [purchasesViewMonth, setPurchasesViewMonth] = useState(() => startOfMonth(new Date()))
  const [activeView, setActiveView] = useState<PurchaseViewMode>(mode === "info" ? "info" : "entry")

  const [isEditMode, setIsEditMode] = useState(false)
  const [editingPurchaseId, setEditingPurchaseId] = useState<number | null>(null)

  const [date, setDate] = useState<Date>(new Date())
  const [supplier, setSupplier] = useState("")
  const [status, setStatus] = useState<string>("Credit")
  const [purchaseStatus, setPurchaseStatus] = useState<string>("Delivered")
  const [paymentMethod, setPaymentMethod] = useState<string>("Cash")
  const [receivedAmount, setReceivedAmount] = useState(0)
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

  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false)
  const [activeProductRowId, setActiveProductRowId] = useState<string | null>(null)
  const [isViewPurchaseModalOpen, setIsViewPurchaseModalOpen] = useState(false)
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | null>(null)

  const [purchaseDrafts, setPurchaseDrafts] = useState<PurchaseDraftSnapshot[]>([])
  const [activeDraftId, setActiveDraftId] = useState("")
  const [draftsHydrated, setDraftsHydrated] = useState(false)
  const [pendingEditPurchaseId, setPendingEditPurchaseId] = useState<number | null>(null)
  const [pendingEditDraftId, setPendingEditDraftId] = useState("")

  const activeDeviceIdRef = useRef<number | null>(null)
  const purchasesFetchRequestRef = useRef(0)
  const editLoadRequestRef = useRef(0)
  const draftSwitchingRef = useRef(false)
  const lastClosedEditPurchaseIdRef = useRef<number | null>(null)

  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const currency = deviceCurrency || "AED"

  useEffect(() => {
    setActiveView(mode === "info" ? "info" : "entry")
  }, [mode])

  const switchView = useCallback(
    (view: PurchaseViewMode) => {
      setActiveView(view)
      const params = new URLSearchParams(searchParams.toString())
      params.set("tab", "purchase")
      params.set("purchaseView", view === "info" ? "list" : "entry")
      const nextQuery = params.toString()
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname)
    },
    [pathname, router, searchParams],
  )

  const createEmptyProductRow = useCallback(
    (): ProductRow => ({
      id: crypto.randomUUID(),
      productId: null,
      productName: "",
      quantity: 1,
      price: 0,
      total: 0,
      wholesalePrice: 0,
    }),
    [],
  )

  const createEmptyDraft = useCallback(
    (label?: string): PurchaseDraftSnapshot => ({
      id: crypto.randomUUID(),
      name: label || "New Purchase",
      updatedAt: Date.now(),
      date: new Date().toISOString(),
      supplier: "",
      status: "Credit",
      purchaseStatus: "Delivered",
      paymentMethod: "Cash",
      receivedAmount: 0,
      taxRate: 0,
      discountAmount: 0,
      products: [createEmptyProductRow()],
      isEditMode: false,
      editingPurchaseId: null,
    }),
    [createEmptyProductRow],
  )

  const purchaseDraftStorageKey = useMemo(() => {
    return `purchase_entry_drafts_${deviceId || userId || "default"}`
  }, [deviceId, userId])

  useEffect(() => {
    if (deviceId && deviceId !== activeDeviceIdRef.current) {
      activeDeviceIdRef.current = deviceId
      setPurchasesListLoaded(false)
      setPurchases([])
    }
  }, [deviceId])

  useEffect(() => {
    if (activeView !== "entry") return
    try {
      const rawDrafts = localStorage.getItem(purchaseDraftStorageKey)
      const rawActiveId = localStorage.getItem(`${purchaseDraftStorageKey}_active`)
      if (rawDrafts) {
        const parsed = JSON.parse(rawDrafts) as PurchaseDraftSnapshot[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPurchaseDrafts(parsed)
          const validActiveId = parsed.some((d) => d.id === rawActiveId) ? String(rawActiveId) : parsed[0].id
          setActiveDraftId(validActiveId)
          setDraftsHydrated(true)
      return
        }
      }
    } catch (loadError) {
      console.error("Failed to restore purchase drafts:", loadError)
    }

    const initialDraft = createEmptyDraft("Draft 1")
    setPurchaseDrafts([initialDraft])
    setActiveDraftId(initialDraft.id)
    setDraftsHydrated(true)
  }, [activeView, purchaseDraftStorageKey, createEmptyDraft])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated) return
    const activeDraft = purchaseDrafts.find((d) => d.id === activeDraftId)
    if (!activeDraft) return

    draftSwitchingRef.current = true
    setDate(new Date(activeDraft.date || new Date().toISOString()))
    setSupplier(activeDraft.supplier || "")
    setStatus(activeDraft.status || "Credit")
    setPurchaseStatus(activeDraft.purchaseStatus || "Delivered")
    setPaymentMethod(activeDraft.paymentMethod || "Cash")
    setReceivedAmount(Number(activeDraft.receivedAmount) || 0)
    setTaxRate(Number(activeDraft.taxRate) || 0)
    setDiscountAmount(Number(activeDraft.discountAmount) || 0)
    setProducts(
      Array.isArray(activeDraft.products) && activeDraft.products.length > 0
        ? activeDraft.products
        : [createEmptyProductRow()],
    )
    setIsEditMode(Boolean(activeDraft.isEditMode))
    setEditingPurchaseId(activeDraft.editingPurchaseId || null)
    setFormAlert(null)

    setTimeout(() => {
      draftSwitchingRef.current = false
    }, 0)
  }, [activeView, draftsHydrated, activeDraftId, purchaseDrafts, createEmptyProductRow])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated || !activeDraftId) return
    if (draftSwitchingRef.current) return

    const computedName = isEditMode
      ? `Edit #${editingPurchaseId || ""}`.trim()
      : supplier?.trim()
        ? supplier.trim()
        : "New Purchase"

    setPurchaseDrafts((prev) =>
      prev.map((draft) =>
        draft.id === activeDraftId
          ? {
              ...draft,
              name: computedName,
              updatedAt: Date.now(),
              date: date?.toISOString() || new Date().toISOString(),
              supplier,
              status,
              purchaseStatus,
              paymentMethod,
              receivedAmount,
              taxRate,
              discountAmount,
              products,
              isEditMode,
              editingPurchaseId,
            }
          : draft,
      ),
    )
  }, [
    activeView,
    draftsHydrated,
    activeDraftId,
    date,
    supplier,
    status,
    purchaseStatus,
    paymentMethod,
    receivedAmount,
    taxRate,
    discountAmount,
    products,
    isEditMode,
    editingPurchaseId,
  ])

  useEffect(() => {
    if (activeView !== "entry" || !draftsHydrated) return
    localStorage.setItem(purchaseDraftStorageKey, JSON.stringify(purchaseDrafts))
    localStorage.setItem(`${purchaseDraftStorageKey}_active`, activeDraftId)
  }, [activeView, draftsHydrated, purchaseDrafts, activeDraftId, purchaseDraftStorageKey])

  useEffect(() => {
    const newSubtotal = products.reduce((sum, product) => sum + (Number(product.total) || 0), 0)
    setSubtotal(newSubtotal)
    const newTaxAmount = newSubtotal * (taxRate / 100)
    setTaxAmount(newTaxAmount)
    const finalTotal = Math.max(0, Number(newSubtotal) + Number(newTaxAmount) - Number(discountAmount))
    setTotalAmount(finalTotal)

    if (status === "Paid") {
      setReceivedAmount(finalTotal)
    } else if (status === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [products, taxRate, discountAmount, status])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "AED",
      minimumFractionDigits: 2,
    }).format(amount)
  }

  const applyPurchasesMonth = useCallback((month: Date) => {
    setPurchasesViewMonth(startOfMonth(month))
  }, [])

  const fetchPurchasesForMonth = useCallback(
    async (month: Date) => {
      if (!deviceId) {
        setError("Device ID not found")
      return
    }

      const requestId = ++purchasesFetchRequestRef.current
      const { from, to } = getMonthRange(month)

      setIsLoading(true)
      setError(null)

      try {
        const result = await getUserPurchases(deviceId, { dateFrom: from, dateTo: to })
        if (requestId !== purchasesFetchRequestRef.current) return

        if (result.success) {
          setPurchases(result.data.map(serializePurchaseRecord))
      } else {
          setPurchases([])
          setError(result.message || "Failed to load purchases")
        }
      } catch (fetchError) {
        console.error("Fetch purchases error:", fetchError)
        if (requestId !== purchasesFetchRequestRef.current) return
        setPurchases([])
        setError("An error occurred while loading purchases")
      } finally {
        if (requestId === purchasesFetchRequestRef.current) {
          setIsLoading(false)
          setPurchasesListLoaded(true)
        }
      }
    },
    [deviceId],
  )

  useEffect(() => {
    if (activeView !== "info" || !deviceId) return
    setPurchasesListLoaded(false)
    fetchPurchasesForMonth(purchasesViewMonth)
  }, [activeView, deviceId, purchasesViewMonth, fetchPurchasesForMonth])

  const addProductRow = () => {
    setProducts([...products, createEmptyProductRow()])
  }

  const removeProductRow = (id: string) => {
    if (products.length > 1) {
      setProducts(products.filter((product) => product.id !== id))
    }
  }

  const updateProductRow = (id: string, updates: Partial<ProductRow>) => {
    setProducts(
      products.map((product) => {
        if (product.id === id) {
          const updatedProduct = { ...product, ...updates }
          if (updates.quantity !== undefined || updates.price !== undefined) {
            const quantity = Number(updatedProduct.quantity) || 0
            const price = Number(updatedProduct.price) || 0
            updatedProduct.total = quantity * price
          }
          return updatedProduct
        }
        return product
      }),
    )
  }

  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
  ) => {
    const priceToUse = wholesalePrice || price
    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse,
      wholesalePrice,
      total: (products.find((p) => p.id === id)?.quantity || 1) * priceToUse,
    })

    const hasEmptyRow = products.some((p) => p.productId === null)
    if (!hasEmptyRow) {
      addProductRow()
    }
  }

  const handleAddNewFromRow = (rowId: string) => {
    setActiveProductRowId(rowId)
    setIsNewProductModalOpen(true)
  }

  const handleNewProduct = (product: any) => {
    const productId = typeof product.id === "string" ? Number.parseInt(product.id, 10) : product.id
    const targetRowId =
      activeProductRowId || products.find((p) => !p.productId)?.id || products[products.length - 1]?.id
    const priceToUse = product.wholesale_price || product.price

    setIsNewProductModalOpen(false)
    setActiveProductRowId(null)

    if (targetRowId) {
      updateProductRow(targetRowId, {
        productId,
        productName: product.name,
        price: priceToUse,
        wholesalePrice: product.wholesale_price,
        total: (products.find((p) => p.id === targetRowId)?.quantity || 1) * priceToUse,
      })
    }

    notifySuccess(toast, `Product "${product.name}" added successfully`)
  }

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus)
  }

  const resetAddPurchaseForm = () => {
    editLoadRequestRef.current += 1
    const resetDate = new Date()
    const resetProducts = [createEmptyProductRow()]
    setDate(resetDate)
    setSupplier("")
    setStatus("Credit")
    setPurchaseStatus("Delivered")
    setPaymentMethod("Cash")
    setProducts(resetProducts)
    setTaxRate(0)
    setDiscountAmount(0)
    setReceivedAmount(0)
    setFormAlert(null)
    setIsEditMode(false)
    setEditingPurchaseId(null)
    setPendingEditPurchaseId(null)
    setPendingEditDraftId("")

    if (activeView === "entry" && activeDraftId) {
      setPurchaseDrafts((prev) =>
        prev.map((draft) =>
          draft.id === activeDraftId
            ? {
                ...draft,
                name: "New Purchase",
                updatedAt: Date.now(),
                date: resetDate.toISOString(),
                supplier: "",
                status: "Credit",
                purchaseStatus: "Delivered",
                paymentMethod: "Cash",
                receivedAmount: 0,
                taxRate: 0,
                discountAmount: 0,
                products: resetProducts,
                isEditMode: false,
                editingPurchaseId: null,
              }
            : draft,
        ),
      )
    }
  }

  const loadPurchaseForEdit = async (purchaseId: number) => {
    const requestId = ++editLoadRequestRef.current
    try {
      setFormAlert(null)
      const result = await getPurchaseDetails(purchaseId)
      if (requestId !== editLoadRequestRef.current) return

      if (result.success && result.data) {
        const { purchase, items } = result.data

        setDate(new Date(purchase.purchase_date))
        setSupplier(purchase.supplier || "")

        const normalizedStatus = purchase.status === "Partial" ? "Cancelled" : purchase.status || "Credit"
        setStatus(normalizedStatus)
        setPurchaseStatus(purchase.purchase_status || "Delivered")
        setPaymentMethod(purchase.payment_method || "Cash")
        setReceivedAmount(Number(purchase.received_amount) || 0)

        const calculatedSubtotal = items.reduce(
          (sum: number, item: any) => sum + item.quantity * item.price,
          0,
        )

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

        setProducts(productRows.length > 0 ? productRows : [createEmptyProductRow()])
        setIsEditMode(true)
        setEditingPurchaseId(purchaseId)

        setFormAlert({
          type: "success",
          message: `Loaded purchase #${purchaseId} for editing`,
        })
      } else {
        if (requestId !== editLoadRequestRef.current) return
        setFormAlert({
          type: "error",
          message: result.message || "Failed to load purchase details",
        })
      }
    } catch (loadError) {
      if (requestId !== editLoadRequestRef.current) return
      console.error("Error loading purchase for edit:", loadError)
      setFormAlert({
        type: "error",
        message: "An error occurred while loading purchase details",
      })
    }
  }

  const handleSubmitPurchase = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormAlert(null)

    if (!deviceId) {
      setFormAlert({ type: "error", message: "Device ID not found. Please refresh the page." })
      return
    }

    if (!supplier.trim()) {
      setFormAlert({ type: "error", message: "Please select a supplier" })
      return
    }

    const supplierResult = await getRegisteredSuppliers(userId)
    const registeredNames =
      supplierResult.success && Array.isArray(supplierResult.data)
        ? supplierResult.data.map((item: any) => String(item.name).trim())
        : []

    if (!registeredNames.includes(supplier.trim())) {
      setFormAlert({
        type: "error",
        message: "Please select a registered supplier or add one from the Suppliers tab",
      })
      return
    }

    const validProducts = products.filter((p) => p.productId !== null)
    if (validProducts.length === 0 || !validProducts.every((p) => p.quantity > 0)) {
      setFormAlert({
        type: "error",
        message: "Please select products and ensure quantities are greater than zero",
      })
      return
    }

    if (status === "Paid" && !paymentMethod) {
      setFormAlert({ type: "error", message: "Please select a payment method" })
        return
      }

    if (receivedAmount > totalAmount) {
      setFormAlert({ type: "error", message: "Received amount cannot be greater than total amount" })
      return
    }

    setIsSubmitting(true)

    try {
      let finalReceivedAmount = receivedAmount
      if (status === "Paid") {
        finalReceivedAmount = totalAmount
      } else if (status === "Cancelled") {
        finalReceivedAmount = 0
      }

      const formData = new FormData()
      if (isEditMode && editingPurchaseId) {
        formData.append("id", editingPurchaseId.toString())
      }
      formData.append("supplier", supplier.trim())
      formData.append("purchase_date", date.toISOString())
      formData.append("total_amount", totalAmount.toString())
      formData.append("status", status)
      formData.append("purchase_status", purchaseStatus)
      formData.append("payment_method", paymentMethod)
      formData.append("user_id", userId.toString())
      formData.append("device_id", deviceId.toString())
      formData.append("received_amount", finalReceivedAmount.toString())

      const items = validProducts.map((p) => ({
        ...(p.originalItemId ? { id: p.originalItemId } : {}),
        product_id: p.productId,
        quantity: p.quantity,
        price: p.price,
      }))
      formData.append("items", JSON.stringify(items))

      const result =
        isEditMode && editingPurchaseId ? await updatePurchase(formData) : await createPurchase(formData)

      if (result.success) {
        markInventoryStale(dispatch)
        notifySuccess(toast, isEditMode ? "Purchase updated successfully" : "Purchase added successfully")
        setFormAlert({
          type: "success",
          message: isEditMode ? "Purchase updated successfully" : "Purchase completed successfully",
        })
        setTimeout(() => {
          finalizeDraftAfterSave()
        }, 1500)
      } else {
        setFormAlert({
          type: "error",
          message: result.message || `Failed to ${isEditMode ? "update" : "complete"} the purchase`,
        })
      }
    } catch (submitError) {
      console.error("Purchase submission error:", submitError)
      setFormAlert({ type: "error", message: "An unexpected error occurred" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleViewPurchase = (purchase: any) => {
    setSelectedPurchaseId(purchase.id)
    setIsViewPurchaseModalOpen(true)
  }

  const handleEditPurchase = (purchase: any) => {
    lastClosedEditPurchaseIdRef.current = null
    if (activeView === "info") {
      switchView("entry")
    }

    const existingDraft = purchaseDrafts.find(
      (draft) => draft.isEditMode && draft.editingPurchaseId === purchase.id,
    )
    if (existingDraft) {
      draftSwitchingRef.current = true
      setActiveDraftId(existingDraft.id)
      setPendingEditPurchaseId(purchase.id)
      setPendingEditDraftId(existingDraft.id)
      return
    }

    const newEditDraft = createEmptyDraft(`Edit #${purchase.id}`)
    newEditDraft.isEditMode = true
    newEditDraft.editingPurchaseId = purchase.id
    draftSwitchingRef.current = true
    setPurchaseDrafts((prev) => [...prev, newEditDraft])
    setActiveDraftId(newEditDraft.id)
    setPendingEditPurchaseId(purchase.id)
    setPendingEditDraftId(newEditDraft.id)
  }

  useEffect(() => {
    if (!pendingEditPurchaseId || !pendingEditDraftId) return
    if (activeDraftId !== pendingEditDraftId) return
    loadPurchaseForEdit(pendingEditPurchaseId)
    setPendingEditPurchaseId(null)
    setPendingEditDraftId("")
  }, [activeDraftId, pendingEditPurchaseId, pendingEditDraftId])

  const handleDeletePurchaseFromView = async (purchaseId: number) => {
    if (!deviceId) {
      notifyError(toast, "Device ID not found")
      return
    }

    try {
      const result = await deletePurchase(purchaseId, deviceId)

      if (result.success) {
        markInventoryStale(dispatch)
        setPurchases((prev) => prev.filter((p) => p.id !== purchaseId))
        notifySuccess(toast, "Purchase deleted successfully")
        if (activeView === "info") {
          fetchPurchasesForMonth(purchasesViewMonth)
        }
      } else {
        notifyError(toast, result.message || "Failed to delete purchase")
      }
    } catch (deleteError) {
      console.error("Delete purchase error:", deleteError)
      notifyError(toast, "An unexpected error occurred")
    }
  }

  const getPaymentMethodDisplay = (purchase: any) => {
    const paymentStatus = normalizePaymentStatus(purchase.status || "")
    if (paymentStatus === "Credit" || paymentStatus === "Cancelled") return "—"
    return purchase.payment_method || "Cash"
  }

  const getRemainingAmount = (purchase: any) => {
    const paymentStatus = normalizePaymentStatus(purchase.status || "")
    if (paymentStatus === "Cancelled" || paymentStatus === "Paid") return 0
    const total = Number(purchase.total_amount) || 0
    const received = Number(purchase.received_amount) || 0
    return Math.max(0, total - received)
  }

  const getPaidAmount = (purchase: any) => {
    const paymentStatus = normalizePaymentStatus(purchase.status || "")
    if (paymentStatus === "Cancelled") return 0
    if (paymentStatus === "Paid") return Number(purchase.total_amount) || 0
    return Number(purchase.received_amount) || 0
  }

  const handleCreateDraftTab = () => {
    if (activeView !== "entry") return
    const draftIndex = purchaseDrafts.length + 1
    const newDraft = createEmptyDraft(`Draft ${draftIndex}`)
    draftSwitchingRef.current = true
    setPurchaseDrafts((prev) => [...prev, newDraft])
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
      const shouldClose = await confirm("Are you sure to close this purchase tab?")
      if (!shouldClose) return
    }

    const removingDraft = purchaseDrafts.find((draft) => draft.id === draftId)
    if (
      removingDraft?.isEditMode ||
      (editingPurchaseId && removingDraft?.editingPurchaseId === editingPurchaseId)
    ) {
      lastClosedEditPurchaseIdRef.current =
        Number(removingDraft?.editingPurchaseId || editingPurchaseId || 0) || null
      setIsEditMode(false)
      setEditingPurchaseId(null)
      setPendingEditPurchaseId(null)
      setPendingEditDraftId("")
    }

    setPurchaseDrafts((prev) => {
      const targetIndex = prev.findIndex((draft) => draft.id === draftId)
      if (targetIndex === -1) return prev

      if (prev.length === 1) {
        const replacement = createEmptyDraft("Draft 1")
        draftSwitchingRef.current = true
        setActiveDraftId(replacement.id)
        setIsEditMode(false)
        setEditingPurchaseId(null)
        setPendingEditPurchaseId(null)
        setPendingEditDraftId("")
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
    if (activeView === "entry" && activeDraftId) {
      void handleRemoveDraftTab(activeDraftId, false)
    } else {
      resetAddPurchaseForm()
    }
    if (deviceId) {
      fetchPurchasesForMonth(purchasesViewMonth)
    }
  }

  const periodLabel = getMonthRange(purchasesViewMonth).label
  const isCurrentMonth = isSameMonth(purchasesViewMonth, new Date())
  const canGoNextMonth = !isCurrentMonth

  const goToPreviousMonth = () => applyPurchasesMonth(subMonths(purchasesViewMonth, 1))
  const goToNextMonth = () => {
    const nextMonth = startOfMonth(addMonths(purchasesViewMonth, 1))
    if (isAfter(nextMonth, startOfMonth(new Date()))) return
    applyPurchasesMonth(nextMonth)
  }
  const goToCurrentMonth = () => applyPurchasesMonth(startOfMonth(new Date()))

  const purchasesListView = (
    <PurchaseExcelTable
      key={periodLabel}
      purchases={purchases}
      periodLabel={periodLabel}
      isCurrentMonth={isCurrentMonth}
      canGoNextMonth={canGoNextMonth}
      onPreviousMonth={goToPreviousMonth}
      onNextMonth={goToNextMonth}
      onCurrentMonth={goToCurrentMonth}
      isLoading={isLoading}
      error={error}
      hasLoadedPurchases={purchasesListLoaded}
      formatCurrency={formatCurrency}
      getPaymentMethodDisplay={getPaymentMethodDisplay}
      getRemainingAmount={getRemainingAmount}
      getPaidAmount={getPaidAmount}
      onViewPurchase={handleViewPurchase}
      onEditPurchase={handleEditPurchase}
    />
  )

  const renderProductRowDesktop = (product: ProductRow, index: number) => (
    <div
      key={product.id}
      className={`grid grid-cols-12 gap-1 p-2 items-center border-b border-gray-200 ${
        index % 2 === 0 ? "bg-white" : "bg-gray-50"
      } hover:bg-gray-100 transition-colors duration-150`}
    >
      <div className="col-span-5">
        {product.productId && product.productName ? (
          <div className="flex items-center justify-between">
            <span className="truncate flex-1 font-medium text-xs text-gray-900">{product.productName}</span>
                <Button
              variant="ghost"
                  size="sm"
              className="h-6 w-6 p-0 text-gray-400 hover:text-blue-500"
              onClick={() =>
                updateProductRow(product.id, {
                  productId: null,
                  productName: "",
                  price: 0,
                  total: 0,
                  wholesalePrice: 0,
                })
              }
            >
              <ChevronsUpDown className="h-3 w-3" />
                </Button>
          </div>
        ) : (
          <ProductSelectSimple
            id={`product-select-${product.id}`}
            value={product.productId}
            onChange={(productId, productName, price, wholesalePrice) =>
              handleProductSelect(product.id, productId, productName, price, wholesalePrice)
            }
            onAddNew={() => handleAddNewFromRow(product.id)}
            userId={userId}
            usePriceType="wholesale"
            allowServices={false}
          />
        )}
              </div>
      <div className="col-span-2">
        <Input
          type="number"
          min="1"
          value={product.quantity}
          onChange={(e) =>
            updateProductRow(product.id, { quantity: Number.parseInt(e.target.value, 10) || 1 })
          }
          className="text-center h-7 text-xs bg-white border-gray-300 text-gray-900"
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
          className="text-center h-7 text-xs bg-white border-gray-300 text-gray-900"
                    />
                  </div>
      <div className="col-span-2 flex items-center justify-center font-medium text-xs text-gray-900">
        {currency} {product.total.toFixed(2)}
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
  )

  const renderProductRowMobile = (product: ProductRow, index: number) => (
    <div
      key={product.id}
      className={`p-3 border-b border-gray-200 ${index % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
    >
      <div className="mb-3">
        <Label className="text-xs font-medium text-gray-700 mb-1 block">Product</Label>
        {product.productId && product.productName ? (
          <div className="flex items-center justify-between p-2 bg-gray-100 rounded">
            <span className="text-sm font-medium text-gray-900">{product.productName}</span>
                <Button
              variant="ghost"
                  size="sm"
              className="h-6 w-6 p-0"
              onClick={() =>
                updateProductRow(product.id, {
                  productId: null,
                  productName: "",
                  price: 0,
                  total: 0,
                  wholesalePrice: 0,
                })
              }
            >
              <ChevronsUpDown className="h-3 w-3" />
                </Button>
          </div>
        ) : (
          <ProductSelectSimple
            id={`product-select-mobile-${product.id}`}
            value={product.productId}
            onChange={(productId, productName, price, wholesalePrice) =>
              handleProductSelect(product.id, productId, productName, price, wholesalePrice)
            }
            onAddNew={() => handleAddNewFromRow(product.id)}
            userId={userId}
            usePriceType="wholesale"
            allowServices={false}
          />
        )}
              </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1 block">Qty</Label>
          <Input
            type="number"
            min="1"
            value={product.quantity}
            onChange={(e) =>
              updateProductRow(product.id, { quantity: Number.parseInt(e.target.value, 10) || 1 })
            }
            className="text-center h-8 text-sm"
          />
                </div>
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1 block">Price</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={product.price}
            onChange={(e) =>
              updateProductRow(product.id, { price: Number.parseFloat(e.target.value) || 0 })
            }
            className="text-center h-8 text-sm"
          />
              </div>
            </div>
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-900">
          Total: {currency} {product.total.toFixed(2)}
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
  )

  const purchasesEntryView = (
    <div className="min-h-[calc(100vh-100px)] bg-gray-50 text-gray-900 p-2 sm:p-3">
      <div className="mb-4">
        <div className="mt-4">
          {activeView === "entry" && (
            <div className="mb-2 rounded-lg border border-gray-200 bg-white p-2">
              <div className="flex items-center gap-2 overflow-x-auto">
                {purchaseDrafts.map((draft, index) => (
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
                      aria-label={`Remove ${draft.name?.trim() ? draft.name : `Draft ${index + 1}`}`}
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

          <div className="flex flex-col xl:flex-row gap-3 h-full">
            <div className="flex-1 xl:w-[70%] flex flex-col min-h-0">
              <Card className="flex-1 overflow-hidden bg-white border-gray-200 shadow-sm flex flex-col">
                <CardContent className="p-0 h-full flex flex-col">
                  <div className="flex-shrink-0">
                    {isEditMode && (
                      <div className="p-2 bg-orange-50 border-b border-orange-200">
                    <div className="flex items-center gap-2">
                          <Edit className="h-4 w-4 text-orange-600" />
                          <span className="text-sm font-medium text-orange-800">
                            Editing Purchase #{editingPurchaseId}
                          </span>
                    </div>
                    </div>
                    )}
                    {formAlert && (
                      <div className="p-2 border-b border-gray-200 bg-gray-50" role="status" aria-live="polite">
                        <FormAlert type={formAlert.type} message={formAlert.message} />
                    </div>
                    )}
                    </div>

                  <div className="flex items-center justify-between p-2 bg-gray-50 border-b border-gray-200 flex-shrink-0">
                    <h3 className="font-medium text-sm text-gray-800">Products</h3>
                    <div className="flex flex-wrap gap-1">
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

                  <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0">
                    <div className="hidden lg:block sticky top-0 z-10 min-w-[640px]">
                      <div className="grid grid-cols-12 gap-1 p-2 bg-gray-100 font-medium text-xs text-gray-700 border-b border-gray-200">
                        <div className="col-span-5">Product</div>
                        <div className="col-span-2 text-center">Qty</div>
                        <div className="col-span-2 text-center">Price</div>
                        <div className="col-span-2 text-center">Total</div>
                        <div className="col-span-1"></div>
                  </div>
              </div>
                    <div className="hidden lg:block min-w-[640px]">
                      {products.map(renderProductRowDesktop)}
            </div>
                    <div className="lg:hidden">{products.map(renderProductRowMobile)}</div>
            </div>
        </CardContent>
      </Card>
      </div>

            <div className="w-full xl:w-[30%] flex flex-col min-h-0">
              <Card className="flex-1 overflow-hidden bg-white border-gray-200 shadow-sm flex flex-col">
                <CardContent className="p-0 h-full flex flex-col">
                  <div className="p-3 border-b border-gray-200 overflow-y-auto flex-1">
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-900">Supplier *</Label>
                        <p className="text-[11px] text-gray-500">Choose from your registered suppliers</p>
                        <SupplierAutocomplete
                          value={supplier}
                          onChange={setSupplier}
                          userId={userId}
                          placeholder="Select supplier"
                          className="h-8 text-xs"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium flex items-center text-gray-900">
                          <Calendar className="h-3 w-3 mr-1 text-blue-500" />
                          Date
                        </Label>
                        <DatePickerField date={date} onDateChange={(d) => d && setDate(d)} />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-900">Payment Status</Label>
                        <Select value={status} onValueChange={handleStatusChange}>
                          <SelectTrigger className="h-8 text-xs bg-white border-gray-300 text-gray-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-gray-200">
                            <SelectItem value="Credit">Credit</SelectItem>
                            <SelectItem value="Paid">Paid</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                          </SelectContent>
                        </Select>
              </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-gray-900">Purchase Status</Label>
                        <Select value={purchaseStatus} onValueChange={setPurchaseStatus}>
                          <SelectTrigger className="h-8 text-xs bg-white border-gray-300 text-gray-900">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-white border-gray-200">
                            <SelectItem value="Delivered">Delivered</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Ordered">Ordered</SelectItem>
                          </SelectContent>
                        </Select>
                </div>

                      {status === "Paid" && (
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
                              <RadioGroupItem value="Cash" id="purchase-cash" className="h-3 w-3" />
                              <Label htmlFor="purchase-cash" className="cursor-pointer text-xs text-gray-900">
                                <Banknote className="h-3 w-3 inline mr-1" />
                                Cash
                              </Label>
                </div>
                            <div className="flex items-center space-x-1 bg-gray-50 p-1 rounded-md border border-gray-200">
                              <RadioGroupItem value="Card" id="purchase-card" className="h-3 w-3" />
                              <Label htmlFor="purchase-card" className="cursor-pointer text-xs text-gray-900">
                                <CreditCard className="h-3 w-3 inline mr-1" />
                                Card
                              </Label>
              </div>
                            <div className="flex items-center space-x-1 bg-gray-50 p-1 rounded-md border border-gray-200">
                              <RadioGroupItem value="Online" id="purchase-online" className="h-3 w-3" />
                              <Label htmlFor="purchase-online" className="cursor-pointer text-xs text-gray-900">
                                <Globe className="h-3 w-3 inline mr-1" />
                                Online
                              </Label>
            </div>
                          </RadioGroup>
        </div>
      )}

                      {status === "Credit" && (
                        <div className="space-y-1">
                          <Label htmlFor="received_amount" className="text-xs font-medium text-gray-900">
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
                            Remaining: {currency} {(totalAmount - receivedAmount).toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
              </div>

                  <div className="p-3 flex flex-col border-t border-gray-200 bg-gray-50">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col">
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between items-center py-1">
                          <span className="font-medium text-xs text-gray-900">Subtotal:</span>
                          <span className="text-sm text-gray-900">
                            {currency} {subtotal.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="font-medium text-xs text-gray-900">Tax (%):</span>
                  <Input
                    type="number"
                    min="0"
                            max="100"
                    step="0.01"
                            value={taxRate}
                            onChange={(e) => setTaxRate(Number.parseFloat(e.target.value) || 0)}
                            className="w-16 h-7 text-xs text-center bg-white border-gray-300 text-gray-900"
                  />
                </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="font-medium text-xs text-gray-900">Tax Amount:</span>
                          <span className="text-sm text-gray-900">
                            {currency} {taxAmount.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-t border-gray-200">
                          <span className="font-medium text-xs text-gray-900">Discount:</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                            value={discountAmount}
                            onChange={(e) => setDiscountAmount(Number.parseFloat(e.target.value) || 0)}
                            className="w-20 h-7 text-xs text-right bg-white border-gray-300 text-gray-900"
                          />
                        </div>
                        <div className="flex justify-between items-center py-2 border-t border-gray-200 bg-green-50 p-2 rounded-md">
                          <span className="font-bold text-green-700 text-sm">Total:</span>
                          <div className="font-bold text-green-700 text-lg">
                            {currency} {totalAmount.toFixed(2)}
                          </div>
                        </div>
                      </div>
                </div>

                    <div className="mt-3">
                      <Button
                        onClick={handleSubmitPurchase}
                        disabled={isSubmitting}
                        className="w-full bg-green-600 hover:bg-green-700 text-white h-auto py-2"
                      >
                        {isSubmitting ? (
                          <span className="flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Processing...
                          </span>
                        ) : (
                          <span className="flex items-center justify-center">
                            <Save className="h-4 w-4 mr-2" />
                            {isEditMode ? "Update Purchase" : "Complete Purchase"}
                          </span>
                        )}
                  </Button>
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
      <PurchaseViewFlip
        activeView={activeView}
        listView={purchasesListView}
        entryView={purchasesEntryView}
      />

      <ViewPurchaseModal
        isOpen={isViewPurchaseModalOpen}
        onClose={() => {
          setIsViewPurchaseModalOpen(false)
          setSelectedPurchaseId(null)
        }}
        purchaseId={selectedPurchaseId}
        currency={currency}
        onEdit={(purchaseData) => {
          setIsViewPurchaseModalOpen(false)
          handleEditPurchase({ id: purchaseData.id })
        }}
        onDelete={handleDeletePurchaseFromView}
      />

      <NewProductModal
        isOpen={isNewProductModalOpen}
        onClose={() => {
          setIsNewProductModalOpen(false)
          setActiveProductRowId(null)
        }}
        onSuccess={handleNewProduct}
        userId={userId}
      />

      {ConfirmDialog}
    </div>
  )
}
