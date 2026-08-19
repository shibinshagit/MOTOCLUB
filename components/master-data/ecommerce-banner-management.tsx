"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Link as LinkIcon,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  Palette,
  Package,
  Search,
  Check,
  X,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  getEcommerceBannerMetadata,
  type BannerImageItem,
  type MasterDataInput,
  type MasterDataItem,
} from "@/lib/master-data"
import {
  createMasterDataItem,
  deleteMasterDataItem,
  updateMasterDataItem,
} from "@/app/actions/master-data-actions"
import { getProducts } from "@/app/actions/product-actions"
import ImageUploadField from "@/components/admin/image-upload-field"
import { cn } from "@/lib/utils"

interface EcommerceBannerManagementProps {
  items: MasterDataItem[]
  deviceId: number | null
  userId: number
  onRefresh: () => void
}

const COLOR_THEMES = [
  { id: "violet", label: "Vibrant Violet", colorClass: "bg-violet-600" },
  { id: "blue", label: "Electric Blue", colorClass: "bg-blue-600" },
  { id: "emerald", label: "Emerald Gold", colorClass: "bg-emerald-600" },
  { id: "amber", label: "Amber Sunset", colorClass: "bg-amber-500" },
  { id: "rose", label: "Rose Crimson", colorClass: "bg-rose-600" },
  { id: "dark", label: "Slate Dark", colorClass: "bg-slate-900" },
]

