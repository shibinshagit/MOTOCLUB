"use client"

import { useEffect, useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { ensureManualEntryCategories } from "@/app/actions/master-data-actions"
import type { MasterDataItem } from "@/lib/master-data"

interface ManualCategorySelectProps {
  deviceId: number
  userId: number
  value: string
  onValueChange: (value: string, category?: MasterDataItem) => void
  disabled?: boolean
}

export default function ManualCategorySelect({
  deviceId,
  userId,
  value,
  onValueChange,
  disabled,
}: ManualCategorySelectProps) {
  const [categories, setCategories] = useState<MasterDataItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!deviceId || !userId) return

    let cancelled = false
    const load = async () => {
      setIsLoading(true)
      try {
        const result = await ensureManualEntryCategories(deviceId, userId)
        if (!cancelled && result.success) {
          setCategories(result.data)
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [deviceId, userId])

  if (isLoading) {
    return (
      <div className="flex h-10 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading categories...
      </div>
    )
  }

  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        const category = categories.find((item) => String(item.id) === nextValue)
        onValueChange(nextValue, category)
      }}
      disabled={disabled || categories.length === 0}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select category" />
      </SelectTrigger>
      <SelectContent>
        {categories.map((category) => (
          <SelectItem key={category.id} value={String(category.id)}>
            {category.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
