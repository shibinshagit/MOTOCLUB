"use client"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface VariantSelectProps {
  variants: any[]
  value?: number
  onChange: (variantId: number, variantName: string) => void
  disabled?: boolean
}

export function VariantSelect({ variants, value, onChange, disabled }: VariantSelectProps) {
  if (!variants || variants.length === 0) {
    return (
      <Select disabled>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Default" />
        </SelectTrigger>
      </Select>
    )
  }

  // Auto-select if there's only 1 variant (and none selected)
  if (variants.length === 1 && !value) {
    // We defer to let the parent handle the actual state update without rendering loop
    setTimeout(() => {
      onChange(variants[0].id, variants[0].name)
    }, 0)
  }

  return (
    <Select
      value={value ? String(value) : undefined}
      onValueChange={(val) => {
        const id = parseInt(val, 10)
        const v = variants.find((v) => v.id === id)
        if (v) {
          onChange(id, v.name)
        }
      }}
      disabled={disabled}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Select variant" />
      </SelectTrigger>
      <SelectContent>
        {variants.map((v) => (
          <SelectItem key={v.id} value={String(v.id)}>
            {v.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
