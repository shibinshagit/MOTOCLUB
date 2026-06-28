"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { ImageIcon, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { updatePlatformBranding } from "@/app/actions/brand-actions"
import { useBranding } from "@/components/branding-provider"
import {
  compressBrandingIconForUpload,
  compressBrandingLogoForUpload,
  formatBytes,
} from "@/lib/media-upload-utils"
import {
  ADMIN_DIALOG_LABEL_CLASS,
  ADMIN_DIALOG_SCROLL_CLASS,
} from "@/lib/staff-restrictions"

interface BrandingSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

function BrandingUploadField({
  label,
  description,
  currentUrl,
  previewUrl,
  onFileChange,
  onRemove,
}: {
  label: string
  description: string
  currentUrl: string | null
  previewUrl: string | null
  onFileChange: (file: File | null) => void
  onRemove: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayUrl = previewUrl || currentUrl

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <Label className={ADMIN_DIALOG_LABEL_CLASS}>{label}</Label>
        <p className="mt-1 text-xs text-gray-500">{description}</p>
      </div>

      <div className="flex min-h-[96px] items-center justify-center rounded-md border border-dashed border-gray-300 bg-white p-4">
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={label}
            width={220}
            height={80}
            className="max-h-20 w-auto object-contain"
            unoptimized={displayUrl.includes("blob.vercel-storage.com")}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">No image uploaded</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0] || null
            onFileChange(file)
          }}
        />
        <Button type="button" variant="outline" className="border-gray-200 bg-white" onClick={() => inputRef.current?.click()}>
          {displayUrl ? "Replace image" : "Upload image"}
        </Button>
        {displayUrl ? (
          <Button type="button" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50" onClick={onRemove}>
            <Trash2 className="mr-1 h-4 w-4" />
            Remove
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export default function BrandingSettingsDialog({ open, onOpenChange }: BrandingSettingsDialogProps) {
  const { toast } = useToast()
  const { branding, refreshBranding } = useBranding()
  const [isSaving, setIsSaving] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [iconFile, setIconFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [iconPreview, setIconPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [removeIcon, setRemoveIcon] = useState(false)
  const [isCompressingLogo, setIsCompressingLogo] = useState(false)
  const [isCompressingIcon, setIsCompressingIcon] = useState(false)

  const resetDraft = useCallback(() => {
    setLogoFile(null)
    setIconFile(null)
    setLogoPreview(null)
    setIconPreview(null)
    setRemoveLogo(false)
    setRemoveIcon(false)
  }, [])

  useEffect(() => {
    if (!open) {
      resetDraft()
    }
  }, [open, resetDraft])

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
      if (iconPreview) URL.revokeObjectURL(iconPreview)
    }
  }, [logoPreview, iconPreview])

  const handleLogoFile = async (file: File | null) => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setRemoveLogo(false)

    if (!file) {
      setLogoFile(null)
      setLogoPreview(null)
      return
    }

    setIsCompressingLogo(true)
    try {
      const compressed = file.type === "image/svg+xml" ? file : await compressBrandingLogoForUpload(file)
      setLogoFile(compressed)
      setLogoPreview(URL.createObjectURL(compressed))
      if (compressed.size < file.size) {
        toast({
          title: "Logo optimized",
          description: `Reduced from ${formatBytes(file.size)} to ${formatBytes(compressed.size)}.`,
        })
      }
    } catch {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    } finally {
      setIsCompressingLogo(false)
    }
  }

  const handleIconFile = async (file: File | null) => {
    if (iconPreview) URL.revokeObjectURL(iconPreview)
    setRemoveIcon(false)

    if (!file) {
      setIconFile(null)
      setIconPreview(null)
      return
    }

    setIsCompressingIcon(true)
    try {
      const compressed = file.type === "image/svg+xml" ? file : await compressBrandingIconForUpload(file)
      setIconFile(compressed)
      setIconPreview(URL.createObjectURL(compressed))
      if (compressed.size < file.size) {
        toast({
          title: "Icon optimized",
          description: `Reduced from ${formatBytes(file.size)} to ${formatBytes(compressed.size)}.`,
        })
      }
    } catch {
      setIconFile(file)
      setIconPreview(URL.createObjectURL(file))
    } finally {
      setIsCompressingIcon(false)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const formData = new FormData()
      if (logoFile) formData.append("brandLogo", logoFile)
      if (iconFile) formData.append("brandIcon", iconFile)
      if (removeLogo) formData.append("removeLogo", "true")
      if (removeIcon) formData.append("removeIcon", "true")

      const result = await updatePlatformBranding(formData)
      if (!result.success) {
        throw new Error(result.message || "Failed to update branding")
      }

      await refreshBranding()
      toast({
        title: "Branding updated",
        description: "Software logos were saved successfully.",
      })
      onOpenChange(false)
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update branding",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${ADMIN_DIALOG_SCROLL_CLASS} sm:max-w-2xl`}>
        <DialogHeader className="shrink-0 space-y-1 border-b border-gray-100 px-6 py-4 text-left">
          <DialogTitle className="text-gray-900">Software branding</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
          <p className="text-sm text-gray-500">
            Upload the logos shown on the device login screen, admin portal, invoices, and receipts. Images are
            automatically resized and compressed before upload for faster loading. SVG files are uploaded as-is.
          </p>

          <BrandingUploadField
            label="Full logo"
            description="Wide logo used on login screens and headers."
            currentUrl={removeLogo ? null : branding.logoUrl}
            previewUrl={logoPreview}
            onFileChange={handleLogoFile}
            onRemove={() => {
              handleLogoFile(null)
              setRemoveLogo(true)
            }}
          />

          <BrandingUploadField
            label="Icon logo"
            description="Square icon used in compact places like the admin header and device dashboard."
            currentUrl={removeIcon ? null : branding.iconUrl}
            previewUrl={iconPreview}
            onFileChange={handleIconFile}
            onRemove={() => {
              handleIconFile(null)
              setRemoveIcon(true)
            }}
          />
        </div>

        <div className="shrink-0 border-t border-gray-100 px-6 py-4">
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving || isCompressingLogo || isCompressingIcon}>
              {isSaving || isCompressingLogo || isCompressingIcon ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save branding
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
