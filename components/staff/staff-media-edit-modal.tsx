"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { updateStaffProductMedia } from "@/app/actions/staff-inventory-actions"
import { uploadProductFileFromClient } from "@/lib/blob-client-upload"
import {
  compressImageForUpload,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@/lib/media-upload-utils"
import {
  ImageIcon,
  Film,
  Upload,
  Trash2,
  Loader2,
  Plus,
  Package,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface StaffMediaEditModalProps {
  isOpen: boolean
  onClose: () => void
  product: any
  onSuccess?: (updatedProduct: any) => void
}

export default function StaffMediaEditModal({
  isOpen,
  onClose,
  product,
  onSuccess,
}: StaffMediaEditModalProps) {
  const { toast } = useToast()
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [isUploadingVideo, setIsUploadingVideo] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!product || !isOpen) return

    let urls: string[] = []
    if (Array.isArray(product.image_urls)) {
      urls = product.image_urls.filter(
        (url: unknown) => typeof url === "string" && url.trim().length > 0,
      ) as string[]
    } else if (typeof product.image_urls === "string" && product.image_urls.trim()) {
      try {
        const parsed = JSON.parse(product.image_urls)
        if (Array.isArray(parsed)) {
          urls = parsed.filter((url) => typeof url === "string" && url.trim().length > 0)
        }
      } catch {
        urls = []
      }
    }
    if (urls.length === 0 && product.image_url) {
      urls = [product.image_url]
    }
    setImageUrls(urls.slice(0, 4))

    const vUrl = typeof product.video_url === "string" && product.video_url.trim() ? product.video_url.trim() : null
    setVideoUrl(vUrl)
  }, [product, isOpen])

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length || !product) return

    const maxCanAdd = 4 - imageUrls.length
    if (maxCanAdd <= 0) {
      notifyError(toast, "Maximum 4 images allowed per product.", "Limit reached")
      if (imageInputRef.current) imageInputRef.current.value = ""
      return
    }

    const filesToUpload = files.slice(0, maxCanAdd)
    setIsUploadingImage(true)

    try {
      const newUrls: string[] = []
      for (const file of filesToUpload) {
        if (!file.type.startsWith("image/")) {
          notifyError(toast, `${file.name} is not a valid image file.`, "Invalid file")
          continue
        }

        const compressed = await compressImageForUpload(file)
        if (compressed.size > MAX_IMAGE_SIZE_BYTES) {
          notifyError(toast, `${file.name} exceeds 10MB limit after compression.`, "File too large")
          continue
        }

        const uploadedUrl = await uploadProductFileFromClient(compressed, product.name || "product", "image")
        if (uploadedUrl) {
          newUrls.push(uploadedUrl)
        }
      }

      if (newUrls.length > 0) {
        setImageUrls((prev) => [...prev, ...newUrls].slice(0, 4))
        notifySuccess(toast, `Uploaded ${newUrls.length} image${newUrls.length > 1 ? "s" : ""}.`)
      }
    } catch (error) {
      console.error("Staff image upload error:", error)
      notifyError(
        toast,
        error instanceof Error ? error.message : "Failed to upload image. Please try again.",
        "Upload failed",
      )
    } finally {
      setIsUploadingImage(false)
      if (imageInputRef.current) imageInputRef.current.value = ""
    }
  }

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !product) return

    if (!file.type.startsWith("video/")) {
      notifyError(toast, "Please select a valid video file (MP4, WebM, MOV).", "Invalid file")
      if (videoInputRef.current) videoInputRef.current.value = ""
      return
    }

    if (file.size > MAX_VIDEO_SIZE_BYTES) {
      notifyError(toast, "Video file exceeds 50MB limit.", "File too large")
      if (videoInputRef.current) videoInputRef.current.value = ""
      return
    }

    setIsUploadingVideo(true)
    try {
      const uploadedUrl = await uploadProductFileFromClient(file, product.name || "product", "video")
      if (uploadedUrl) {
        setVideoUrl(uploadedUrl)
        notifySuccess(toast, "Product video uploaded successfully.")
      }
    } catch (error) {
      console.error("Staff video upload error:", error)
      notifyError(
        toast,
        error instanceof Error ? error.message : "Failed to upload video.",
        "Upload failed",
      )
    } finally {
      setIsUploadingVideo(false)
      if (videoInputRef.current) videoInputRef.current.value = ""
    }
  }

  const handleRemoveImage = (index: number) => {
    setImageUrls((prev) => prev.filter((_, i) => i !== index))
  }

  const handleRemoveVideo = () => {
    setVideoUrl(null)
  }

  const handleSave = () => {
    if (!product) return

    startTransition(async () => {
      const res = await updateStaffProductMedia(product.id, imageUrls, videoUrl)
      if (res.success && res.product) {
        notifySuccess(toast, "Product photos and videos updated successfully.")
        if (onSuccess) {
          onSuccess(res.product)
        }
        onClose()
      } else {
        notifyError(toast, res.message || "Failed to update product media.")
      }
    })
  }

  if (!product) return null

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isUploadingImage && !isUploadingVideo && !isPending && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-2xl p-0 overflow-hidden bg-slate-50">
        {/* Header */}
        <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-white">
          <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-600" />
            Manage Product Media - {product.name}
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-0.5">
            Add or update photos and videos for this product in inventory
          </p>
        </DialogHeader>

        {/* Content Body */}
        <div className="p-4 sm:p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Photos Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <ImageIcon className="h-4 w-4 text-violet-600" />
                  Product Photos ({imageUrls.length}/4)
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload up to 4 high quality photos (PNG, JPG, WebP)
                </p>
              </div>
              {imageUrls.length < 4 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isUploadingImage || isPending}
                  onClick={() => imageInputRef.current?.click()}
                  className="h-8 border-violet-200 text-violet-700 hover:bg-violet-50"
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Add Photos
                </Button>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
            </div>

            {/* Photo Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              {imageUrls.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="relative group rounded-lg border border-slate-200 overflow-hidden bg-slate-100 aspect-square shadow-sm"
                >
                  <img
                    src={url}
                    alt={`Photo ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(idx)}
                      disabled={isPending}
                      className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-colors shadow"
                      title="Delete photo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  {idx === 0 && (
                    <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] font-medium px-1.5 py-0.5 rounded backdrop-blur-sm">
                      Primary
                    </span>
                  )}
                </div>
              ))}

              {imageUrls.length < 4 && (
                <button
                  type="button"
                  disabled={isUploadingImage || isPending}
                  onClick={() => imageInputRef.current?.click()}
                  className={cn(
                    "flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 p-4 text-slate-400 hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-600 transition-colors aspect-square",
                    isUploadingImage && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-6 w-6 animate-spin text-violet-600 mb-1" />
                  ) : (
                    <Upload className="h-6 w-6 mb-1" />
                  )}
                  <span className="text-[11px] font-medium text-center">
                    {isUploadingImage ? "Uploading..." : "Click to upload"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Video Section */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Film className="h-4 w-4 text-indigo-600" />
                  Product Video
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Upload a demonstration or showcase video (MP4, WebM, max 50MB)
                </p>
              </div>
              {!videoUrl && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isUploadingVideo || isPending}
                  onClick={() => videoInputRef.current?.click()}
                  className="h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                >
                  {isUploadingVideo ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Add Video
                </Button>
              )}
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleVideoSelect}
              />
            </div>

            {videoUrl ? (
              <div className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-900 pt-2">
                <video controls className="w-full max-h-48 rounded-b-lg object-contain">
                  <source src={videoUrl} />
                  Your browser does not support the video tag.
                </video>
                <div className="absolute top-2 right-2 z-10">
                  <button
                    type="button"
                    onClick={handleRemoveVideo}
                    disabled={isPending}
                    className="p-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 transition-colors shadow"
                    title="Remove video"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isUploadingVideo || isPending}
                onClick={() => videoInputRef.current?.click()}
                className={cn(
                  "w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50/50 py-6 text-slate-400 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 transition-colors",
                  isUploadingVideo && "opacity-50 cursor-not-allowed"
                )}
              >
                {isUploadingVideo ? (
                  <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
                ) : (
                  <Film className="h-5 w-5" />
                )}
                <span className="text-xs font-medium">
                  {isUploadingVideo ? "Uploading video..." : "Click to select product video"}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t bg-slate-50 px-6 py-4 flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isUploadingImage || isUploadingVideo || isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isUploadingImage || isUploadingVideo || isPending}
            onClick={handleSave}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving Changes...
              </>
            ) : (
              "Save Media Changes"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