export default function EcommerceBannerManagement({
  items,
  deviceId,
  userId,
  onRefresh,
}: EcommerceBannerManagementProps) {
  const { toast } = useToast()

  const bannerItems = items.filter((item) => item.category === "ecommerce_banner")

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editingItem, setEditingItem] = useState<MasterDataItem | null>(null)
  const [deletingItem, setDeletingItem] = useState<MasterDataItem | null>(null)

  // Banner Type (custom multi-image OR product carousel)
  const [bannerType, setBannerType] = useState<"custom" | "product_carousel">("custom")

  // Form state
  const [name, setName] = useState("")
  const [subtitle, setSubtitle] = useState("")
  const [notes, setNotes] = useState("")
  const [ctaText, setCtaText] = useState("Shop Now")
  const [ctaUrl, setCtaUrl] = useState("")
  const [badgeText, setBadgeText] = useState("")
  const [themeColor, setThemeColor] = useState("violet")
  const [sortOrder, setSortOrder] = useState(0)
  const [isActive, setIsActive] = useState(true)

  // Custom Banner Images list
  const [images, setImages] = useState<BannerImageItem[]>([])
  const [newImageUrlInput, setNewImageUrlInput] = useState("")

  // Products list & selection
  const [availableProducts, setAvailableProducts] = useState<any[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [productSearchTerm, setProductSearchTerm] = useState("")
  const [selectedProductIds, setSelectedProductIds] = useState<number[]>([])

  // Load products when modal opens or component mounts
  const fetchStoreProducts = async () => {
    if (!userId && !deviceId) return
    setLoadingProducts(true)
    try {
      const res = await getProducts(userId || deviceId || 1, 100)
      if (res.success && res.data) {
        setAvailableProducts(res.data)
      }
    } catch {
      // ignore
    } finally {
      setLoadingProducts(false)
    }
  }

  useEffect(() => {
    fetchStoreProducts()
  }, [userId, deviceId])

  const openCreateDialog = () => {
    setEditingItem(null)
    setBannerType("custom")
    setName("")
    setSubtitle("")
    setNotes("")
    setCtaText("Shop Now")
    setCtaUrl("")
    setBadgeText("HOT DEAL")
    setThemeColor("violet")
    setSortOrder(bannerItems.length + 1)
    setIsActive(true)
    setImages([])
    setNewImageUrlInput("")
    setSelectedProductIds([])
    setProductSearchTerm("")
    setIsDialogOpen(true)
  }

  const openEditDialog = (item: MasterDataItem) => {
    const meta = getEcommerceBannerMetadata(item.metadata)
    setEditingItem(item)
    setBannerType(meta.bannerType || "custom")
    setName(item.name)
    setSubtitle(meta.subtitle || "")
    setNotes(item.notes || "")
    setCtaText(meta.ctaText || "Shop Now")
    setCtaUrl(meta.ctaUrl || item.website || "")
    setBadgeText(meta.badgeText || "")
    setThemeColor(meta.themeColor || "violet")
    setSortOrder(item.sort_order || 0)
    setIsActive(item.is_active !== false)
    
    // Explicitly fallback to imageUrl if meta.images is empty
    const loadedImages = meta.images && meta.images.length > 0
      ? meta.images
      : (meta.imageUrl ? [{ url: meta.imageUrl }] : [])

    setImages(loadedImages)
    setNewImageUrlInput("")
    setSelectedProductIds(meta.selectedProductIds || [])
    setProductSearchTerm("")
    setIsDialogOpen(true)
  }

  const handleAddImageUrl = () => {
    if (!newImageUrlInput.trim()) return
    setImages((prev) => [...prev, { url: newImageUrlInput.trim() }])
    setNewImageUrlInput("")
  }

  const handleFileUpload = (file: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const src = e.target?.result as string
      if (!src) return

      // Compress image using HTML5 Canvas to prevent payload size errors
      const img = new window.Image()
      img.onload = () => {
        const MAX_WIDTH = 1000
        const MAX_HEIGHT = 700
        let width = img.width
        let height = img.height

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width)
          width = MAX_WIDTH
        }
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height)
          height = MAX_HEIGHT
        }

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height)
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7)
          setImages((prev) => [...prev, { url: compressedDataUrl }])
        } else {
          setImages((prev) => [...prev, { url: src }])
        }
      }
      img.onerror = () => {
        setImages((prev) => [...prev, { url: src }])
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index))
  }

  const toggleProductSelection = (product: any) => {
    const pId = Number(product.id)
    setSelectedProductIds((prev) => {
      const exists = prev.includes(pId)
      if (exists) {
        return prev.filter((id) => id !== pId)
      } else {
        return [...prev, pId]
      }
    })
  }

  const handleSave = async () => {
    const targetDeviceId = deviceId || 1
    const targetUserId = userId || 1

    if (!name.trim()) {
      notifyError(toast, "Banner title is required")
      return
    }

    setIsSaving(true)
    try {
      // Finalize images array including any pending URL input
      let finalImages: BannerImageItem[] = [...images]
      if (newImageUrlInput.trim()) {
        finalImages.push({ url: newImageUrlInput.trim() })
      }

      if (bannerType === "product_carousel" && selectedProductIds.length > 0) {
        // Collect product images from selected products
        const productImages: BannerImageItem[] = []
        selectedProductIds.forEach((pId) => {
          const prod = availableProducts.find((p) => Number(p.id) === pId)
          if (prod) {
            const pImg = prod.image_url || (prod.image_urls && prod.image_urls[0]) || (prod.images && prod.images[0]) || ""
            if (pImg) {
              productImages.push({
                url: pImg,
                title: prod.name,
                subtitle: prod.selling_price ? `Price: ₹${prod.selling_price}` : prod.description || "",
                productId: pId,
              })
            }
          }
        })
        if (productImages.length > 0) {
          finalImages = productImages
        }
      }

      const primaryImage = finalImages[0]?.url || ""

      const input: MasterDataInput = {
        category: "ecommerce_banner",
        name: name.trim(),
        notes: notes.trim(),
        website: ctaUrl.trim(),
        imageUrl: primaryImage,
        images: finalImages,
        selectedProductIds,
        bannerType,
        subtitle: subtitle.trim(),
        ctaText: ctaText.trim() || "Shop Now",
        ctaUrl: ctaUrl.trim(),
        badgeText: badgeText.trim(),
        themeColor,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      }

      if (editingItem) {
        const result = await updateMasterDataItem(editingItem.id, targetDeviceId, input)
        if (result.success) {
          notifySuccess(toast, "Banner updated successfully")
          setIsDialogOpen(false)
          onRefresh()
        } else {
          notifyError(toast, result.message || "Failed to update banner")
        }
      } else {
        const result = await createMasterDataItem(targetDeviceId, targetUserId, input)
        if (result.success) {
          notifySuccess(toast, "Banner created successfully")
          setIsDialogOpen(false)
          onRefresh()
        } else {
          notifyError(toast, result.message || "Failed to create banner")
        }
      }
    } catch (err: any) {
      notifyError(toast, err.message || "Failed to save banner")
    } finally {
      setIsSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deletingItem) return
    const targetDeviceId = deviceId || 1
    setIsSaving(true)
    try {
      const result = await deleteMasterDataItem(deletingItem.id, targetDeviceId)
      if (result.success) {
        notifySuccess(toast, "Banner deleted")
        setIsDeleteOpen(false)
        setDeletingItem(null)
        onRefresh()
      } else {
        notifyError(toast, result.message || "Failed to delete banner")
      }
    } catch {
      notifyError(toast, "Failed to delete banner")
    } finally {
      setIsSaving(false)
    }
  }

  const toggleActiveStatus = async (item: MasterDataItem) => {
    const targetDeviceId = deviceId || 1
    const meta = getEcommerceBannerMetadata(item.metadata)
    const nextStatus = item.is_active === false
    try {
      const result = await updateMasterDataItem(item.id, targetDeviceId, {
        category: "ecommerce_banner",
        name: item.name,
        notes: item.notes || "",
        website: meta.ctaUrl || item.website || "",
        imageUrl: meta.imageUrl,
        images: meta.images,
        selectedProductIds: meta.selectedProductIds,
        bannerType: meta.bannerType,
        subtitle: meta.subtitle,
        ctaText: meta.ctaText,
        ctaUrl: meta.ctaUrl,
        badgeText: meta.badgeText,
        themeColor: meta.themeColor,
        sortOrder: item.sort_order || 0,
        isActive: nextStatus,
      })
      if (result.success) {
        notifySuccess(toast, nextStatus ? "Banner activated" : "Banner deactivated")
        onRefresh()
      }
    } catch {
      notifyError(toast, "Failed to toggle banner status")
    }
  }

  const moveOrder = async (item: MasterDataItem, direction: "up" | "down") => {
    const targetDeviceId = deviceId || 1
    const meta = getEcommerceBannerMetadata(item.metadata)
    const currentOrder = item.sort_order || 0
    const newOrder = direction === "up" ? Math.max(0, currentOrder - 1) : currentOrder + 1

    try {
      await updateMasterDataItem(item.id, targetDeviceId, {
        category: "ecommerce_banner",
        name: item.name,
        notes: item.notes || "",
        website: meta.ctaUrl || item.website || "",
        imageUrl: meta.imageUrl,
        images: meta.images,
        selectedProductIds: meta.selectedProductIds,
        bannerType: meta.bannerType,
        subtitle: meta.subtitle,
        ctaText: meta.ctaText,
        ctaUrl: meta.ctaUrl,
        badgeText: meta.badgeText,
        themeColor: meta.themeColor,
        sortOrder: newOrder,
        isActive: item.is_active !== false,
      })
      onRefresh()
    } catch {
      notifyError(toast, "Failed to update order")
    }
  }

  const filteredProducts = availableProducts.filter((p) => {
    if (!productSearchTerm.trim()) return true
    const term = productSearchTerm.toLowerCase()
    return (
      p.name.toLowerCase().includes(term) ||
      (p.code || "").toLowerCase().includes(term) ||
      (p.category_name || "").toLowerCase().includes(term)
    )
  })

  return (
    <div className="space-y-6 pb-6">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b border-slate-200 bg-[#F1F4F9] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white shadow-md shadow-violet-500/20">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">E-Commerce Home Page Banners</h2>
            <p className="text-xs text-slate-500">
              Manage promotional banners, custom carousel images, and product showcase slides for your e-commerce store.
            </p>
          </div>
        </div>

        <div>
          <Button size="sm" className="h-9 bg-violet-600 hover:bg-violet-700 text-white font-semibold" onClick={openCreateDialog}>
            <Plus className="mr-1.5 h-4 w-4" />
            Add New Banner
          </Button>
        </div>
      </div>

      {/* Banner Cards List */}
      <div className="px-5">
        {bannerItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600 mb-3">
              <ImageIcon className="h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-slate-900">No Banners Created Yet</h3>
            <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
              Create your first promotional banner or product carousel to showcase your items on the e-commerce home page.
            </p>
            <Button size="sm" className="mt-4 bg-violet-600 hover:bg-violet-700 text-white" onClick={openCreateDialog}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add First Banner
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {bannerItems.map((item) => {
              const meta = getEcommerceBannerMetadata(item.metadata)
              const isBannerActive = item.is_active !== false
              const cardImages = meta.images && meta.images.length > 0 ? meta.images : (meta.imageUrl ? [{ url: meta.imageUrl }] : [])
              const cardImageUrl = meta.imageUrl || cardImages[0]?.url || ""
              const bannerImagesCount = cardImages.length

              return (
                <div
                  key={item.id}
                  className={cn(
                    "relative overflow-hidden rounded-2xl border bg-white transition-all shadow-sm hover:shadow-md",
                    isBannerActive ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50/70"
                  )}
                >
                  {/* Thumbnail Banner Header */}
                  <div className="relative aspect-[21/9] min-h-[140px] w-full bg-slate-950 overflow-hidden">
                    {cardImageUrl ? (
                      <Image src={cardImageUrl} alt={item.name} fill unoptimized className="object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-slate-900 text-slate-500">
                        <ImageIcon className="h-10 w-10 opacity-30" />
                      </div>
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/40 to-transparent" />

                    {/* Top Status & Sequence Badges */}
                    <div className="absolute top-3 inset-x-3 flex items-center justify-between z-10">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md bg-black/60 backdrop-blur border border-white/20 px-2 py-0.5 text-[11px] font-bold text-white">
                          Order #{item.sort_order || 0}
                        </span>
                        <span className="rounded-md bg-indigo-600/90 border border-indigo-400/40 px-2 py-0.5 text-[11px] font-bold text-white">
                          {meta.bannerType === "product_carousel"
                            ? `Products (${meta.selectedProductIds?.length || 0})`
                            : `Images (${bannerImagesCount})`}
                        </span>
                        {meta.badgeText && (
                          <span className="rounded-md bg-violet-600/90 border border-violet-400/40 px-2 py-0.5 text-[11px] font-bold text-white">
                            {meta.badgeText}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleActiveStatus(item)}
                        className={cn(
                          "flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur shadow-sm transition-all",
                          isBannerActive
                            ? "bg-emerald-500/90 text-white hover:bg-emerald-600"
                            : "bg-slate-700/90 text-slate-200 hover:bg-slate-800"
                        )}
                      >
                        {isBannerActive ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        {isBannerActive ? "Active" : "Inactive"}
                      </button>
                    </div>

                    {/* Banner Title Preview overlay */}
                    <div className="absolute bottom-3 inset-x-3 z-10">
                      <h4 className="text-base font-extrabold text-white truncate drop-shadow-sm">{item.name}</h4>
                      {meta.subtitle && <p className="text-xs text-slate-200/90 truncate font-medium">{meta.subtitle}</p>}
                    </div>
                  </div>

                  {/* Details & Actions Footer */}
                  <div className="p-4 space-y-3">
                    {item.notes && <p className="text-xs text-slate-600 line-clamp-2">{item.notes}</p>}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs">
                      <div className="flex items-center gap-2 text-slate-500 min-w-0">
                        {meta.ctaUrl && (
                          <span className="flex items-center gap-1 text-slate-700 font-medium truncate max-w-[200px]">
                            <LinkIcon className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{meta.ctaUrl}</span>
                          </span>
                        )}
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-semibold text-slate-700 shrink-0">
                          CTA: {meta.ctaText || "Shop Now"}
                        </span>
                      </div>

                      {/* Control Actions */}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
                          onClick={() => moveOrder(item, "up")}
                          title="Move Order Up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-600 hover:bg-slate-100"
                          onClick={() => moveOrder(item, "down")}
                          title="Move Order Down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-slate-700 hover:bg-slate-100"
                          onClick={() => openEditDialog(item)}
                          title="Edit Banner"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => {
                            setDeletingItem(item)
                            setIsDeleteOpen(true)
                          }}
                          title="Delete Banner"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Dialog Form for Creating / Editing Banner */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Sparkles className="h-5 w-5 text-violet-600" />
              {editingItem ? "Edit E-Commerce Carousel Banner" : "Add New Carousel Banner"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            {/* Banner Mode Switch: Custom Images vs Product Showcase */}
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-1.5 flex gap-1">
              <button
                type="button"
                onClick={() => setBannerType("custom")}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  bannerType === "custom" ? "bg-white text-violet-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <ImageIcon className="h-4 w-4" />
                Custom Carousel Images
              </button>

              <button
                type="button"
                onClick={() => setBannerType("product_carousel")}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                  bannerType === "product_carousel" ? "bg-white text-violet-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Package className="h-4 w-4" />
                Select Products Images
              </button>
            </div>

            {/* Banner Title */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Banner Headline / Title *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer Super Sale, New Season Arrival" />
            </div>

            {/* Subtitle / Tagline */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Subtitle / Tagline</Label>
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="e.g. Exclusive Limited Time Automotive Deals" />
            </div>

            {/* Mode 1: Custom Multiple Images */}
            {bannerType === "custom" && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <Label className="text-xs font-semibold text-slate-800 flex items-center justify-between">
                  <span>Banner Carousel Images ({images.length})</span>
                  <span className="text-[11px] text-slate-500 font-normal">Add single or multiple slide images</span>
                </Label>

                {/* Upload or URL input */}
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <label className="flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-violet-300 bg-violet-50/50 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-100">
                      <Upload className="mr-1.5 h-4 w-4" />
                      Upload Image File
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <Input
                      value={newImageUrlInput}
                      onChange={(e) => setNewImageUrlInput(e.target.value)}
                      placeholder="Paste Image URL..."
                      className="h-9 text-xs"
                    />
                    <Button type="button" size="sm" className="h-9 shrink-0 bg-violet-600 text-white" onClick={handleAddImageUrl}>
                      Add URL
                    </Button>
                  </div>
                </div>

                {/* Images Preview Grid */}
                {images.length > 0 ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 pt-2">
                    {images.map((img, idx) => (
                      <div key={idx} className="relative aspect-[16/9] rounded-lg border border-slate-200 bg-slate-950 overflow-hidden group">
                        <Image src={img.url} alt="" fill unoptimized className="object-cover" />
                        <button
                          type="button"
                          onClick={() => handleRemoveImage(idx)}
                          className="absolute top-1 right-1 rounded-full bg-red-600 p-1 text-white opacity-90 hover:opacity-100"
                          title="Remove image"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          Slide #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    No images added yet. Upload an image file or paste an image URL above.
                  </div>
                )}
              </div>
            )}

            {/* Mode 2: Product Images Selector */}
            {bannerType === "product_carousel" && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold text-slate-800">Select Products for Carousel ({selectedProductIds.length} selected)</Label>
                  <div className="relative w-48">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      placeholder="Search products..."
                      className="h-8 pl-8 text-xs bg-white"
                    />
                  </div>
                </div>

                {loadingProducts ? (
                  <p className="py-6 text-center text-xs text-slate-500">Loading products catalog...</p>
                ) : filteredProducts.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-500">No products found.</p>
                ) : (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                    {filteredProducts.map((product) => {
                      const pId = Number(product.id)
                      const isSelected = selectedProductIds.includes(pId)
                      const pImg = product.image_url || (product.image_urls && product.image_urls[0]) || (product.images && product.images[0]) || ""

                      return (
                        <div
                          key={pId}
                          onClick={() => toggleProductSelection(product)}
                          className={cn(
                            "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all",
                            isSelected ? "border-violet-500 bg-violet-50/80" : "border-slate-200 bg-white hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="relative h-10 w-10 shrink-0 rounded-md border bg-slate-100 overflow-hidden">
                              {pImg ? (
                                <Image src={pImg} alt="" fill unoptimized className="object-cover" />
                              ) : (
                                <Package className="m-auto h-5 w-5 text-slate-400" />
                              )}
                            </div>

                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-900 truncate">{product.name}</p>
                              <p className="text-[11px] text-slate-500">
                                {product.category_name || "Uncategorized"} • {product.selling_price ? `₹${product.selling_price}` : "No price"}
                              </p>
                            </div>
                          </div>

                          <div
                            className={cn(
                              "h-5 w-5 rounded-full border flex items-center justify-center text-white shrink-0",
                              isSelected ? "bg-violet-600 border-violet-600" : "border-slate-300 bg-white"
                            )}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Description */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold text-slate-700">Description / Summary</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Brief summary or description for the banner slide."
              />
            </div>

            {/* Badge & CTA Config */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Highlight Badge Text</Label>
                <Input value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="e.g. HOT DEAL, 40% OFF, NEW" />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">CTA Button Text</Label>
                <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g. Shop Now, Explore" />
              </div>

              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-semibold text-slate-700">Target Link URL / Destination</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="e.g. /products or https://..." />
              </div>
            </div>

            {/* Theme & Sort Order */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 border-t pt-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Palette className="h-3.5 w-3.5 text-slate-500" />
                  Color Accent Theme
                </Label>
                <select
                  value={themeColor}
                  onChange={(e) => setThemeColor(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-xs"
                >
                  {COLOR_THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-slate-700">Sequence Display Order</Label>
                <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} placeholder="1, 2, 3..." />
              </div>
            </div>

            {/* Active Switch */}
            <div className="flex items-center space-x-2 border-t pt-3">
              <input
                type="checkbox"
                id="banner_is_active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
              />
              <label htmlFor="banner_is_active" className="text-xs font-semibold text-slate-800">
                Visible on E-Commerce Homepage Carousel
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {isSaving ? "Saving..." : editingItem ? "Update Banner" : "Create Banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete E-Commerce Banner</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingItem?.name}&quot;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isSaving} className="bg-red-600 hover:bg-red-700 text-white">
              {isSaving ? "Deleting..." : "Delete Banner"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
