"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { getSuppliers } from "@/app/actions/purchase-actions"
import { cn } from "@/lib/utils"

interface SupplierAutocompleteProps {
  value: string
  onChange: (value: string) => void
  userId?: number
  placeholder?: string
  className?: string
}

export default function SupplierAutocomplete({
  value,
  onChange,
  placeholder = "Supplier name",
  className,
}: SupplierAutocompleteProps) {
  const [suppliers, setSuppliers] = useState<string[]>([])

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const result = await getSuppliers()
        if (result.success && Array.isArray(result.data)) {
          setSuppliers(result.data)
        }
      } catch {
        setSuppliers([])
      }
    }

    loadSuppliers()
  }, [])

  return (
    <>
      <Input
        list="supplier-suggestions"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("bg-white border-gray-300 text-gray-900", className)}
      />
      <datalist id="supplier-suggestions">
        {suppliers.map((supplier) => (
          <option key={supplier} value={supplier} />
        ))}
      </datalist>
    </>
  )
}
