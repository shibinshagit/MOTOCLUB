"use client"

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react"
import { Search, X, Package, Folder, Building2, ChevronRight, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { getProductSearchSuggestions } from "@/app/actions/product-actions"
import {
  generateProductSuggestions,
  type ProductSuggestionsResult,
  type SuggestionProductItem,
} from "@/lib/product-search"

export interface SelectedCategoryFilter {
  id?: number | string | null
  name: string
}

interface InventorySearchBoxProps {
  value: string
  onChange: (val: string) => void
  selectedCategory?: SelectedCategoryFilter | string | null
  onSelectCategory?: (category: SelectedCategoryFilter | null) => void
  onSelectProduct?: (product: any) => void
  products?: any[]
  userId?: number
  placeholder?: string
  className?: string
  inputClassName?: string
  autoFocus?: boolean
}

type FlatSuggestionItem =
  | { type: "product"; item: SuggestionProductItem; label: string; sublabel?: string }
  | { type: "category"; id?: number | string; name: string; label: string }
  | { type: "company"; name: string; label: string }

export function InventorySearchBox({
  value,
  onChange,
  selectedCategory = null,
  onSelectCategory,
  onSelectProduct,
  products = [],
  userId,
  placeholder = "Search products...",
  className = "",
  inputClassName = "",
  autoFocus = false,
}: InventorySearchBoxProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [debouncedValue, setDebouncedValue] = useState(value)
  const [serverSuggestions, setServerSuggestions] = useState<ProductSuggestionsResult>({
    products: [],
    categories: [],
    companies: [],
    totalCount: 0,
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const activeCategory = useMemo<SelectedCategoryFilter | null>(() => {
    if (!selectedCategory) return null
    if (typeof selectedCategory === "string") {
      return { name: selectedCategory }
    }
    return selectedCategory
  }, [selectedCategory])

  // 250ms debounce for suggestion computation
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, 250)
    return () => clearTimeout(timer)
  }, [value])

  // Fetch catalog-wide search suggestions from server when userId is available
  useEffect(() => {
    let isMounted = true
    if (!debouncedValue || debouncedValue.trim().length < 2) {
      setServerSuggestions({ products: [], categories: [], companies: [], totalCount: 0 })
      return
    }

    if (userId) {
      getProductSearchSuggestions(
        debouncedValue,
        userId,
        activeCategory?.id ? Number(activeCategory.id) : null,
        activeCategory?.name || null
      ).then((res) => {
        if (isMounted && res.success && res.suggestions) {
          setServerSuggestions(res.suggestions)
        }
      })
    }
    return () => {
      isMounted = false
    }
  }, [debouncedValue, userId, activeCategory])

  // Compute suggestions from server or loaded products
  const suggestions: ProductSuggestionsResult = useMemo(() => {
    if (!debouncedValue || debouncedValue.trim().length < 2) {
      return { products: [], categories: [], companies: [], totalCount: 0 }
    }
    if (userId && serverSuggestions.totalCount > 0) {
      return serverSuggestions
    }
    return generateProductSuggestions(products, debouncedValue, 8)
  }, [products, debouncedValue, userId, serverSuggestions])

  // Flatten suggestions into a single array for keyboard navigation (Arrow Up / Down)
  const flatItems: FlatSuggestionItem[] = useMemo(() => {
    const items: FlatSuggestionItem[] = []

    for (const p of suggestions.products) {
      const sub = [p.company_name, p.category].filter(Boolean).join(" · ")
      items.push({
        type: "product",
        item: p,
        label: p.name,
        sublabel: sub,
      })
    }

    for (const c of suggestions.categories) {
      items.push({
        type: "category",
        id: (c as any).id,
        name: c.name,
        label: c.name,
      })
    }

    for (const comp of suggestions.companies) {
      items.push({
        type: "company",
        name: comp.name,
        label: comp.name,
      })
    }

    return items
  }, [suggestions])

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        setHighlightedIndex(-1)
      }
    }
    document.addEventListener("mousedown", handleOutsideClick)
    return () => document.removeEventListener("mousedown", handleOutsideClick)
  }, [])

  // Reset highlight index when query or suggestions change
  useEffect(() => {
    setHighlightedIndex(-1)
  }, [debouncedValue])

  const handleSelect = useCallback(
    (item: FlatSuggestionItem) => {
      if (item.type === "product") {
        onChange(item.label)
        if (onSelectProduct) {
          const originalProduct = products.find((p) => p.id === item.item.id) || item.item
          if (originalProduct) onSelectProduct(originalProduct)
        }
      } else if (item.type === "category") {
        if (onSelectCategory) {
          onSelectCategory({ id: item.id || null, name: item.name })
        }
        onChange("") // Clear search input so user can type product name immediately
        setTimeout(() => {
          inputRef.current?.focus()
        }, 50)
      } else if (item.type === "company") {
        onChange(item.name)
      }
      setIsOpen(false)
      setHighlightedIndex(-1)
    },
    [onChange, onSelectCategory, onSelectProduct, products]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || flatItems.length === 0) {
      if (e.key === "ArrowDown" && flatItems.length > 0) {
        setIsOpen(true)
        setHighlightedIndex(0)
        e.preventDefault()
      }
      return
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        setHighlightedIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0))
        break
      case "ArrowUp":
        e.preventDefault()
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1))
        break
      case "Enter":
        e.preventDefault()
        if (highlightedIndex >= 0 && highlightedIndex < flatItems.length) {
          handleSelect(flatItems[highlightedIndex])
        } else {
          setIsOpen(false)
        }
        break
      case "Escape":
        e.preventDefault()
        setIsOpen(false)
        setHighlightedIndex(-1)
        break
    }
  }

  const showDropdown = isOpen && value.trim().length >= 2 && flatItems.length > 0

  return (
    <div ref={containerRef} className={cn("relative flex w-full flex-col sm:flex-row items-stretch sm:items-center gap-1.5", className)}>
      {/* Category Filter Chip */}
      {activeCategory ? (
        <div className="inline-flex h-8 shrink-0 items-center justify-between gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 shadow-sm max-w-full sm:max-w-[200px] transition-all">
          <div className="flex items-center gap-1.5 min-w-0">
            <Folder className="h-3.5 w-3.5 text-violet-600 shrink-0" />
            <span className="truncate" title={activeCategory.name}>{activeCategory.name}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              onSelectCategory?.(null)
              inputRef.current?.focus()
            }}
            className="ml-0.5 rounded-full p-0.5 hover:bg-violet-200/80 text-violet-600 hover:text-violet-950 transition-colors shrink-0"
            title="Remove category filter"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="relative flex-1 min-w-0">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setIsOpen(true)
          }}
          onFocus={() => {
            if (value.trim().length >= 2) {
              setIsOpen(true)
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={cn(
            "h-8 w-full border-slate-200 bg-white pl-8 pr-8 text-xs transition-shadow focus-visible:ring-1 focus-visible:ring-violet-500",
            inputClassName
          )}
        />
        {value ? (
          <button
            type="button"
            onClick={() => {
              onChange("")
              setIsOpen(false)
              setHighlightedIndex(-1)
              inputRef.current?.focus()
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {/* Autocomplete Suggestion Dropdown */}
      {showDropdown && (
        <div
          ref={listRef}
          className="absolute left-0 top-full z-50 mt-1 w-full min-w-[260px] max-w-[420px] rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg animate-in fade-in-50 zoom-in-95"
        >
          {/* Products Group */}
          {suggestions.products.length > 0 && (
            <div className="mb-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Package className="h-3 w-3 text-violet-500" />
                <span>Products</span>
              </div>
              {suggestions.products.map((p) => {
                const itemIndex = flatItems.findIndex(
                  (f) => f.type === "product" && f.item.id === p.id
                )
                const isSelected = itemIndex === highlightedIndex

                return (
                  <button
                    key={`prod-${p.id}`}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    onClick={() => {
                      if (itemIndex >= 0) handleSelect(flatItems[itemIndex])
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-violet-50 text-violet-900 font-medium"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="truncate font-medium text-slate-900">{p.name}</div>
                      {(p.company_name || p.category) && (
                        <div className="truncate text-[10px] text-slate-500">
                          {[p.company_name, p.category].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </div>
                    {p.stock !== undefined && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          p.stock > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-700"
                        )}
                      >
                        {p.stock > 0 ? `${p.stock} in stock` : "OOS"}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Categories Group */}
          {suggestions.categories.length > 0 && (
            <div className="mb-1 border-t border-slate-100 pt-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Folder className="h-3 w-3 text-amber-500" />
                <span>Categories</span>
              </div>
              {suggestions.categories.map((c) => {
                const itemIndex = flatItems.findIndex(
                  (f) => f.type === "category" && f.name === c.name
                )
                const isSelected = itemIndex === highlightedIndex

                return (
                  <button
                    key={`cat-${c.name}`}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    onClick={() => {
                      if (itemIndex >= 0) handleSelect(flatItems[itemIndex])
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-violet-50 text-violet-900 font-medium"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <div className="truncate font-medium text-slate-800">{c.name}</div>
                    <span className="text-[10px] text-slate-400">Category</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Companies Group */}
          {suggestions.companies.length > 0 && (
            <div className="border-t border-slate-100 pt-1">
              <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <Building2 className="h-3 w-3 text-blue-500" />
                <span>Companies / Brands</span>
              </div>
              {suggestions.companies.map((comp) => {
                const itemIndex = flatItems.findIndex(
                  (f) => f.type === "company" && f.name === comp.name
                )
                const isSelected = itemIndex === highlightedIndex

                return (
                  <button
                    key={`comp-${comp.name}`}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(itemIndex)}
                    onClick={() => {
                      if (itemIndex >= 0) handleSelect(flatItems[itemIndex])
                    }}
                    className={cn(
                      "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-violet-50 text-violet-900 font-medium"
                        : "text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <div className="truncate font-medium text-slate-800">{comp.name}</div>
                    <span className="text-[10px] text-slate-400">Brand</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Footer prompt */}
          <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-2 py-1 text-[10px] text-slate-400">
            <span>
              Press <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px]">↑</kbd>{" "}
              <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px]">↓</kbd> to
              navigate
            </span>
            <span>
              <kbd className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[9px]">Enter</kbd> to
              select
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
