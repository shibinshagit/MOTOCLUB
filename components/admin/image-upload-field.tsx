"use client"

import { useRef } from "react"
import Image from "next/image"
import { ImageIcon, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ADMIN_DIALOG_LABEL_CLASS } from "@/lib/staff-restrictions"

export default function ImageUploadField({
  label,
  description,
  currentUrl,
  previewUrl,
  onFileChange,
  onRemove,
  replaceLabel = "Replace image",
  uploadLabel = "Upload image",
}: {
  label: string
  description?: string
  currentUrl: string | null
  previewUrl: string | null
  onFileChange: (file: File | null) => void
  onRemove: () => void
  replaceLabel?: string
  uploadLabel?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const displayUrl = previewUrl || currentUrl

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div>
        <Label className={ADMIN_DIALOG_LABEL_CLASS}>{label}</Label>
        {description ? <p className="mt-1 text-xs text-gray-500">{description}</p> : null}
      </div>

      <div className="flex min-h-[96px] items-center justify-center rounded-md border border-dashed border-gray-300 bg-white p-4">
        {displayUrl ? (
          <Image
            src={displayUrl}
            alt={label}
            width={220}
            height={80}
            className="max-h-20 w-auto object-contain"
            unoptimized={displayUrl.includes("blob.vercel-storage.com") || displayUrl.startsWith("blob:")}
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
          {displayUrl ? replaceLabel : uploadLabel}
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
