"use client"

import { useEffect } from "react"
import { createPortal } from "react-dom"
import { ProductDetailPanel, type ProductDetailPanelProps } from "@/components/products/view-product-modal"
import { cn } from "@/lib/utils"

interface ProductDetailSliderProps extends ProductDetailPanelProps {
  className?: string
  /** Portaled viewport overlay above dialogs. */
  portaled?: boolean
}

export function ProductDetailSlider({
  product,
  onClose,
  className,
  portaled = false,
  ...panelProps
}: ProductDetailSliderProps) {
  useEffect(() => {
    if (!product || !portaled) return

    const originalBodyOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"

    const mainElements = Array.from(document.querySelectorAll("main"))
    const originalMainOverflows = mainElements.map((el) => el.style.overflow)
    mainElements.forEach((el) => {
      el.style.overflow = "hidden"
    })

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)

    return () => {
      document.body.style.overflow = originalBodyOverflow
      mainElements.forEach((el, i) => {
        el.style.overflow = originalMainOverflows[i] || ""
      })
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [product, portaled, onClose])

  if (!product) return null

  const slider = (
    <div
      className={cn(
        "pointer-events-none",
        portaled ? "fixed inset-0 z-[100]" : "absolute inset-0 z-[60]",
      )}
    >
      <button
        type="button"
        aria-label="Close product details"
        className="pointer-events-auto absolute inset-0 bg-black/30"
        onClick={(event) => {
          event.stopPropagation()
          onClose()
        }}
        onWheel={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
      />
      <div
        className={cn(
          "pointer-events-auto absolute inset-y-0 right-0 flex w-full max-w-[min(540px,92%)] flex-col overflow-hidden border-l border-slate-200 bg-background shadow-2xl overscroll-contain",
          portaled ? "h-[100dvh] max-h-[100dvh]" : "h-full max-h-full",
          className,
        )}
      >
        <ProductDetailPanel product={product} onClose={onClose} {...panelProps} />
      </div>
    </div>
  )

  if (portaled && typeof document !== "undefined") {
    return createPortal(slider, document.body)
  }

  return slider
}
