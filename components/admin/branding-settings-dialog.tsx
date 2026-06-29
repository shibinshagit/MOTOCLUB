"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { updatePlatformBranding } from "@/app/actions/brand-actions"
import { useBranding } from "@/components/branding-provider"
import { DEFAULT_PLATFORM_NAME } from "@/lib/brand"
import ImageUploadField from "@/components/admin/image-upload-field"
import {
  compressBrandingIconForUpload,
  compressBrandingLogoForUpload,
  formatBytes,
} from "@/lib/media-upload-utils"
import { ADMIN_DIALOG_SCROLL_CLASS } from "@/lib/staff-restrictions"

interface BrandingSettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function BrandingSettingsDialog({ open, onOpenChange }: BrandingSettingsDialogProps) {
  const { toast } = useToast()
  const { branding, refreshBranding } = useBranding()
  const [platformNameDraft, setPlatformNameDraft] = useState("")
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
    } else {
      setPlatformNameDraft(branding.name || "")
    }
  }, [open, resetDraft, branding.name])

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
        notifySuccess(toast, `Reduced from ${formatBytes(file.size)} to ${formatBytes(compressed.size)}.`, "Logo optimized")
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
        notifySuccess(toast, `Reduced from ${formatBytes(file.size)} to ${formatBytes(compressed.size)}.`, "Icon optimized")
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
      formData.append("platformName", platformNameDraft)
      if (logoFile) formData.append("brandLogo", logoFile)
      if (iconFile) formData.append("brandIcon", iconFile)
      if (removeLogo) formData.append("removeLogo", "true")
      if (removeIcon) formData.append("removeIcon", "true")

      const result = await updatePlatformBranding(formData)
      if (!result.success) {
        throw new Error(result.message || "Failed to update branding")
      }

      await refreshBranding()
      notifySuccess(toast, "Software logos were saved successfully.", "Branding updated")
      onOpenChange(false)
    } catch (error) {
      notifyError(toast, error instanceof Error ? error.message : "Failed to update branding")
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
            Set the software name and logos shown on login, admin, invoices, and receipts. Leave the name empty to use
            &ldquo;{DEFAULT_PLATFORM_NAME}&rdquo;.
          </p>

          <div className="space-y-2">
            <Label htmlFor="platformName" className="text-sm font-medium text-gray-700">
              Software name
            </Label>
            <Input
              id="platformName"
              value={platformNameDraft}
              onChange={(e) => setPlatformNameDraft(e.target.value)}
              placeholder={DEFAULT_PLATFORM_NAME}
              className="border-gray-200 bg-white"
            />
            <p className="text-xs text-gray-500">
              Preview: <span className="font-medium text-gray-700">{platformNameDraft.trim() || DEFAULT_PLATFORM_NAME}</span>
            </p>
          </div>

          <ImageUploadField
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

          <ImageUploadField
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
