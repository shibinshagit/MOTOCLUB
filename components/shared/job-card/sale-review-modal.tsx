"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { 
  getSaleReview, 
  saveSaleReview, 
  deleteReviewMediaFile, 
  ReviewMediaItem, 
  SaleReviewRecord 
} from "@/app/actions/review-actions"
import { uploadReviewFileFromClient } from "@/lib/blob-client-upload"
import { 
  Loader2, 
  Upload, 
  Image as ImageIcon, 
  Video, 
  Trash2, 
  CheckCircle2, 
  Star, 
  Phone, 
  User, 
  Play, 
  X,
  FileCheck2
} from "lucide-react"

interface SaleReviewModalProps {
  isOpen: boolean
  onClose: () => void
  sale: any
  onSaved?: () => void
}

export function SaleReviewModal({ isOpen, onClose, sale, onSaved }: SaleReviewModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgressText, setUploadProgressText] = useState("")

  const [reviewId, setReviewId] = useState<number | null>(null)
  const [reviewText, setReviewText] = useState("")
  const [mediaList, setMediaList] = useState<ReviewMediaItem[]>([])
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [staffName, setStaffName] = useState<string | null>(null)

  // Active video preview in modal
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen || !sale?.id) return

    let isMounted = true
    setLoading(true)
    setReviewText("")
    setMediaList([])
    setReviewId(null)
    setUpdatedAt(null)
    setStaffName(null)

    getSaleReview(sale.id)
      .then((res) => {
        if (!isMounted) return
        if (res.success && res.review) {
          setReviewId(res.review.id)
          setReviewText(res.review.review_text || "")

          const rawMedia = res.review.media_urls
          let parsedMedia: ReviewMediaItem[] = []
          if (Array.isArray(rawMedia)) {
            parsedMedia = rawMedia
          } else if (typeof rawMedia === "string") {
            try {
              const p = JSON.parse(rawMedia)
              parsedMedia = Array.isArray(p) ? p : []
            } catch (_) {}
          }
          setMediaList(parsedMedia)

          setUpdatedAt(res.review.updated_at || null)
          setStaffName(res.review.staff_name || null)
        }
      })
      .catch((err) => {
        console.error("Failed to load review:", err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [isOpen, sale?.id])

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const fileArray = Array.from(files)
    const total = fileArray.length
    let completed = 0

    const newMediaItems: ReviewMediaItem[] = []

    try {
      for (const file of fileArray) {
        const isVideo = file.type.startsWith("video/")
        const isImage = file.type.startsWith("image/")

        if (!isVideo && !isImage) {
          toast({
            title: "Unsupported file",
            description: `${file.name} is not an image or video.`,
            variant: "destructive",
          })
          continue
        }

        // 10MB limit for image, 50MB for video
        if (isImage && file.size > 10 * 1024 * 1024) {
          toast({
            title: "Image too large",
            description: `${file.name} exceeds 10MB limit.`,
            variant: "destructive",
          })
          continue
        }

        if (isVideo && file.size > 50 * 1024 * 1024) {
          toast({
            title: "Video too large",
            description: `${file.name} exceeds 50MB limit.`,
            variant: "destructive",
          })
          continue
        }

        setUploadProgressText(`Uploading ${completed + 1} of ${total}: ${file.name}...`)

        const type: "image" | "video" = isVideo ? "video" : "image"
        const uploadedUrl = await uploadReviewFileFromClient(file, sale.id, type)

        newMediaItems.push({
          url: uploadedUrl,
          type,
          name: file.name,
          size: file.size,
        })

        completed++
      }

      if (newMediaItems.length > 0) {
        setMediaList((prev) => [...prev, ...newMediaItems])
        toast({
          title: "Files uploaded",
          description: `Successfully uploaded ${newMediaItems.length} media file(s).`,
        })
      }
    } catch (error: any) {
      console.error("Upload failed:", error)
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload file to Blob storage.",
        variant: "destructive",
      })
    } finally {
      setUploading(false)
      setUploadProgressText("")
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleRemoveMedia = async (index: number) => {
    const itemToRemove = mediaList[index]
    setMediaList((prev) => prev.filter((_, idx) => idx !== index))

    // Optional background delete from blob storage
    if (itemToRemove?.url) {
      deleteReviewMediaFile(itemToRemove.url).catch(() => {})
    }
  }

  const handleSave = async () => {
    if (!sale?.id) return

    setSaving(true)
    try {
      const res = await saveSaleReview({
        saleId: sale.id,
        reviewText: reviewText.trim(),
        mediaUrls: mediaList,
      })

      if (res.success) {
        const count = mediaList.length
        const mediaMsg = count > 0 ? ` with ${count} media file${count > 1 ? "s" : ""}` : ""
        toast({
          title: reviewId ? "Review updated" : "Review saved",
          description: `Customer review${mediaMsg} saved successfully.`,
        })
        onSaved?.()
        onClose()
      } else {
        toast({
          title: "Failed to save review",
          description: res.message || "An error occurred while saving.",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Save review error:", error)
      toast({
        title: "Error",
        description: error.message || "Failed to save review.",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  if (!sale) return null

  const customerName = sale.customer_name || "Customer"
  const customerPhone = sale.customer_phone || ""

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-6 pb-4 border-b bg-slate-50/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                <Star className="h-5 w-5 fill-amber-500 text-amber-600" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-slate-900">
                  {reviewId ? `Edit Review - Job Card #${sale.id}` : `Add Review - Job Card #${sale.id}`}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  Job Card #{sale.id} • Delivered Order
                </DialogDescription>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Delivered</span>
            </div>
          </div>

          {/* Quick info bar */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-blue-700 font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                Job Card #{sale.id}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-700 truncate">
              <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <span className="font-semibold">{customerName}</span>
              {customerPhone && (
                <span className="text-slate-500 flex items-center gap-1">
                  • <Phone className="h-3 w-3 text-slate-400" /> {customerPhone}
                </span>
              )}
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
            <span className="text-sm">Loading review...</span>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Review Text */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-slate-800 flex items-center justify-between">
                <span>Review / Feedback Remarks</span>
                {updatedAt && (
                  <span className="text-[11px] font-normal text-slate-400">
                    Last saved: {new Date(updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {staffName ? ` by ${staffName}` : ""}
                  </span>
                )}
              </label>
              <Textarea
                placeholder="Write customer feedback, comments, experience, or testimonial..."
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />
            </div>

            {/* Media Upload (Images & Videos) */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-slate-800">Review Photos & Videos</h4>
                  <p className="text-xs text-slate-500">
                    Upload delivery photos, customer video testimonials, or installation clips
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || saving}
                  className="gap-1.5 text-xs text-slate-700 hover:text-slate-900 border-slate-300"
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 text-amber-600" />
                  )}
                  <span>Upload Media</span>
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>

              {/* Uploading progress notification */}
              {uploading && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-xs text-amber-800">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-600 shrink-0" />
                  <span className="font-medium">{uploadProgressText || "Uploading media to Blob storage..."}</span>
                </div>
              )}

              {/* Uploaded Media Grid */}
              {mediaList.length === 0 && !uploading ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-amber-300 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50 hover:bg-amber-50/30"
                >
                  <div className="flex items-center justify-center gap-2 mb-2 text-slate-400">
                    <ImageIcon className="h-6 w-6" />
                    <Video className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">No media attached yet</p>
                  <p className="text-xs text-slate-400 mt-1">
                    Click to browse and upload images (up to 10MB) or videos (up to 50MB)
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {mediaList.map((item, idx) => (
                    <div
                      key={idx}
                      className="group relative rounded-lg border border-slate-200 bg-slate-900 overflow-hidden aspect-video flex items-center justify-center shadow-sm"
                    >
                      {item.type === "video" ? (
                        <>
                          <video
                            src={item.url}
                            className="w-full h-full object-cover opacity-80"
                            preload="metadata"
                          />
                          <button
                            type="button"
                            onClick={() => setPreviewVideoUrl(item.url)}
                            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
                            title="Play Video"
                          >
                            <div className="h-10 w-10 rounded-full bg-white/90 text-slate-900 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                              <Play className="h-5 w-5 fill-slate-900 ml-0.5" />
                            </div>
                          </button>
                          <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                            <Video className="h-3 w-3" />
                            <span>Video</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <img
                            src={item.url}
                            alt={item.name || `Review photo ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-1.5 left-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1 font-medium">
                            <ImageIcon className="h-3 w-3" />
                            <span>Image</span>
                          </div>
                        </>
                      )}

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveMedia(idx)
                        }}
                        className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow opacity-90 hover:opacity-100 transition-opacity"
                        title="Remove file"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="p-4 border-t bg-slate-50 flex items-center justify-between sm:justify-between">
          <div className="text-xs text-slate-500">
            {mediaList.length} media file{mediaList.length === 1 ? "" : "s"} attached
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={saving || uploading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={saving || uploading || loading}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5 shadow-sm"
            >
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <FileCheck2 className="h-4 w-4" />
                  <span>{reviewId ? "Update Review" : "Save Review"}</span>
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      {/* Video Preview Popup Dialog */}
      {previewVideoUrl && (
        <Dialog open={!!previewVideoUrl} onOpenChange={() => setPreviewVideoUrl(null)}>
          <DialogContent className="max-w-3xl p-2 bg-black border-slate-800">
            <video
              src={previewVideoUrl}
              controls
              autoPlay
              className="w-full max-h-[80vh] rounded"
            />
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  )
}

