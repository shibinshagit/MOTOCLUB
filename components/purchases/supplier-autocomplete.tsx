"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Building2,
  Check,
  ChevronsUpDown,
  Loader2,
  Plus,
  Search,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { createSupplier, getSuppliers } from "@/app/actions/supplier-actions"

type SupplierRecord = {
  id: number
  name: string
  phone?: string | null
  email?: string | null
}

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
  userId,
  placeholder = "Select supplier",
  className,
}: SupplierAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [showAddForm, setShowAddForm] = useState(false)
  const [formLoading, setFormLoading] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: "", phone: "" })

  const isCompact = className?.includes("h-8") || className?.includes("text-xs")

  const selectedSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.name === value) ?? null,
    [suppliers, value],
  )

  const isLegacyValue = Boolean(value.trim()) && !selectedSupplier

  const filteredSuppliers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return suppliers

    return suppliers.filter((supplier) => {
      const name = supplier.name.toLowerCase()
      const phone = (supplier.phone || "").toLowerCase()
      const email = (supplier.email || "").toLowerCase()
      return name.includes(query) || phone.includes(query) || email.includes(query)
    })
  }, [searchTerm, suppliers])

  const loadSuppliers = useCallback(async () => {
    if (!userId) {
      setSuppliers([])
      return
    }

    try {
      setLoading(true)
      const result = await getSuppliers(userId)
      if (result.success && Array.isArray(result.data)) {
        setSuppliers(
          result.data.map((supplier: any) => ({
            id: Number(supplier.id),
            name: String(supplier.name || "").trim(),
            phone: supplier.phone,
            email: supplier.email,
          })),
        )
      } else {
        setSuppliers([])
      }
    } catch {
      setSuppliers([])
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void loadSuppliers()
  }, [loadSuppliers])

  useEffect(() => {
    if (!open) return

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
        setShowAddForm(false)
        setSearchTerm("")
        setFormError(null)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 60)
    }
  }, [open, showAddForm])

  const handleSelect = (supplier: SupplierRecord) => {
    onChange(supplier.name)
    setOpen(false)
    setShowAddForm(false)
    setSearchTerm("")
    setFormError(null)
  }

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation()
    onChange("")
  }

  const handleCreateSupplier = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!userId) return

    const name = formData.name.trim()
    const phone = formData.phone.trim()
    if (!name || !phone) {
      setFormError("Name and phone are required")
      return
    }

    setFormLoading(true)
    setFormError(null)

    try {
      const body = new FormData()
      body.append("user_id", String(userId))
      body.append("name", name)
      body.append("phone", phone)

      const result = await createSupplier(body)
      if (!result.success) {
        setFormError(result.message || "Failed to add supplier")
        return
      }

      await loadSuppliers()
      onChange(name)
      setOpen(false)
      setShowAddForm(false)
      setSearchTerm("")
      setFormData({ name: "", phone: "" })
    } catch {
      setFormError("Failed to add supplier. Please try again.")
    } finally {
      setFormLoading(false)
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        disabled={!userId}
        onClick={() => {
          setOpen((current) => !current)
          if (!open) void loadSuppliers()
        }}
        className={cn(
          "w-full justify-between bg-white border-gray-300 text-gray-900 hover:bg-gray-50 font-normal",
          isCompact ? "h-8 px-2 text-xs" : "h-10 px-3 text-sm",
          !value && "text-muted-foreground",
          className,
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <Building2 className={cn("shrink-0 text-gray-500", isCompact ? "h-3 w-3" : "h-4 w-4")} />
          <span className="truncate">{value || placeholder}</span>
          {isLegacyValue && (
            <Badge variant="outline" className="shrink-0 border-amber-300 text-[10px] text-amber-700">
              Not registered
            </Badge>
          )}
        </span>
        <span className="ml-2 flex shrink-0 items-center gap-1">
          {value && (
            <span
              role="button"
              tabIndex={0}
              className="rounded p-0.5 hover:bg-gray-100"
              onClick={handleClear}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onChange("")
                }
              }}
            >
              <X className={cn("text-gray-500", isCompact ? "h-3 w-3" : "h-3.5 w-3.5")} />
            </span>
          )}
          <ChevronsUpDown className={cn("opacity-50", isCompact ? "h-3 w-3" : "h-4 w-4")} />
        </span>
      </Button>

      {!userId && (
        <p className="mt-1 text-[11px] text-amber-700">Sign in again to load suppliers.</p>
      )}

      {isLegacyValue && (
        <p className="mt-1 text-[11px] text-amber-700">
          This purchase uses an old supplier name. Select a registered supplier or add one below.
        </p>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 p-2">
            <Search className="h-4 w-4 shrink-0 text-gray-500" />
            <Input
              ref={searchInputRef}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search suppliers..."
              className="h-8 border-0 bg-transparent px-0 text-sm text-gray-900 shadow-none focus-visible:ring-0"
            />
            {searchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setSearchTerm("")}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {loading ? (
              <div className="py-6 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-blue-600" />
                <p className="mt-2 text-xs text-gray-500">Loading suppliers...</p>
              </div>
            ) : showAddForm ? (
              <form onSubmit={handleCreateSupplier} className="m-1 space-y-3 rounded-md border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
                    <Plus className="h-4 w-4" />
                    Add supplier
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setShowAddForm(false)
                      setFormError(null)
                    }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                <div className="space-y-2">
                  <Input
                    value={formData.name}
                    onChange={(event) => setFormData((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Supplier name"
                    className="h-8 bg-white text-sm"
                    disabled={formLoading}
                  />
                  <Input
                    value={formData.phone}
                    onChange={(event) => setFormData((current) => ({ ...current, phone: event.target.value }))}
                    placeholder="Phone number"
                    className="h-8 bg-white text-sm"
                    disabled={formLoading}
                  />
                  {formError && <p className="text-xs text-red-600">{formError}</p>}
                </div>

                <div className="flex gap-2">
                  <Button type="submit" size="sm" className="h-8 flex-1 bg-blue-600 hover:bg-blue-700" disabled={formLoading}>
                    {formLoading ? (
                      <>
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save supplier"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={formLoading}
                    onClick={() => {
                      setShowAddForm(false)
                      setFormError(null)
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {filteredSuppliers.length > 0 ? (
                  filteredSuppliers.map((supplier) => (
                    <button
                      key={supplier.id}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-gray-100",
                        value === supplier.name && "bg-blue-50 text-blue-700",
                      )}
                      onClick={() => handleSelect(supplier)}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                        <Building2 className="h-4 w-4 text-gray-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{supplier.name}</div>
                        {(supplier.phone || supplier.email) && (
                          <div className="truncate text-xs text-gray-500">
                            {supplier.phone || supplier.email}
                          </div>
                        )}
                      </div>
                      {value === supplier.name && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                    </button>
                  ))
                ) : (
                  <div className="px-3 py-6 text-center">
                    <Building2 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                    <p className="text-sm font-medium text-gray-700">
                      {searchTerm ? "No suppliers match your search" : "No suppliers added yet"}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      Add suppliers from the Suppliers tab or create one here.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {!showAddForm && (
            <div className="border-t border-gray-100 p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 w-full justify-start text-blue-700 hover:bg-blue-50 hover:text-blue-800"
                onClick={() => {
                  setShowAddForm(true)
                  setFormData({
                    name: searchTerm.trim(),
                    phone: "",
                  })
                  setFormError(null)
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add new supplier
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
