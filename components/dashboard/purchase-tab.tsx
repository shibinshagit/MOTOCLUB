"use client"

import React from "react"
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
  variant_id?: number | null
  batch_id?: number | null
  batch_number?: string | null
  expiry_date?: string | null
  mfg_date?: string | null
  selling_price?: number | null
  hasVariants?: boolean
  isBatchManaged?: boolean
  variants?: any[]
  msp?: number | null
  mrp?: number | null
  shelf?: string | null
  barcode?: string | null
  sku?: string | null
  stock?: number | null
  variantEntries?: PurchaseVariantEntry[]
  taxPercentage: number
  taxAmount: number
  lineTotal: number
}

interface PurchaseVariantEntry {
  id: number
  name: string
  quantity: number
  price: number
  msp: number | null
  mrp: number | null
  sku?: string | null
  barcode?: string | null
  shelf?: string | null
  stock?: number
  taxPercentage: number
  total: number
  taxAmount: number
  lineTotal: number
}

type TaxablePurchaseLine = Pick<PurchaseVariantEntry, "quantity" | "price" | "taxPercentage">

/** The single source of truth for product and variant purchase-line amounts. */
function calculatePurchaseLine({ quantity, price, taxPercentage }: TaxablePurchaseLine) {
  const baseAmount = (Number(quantity) || 0) * (Number(price) || 0)
  const taxAmount = baseAmount * ((Number(taxPercentage) || 0) / 100)

  return { total: baseAmount, taxAmount, lineTotal: baseAmount + taxAmount }
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
  const [purchaseSearch, setPurchaseSearch] = useState("")
  const [debouncedPurchaseSearch, setDebouncedPurchaseSearch] = useState("")
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
      taxPercentage: 0,
      taxAmount: 0,
      lineTotal: 0,
    },
  ])
  const [subtotal, setSubtotal] = useState(0)
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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedPurchaseSearch(purchaseSearch), 400)
    return () => window.clearTimeout(timer)
  }, [purchaseSearch])

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
      selling_price: 0,
      taxPercentage: 0,
      taxAmount: 0,
      lineTotal: 0,
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
    const lineTaxTotal = products.reduce((sum, product) => sum + (Number(product.taxAmount) || 0), 0)
    const finalTotal = Math.max(0, Number(newSubtotal) + lineTaxTotal - Number(discountAmount))
    setTotalAmount(finalTotal)

    if (status === "Paid") {
      setReceivedAmount(finalTotal)
    } else if (status === "Cancelled") {
      setReceivedAmount(0)
    }
  }, [products, discountAmount, status])

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
    async (month: Date, searchTerm = "") => {
      if (!deviceId) {
        setError("Device ID not found")
      return
    }

      const requestId = ++purchasesFetchRequestRef.current
      const { from, to } = getMonthRange(month)

      setIsLoading(true)
      setError(null)

      try {
        const result = await getUserPurchases(deviceId, { dateFrom: from, dateTo: to, searchTerm })
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
    fetchPurchasesForMonth(purchasesViewMonth, debouncedPurchaseSearch)
  }, [activeView, deviceId, purchasesViewMonth, debouncedPurchaseSearch, fetchPurchasesForMonth])

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
          Object.assign(updatedProduct, calculatePurchaseLine(updatedProduct))
          if ((updatedProduct.variantEntries?.length || 0) > 1) {
            updatedProduct.total = updatedProduct.variantEntries!.reduce((sum, entry) => sum + entry.total, 0)
            updatedProduct.taxAmount = updatedProduct.variantEntries!.reduce((sum, entry) => sum + entry.taxAmount, 0)
            updatedProduct.lineTotal = updatedProduct.total + updatedProduct.taxAmount
          }
          return updatedProduct
        }
        return product
      }),
    )
  }

  const updateVariantEntry = (rowId: string, variantId: number, updates: Partial<PurchaseVariantEntry>) => {
    setProducts(current => current.map(row => {
      if (row.id !== rowId) return row
      const variantEntries = (row.variantEntries || []).map(entry => {
        if (entry.id === variantId) {
          const updatedEntry = { ...entry, ...updates }
          Object.assign(updatedEntry, calculatePurchaseLine(updatedEntry))
          return updatedEntry
        }
        return entry
      })
      return {
        ...row,
        variantEntries,
        total: variantEntries.reduce((sum, entry) => sum + entry.total, 0),
        taxAmount: variantEntries.reduce((sum, entry) => sum + entry.taxAmount, 0),
        lineTotal: variantEntries.reduce((sum, entry) => sum + entry.lineTotal, 0),
      }
    }))
  }

  const handleProductSelect = (
    id: string,
    productId: number,
    productName: string,
    price: number,
    wholesalePrice?: number,
    stock?: number,
    productObj?: any,
  ) => {
    // Every product now has at least one default variant (guaranteed by createProduct).
    // Always read pricing from the first (default) variant. Never rely on has_variants flag.
    const variants: any[] = Array.isArray(productObj?.variants) ? productObj.variants : []
    const defaultVariant = variants[0] || null
    const isService = stock === 999
    const isBatchManaged = !isService

    // Priority: variant cost_price → wholesale_price → price → product fallback
    let priceToUse: number = Number(wholesalePrice || price) || 0
    let resolvedVariantId: number | null = productObj?.variant_id ?? null
    let resolvedMsp: number = 0
    let resolvedMrp: number = 0
    let resolvedShelf: string | null = null
    let resolvedBarcode: string | null = null
    let resolvedSku: string | null = null
    let resolvedStock: number = Number(stock) || 0

    if (defaultVariant) {
      resolvedVariantId = defaultVariant.id
      priceToUse = Number(
        defaultVariant.cost_price ?? defaultVariant.wholesale_price ?? defaultVariant.price ?? wholesalePrice ?? price
      ) || 0
      resolvedMsp = Number(defaultVariant.msp ?? defaultVariant.price ?? 0)
      resolvedMrp = Number(defaultVariant.mrp ?? defaultVariant.msp ?? defaultVariant.price ?? 0)
      resolvedShelf = defaultVariant.shelf || null
      resolvedBarcode = defaultVariant.barcode || null
      resolvedSku = defaultVariant.sku || null
      resolvedStock = Number(defaultVariant.stock ?? stock ?? 0)
    } else if (productObj) {
      // Fallback: use top-level product fields surfaced by getProducts
      resolvedVariantId = productObj.variant_id ?? null
      priceToUse = Number(productObj.cost_price ?? productObj.wholesale_price ?? productObj.price ?? 0)
      resolvedMsp = Number(productObj.msp ?? productObj.price ?? 0)
      resolvedMrp = Number(productObj.mrp ?? productObj.msp ?? productObj.price ?? 0)
      resolvedShelf = productObj.shelf ?? null
      resolvedBarcode = productObj.barcode ?? null
      resolvedSku = productObj.sku ?? null
      resolvedStock = Number(productObj.stock ?? 0)
    }

    priceToUse = priceToUse || 0
    const currentQty = Number(products.find((p) => p.id === id)?.quantity) || 1
    const taxPercentage = Number(productObj?.tax_percentage) || 0

    console.log("[Purchase] selectedProduct", productObj)
    console.log("[Purchase] selectedProduct.variants.length", variants.length)

    const variantEntries: PurchaseVariantEntry[] = variants.map((variant: any, index: number) => ({
      id: Number(variant.id),
      name: String(variant.name || (index === 0 ? "Default" : "Variant")),
      quantity: 0,
      price: Number(variant.cost_price ?? variant.wholesale_price ?? priceToUse ?? 0),
      msp: variant.msp != null ? Number(variant.msp) : null,
      mrp: variant.mrp != null ? Number(variant.mrp) : null,
      sku: variant.sku || null,
      barcode: variant.barcode || null,
      shelf: variant.shelf || null,
      stock: Number(variant.stock || 0),
      taxPercentage,
      ...calculatePurchaseLine({ quantity: 0, price: Number(variant.cost_price ?? variant.wholesale_price ?? priceToUse ?? 0), taxPercentage }),
    }))

    updateProductRow(id, {
      productId,
      productName,
      price: priceToUse,
      wholesalePrice: priceToUse,
      total: variantEntries.length > 1 ? 0 : currentQty * priceToUse,
      taxPercentage,
      variant_id: resolvedVariantId,
      hasVariants: variants.length > 1,
      isBatchManaged,
      variants,
      variantEntries,
      msp: resolvedMsp,
      mrp: resolvedMrp,
      shelf: resolvedShelf,
      barcode: resolvedBarcode,
      sku: resolvedSku,
      stock: resolvedStock,
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
      // Use the same variant-aware selection path as an existing product.
      // createProduct returns its persisted variants, so a new multi-variant
      // product expands immediately without requiring a second search.
      handleProductSelect(
        targetRowId,
        productId,
        product.name,
        Number(product.price ?? product.msp ?? priceToUse ?? 0),
        Number(product.wholesale_price ?? product.cost_price ?? priceToUse ?? 0),
        Number(product.stock ?? 0),
        product,
      )
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

        const lineTotalsBeforeDiscount = items.reduce(
          (sum: number, item: any) => sum + Number(item.line_total ?? (item.quantity * item.price)),
          0,
        )
        setDiscountAmount(Math.max(0, lineTotalsBeforeDiscount - Number(purchase.total_amount || 0)))

        const productRows = items.map((item: any) => ({
          id: crypto.randomUUID(),
          productId: item.product_id,
          productName: item.product_name,
          quantity: item.quantity,
          price: item.price,
          total: item.quantity * item.price,
          taxPercentage: Number(item.tax_percentage) || 0,
          taxAmount: Number(item.tax_amount) || 0,
          lineTotal: Number(item.line_total ?? (item.quantity * item.price)) || 0,
          originalItemId: item.id,
          wholesalePrice: item.wholesale_price || item.price,
          variant_id: item.product_variant_id || null,
          batch_id: item.batch_id || null,
          batch_number: item.batch_number || null,
          mfg_date: item.mfg_date ? format(new Date(item.mfg_date), "yyyy-MM-dd") : null,
          expiry_date: item.expiry_date ? format(new Date(item.expiry_date), "yyyy-MM-dd") : null,
          selling_price: item.selling_price || null,
          isBatchManaged: Boolean(item.is_batch_managed),
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

    const items: any[] = products.flatMap((product): any[] => {
      if (!product.productId) return []
      if ((product.variantEntries?.length || 0) > 1) {
        return product.variantEntries!
          .filter(variant => variant.quantity > 0)
          .map(variant => ({
            product_id: product.productId!,
            variant_id: variant.id,
            quantity: variant.quantity,
            price: variant.price,
            tax_percentage: variant.taxPercentage,
            tax_amount: variant.taxAmount,
            line_total: variant.lineTotal,
          }))
      }
      return product.quantity > 0
        ? [{
            ...(product.originalItemId ? { id: product.originalItemId } : {}),
            product_id: product.productId,
            quantity: product.quantity,
            price: product.price,
            variant_id: product.variantEntries?.[0]?.id || product.variant_id || null,
            batch_id: product.batch_id || null,
            batch_number: product.batch_number || null,
            mfg_date: product.mfg_date || null,
            expiry_date: product.expiry_date || null,
            tax_percentage: product.taxPercentage,
            tax_amount: product.taxAmount,
            line_total: product.lineTotal,
          }]
        : []
    })
    if (items.length === 0) {
      setFormAlert({
        type: "error",
        message: "Please select products and enter a quantity greater than zero",
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
      searchTerm={purchaseSearch}
      onSearchChange={setPurchaseSearch}
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

  const renderVariantEntries = (product: ProductRow) => {
    const variants = product.variantEntries || []
    if (variants.length <= 1) return null

    return (
      <div className="mx-2 mb-3 overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
          <ChevronsUpDown className="h-4 w-4" /> Variants ({variants.length})
        </div>
        <div className="grid grid-cols-[43fr_9fr_16fr_9fr_11fr_12fr] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
          <div className="min-w-0">Variant</div><div className="min-w-0">Qty</div><div className="min-w-0">Cost Price</div><div className="min-w-0">Tax %</div><div className="min-w-0">Tax Amount</div><div className="min-w-0">Line Total</div>
        </div>
        {variants.map(variant => {
          // Older saved drafts predate per-line tax fields. Recalculate here
          // rather than assuming those optional persisted values exist.
          const amounts = calculatePurchaseLine(variant)

          return (
          <div key={variant.id} className="grid grid-cols-[43fr_9fr_16fr_9fr_11fr_12fr] gap-2 items-center border-b border-gray-100 px-3 py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-900">{variant.name}</p>
              <p className="truncate text-[11px] text-gray-500">Stock: {variant.stock || 0}{variant.sku ? ` · SKU: ${variant.sku}` : ""}{variant.barcode ? ` · ${variant.barcode}` : ""}{variant.shelf ? ` · Shelf: ${variant.shelf}` : ""}</p>
            </div>
            <div className="min-w-0">
              <Input type="number" min="0" className="h-8 border-slate-300 w-full" value={variant.quantity || ""} placeholder="0" onChange={event => updateVariantEntry(product.id, variant.id, { quantity: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} />
            </div>
            <div className="min-w-0">
              <Input type="number" min="0" step="0.01" className="h-8 border-slate-300 w-full" value={variant.price || 0} placeholder="0.00" onChange={event => updateVariantEntry(product.id, variant.id, { price: Number.parseFloat(event.target.value) || 0 })} />
            </div>
            <div className="min-w-0">
              <Input type="number" min="0" max="100" step="0.01" className="h-8 border-slate-300 w-full" value={variant.taxPercentage || 0} onChange={event => updateVariantEntry(product.id, variant.id, { taxPercentage: Math.max(0, Math.min(100, Number.parseFloat(event.target.value) || 0)) })} />
            </div>
            <div className="min-w-0 text-xs text-gray-700 truncate">{currency} {amounts.taxAmount.toFixed(2)}</div>
            <div className="min-w-0 font-medium text-xs text-gray-900 truncate">{currency} {amounts.lineTotal.toFixed(2)}</div>
          </div>
          )
        })}
      </div>
    )
  }

  const renderProductRowDesktop = (product: ProductRow, index: number) => (
    <React.Fragment key={product.id}>
    <div
      className={`grid grid-cols-[38fr_9fr_16fr_9fr_11fr_12fr_5fr] gap-2 p-2 items-center border-b border-gray-200 ${
        index % 2 === 0 ? "bg-white" : "bg-gray-50"
      } hover:bg-gray-100 transition-colors duration-150`}
    >
      <div className="min-w-0">
        {product.productId && product.productName ? (
          <div className="flex flex-col">
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
                    variants: [],
                    variantEntries: [],
                    taxPercentage: 0,
                    taxAmount: 0,
                    lineTotal: 0,
                  })
                }
              >
                <ChevronsUpDown className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <ProductSelectSimple
            id={`product-select-${product.id}`}
            value={product.productId}
            onChange={(productId, productName, price, wholesalePrice, stock, productObj) =>
              handleProductSelect(product.id, productId, productName, price, wholesalePrice, stock, productObj)
            }
            onAddNew={() => handleAddNewFromRow(product.id)}
            userId={userId}
            usePriceType="wholesale"
            allowServices={false}
          />
        )}
      </div>
      <div className="min-w-0">
        {(!product.variantEntries || product.variantEntries.length <= 1) && (
          <Input
            type="number"
            min="1"
            value={product.quantity}
            onChange={(e) => updateProductRow(product.id, { quantity: Number.parseInt(e.target.value, 10) || 1 })}
            className="h-9 border-slate-300 w-full"
          />
        )}
      </div>
      <div className="min-w-0">
        {(!product.variantEntries || product.variantEntries.length <= 1) && (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={product.price}
            onChange={(e) => updateProductRow(product.id, { price: Number.parseFloat(e.target.value) || 0 })}
            placeholder="0.00"
            className="h-9 border-slate-300 w-full"
          />
        )}
      </div>
      <div className="min-w-0">
        {(!product.variantEntries || product.variantEntries.length <= 1) && (
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={product.taxPercentage}
            onChange={(e) => {
              const value = Number.parseFloat(e.target.value) || 0
              if (value >= 0 && value <= 100) {
                updateProductRow(product.id, { taxPercentage: value })
              }
            }}
            className="h-9 border-slate-300 w-full"
          />
        )}
      </div>
      <div className="min-w-0 flex items-center text-xs text-gray-700 truncate">
        {currency} {(Number(product.taxAmount) || 0).toFixed(2)}
      </div>
      <div className="min-w-0 flex items-center font-medium text-xs text-gray-900 truncate">
        {currency} {(Number(product.lineTotal) || 0).toFixed(2)}
      </div>
      <div className="min-w-0 flex justify-center">
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
    {renderVariantEntries(product)}
    </React.Fragment>
  )

  const renderProductRowMobile = (product: ProductRow, index: number) => (
    <React.Fragment key={product.id}>
    <div
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
                  variants: [],
                  variantEntries: [],
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
            onChange={(productId, productName, price, wholesalePrice, stock, productObj) =>
              handleProductSelect(product.id, productId, productName, price, wholesalePrice, stock, productObj)
            }
            onAddNew={() => handleAddNewFromRow(product.id)}
            userId={userId}
            usePriceType="wholesale"
            allowServices={false}
          />
        )}
      </div>
      {(!product.variantEntries || product.variantEntries.length <= 1) && <div className="grid grid-cols-3 gap-2 mb-3">
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
        <div>
          <Label className="text-xs font-medium text-gray-700 mb-1 block">Tax %</Label>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={product.taxPercentage}
            onChange={(e) => updateProductRow(product.id, { taxPercentage: Math.max(0, Math.min(100, Number.parseFloat(e.target.value) || 0)) })}
            className="text-center h-8 text-sm"
          />
        </div>
      </div>}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-gray-900">
          Tax Amount: {currency} {(Number(product.taxAmount) || 0).toFixed(2)}
        </div>
        <div className="text-sm font-medium text-gray-900">
          Total: {currency} {(Number(product.lineTotal) || 0).toFixed(2)}
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
    {renderVariantEntries(product)}
    </React.Fragment>
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
                      <div className="grid grid-cols-[38fr_9fr_16fr_9fr_11fr_12fr_5fr] gap-2 p-2 bg-gray-100 font-medium text-xs text-gray-700 border-b border-gray-200">
                        <div className="min-w-0">Product</div>
                        <div className="min-w-0">Qty</div>
                        <div className="min-w-0">Price</div>
                        <div className="min-w-0">Tax %</div>
                        <div className="min-w-0">Tax Amount</div>
                        <div className="min-w-0">Total</div>
                        <div className="min-w-0"></div>
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
                          <span className="font-bold text-green-700 text-sm">Grand Total:</span>
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
        onDelivered={() => {
          markInventoryStale(dispatch)
          fetchPurchasesForMonth(purchasesViewMonth)
        }}
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
