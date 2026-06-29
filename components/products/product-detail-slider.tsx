"use client"

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
      />
      <div
        className={cn(
          "pointer-events-auto absolute inset-y-0 right-0 flex w-full max-w-[min(540px,92%)] flex-col overflow-hidden border-l border-slate-200 bg-background shadow-2xl",
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
