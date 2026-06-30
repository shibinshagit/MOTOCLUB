"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { useConfirm } from "@/hooks/use-confirm"
import { cleanupProductMediaUrls, updateProduct } from "@/app/actions/product-actions"
import { getCategories, createCategory, updateCategory, deleteCategory } from "@/app/actions/category-actions"
import { Check, ChevronRight, Loader2, Plus, Search, Tag, X, ImageIcon, Link2, Trash2, Film, Pencil } from "lucide-react"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { FormAlert } from "@/components/ui/form-alert"
import { Switch } from "@/components/ui/switch"
import {
  compressImageForUpload,
  formatBytes,
  MAX_IMAGE_SIZE_BYTES,
  MAX_TOTAL_MEDIA_PAYLOAD_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/media-upload-utils"
import { uploadProductFileFromClient } from "@/lib/blob-client-upload"
import { parseProductLinks, type ProductLinkEntry } from "@/lib/product-links"
import {
  NESTED_DIALOG_CONTENT_ATTR,
  preventDismissWhenNestedOpen,
  shouldIgnoreParentDialogClose,
} from "@/lib/nested-dialog"
import { useStaffRestrictions } from "@/hooks/use-staff-restrictions"
import { cn } from "@/lib/utils"
import type { ReactNode } from "react"

interface Category {
  id: number
  name: string
  description?: string
  parent_id?: number | null
  parent_name?: string | null
}

interface AttributeEntry {
  key: string
  value: string
}

type PlatformKey = "amazon" | "flipkart" | "meesho" | "own_ecom"
type PlatformStatus = "not_listed" | "active" | "archived"

const PLATFORM_OPTIONS: { key: PlatformKey; label: string }[] = [
  { key: "amazon", label: "Amazon" },
  { key: "flipkart", label: "Flipkart" },
  { key: "meesho", label: "Meesho" },
  { key: "own_ecom", label: "Own Ecom" },
]

function PanelSection({
  title,
  subtitle,
  children,
  action,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-card">
      <div className="flex items-center justify-between border-b border-slate-200 bg-[#F1F4F9] px-4 py-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function FieldLabel({ htmlFor, children, required }: { htmlFor?: string; children: ReactNode; required?: boolean }) {
  return (
    <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
      {children}
      {required ? <span className="text-rose-500"> *</span> : null}
    </Label>
  )
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "violet" | "emerald" | "amber" | "blue" | "slate"
}) {
  const tones = {
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    blue: "border-blue-100 bg-blue-50 text-blue-700",
    slate: "border-border bg-muted/40 text-foreground",
  }

  return (
    <div className={cn("rounded-lg border px-3 py-2", tones[tone])}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="truncate text-sm font-bold">{value || "—"}</p>
    </div>
  )
}

function CategoryListRow({
  category,
  displayName,
  level = 0,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  disabled,
}: {
  category: Category
  displayName: string
  level?: 0 | 1 | 2
  isSelected: boolean
  onSelect: (category: Category) => void
  onEdit: (category: Category) => void
  onDelete: (category: Category) => void
  disabled?: boolean
}) {
  const tagClass = level === 0 ? "h-4 w-4 text-violet-600" : level === 1 ? "h-3.5 w-3.5 text-slate-400" : "h-3 w-3 text-slate-300"
  const textClass = level === 0 ? "font-medium" : level === 1 ? "text-sm" : "text-xs"
  const rowPad = level === 0 ? "py-3" : "py-2"

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md",
        isSelected ? "bg-violet-50" : "hover:bg-violet-50/50",
      )}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onSelect(category)
        }}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between px-3 text-left text-slate-900 disabled:opacity-50",
          rowPad,
          textClass,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Tag className={cn("shrink-0", tagClass)} />
          <span className="truncate">{displayName}</span>
        </span>
        {isSelected ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
      </button>
      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onEdit(category)
          }}
          className="h-7 w-7 text-slate-500 hover:bg-white hover:text-violet-700"
          aria-label={`Edit ${category.name}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          onClick={(e) => {
            e.stopPropagation()
            onDelete(category)
          }}
          className="h-7 w-7 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
          aria-label={`Delete ${category.name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

interface Product {
  id: number
  name: string
  company_name?: string
  category?: string
  category_id?: number
  description?: string
  price: number
  wholesale_price?: number
  msp?: number
  stock: number
  shelf?: string
  barcode?: string
  image_url?: string
  image_urls?: string[] | string
  video_url?: string
  created_by?: number
  color?: string
  size?: string
  suitable_for?: string
  attributes?: AttributeEntry[] | string
  link?: string
  amazon_status?: PlatformStatus
  flipkart_status?: PlatformStatus
  meesho_status?: PlatformStatus
  own_ecom_status?: PlatformStatus
  trending?: boolean
}

interface EditProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (product: any) => void
  product: Product | null
  userId?: number
}

export default function EditProductModal({ isOpen, onClose, onSuccess, product, userId }: EditProductModalProps) {
  const { isValueHidden } = useStaffRestrictions()
  const hideCogs = isValueHidden("cogs")
  const hideStockCount = isValueHidden("stock_count")
  const { toast } = useToast()
  const { confirm, ConfirmDialog } = useConfirm()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currency, setCurrency] = useState("QAR")
  const [selectedImages, setSelectedImages] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [uploadedImageUrls, setUploadedImageUrls] = useState<string[]>([])
  const [currentImageUrls, setCurrentImageUrls] = useState<string[]>([])
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null)
  const [videoPreview, setVideoPreview] = useState<string | null>(null)
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null)
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | null>(null)
  const [isUploadingMedia, setIsUploadingMedia] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    name: "",
    companyName: "",
    category: "",
    categoryId: null as number | null,
    description: "",
    price: "",
    wholesalePrice: "",
    msp: "",
    stock: "",
    shelf: "",
    barcode: "",
    color: "",
    size: "",
    suitableFor: "",
  })
  const [attributes, setAttributes] = useState<AttributeEntry[]>([])
  const [productLinks, setProductLinks] = useState<ProductLinkEntry[]>([])
  const [platformStatus, setPlatformStatus] = useState<Record<PlatformKey, PlatformStatus>>({
    amazon: "not_listed",
    flipkart: "not_listed",
    meesho: "not_listed",
    own_ecom: "not_listed",
  })
  const [trending, setTrending] = useState(false)

  const [categories, setCategories] = useState<Category[]>([])
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  const [categorySearchQuery, setCategorySearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false)
  const [isEditingCategory, setIsEditingCategory] = useState(false)
  const [editingCategory, setEditingCategory] = useState<Category | null>(null)
  const [editCategoryName, setEditCategoryName] = useState("")
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(null)
  const editCategoryInputRef = useRef<HTMLInputElement>(null)
  const categorySearchInputRef = useRef<HTMLInputElement>(null)
  const newCategoryInputRef = useRef<HTMLInputElement>(null)
  const closingCategoryDialogRef = useRef(false)

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  useEffect(() => {
    if (Object.keys(fieldErrors).length > 0) {
      const timer = setTimeout(() => setFieldErrors({}), 5000)
      return () => clearTimeout(timer)
    }
  }, [fieldErrors])

  const parseAttributes = (raw: any): AttributeEntry[] => {
    if (!raw) return []
    if (Array.isArray(raw)) return raw
    if (typeof raw === "string") {
      try { return JSON.parse(raw) } catch { return [] }
    }
    return []
  }

  useEffect(() => {
    if (isOpen && product) {
      setFormData({
        name: product.name || "",
        companyName: product.company_name || "",
        category: product.category || "",
        categoryId: product.category_id || null,
        description: product.description || "",
        price: product.price?.toString() || "",
        wholesalePrice: product.wholesale_price?.toString() || "",
        msp: product.msp?.toString() || "",
        stock: product.stock?.toString() || "",
        shelf: product.shelf || "",
        barcode: product.barcode || "",
        color: product.color || "",
        size: product.size || "",
        suitableFor: product.suitable_for || "",
      })
      setAttributes(parseAttributes(product.attributes))
      setProductLinks(parseProductLinks(product.link))
      let initialImageUrls: string[] = []
      if (Array.isArray(product.image_urls)) {
        initialImageUrls = product.image_urls.filter((url) => typeof url === "string" && url.trim().length > 0)
      } else if (typeof product.image_urls === "string" && product.image_urls.trim()) {
        try {
          const parsed = JSON.parse(product.image_urls)
          if (Array.isArray(parsed)) {
            initialImageUrls = parsed.filter((url) => typeof url === "string" && url.trim().length > 0)
          }
        } catch {
          initialImageUrls = []
        }
      }
      if (initialImageUrls.length === 0 && product.image_url) {
        initialImageUrls = [product.image_url]
      }
      setCurrentImageUrls(initialImageUrls.slice(0, 4))
      setSelectedImages([])
      setImagePreviews([])
      setUploadedImageUrls([])
      setSelectedVideo(null)
      setVideoPreview(null)
      setUploadedVideoUrl(null)
      setCurrentVideoUrl(product.video_url || null)
      setPlatformStatus({
        amazon: product.amazon_status || "not_listed",
        flipkart: product.flipkart_status || "not_listed",
        meesho: product.meesho_status || "not_listed",
        own_ecom: product.own_ecom_status || "not_listed",
      })
      setTrending(Boolean(product.trending))

      if (product.category_id) {
        const category = categories.find((cat) => cat.id === product.category_id)
        setSelectedCategory(category || null)
      } else {
        setSelectedCategory(null)
      }

      setError(null)
      setFieldErrors({})
      fetchCategories()

      const fetchCurrency = async () => {
        try {
          const deviceCurrency = await getDeviceCurrency(userId || 1)
          setCurrency(deviceCurrency)
        } catch (err) {
          console.error("Error fetching currency:", err)
        }
      }
      fetchCurrency()
    }
  }, [isOpen, product, userId])

  useEffect(() => {
    if (categorySearchQuery.trim() === "") {
      setFilteredCategories(categories)
    } else {
      const query = categorySearchQuery.toLowerCase()
      setFilteredCategories(categories.filter((c) =>
        c.name.toLowerCase().includes(query) || c.parent_name?.toLowerCase().includes(query)
      ))
    }
  }, [categorySearchQuery, categories])

  useEffect(() => {
    if (isCategoryDialogOpen && categorySearchInputRef.current) {
      setTimeout(() => categorySearchInputRef.current?.focus(), 100)
    }
  }, [isCategoryDialogOpen])

  useEffect(() => {
    if (isAddingNewCategory && newCategoryInputRef.current) {
      setTimeout(() => newCategoryInputRef.current?.focus(), 100)
    }
  }, [isAddingNewCategory])

  useEffect(() => {
    if (isEditingCategory && editCategoryInputRef.current) {
      setTimeout(() => editCategoryInputRef.current?.focus(), 100)
    }
  }, [isEditingCategory])

  useEffect(() => {
    return () => {
      imagePreviews.forEach((url) => URL.revokeObjectURL(url))
      if (videoPreview) URL.revokeObjectURL(videoPreview)
    }
  }, [imagePreviews, videoPreview])

  const hasPendingDraftMedia =
    selectedImages.length > 0 || !!selectedVideo || uploadedImageUrls.length > 0 || !!uploadedVideoUrl

  const clearSelectedDraftMedia = () => {
    imagePreviews.forEach((url) => URL.revokeObjectURL(url))
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setSelectedImages([])
    setImagePreviews([])
    setSelectedVideo(null)
    setVideoPreview(null)
  }

  const cleanupUploadedDraftMedia = async () => {
    const urlsToCleanup = [...uploadedImageUrls, ...(uploadedVideoUrl ? [uploadedVideoUrl] : [])]
    if (urlsToCleanup.length > 0) {
      await cleanupProductMediaUrls(urlsToCleanup)
    }
    setUploadedImageUrls([])
    setUploadedVideoUrl(null)
  }

  const handleAttemptClose = async () => {
    if (hasPendingDraftMedia) {
      const shouldDiscard = await confirm({
        description: "Are you sure? Unsaved uploaded media will be removed from cloud storage.",
        destructive: true,
        confirmLabel: "Discard",
      })
      if (!shouldDiscard) return
      await cleanupUploadedDraftMedia()
      clearSelectedDraftMedia()
    }
    onClose()
  }

  useEffect(() => {
    if (!isOpen || !hasPendingDraftMedia) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }

    const handleReloadShortcut = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const isReload = event.key === "F5" || ((event.ctrlKey || event.metaKey) && key === "r")
      if (!isReload) return
      event.preventDefault()
      notifyError(toast, "Discard and remove uploaded media before reloading.", "Unsaved media present")
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    window.addEventListener("keydown", handleReloadShortcut)
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
      window.removeEventListener("keydown", handleReloadShortcut)
    }
  }, [isOpen, hasPendingDraftMedia, toast])

  const fetchCategories = async () => {
    setIsLoadingCategories(true)
    setCategorySearchQuery("")
    try {
      const result = await getCategories(userId)
      if (result.success) {
        setCategories(result.data)
        setFilteredCategories(result.data)
        if (product?.category_id) {
          const category = result.data.find((cat: Category) => cat.id === product.category_id)
          setSelectedCategory(category || null)
        }
      } else {
        notifyError(toast, result.message || "Failed to load categories")
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
      notifyError(toast, "Failed to load categories")
    } finally {
      setIsLoadingCategories(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const currentTotal = currentImageUrls.length + uploadedImageUrls.length + selectedImages.length
    const maxCanAdd = Math.max(0, 4 - currentTotal)
    if (maxCanAdd === 0) {
      const message = "Maximum 4 images allowed."
      setError(message)
      notifyError(toast, message, "Limit reached")
      if (imageInputRef.current) imageInputRef.current.value = ""
      return
    }

    if (files.length > maxCanAdd) {
      notifyError(toast, `Only ${maxCanAdd} more image${maxCanAdd === 1 ? "" : "s"} can be selected.`, "Image limit reached")
    }

    const accepted: File[] = []
    const previews: string[] = []
    for (const file of files.slice(0, maxCanAdd)) {
      if (!file.type.startsWith("image/")) {
        const message = `${file.name} is not an image.`
        setError(message)
        notifyError(toast, message, "Invalid file")
        continue
      }
      const processedImage = await compressImageForUpload(file)
      if (processedImage.size > MAX_IMAGE_SIZE_BYTES) {
        const message = `${file.name} exceeds 10MB even after compression.`
        setError(message)
        notifyError(toast, message, "Too large")
        continue
      }
      accepted.push(processedImage)
      previews.push(URL.createObjectURL(processedImage))
    }

    if (accepted.length > 0) {
      setSelectedImages((prev) => [...prev, ...accepted].slice(0, 4))
      setImagePreviews((prev) => [...prev, ...previews].slice(0, 4))
    }

    if (imageInputRef.current) imageInputRef.current.value = ""
  }

  const removeCurrentImageAt = (index: number) => {
    setCurrentImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const removeUploadedImageAt = async (index: number) => {
    const urlToRemove = uploadedImageUrls[index]
    if (!urlToRemove) return
    await cleanupProductMediaUrls([urlToRemove])
    setUploadedImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const removeNewImageAt = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index))
    setImagePreviews((prev) => {
      const url = prev[index]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("video/")) {
      const message = "Please select a video file."
      setError(message)
      notifyError(toast, message, "Invalid file")
      if (videoInputRef.current) videoInputRef.current.value = ""
      return
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      const message = "Video must be under 50MB."
      setError(message)
      notifyError(toast, message, "Too large")
      if (videoInputRef.current) videoInputRef.current.value = ""
      return
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setSelectedVideo(file)
    setVideoPreview(URL.createObjectURL(file))
    if (videoInputRef.current) videoInputRef.current.value = ""
  }

  const removeVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setSelectedVideo(null)
    setVideoPreview(null)
    setCurrentVideoUrl(null)
    if (videoInputRef.current) videoInputRef.current.value = ""
  }

  const removeUploadedVideo = async () => {
    if (!uploadedVideoUrl) return
    await cleanupProductMediaUrls([uploadedVideoUrl])
    setUploadedVideoUrl(null)
  }

  const handleUploadSelectedMedia = async () => {
    if (!product) return
    if (selectedImages.length === 0 && !selectedVideo) return

    setIsUploadingMedia(true)
    try {
      const newlyUploadedImageUrls: string[] = []
      for (const image of selectedImages) {
        const uploadedUrl = await uploadProductFileFromClient(image, formData.name || product.name, "image")
        newlyUploadedImageUrls.push(uploadedUrl)
      }

      let newlyUploadedVideoUrl: string | null = null
      if (selectedVideo) {
        newlyUploadedVideoUrl = await uploadProductFileFromClient(selectedVideo, formData.name || product.name, "video")
      }

      if (newlyUploadedImageUrls.length > 0) {
        setUploadedImageUrls((prev) => [...prev, ...newlyUploadedImageUrls].slice(0, 4))
      }
      if (newlyUploadedVideoUrl) {
        if (uploadedVideoUrl) {
          await cleanupProductMediaUrls([uploadedVideoUrl])
        }
        setUploadedVideoUrl(newlyUploadedVideoUrl)
      }

      clearSelectedDraftMedia()
      notifySuccess(toast, "Selected media uploaded successfully." , "Uploaded")
    } catch (error) {
      console.error("Media upload failed:", error)
      const message = error instanceof Error ? error.message : "Failed to upload selected media. Please try again."
      notifyError(toast, message, "Upload failed")
    } finally {
      setIsUploadingMedia(false)
    }
  }

  const handleAddAttribute = () => {
    setAttributes((prev) => [...prev, { key: "", value: "" }])
  }

  const handleRemoveAttribute = (index: number) => {
    setAttributes((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAttributeChange = (index: number, field: "key" | "value", val: string) => {
    setAttributes((prev) => prev.map((attr, i) => i === index ? { ...attr, [field]: val } : attr))
  }

  const handleAddProductLink = () => {
    setProductLinks((prev) => [...prev, { name: "", url: "" }])
  }

  const handleRemoveProductLink = (index: number) => {
    setProductLinks((prev) => prev.filter((_, i) => i !== index))
  }

  const handleProductLinkChange = (index: number, field: "name" | "url", val: string) => {
    setProductLinks((prev) => prev.map((entry, i) => (i === index ? { ...entry, [field]: val } : entry)))
  }

  const parentCategories = categories.filter((c) => !c.parent_id)
  const childrenOf = (parentId: number) => categories.filter((c) => c.parent_id === parentId)

  const getCategoryDisplayName = (cat: Category) => {
    if (cat.parent_name) return `${cat.parent_name} › ${cat.name}`
    return cat.name
  }

  const resetCategoryDialogModes = () => {
    setIsAddingNewCategory(false)
    setIsEditingCategory(false)
    setEditingCategory(null)
    setEditCategoryName("")
    setNewCategoryName("")
    setNewCategoryParentId(null)
  }

  const closeCategoryDialog = () => {
    closingCategoryDialogRef.current = true
    setIsCategoryDialogOpen(false)
    resetCategoryDialogModes()
    window.setTimeout(() => {
      closingCategoryDialogRef.current = false
    }, 300)
  }

  const guardProductDialogDismiss = (event: Event) => {
    preventDismissWhenNestedOpen(event, isCategoryDialogOpen, closingCategoryDialogRef.current)
  }

  const handleStartEditCategory = (category: Category) => {
    setIsAddingNewCategory(false)
    setIsEditingCategory(true)
    setEditingCategory(category)
    setEditCategoryName(category.name)
  }

  const handleCancelEditCategory = () => {
    setIsEditingCategory(false)
    setEditingCategory(null)
    setEditCategoryName("")
  }

  const handleSaveEditCategory = async () => {
    if (!editingCategory || !editCategoryName.trim()) {
      notifyError(toast, "Category name cannot be empty")
      return
    }

    setIsSubmitting(true)
    try {
      const result = await updateCategory({
        id: editingCategory.id,
        name: editCategoryName.trim(),
        description: editingCategory.description,
      })

      if (result.success && result.data) {
        const updatedCategory: Category = {
          ...editingCategory,
          ...result.data,
          parent_name: editingCategory.parent_name,
        }

        setCategories((prev) => prev.map((cat) => (cat.id === editingCategory.id ? updatedCategory : cat)))

        if (selectedCategory?.id === editingCategory.id) {
          setSelectedCategory(updatedCategory)
          setFormData((prev) => ({
            ...prev,
            category: getCategoryDisplayName(updatedCategory),
            categoryId: updatedCategory.id,
          }))
        }

        notifySuccess(toast, `Category renamed to "${updatedCategory.name}"`)
        handleCancelEditCategory()
      } else {
        notifyError(toast, result.message || "Failed to update category")
      }
    } catch (error) {
      console.error("Error updating category:", error)
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteCategory = async (category: Category) => {
    const childCount = categories.filter((cat) => cat.parent_id === category.id).length
    if (childCount > 0) {
      notifyError(toast, "Remove or reassign subcategories before deleting this category.")
      return
    }

    const shouldDelete = await confirm({
      title: `Delete "${category.name}"?`,
      description: "Categories used by products cannot be deleted.",
      destructive: true,
      confirmLabel: "Delete",
    })
    if (!shouldDelete) return

    setIsSubmitting(true)
    try {
      const result = await deleteCategory(category.id)
      if (result.success) {
        setCategories((prev) => prev.filter((cat) => cat.id !== category.id))
        if (selectedCategory?.id === category.id) {
          setSelectedCategory(null)
          setFormData((prev) => ({ ...prev, category: "", categoryId: null }))
        }
        if (editingCategory?.id === category.id) {
          handleCancelEditCategory()
        }
        notifySuccess(toast, `Category "${category.name}" deleted`)
      } else {
        notifyError(toast, result.message || "Failed to delete category")
      }
    } catch (error) {
      console.error("Error deleting category:", error)
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) {
      notifyError(toast, "Category name cannot be empty")
      return
    }
    setIsSubmitting(true)
    try {
      const result = await createCategory({
        name: newCategoryName.trim(),
        userId: userId,
        parentId: newCategoryParentId,
      })
      if (result.success && result.data) {
        setCategories((prev) => {
          const exists = prev.some((cat) => cat.id === result.data.id)
          return exists ? prev : [...prev, result.data]
        })
        setSelectedCategory(result.data)
        setFormData((prev) => ({
          ...prev,
          category: result.data.parent_name ? `${result.data.parent_name} › ${result.data.name}` : result.data.name,
          categoryId: result.data.id,
        }))
        notifySuccess(toast, `Category "${result.data.name}" added successfully`)
        setNewCategoryName("")
        setNewCategoryParentId(null)
        setIsAddingNewCategory(false)
        closeCategoryDialog()
      } else {
        notifyError(toast, result.message || "Failed to add category")
      }
    } catch (error) {
      console.error("Error adding category:", error)
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCategorySelect = (category: Category) => {
    setSelectedCategory(category)
    setFormData((prev) => ({
      ...prev,
      category: getCategoryDisplayName(category),
      categoryId: category.id,
    }))
    closeCategoryDialog()
    notifySuccess(toast, `"${getCategoryDisplayName(category)}" has been selected`, "Category Selected")
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!product) {
      setError("No product selected for editing")
      return
    }
    setIsSubmitting(true)
    setError(null)
    setFieldErrors({})

    try {
      const errors: Record<string, string> = {}
      if (!formData.name) errors.name = "Product name is required"
      if (!formData.price) errors.price = "MRP is required"
      if (!hideCogs && !formData.wholesalePrice) errors.wholesalePrice = "Cost price is required"
      if (!hideStockCount && !formData.stock) errors.stock = "Stock is required"

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors)
        setIsSubmitting(false)
        return
      }

      if (selectedImages.length > 0 || selectedVideo) {
        setError("Please click 'Upload Selected Media' before saving the product.")
        setIsSubmitting(false)
        return
      }

      const submitFormData = new FormData()
      submitFormData.append("id", product.id.toString())
      submitFormData.append("name", formData.name)
      submitFormData.append("company_name", formData.companyName)
      submitFormData.append("category", formData.category)
      if (formData.categoryId) submitFormData.append("category_id", formData.categoryId.toString())
      submitFormData.append("description", formData.description)
      submitFormData.append("price", formData.price)
      submitFormData.append("wholesale_price", formData.wholesalePrice || "0")
      submitFormData.append("msp", formData.msp || "0")
      submitFormData.append("stock", formData.stock || "0")
      submitFormData.append("shelf", formData.shelf)
      submitFormData.append("barcode", formData.barcode)
      submitFormData.append("color", formData.color)
      submitFormData.append("size", formData.size)
      submitFormData.append("suitable_for", formData.suitableFor)
      submitFormData.append("links", JSON.stringify(productLinks))
      const validAttributes = attributes.filter((a) => a.key.trim() && a.value.trim())
      submitFormData.append("attributes", JSON.stringify(validAttributes))
      submitFormData.append("amazon_status", platformStatus.amazon)
      submitFormData.append("flipkart_status", platformStatus.flipkart)
      submitFormData.append("meesho_status", platformStatus.meesho)
      submitFormData.append("own_ecom_status", platformStatus.own_ecom)
      submitFormData.append("trending", trending ? "true" : "false")
      submitFormData.append("existing_image_urls", JSON.stringify(currentImageUrls))
      if (uploadedImageUrls.length > 0) {
        submitFormData.append("uploaded_image_urls", JSON.stringify(uploadedImageUrls))
      }
      if (!currentVideoUrl && !selectedVideo) {
        submitFormData.append("remove_video", "true")
      }
      if (uploadedVideoUrl) {
        submitFormData.append("uploaded_video_url", uploadedVideoUrl)
      }
      if (userId) submitFormData.append("user_id", userId.toString())

      const result = await updateProduct(submitFormData)

      if (result && result.success) {
        notifySuccess(toast, "Product updated successfully" )
        setUploadedImageUrls([])
        setUploadedVideoUrl(null)
        if (onSuccess) onSuccess(result.data)
        onClose()
      } else {
        if (result?.field) {
          setFieldErrors({ [result.field]: result.message || "Invalid value" })
        } else {
          const message = result?.message || "Failed to update product. Please try again."
          setError(message)
          notifyError(toast, message)
        }
      }
    } catch (error) {
      console.error("Error updating product:", error)
      const message = error instanceof Error ? error.message : String(error)
      setError(message)
      notifyError(toast, message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!product) return null

  const inputClass = (field?: string) =>
    cn(
      "h-9 bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 text-sm",
      field && fieldErrors[field] ? "border-rose-500" : "",
    )

  const totalImageCount = currentImageUrls.length + uploadedImageUrls.length + selectedImages.length
  const activeVideoSrc = videoPreview || uploadedVideoUrl || currentVideoUrl

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && shouldIgnoreParentDialogClose(isCategoryDialogOpen, closingCategoryDialogRef.current)) {
            return
          }
          if (!open) void handleAttemptClose()
        }}
      >
        <DialogContent
          className="max-w-4xl gap-0 overflow-hidden border-slate-200 p-0 sm:max-w-4xl [&>button]:top-3 [&>button]:right-3"
          onInteractOutside={guardProductDialogDismiss}
          onPointerDownOutside={guardProductDialogDismiss}
          onFocusOutside={guardProductDialogDismiss}
        >
          <DialogHeader className="space-y-0 border-b border-slate-200 bg-[#F1F4F9] px-4 py-3 text-left">
            <DialogTitle className="sr-only">Edit product</DialogTitle>
            <div className="flex flex-wrap items-center gap-2 pr-10">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAttemptClose()}
                className="h-8 border-slate-200 bg-white px-3 text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="edit-product-form"
                size="sm"
                disabled={isSubmitting || isUploadingMedia}
                className="h-8 bg-violet-600 px-3 text-xs hover:bg-violet-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Product"
                )}
              </Button>
            </div>
          </DialogHeader>

          <form id="edit-product-form" onSubmit={handleSubmit} className="max-h-[calc(90vh-4.5rem)] space-y-3 overflow-y-auto p-4">
            {(error || Object.keys(fieldErrors).length > 0) && (
              <div className="space-y-2">
                {error ? <FormAlert type="error" message={error} /> : null}
                {Object.entries(fieldErrors).map(([field, message]) =>
                  message ? <FormAlert key={field} type="error" message={message} /> : null,
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <SummaryCard label="MRP" value={formData.price ? `${currency} ${formData.price}` : ""} tone="violet" />
              {!hideCogs && (
                <SummaryCard
                  label="Cost"
                  value={formData.wholesalePrice ? `${currency} ${formData.wholesalePrice}` : ""}
                  tone="slate"
                />
              )}
              <SummaryCard label="MSP" value={formData.msp ? `${currency} ${formData.msp}` : ""} tone="blue" />
              {!hideStockCount && <SummaryCard label="Stock" value={formData.stock || ""} tone="emerald" />}
            </div>

            <PanelSection title="Basic information">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="name" required>
                    Product name
                  </FieldLabel>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    placeholder="Enter product name"
                    required
                    className={inputClass("name")}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="companyName">Company / brand</FieldLabel>
                  <Input
                    id="companyName"
                    name="companyName"
                    value={formData.companyName}
                    onChange={handleChange}
                    placeholder="Brand name"
                    className={inputClass()}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel required>Category</FieldLabel>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-full justify-between border-slate-300 bg-white text-left text-sm text-slate-900 hover:bg-slate-50"
                    onClick={() => setIsCategoryDialogOpen(true)}
                  >
                    {selectedCategory ? (
                      <span className="flex items-center gap-2 truncate">
                        <Tag className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                        <span className="truncate">{getCategoryDisplayName(selectedCategory)}</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">Select category...</span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <FieldLabel htmlFor="description">Description</FieldLabel>
                  <Textarea
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Enter product description"
                    className="min-h-[72px] border-slate-300 bg-white text-sm text-slate-900 placeholder:text-slate-400"
                    rows={3}
                  />
                </div>

                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel>
                    <span className="inline-flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Product links
                    </span>
                  </FieldLabel>
                  {productLinks.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={entry.name}
                        onChange={(e) => handleProductLinkChange(index, "name", e.target.value)}
                        placeholder="Name (optional, defaults to Link)"
                        className="h-8 flex-1 border-slate-300 bg-white text-sm"
                      />
                      <Input
                        value={entry.url}
                        onChange={(e) => handleProductLinkChange(index, "url", e.target.value)}
                        placeholder="https://..."
                        className="h-8 flex-[1.5] border-slate-300 bg-white text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveProductLink(index)}
                        className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddProductLink}
                    className="w-full border-dashed border-slate-300 bg-transparent text-slate-600 hover:bg-slate-50"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add link
                  </Button>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5 sm:col-span-2">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Trending</p>
                    <p className="text-[11px] text-slate-500">Mark this product as trending</p>
                  </div>
                  <Switch
                    checked={trending}
                    onCheckedChange={setTrending}
                    aria-label="Mark product as trending"
                  />
                </div>
              </div>
            </PanelSection>

            <PanelSection title="Pricing">
              <div className="grid gap-4 sm:grid-cols-3">
                {!hideCogs && (
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="wholesalePrice" required>
                      Cost ({currency})
                    </FieldLabel>
                    <Input
                      id="wholesalePrice"
                      name="wholesalePrice"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.wholesalePrice}
                      onChange={handleChange}
                      placeholder="0.00"
                      className={inputClass("wholesalePrice")}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="msp">MSP ({currency})</FieldLabel>
                  <Input
                    id="msp"
                    name="msp"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.msp}
                    onChange={handleChange}
                    placeholder="0.00"
                    className={inputClass()}
                  />
                </div>

                <div className="space-y-1.5">
                  <FieldLabel htmlFor="price" required>
                    MRP ({currency})
                  </FieldLabel>
                  <Input
                    id="price"
                    name="price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.price}
                    onChange={handleChange}
                    placeholder="0.00"
                    required
                    className={inputClass("price")}
                  />
                </div>
              </div>
            </PanelSection>

            <PanelSection title="Inventory & barcode">
              <div className="grid gap-4 sm:grid-cols-3">
                {!hideStockCount && (
                  <>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="stock" required>
                        Stock
                      </FieldLabel>
                      <Input
                        id="stock"
                        name="stock"
                        type="number"
                        min="0"
                        value={formData.stock}
                        onChange={handleChange}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className={inputClass("stock")}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel htmlFor="shelf">Shelf</FieldLabel>
                      <Input
                        id="shelf"
                        name="shelf"
                        value={formData.shelf}
                        onChange={handleChange}
                        placeholder="e.g. A1, B3"
                        className={inputClass()}
                      />
                    </div>
                  </>
                )}
                {hideStockCount && (
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="shelf">Shelf</FieldLabel>
                    <Input
                      id="shelf"
                      name="shelf"
                      value={formData.shelf}
                      onChange={handleChange}
                      placeholder="e.g. A1, B3"
                      className={inputClass()}
                    />
                  </div>
                )}
                <div className={cn("space-y-1.5", hideStockCount ? "sm:col-span-2" : "")}>
                  <FieldLabel htmlFor="barcode">Barcode + code</FieldLabel>
                  <Input
                    id="barcode"
                    name="barcode"
                    value={formData.barcode}
                    onChange={handleChange}
                    placeholder="Enter or scan barcode"
                    className={inputClass("barcode")}
                  />
                </div>
              </div>
            </PanelSection>

            <PanelSection
              title="Product media"
              subtitle="Up to 4 images (max 10MB each) · optional 1 video (max 50MB)"
            >
              <div className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Images ({totalImageCount}/4)</FieldLabel>
                  {(currentImageUrls.length > 0 || uploadedImageUrls.length > 0 || imagePreviews.length > 0) && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {currentImageUrls.map((url, index) => (
                        <div key={`current-${url}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                          <img src={url} alt={`Current image ${index + 1}`} className="h-24 w-full object-cover" />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => removeCurrentImageAt(index)}
                            className="absolute right-1 top-1 h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                      {uploadedImageUrls.map((url, index) => (
                        <div key={`uploaded-${url}-${index}`} className="relative overflow-hidden rounded-lg border border-emerald-200">
                          <img src={url} alt={`Uploaded image ${index + 1}`} className="h-24 w-full object-cover" />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => void removeUploadedImageAt(index)}
                            className="absolute right-1 top-1 h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          <span className="absolute bottom-1 left-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] text-white">
                            Uploaded
                          </span>
                        </div>
                      ))}
                      {imagePreviews.map((preview, index) => (
                        <div key={`new-${preview}-${index}`} className="relative overflow-hidden rounded-lg border border-slate-200">
                          <img src={preview} alt={`Selected image ${index + 1}`} className="h-24 w-full object-cover" />
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => removeNewImageAt(index)}
                            className="absolute right-1 top-1 h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          <span className="absolute bottom-1 left-1 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] text-white">
                            Selected
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {totalImageCount < 4 ? (
                    <button
                      type="button"
                      onClick={() => imageInputRef.current?.click()}
                      className="flex h-24 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 transition-colors hover:border-violet-300 hover:bg-violet-50/30"
                    >
                      <ImageIcon className="mb-1 h-6 w-6 text-slate-400" />
                      <p className="text-xs text-slate-500">Add images</p>
                    </button>
                  ) : null}
                  <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                </div>

                <div className="space-y-2">
                  <FieldLabel>Video (optional)</FieldLabel>
                  {activeVideoSrc ? (
                    <div className="relative overflow-hidden rounded-lg border border-slate-200">
                      <video controls className="h-32 w-full">
                        <source src={activeVideoSrc} />
                      </video>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (uploadedVideoUrl) {
                            void removeUploadedVideo()
                          } else {
                            removeVideo()
                          }
                        }}
                        className="absolute right-2 top-2"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      {videoPreview ? (
                        <span className="absolute bottom-2 left-2 rounded bg-blue-600 px-2 py-1 text-xs text-white">
                          Selected
                        </span>
                      ) : uploadedVideoUrl ? (
                        <span className="absolute bottom-2 left-2 rounded bg-emerald-600 px-2 py-1 text-xs text-white">
                          Uploaded
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => videoInputRef.current?.click()}
                      className="flex h-24 w-full flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 transition-colors hover:border-violet-300 hover:bg-violet-50/30"
                    >
                      <Film className="mb-1 h-6 w-6 text-slate-400" />
                      <p className="text-xs text-slate-500">Add video</p>
                    </button>
                  )}
                  <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />
                </div>

                {(selectedImages.length > 0 || selectedVideo) && (
                  <Button
                    type="button"
                    onClick={handleUploadSelectedMedia}
                    disabled={isUploadingMedia}
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                  >
                    {isUploadingMedia ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading media...
                      </>
                    ) : (
                      "Upload selected media"
                    )}
                  </Button>
                )}
              </div>
            </PanelSection>

            <PanelSection
              title="Marketplace availability"
              subtitle="Use Archived when a listing was live before but is currently stopped."
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {PLATFORM_OPTIONS.map((platform) => (
                  <div key={platform.key} className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {platform.label}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { value: "not_listed" as PlatformStatus, label: "Not listed" },
                          { value: "active" as PlatformStatus, label: "Active" },
                          { value: "archived" as PlatformStatus, label: "Archived" },
                        ] as const
                      ).map((option) => {
                        const isActive = platformStatus[platform.key] === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() =>
                              setPlatformStatus((prev) => ({
                                ...prev,
                                [platform.key]: option.value,
                              }))
                            }
                            className={cn(
                              "rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors",
                              isActive
                                ? "border-violet-300 bg-white text-violet-700 shadow-sm"
                                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                            )}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </PanelSection>

            <PanelSection title="Attributes & details">
              <div className="space-y-4">
                <div className="space-y-2">
                  <FieldLabel>Custom attributes</FieldLabel>
                  {attributes.map((attr, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        value={attr.key}
                        onChange={(e) => handleAttributeChange(index, "key", e.target.value)}
                        placeholder="e.g. Model"
                        className="h-8 flex-1 border-slate-300 bg-white text-sm"
                      />
                      <Input
                        value={attr.value}
                        onChange={(e) => handleAttributeChange(index, "value", e.target.value)}
                        placeholder="e.g. CBR600"
                        className="h-8 flex-1 border-slate-300 bg-white text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAttribute(index)}
                        className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddAttribute}
                    className="w-full border-dashed border-slate-300 bg-transparent text-slate-600 hover:bg-slate-50"
                  >
                    <Plus className="mr-1 h-4 w-4" /> Add attribute
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5 sm:col-span-3">
                    <FieldLabel htmlFor="suitableFor">Suitable for</FieldLabel>
                    <Input
                      id="suitableFor"
                      name="suitableFor"
                      value={formData.suitableFor}
                      onChange={handleChange}
                      placeholder="e.g. Honda CBR, Yamaha R15"
                      className={inputClass()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="color">Colour</FieldLabel>
                    <Input
                      id="color"
                      name="color"
                      value={formData.color}
                      onChange={handleChange}
                      placeholder="e.g. Red"
                      className={inputClass()}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="size">Size</FieldLabel>
                    <Input
                      id="size"
                      name="size"
                      value={formData.size}
                      onChange={handleChange}
                      placeholder="e.g. M, L"
                      className={inputClass()}
                    />
                  </div>
                </div>
              </div>
            </PanelSection>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isCategoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closingCategoryDialogRef.current = true
            window.setTimeout(() => {
              closingCategoryDialogRef.current = false
            }, 300)
          }
          setIsCategoryDialogOpen(open)
          if (!open) resetCategoryDialogModes()
        }}
      >
        <DialogContent
          {...{ [NESTED_DIALOG_CONTENT_ATTR]: "true" }}
          overlayClassName="z-[60]"
          className="z-[60] max-w-md gap-0 overflow-hidden border-slate-200 p-0 sm:max-w-md [&>button]:top-3 [&>button]:right-3"
        >
          <DialogHeader className="border-b border-slate-200 bg-[#F1F4F9] px-4 py-3 text-left">
            <DialogTitle className="text-sm font-semibold text-slate-900">Select category</DialogTitle>
          </DialogHeader>

          {isEditingCategory && editingCategory ? (
            <div className="border-b border-slate-200 p-4">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Edit category</h3>
                {editingCategory.parent_name ? (
                  <p className="text-xs text-slate-500">Parent: {editingCategory.parent_name}</p>
                ) : null}
                <div className="flex gap-2">
                  <Input
                    ref={editCategoryInputRef}
                    value={editCategoryName}
                    onChange={(e) => setEditCategoryName(e.target.value)}
                    placeholder="Category name"
                    className="h-9 flex-1 border-slate-300 bg-white text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        void handleSaveEditCategory()
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={handleSaveEditCategory}
                    disabled={!editCategoryName.trim() || isSubmitting}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCancelEditCategory} className="border-slate-300">
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : isAddingNewCategory ? (
            <div className="border-b border-slate-200 p-4">
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Add new category</h3>
                <div className="space-y-1.5">
                  <FieldLabel>Parent category (optional)</FieldLabel>
                  <select
                    value={newCategoryParentId || ""}
                    onChange={(e) => setNewCategoryParentId(e.target.value ? Number(e.target.value) : null)}
                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
                  >
                    <option value="">None (Top-level)</option>
                    {parentCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Input
                    ref={newCategoryInputRef}
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name"
                    className="h-9 flex-1 border-slate-300 bg-white text-sm"
                  />
                  <Button
                    type="button"
                    onClick={handleAddNewCategory}
                    disabled={!newCategoryName.trim() || isSubmitting}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsAddingNewCategory(false)
                      setNewCategoryParentId(null)
                    }}
                    className="border-slate-300"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b border-slate-200 p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  ref={categorySearchInputRef}
                  value={categorySearchQuery}
                  onChange={(e) => setCategorySearchQuery(e.target.value)}
                  placeholder="Search categories..."
                  className="h-9 border-slate-300 bg-white pl-9 pr-9 text-sm"
                />
                {categorySearchQuery ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setCategorySearchQuery("")}
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-slate-500"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          <div className="max-h-[50vh] flex-1 overflow-y-auto p-1">
            {isLoadingCategories ? (
              <div className="flex flex-col items-center justify-center py-8 text-sm text-slate-500">
                <Loader2 className="mb-2 h-6 w-6 animate-spin" />
                <p>Loading categories...</p>
              </div>
            ) : (
              !isAddingNewCategory &&
              !isEditingCategory && (
                <>
                  {categorySearchQuery.trim() ? (
                    filteredCategories.length > 0 ? (
                      <div className="grid gap-1 p-2">
                        {filteredCategories.map((category) => (
                          <CategoryListRow
                            key={category.id}
                            category={category}
                            displayName={getCategoryDisplayName(category)}
                            isSelected={selectedCategory?.id === category.id}
                            onSelect={handleCategorySelect}
                            onEdit={handleStartEditCategory}
                            onDelete={(cat) => void handleDeleteCategory(cat)}
                            disabled={isSubmitting}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-slate-500">
                        <p>No categories found</p>
                        <p className="mt-1 text-xs">Try a different search or add a new category</p>
                      </div>
                    )
                  ) : categories.length > 0 ? (
                    <div className="space-y-1 p-2">
                      {parentCategories.map((parent) => {
                        const children = childrenOf(parent.id)
                        return (
                          <div key={parent.id}>
                            <CategoryListRow
                              category={parent}
                              displayName={parent.name}
                              isSelected={selectedCategory?.id === parent.id}
                              onSelect={handleCategorySelect}
                              onEdit={handleStartEditCategory}
                              onDelete={(cat) => void handleDeleteCategory(cat)}
                              disabled={isSubmitting}
                            />
                            {children.length > 0 && (
                              <div className="ml-6 space-y-1 border-l-2 border-slate-200 pl-2">
                                {children.map((child) => {
                                  const grandchildren = childrenOf(child.id)
                                  return (
                                    <div key={child.id}>
                                      <CategoryListRow
                                        category={child}
                                        displayName={child.name}
                                        level={1}
                                        isSelected={selectedCategory?.id === child.id}
                                        onSelect={handleCategorySelect}
                                        onEdit={handleStartEditCategory}
                                        onDelete={(cat) => void handleDeleteCategory(cat)}
                                        disabled={isSubmitting}
                                      />
                                      {grandchildren.length > 0 && (
                                        <div className="ml-4 space-y-1 border-l-2 border-slate-100 pl-2">
                                          {grandchildren.map((gc) => (
                                            <CategoryListRow
                                              key={gc.id}
                                              category={gc}
                                              displayName={gc.name}
                                              level={2}
                                              isSelected={selectedCategory?.id === gc.id}
                                              onSelect={handleCategorySelect}
                                              onEdit={handleStartEditCategory}
                                              onDelete={(cat) => void handleDeleteCategory(cat)}
                                              disabled={isSubmitting}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {categories
                        .filter((c) => c.parent_id && !categories.some((p) => p.id === c.parent_id))
                        .map((orphan) => (
                          <CategoryListRow
                            key={orphan.id}
                            category={orphan}
                            displayName={orphan.name}
                            isSelected={selectedCategory?.id === orphan.id}
                            onSelect={handleCategorySelect}
                            onEdit={handleStartEditCategory}
                            onDelete={(cat) => void handleDeleteCategory(cat)}
                            disabled={isSubmitting}
                          />
                        ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-slate-500">
                      <p>No categories found</p>
                      <p className="mt-1 text-xs">Add a new category below</p>
                    </div>
                  )}
                </>
              )
            )}
          </div>

          {!isAddingNewCategory && !isEditingCategory && (
            <div className="border-t border-slate-200 p-4">
              <Button
                type="button"
                variant="outline"
                className="w-full border-slate-300 bg-transparent hover:bg-slate-50"
                onClick={() => {
                  handleCancelEditCategory()
                  setIsAddingNewCategory(true)
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Add new category
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {ConfirmDialog}
    </>
  )
}
