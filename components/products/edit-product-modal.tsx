"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ScrollableContent } from "@/components/ui/custom-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { cleanupProductMediaUrls, updateProduct } from "@/app/actions/product-actions"
import { getCategories, createCategory } from "@/app/actions/category-actions"
import { Check, ChevronRight, Loader2, Plus, Search, Tag, X, ImageIcon, Link2, Trash2, Film } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { getDeviceCurrency } from "@/app/actions/dashboard-actions"
import { FormError } from "@/components/ui/form-error"
import {
  compressImageForUpload,
  formatBytes,
  MAX_IMAGE_SIZE_BYTES,
  MAX_TOTAL_MEDIA_PAYLOAD_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/media-upload-utils"
import { uploadProductFileFromClient } from "@/lib/blob-client-upload"

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
}

interface EditProductModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (product: any) => void
  product: Product | null
  userId?: number
}

export default function EditProductModal({ isOpen, onClose, onSuccess, product, userId }: EditProductModalProps) {
  const { toast } = useToast()
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
    link: "",
  })
  const [attributes, setAttributes] = useState<AttributeEntry[]>([])
  const [platformStatus, setPlatformStatus] = useState<Record<PlatformKey, PlatformStatus>>({
    amazon: "not_listed",
    flipkart: "not_listed",
    meesho: "not_listed",
    own_ecom: "not_listed",
  })

  const [categories, setCategories] = useState<Category[]>([])
  const [filteredCategories, setFilteredCategories] = useState<Category[]>([])
  const [isLoadingCategories, setIsLoadingCategories] = useState(false)
  const [categorySearchQuery, setCategorySearchQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [isAddingNewCategory, setIsAddingNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState("")
  const [newCategoryParentId, setNewCategoryParentId] = useState<number | null>(null)
  const categorySearchInputRef = useRef<HTMLInputElement>(null)
  const newCategoryInputRef = useRef<HTMLInputElement>(null)

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
        link: product.link || "",
      })
      setAttributes(parseAttributes(product.attributes))
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
      const shouldDiscard = window.confirm(
        "Are you sure? Unsaved uploaded media will be removed from cloud storage.",
      )
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
      toast({
        title: "Unsaved media present",
        description: "Discard and remove uploaded media before reloading.",
        variant: "destructive",
      })
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
        toast({ title: "Error", description: result.message || "Failed to load categories", variant: "destructive" })
      }
    } catch (error) {
      console.error("Error fetching categories:", error)
      toast({ title: "Error", description: "Failed to load categories", variant: "destructive" })
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
      toast({ title: "Limit reached", description: message, variant: "destructive" })
      if (imageInputRef.current) imageInputRef.current.value = ""
      return
    }

    if (files.length > maxCanAdd) {
      toast({
        title: "Image limit reached",
        description: `Only ${maxCanAdd} more image${maxCanAdd === 1 ? "" : "s"} can be selected.`,
        variant: "destructive",
      })
    }

    const accepted: File[] = []
    const previews: string[] = []
    for (const file of files.slice(0, maxCanAdd)) {
      if (!file.type.startsWith("image/")) {
        const message = `${file.name} is not an image.`
        setError(message)
        toast({ title: "Invalid file", description: message, variant: "destructive" })
        continue
      }
      const processedImage = await compressImageForUpload(file)
      if (processedImage.size > MAX_IMAGE_SIZE_BYTES) {
        const message = `${file.name} exceeds 10MB even after compression.`
        setError(message)
        toast({
          title: "Too large",
          description: message,
          variant: "destructive",
        })
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
      toast({ title: "Invalid file", description: message, variant: "destructive" })
      if (videoInputRef.current) videoInputRef.current.value = ""
      return
    }
    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      const message = "Video must be under 50MB."
      setError(message)
      toast({ title: "Too large", description: message, variant: "destructive" })
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
      toast({ title: "Uploaded", description: "Selected media uploaded successfully." })
    } catch (error) {
      console.error("Media upload failed:", error)
      const message = error instanceof Error ? error.message : "Failed to upload selected media. Please try again."
      toast({
        title: "Upload failed",
        description: message,
        variant: "destructive",
      })
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

  const parentCategories = categories.filter((c) => !c.parent_id)
  const childrenOf = (parentId: number) => categories.filter((c) => c.parent_id === parentId)

  const getCategoryDisplayName = (cat: Category) => {
    if (cat.parent_name) return `${cat.parent_name} › ${cat.name}`
    return cat.name
  }

  const handleAddNewCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({ title: "Error", description: "Category name cannot be empty", variant: "destructive" })
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
        toast({ title: "Success", description: `Category "${result.data.name}" added successfully` })
        setNewCategoryName("")
        setNewCategoryParentId(null)
        setIsAddingNewCategory(false)
        setIsCategoryDialogOpen(false)
      } else {
        toast({ title: "Error", description: result.message || "Failed to add category", variant: "destructive" })
      }
    } catch (error) {
      console.error("Error adding category:", error)
      toast({ title: "Error", description: "An unexpected error occurred", variant: "destructive" })
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
    setIsCategoryDialogOpen(false)
    toast({ title: "Category Selected", description: `"${getCategoryDisplayName(category)}" has been selected`, duration: 2000 })
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
      if (!formData.wholesalePrice) errors.wholesalePrice = "Cost price is required"
      if (!formData.stock) errors.stock = "Stock is required"

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
      submitFormData.append("link", formData.link)
      const validAttributes = attributes.filter((a) => a.key.trim() && a.value.trim())
      submitFormData.append("attributes", JSON.stringify(validAttributes))
      submitFormData.append("amazon_status", platformStatus.amazon)
      submitFormData.append("flipkart_status", platformStatus.flipkart)
      submitFormData.append("meesho_status", platformStatus.meesho)
      submitFormData.append("own_ecom_status", platformStatus.own_ecom)
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
        toast({ title: "Success", description: "Product updated successfully" })
        setUploadedImageUrls([])
        setUploadedVideoUrl(null)
        if (onSuccess) onSuccess(result.data)
        onClose()
      } else {
        if (result?.field) {
          setFieldErrors({ [result.field]: result.error || result.message })
        } else {
          const message = result?.error || result?.message || "Failed to update product. Please try again."
          setError(message)
          toast({ title: "Error", description: message, variant: "destructive" })
        }
      }
    } catch (error) {
      console.error("Error updating product:", error)
      const message = error instanceof Error ? error.message : String(error)
      setError(message)
      toast({ title: "Error", description: message, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!product) return null

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) void handleAttemptClose()
        }}
      >
        <DialogContent className="sm:max-w-md p-0 max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700">
          <ScrollableContent className="p-6 overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-gray-100">Edit Product</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="grid gap-4">
                {/* Product Media */}
                <div className="grid gap-2">
                  <Label className="text-gray-700 dark:text-gray-300">Product Media</Label>
                  <div className="flex flex-col gap-2">
                    {(currentImageUrls.length > 0 || uploadedImageUrls.length > 0 || imagePreviews.length > 0) && (
                      <div className="grid grid-cols-2 gap-2">
                        {currentImageUrls.map((url, index) => (
                          <div key={`current-${index}`} className="relative">
                            <img src={url} alt={`Current product ${index + 1}`} className="w-full h-24 object-cover rounded-md border border-gray-300 dark:border-gray-600" />
                            <Button type="button" variant="destructive" size="sm" onClick={() => removeCurrentImageAt(index)} className="absolute top-1 right-1 h-6 w-6 p-0"><X className="h-3 w-3" /></Button>
                          </div>
                        ))}
                        {uploadedImageUrls.map((url, index) => (
                          <div key={`uploaded-${index}`} className="relative">
                            <img src={url} alt={`Uploaded product ${index + 1}`} className="w-full h-24 object-cover rounded-md border border-green-400" />
                            <Button type="button" variant="destructive" size="sm" onClick={() => void removeUploadedImageAt(index)} className="absolute top-1 right-1 h-6 w-6 p-0"><X className="h-3 w-3" /></Button>
                            <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[10px] px-1.5 py-0.5 rounded">Uploaded</div>
                          </div>
                        ))}
                        {imagePreviews.map((preview, index) => (
                          <div key={`new-${index}`} className="relative">
                            <img src={preview} alt={`New product ${index + 1}`} className="w-full h-24 object-cover rounded-md border border-blue-400" />
                            <Button type="button" variant="destructive" size="sm" onClick={() => removeNewImageAt(index)} className="absolute top-1 right-1 h-6 w-6 p-0"><X className="h-3 w-3" /></Button>
                            <div className="absolute bottom-1 left-1 bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded">Selected</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {currentImageUrls.length + uploadedImageUrls.length + selectedImages.length < 4 && (
                      <div onClick={() => imageInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                        <ImageIcon className="h-6 w-6 text-gray-400 dark:text-gray-500 mb-1" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">Add Image ({currentImageUrls.length + uploadedImageUrls.length + selectedImages.length}/4)</p>
                      </div>
                    )}
                    <input ref={imageInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
                  </div>

                  <div className="flex flex-col gap-2 mt-2">
                    {(videoPreview || uploadedVideoUrl || currentVideoUrl) ? (
                      <div className="relative">
                        <video controls className="w-full h-32 rounded-md border border-gray-300 dark:border-gray-600">
                          <source src={videoPreview || uploadedVideoUrl || currentVideoUrl || ""} />
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
                          className="absolute top-2 right-2"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                        {videoPreview && <div className="absolute bottom-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded">Selected</div>}
                        {!videoPreview && uploadedVideoUrl && <div className="absolute bottom-2 left-2 bg-green-600 text-white text-xs px-2 py-1 rounded">Uploaded</div>}
                      </div>
                    ) : (
                      <div onClick={() => videoInputRef.current?.click()} className="w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
                        <Film className="h-6 w-6 text-gray-400 dark:text-gray-500 mb-1" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">Add Video (optional)</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">Max 50MB</p>
                      </div>
                    )}
                    <input ref={videoInputRef} type="file" accept="video/*" onChange={handleVideoSelect} className="hidden" />
                  </div>

                  {(selectedImages.length > 0 || selectedVideo) && (
                    <Button
                      type="button"
                      onClick={handleUploadSelectedMedia}
                      disabled={isUploadingMedia}
                      className="w-full mt-2 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {isUploadingMedia ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Uploading Media...
                        </>
                      ) : (
                        "Upload Selected Media"
                      )}
                    </Button>
                  )}
                </div>

                <div className="grid gap-2">
                  <Label className="text-gray-700 dark:text-gray-300">Marketplace Availability</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Active means currently selling. Archived means listed before but intentionally paused.
                  </p>
                  <div className="space-y-2">
                    {PLATFORM_OPTIONS.map((platform) => (
                      <div
                        key={platform.key}
                        className="rounded-md border border-gray-200 dark:border-gray-700 p-2 bg-gray-50 dark:bg-gray-900/30"
                      >
                        <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">{platform.label}</div>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { value: "not_listed" as PlatformStatus, label: "Not Listed" },
                            { value: "active" as PlatformStatus, label: "Active" },
                            { value: "archived" as PlatformStatus, label: "Archived" },
                          ].map((option) => {
                            const isActive = platformStatus[platform.key] === option.value
                            return (
                              <Button
                                key={option.value}
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  setPlatformStatus((prev) => ({
                                    ...prev,
                                    [platform.key]: option.value,
                                  }))
                                }
                                className={`text-xs ${
                                  isActive
                                    ? "border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20"
                                    : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                                }`}
                              >
                                {option.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Link */}
                <div className="grid gap-2">
                  <Label htmlFor="link" className="text-gray-700 dark:text-gray-300">
                    <span className="flex items-center gap-1"><Link2 className="h-3.5 w-3.5" /> Product Link</span>
                  </Label>
                  <Input id="link" name="link" value={formData.link} onChange={handleChange} placeholder="https://..." className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                </div>

                {/* Name */}
                <div className="grid gap-2">
                  <Label htmlFor="name" className="text-gray-700 dark:text-gray-300">Product Name *</Label>
                  <Input id="name" name="name" value={formData.name} onChange={handleChange} placeholder="Enter product name" required className={`bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${fieldErrors.name ? "border-red-500 dark:border-red-400" : ""}`} />
                  <FormError message={fieldErrors.name || ""} />
                </div>

                {/* Company Name */}
                <div className="grid gap-2">
                  <Label htmlFor="companyName" className="text-gray-700 dark:text-gray-300">Company / Brand</Label>
                  <Input id="companyName" name="companyName" value={formData.companyName} onChange={handleChange} placeholder="Enter company or brand name" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                </div>

                {/* Category */}
                <div className="grid gap-2">
                  <Label htmlFor="category" className="text-gray-700 dark:text-gray-300">Category *</Label>
                  <div className="flex gap-2 items-center">
                    <Button type="button" variant="outline" className="w-full justify-between bg-white dark:bg-gray-700 text-left border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-600" onClick={() => setIsCategoryDialogOpen(true)}>
                      {selectedCategory ? (
                        <span className="flex items-center gap-2"><Tag className="h-4 w-4" />{getCategoryDisplayName(selectedCategory)}</span>
                      ) : "Select category..."}
                      <ChevronRight className="h-4 w-4 opacity-50" />
                    </Button>
                  </div>
                  {selectedCategory && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">Selected: <Badge variant="outline" className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300">{getCategoryDisplayName(selectedCategory)}</Badge></p>
                  )}
                </div>

                {/* Description */}
                <div className="grid gap-2">
                  <Label htmlFor="description" className="text-gray-700 dark:text-gray-300">Description</Label>
                  <Textarea id="description" name="description" value={formData.description} onChange={handleChange} placeholder="Enter product description" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" rows={3} />
                </div>

                {/* Price Fields */}
                <div className="grid grid-cols-1 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="wholesalePrice" className="text-gray-700 dark:text-gray-300">Cost Price ({currency}) *</Label>
                    <Input id="wholesalePrice" name="wholesalePrice" type="number" step="0.01" min="0" value={formData.wholesalePrice} onChange={handleChange} placeholder="0.00" className={`bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${fieldErrors.wholesalePrice ? "border-red-500 dark:border-red-400" : ""}`} />
                    <FormError message={fieldErrors.wholesalePrice || ""} />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="msp" className="text-gray-700 dark:text-gray-300">MSP - Minimum Selling Price ({currency})</Label>
                    <Input id="msp" name="msp" type="number" step="0.01" min="0" value={formData.msp} onChange={handleChange} placeholder="0.00" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="price" className="text-gray-700 dark:text-gray-300">MRP ({currency}) *</Label>
                    <Input id="price" name="price" type="number" step="0.01" min="0" value={formData.price} onChange={handleChange} placeholder="0.00" required className={`bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${fieldErrors.price ? "border-red-500 dark:border-red-400" : ""}`} />
                    <FormError message={fieldErrors.price || ""} />
                  </div>
                </div>

                {/* Stock & Shelf */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="stock" className="text-gray-700 dark:text-gray-300">Stock *</Label>
                    <Input id="stock" name="stock" type="number" min="0" value={formData.stock} onChange={handleChange} onFocus={(e) => e.target.select()} placeholder="0" className={`bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${fieldErrors.stock ? "border-red-500 dark:border-red-400" : ""}`} />
                    <FormError message={fieldErrors.stock || ""} />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="shelf" className="text-gray-700 dark:text-gray-300">Shelf</Label>
                    <Input id="shelf" name="shelf" value={formData.shelf} onChange={handleChange} placeholder="e.g. A1, B3" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                  </div>
                </div>

                {/* Barcode */}
                <div className="grid gap-2">
                  <Label htmlFor="barcode" className="text-gray-700 dark:text-gray-300">Barcode + Code</Label>
                  <Input id="barcode" name="barcode" value={formData.barcode} onChange={handleChange} placeholder="Enter or scan barcode" className={`bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${fieldErrors.barcode ? "border-red-500 dark:border-red-400" : ""}`} />
                  <FormError message={fieldErrors.barcode || ""} />
                </div>

                {/* Attributes */}
                <div className="grid gap-2">
                  <Label className="text-gray-700 dark:text-gray-300">Attributes (Model, Year, etc.)</Label>
                  <div className="space-y-2">
                    {attributes.map((attr, index) => (
                      <div key={index} className="flex gap-2 items-center">
                        <Input value={attr.key} onChange={(e) => handleAttributeChange(index, "key", e.target.value)} placeholder="e.g. Model" className="flex-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 text-sm h-9" />
                        <Input value={attr.value} onChange={(e) => handleAttributeChange(index, "value", e.target.value)} placeholder="e.g. CBR600" className="flex-1 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 text-sm h-9" />
                        <Button type="button" variant="ghost" size="sm" onClick={() => handleRemoveAttribute(index)} className="h-9 w-9 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" onClick={handleAddAttribute} className="w-full border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent">
                      <Plus className="h-4 w-4 mr-1" /> Add Attribute
                    </Button>
                  </div>
                </div>

                {/* Suitable For */}
                <div className="grid gap-2">
                  <Label htmlFor="suitableFor" className="text-gray-700 dark:text-gray-300">Suitable For (Optional)</Label>
                  <Input id="suitableFor" name="suitableFor" value={formData.suitableFor} onChange={handleChange} placeholder="e.g. Honda CBR, Yamaha R15" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                </div>

                {/* Colour & Size */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="color" className="text-gray-700 dark:text-gray-300">Colour (Optional)</Label>
                    <Input id="color" name="color" value={formData.color} onChange={handleChange} placeholder="e.g. Red, Black" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="size" className="text-gray-700 dark:text-gray-300">Size (Optional)</Label>
                    <Input id="size" name="size" value={formData.size} onChange={handleChange} placeholder="e.g. M, L, XL" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleAttemptClose()}
                  className="w-full sm:w-auto border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || isUploadingMedia}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</>) : "Update Product"}
                </Button>
              </DialogFooter>
            </form>
          </ScrollableContent>
        </DialogContent>
      </Dialog>

      {/* Category Selection Dialog with Hierarchy */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 max-h-[90vh] overflow-hidden flex flex-col bg-white dark:bg-gray-800 border dark:border-gray-700">
          <DialogHeader className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-gray-900 dark:text-gray-100">Select Category</DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => setIsCategoryDialogOpen(false)} className="h-8 w-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X className="h-4 w-4" /></Button>
            </div>
          </DialogHeader>

          {isAddingNewCategory ? (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Add New Category</h3>
                <div className="grid gap-2">
                  <Label className="text-xs text-gray-600 dark:text-gray-400">Parent Category (optional)</Label>
                  <select
                    value={newCategoryParentId || ""}
                    onChange={(e) => setNewCategoryParentId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full h-9 px-3 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="">None (Top-level)</option>
                    {parentCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Input ref={newCategoryInputRef} value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="Enter category name" className="bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 flex-1" />
                  <Button type="button" onClick={handleAddNewCategory} disabled={!newCategoryName.trim() || isSubmitting} className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => { setIsAddingNewCategory(false); setNewCategoryParentId(null) }} className="border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input ref={categorySearchInputRef} value={categorySearchQuery} onChange={(e) => setCategorySearchQuery(e.target.value)} placeholder="Search categories..." className="pl-9 pr-4 py-2 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400" />
                {categorySearchQuery && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setCategorySearchQuery("")} className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"><X className="h-4 w-4" /></Button>
                )}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-1">
            {isLoadingCategories ? (
              <div className="py-8 flex flex-col items-center justify-center text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="h-6 w-6 animate-spin mb-2" />
                <p>Loading categories...</p>
              </div>
            ) : (
              !isAddingNewCategory && (
                <>
                  {categorySearchQuery.trim() ? (
                    filteredCategories.length > 0 ? (
                      <div className="grid gap-1 p-2">
                        {filteredCategories.map((category) => (
                          <Button key={category.id} type="button" variant="ghost"
                            className={`w-full justify-start text-left h-auto py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 ${selectedCategory?.id === category.id ? "bg-gray-100 dark:bg-gray-700" : ""}`}
                            onClick={() => handleCategorySelect(category)}>
                            <div className="flex items-center justify-between w-full">
                              <div className="flex items-center gap-2">
                                <Tag className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <span>{getCategoryDisplayName(category)}</span>
                              </div>
                              {selectedCategory?.id === category.id && <Check className="h-4 w-4 text-green-600 dark:text-green-400" />}
                            </div>
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        <p>No categories found</p>
                      </div>
                    )
                  ) : (
                    categories.length > 0 ? (
                      <div className="p-2 space-y-1">
                        {parentCategories.map((parent) => {
                          const children = childrenOf(parent.id)
                          return (
                            <div key={parent.id}>
                              <Button type="button" variant="ghost"
                                className={`w-full justify-start text-left h-auto py-3 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium ${selectedCategory?.id === parent.id ? "bg-gray-100 dark:bg-gray-700" : ""}`}
                                onClick={() => handleCategorySelect(parent)}>
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-2">
                                    <Tag className="h-4 w-4 text-blue-500 dark:text-blue-400" />
                                    <span>{parent.name}</span>
                                  </div>
                                  {selectedCategory?.id === parent.id && <Check className="h-4 w-4 text-green-600 dark:text-green-400" />}
                                </div>
                              </Button>
                              {children.length > 0 && (
                                <div className="ml-6 border-l-2 border-gray-200 dark:border-gray-600 pl-2 space-y-1">
                                  {children.map((child) => {
                                    const grandchildren = childrenOf(child.id)
                                    return (
                                      <div key={child.id}>
                                        <Button type="button" variant="ghost"
                                          className={`w-full justify-start text-left h-auto py-2 text-gray-800 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm ${selectedCategory?.id === child.id ? "bg-gray-100 dark:bg-gray-700" : ""}`}
                                          onClick={() => handleCategorySelect(child)}>
                                          <div className="flex items-center justify-between w-full">
                                            <div className="flex items-center gap-2">
                                              <Tag className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500" />
                                              <span>{child.name}</span>
                                            </div>
                                            {selectedCategory?.id === child.id && <Check className="h-4 w-4 text-green-600 dark:text-green-400" />}
                                          </div>
                                        </Button>
                                        {grandchildren.length > 0 && (
                                          <div className="ml-4 border-l-2 border-gray-100 dark:border-gray-700 pl-2 space-y-1">
                                            {grandchildren.map((gc) => (
                                              <Button key={gc.id} type="button" variant="ghost"
                                                className={`w-full justify-start text-left h-auto py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs ${selectedCategory?.id === gc.id ? "bg-gray-100 dark:bg-gray-700" : ""}`}
                                                onClick={() => handleCategorySelect(gc)}>
                                                <div className="flex items-center justify-between w-full">
                                                  <div className="flex items-center gap-2">
                                                    <Tag className="h-3 w-3 text-gray-300 dark:text-gray-600" />
                                                    <span>{gc.name}</span>
                                                  </div>
                                                  {selectedCategory?.id === gc.id && <Check className="h-4 w-4 text-green-600 dark:text-green-400" />}
                                                </div>
                                              </Button>
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
                      </div>
                    ) : (
                      <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                        <p>No categories found</p>
                      </div>
                    )
                  )}
                </>
              )
            )}
          </div>

          {!isAddingNewCategory && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <Button type="button" variant="outline" className="w-full border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 bg-transparent" onClick={() => setIsAddingNewCategory(true)}>
                <Plus className="h-4 w-4 mr-2" /> Add New Category
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
