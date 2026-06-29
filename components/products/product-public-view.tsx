"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, Maximize2, Play, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { PublicSharedProduct } from "@/lib/product-share"
import { BrandLogo } from "@/components/brand-logo"

interface ProductPublicViewProps {
  product: PublicSharedProduct
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 py-3 last:border-b-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-800">{value}</p>
    </div>
  )
}

export function ProductPublicView({ product }: ProductPublicViewProps) {
  const mediaItems = useMemo(() => {
    const items: Array<{ type: "image" | "video"; url: string }> = product.imageUrls.map((url) => ({
      type: "image" as const,
      url,
    }))
    if (product.videoUrl) {
      items.push({ type: "video", url: product.videoUrl })
    }
    return items
  }, [product.imageUrls, product.videoUrl])

  const [activeIndex, setActiveIndex] = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const activeMedia = mediaItems[activeIndex] || null

  const goNext = useCallback(() => {
    if (mediaItems.length <= 1) return
    setActiveIndex((current) => (current + 1) % mediaItems.length)
  }, [mediaItems.length])

  const goPrevious = useCallback(() => {
    if (mediaItems.length <= 1) return
    setActiveIndex((current) => (current - 1 + mediaItems.length) % mediaItems.length)
  }, [mediaItems.length])

  useEffect(() => {
    if (!isFullscreen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false)
      if (event.key === "ArrowRight") goNext()
      if (event.key === "ArrowLeft") goPrevious()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isFullscreen, goNext, goPrevious])

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [isFullscreen])

  const detailRows = [
    product.companyName ? { label: "Brand", value: product.companyName } : null,
    product.categoryName ? { label: "Category", value: product.categoryName } : null,
    product.color ? { label: "Color", value: product.color } : null,
    product.size ? { label: "Size", value: product.size } : null,
    product.suitableFor ? { label: "Suitable for", value: product.suitableFor } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>

  return (
    <>
      <div className="mx-auto min-h-screen max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 flex items-center gap-3">
          {product.storeLogoUrl ? (
            <Image
              src={product.storeLogoUrl}
              alt={product.storeName || "Store"}
              width={40}
              height={40}
              className="h-10 w-10 rounded-lg border border-slate-200 object-cover"
              unoptimized
            />
          ) : (
            <BrandLogo variant="icon" width={40} height={40} className="h-10 w-10 rounded-lg" />
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Product enquiry</p>
            <p className="text-sm font-semibold text-slate-900">{product.storeName || "Product catalogue"}</p>
          </div>
        </header>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {mediaItems.length > 0 ? (
            <div className="border-b border-slate-200 bg-slate-950">
              <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
                {activeMedia?.type === "video" ? (
                  <video
                    key={activeMedia.url}
                    src={activeMedia.url}
                    controls
                    playsInline
                    className="h-full w-full bg-black object-contain"
                  />
                ) : activeMedia ? (
                  <Image
                    src={activeMedia.url}
                    alt={product.name}
                    fill
                    unoptimized
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, 960px"
                  />
                ) : null}

                {mediaItems.length > 1 ? (
                  <>
                    <button
                      type="button"
                      onClick={goPrevious}
                      className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                      aria-label="Previous media"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                      aria-label="Next media"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                ) : null}

                {activeMedia?.type === "image" ? (
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
                    aria-label="View full screen"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              {mediaItems.length > 1 ? (
                <div className="flex gap-2 overflow-x-auto bg-slate-900 p-3">
                  {mediaItems.map((item, index) => (
                    <button
                      key={`${item.type}-${item.url}`}
                      type="button"
                      onClick={() => setActiveIndex(index)}
                      className={cn(
                        "relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2",
                        index === activeIndex ? "border-white" : "border-transparent opacity-70 hover:opacity-100",
                      )}
                    >
                      {item.type === "video" ? (
                        <div className="flex h-full w-full items-center justify-center bg-slate-800 text-white">
                          <Play className="h-5 w-5" />
                        </div>
                      ) : (
                        <Image src={item.url} alt="" fill unoptimized className="object-cover" sizes="64px" />
                      )}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center border-b border-slate-200 bg-slate-100 text-sm text-slate-500">
              No media available
            </div>
          )}

          <div className="space-y-6 p-5 sm:p-8">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{product.name}</h1>
              {product.categoryName ? (
                <p className="mt-1 text-sm text-slate-500">{product.categoryName}</p>
              ) : null}
            </div>

            {product.description ? (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{product.description}</p>
              </div>
            ) : null}

            {detailRows.length > 0 ? (
              <div>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h2>
                <div className="rounded-xl border border-slate-100 bg-slate-50/60 px-4">
                  {detailRows.map((row) => (
                    <InfoRow key={row.label} label={row.label} value={row.value} />
                  ))}
                </div>
              </div>
            ) : null}

            {product.attributes.length > 0 ? (
              <div>
                <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Specifications</h2>
                <div className="grid gap-2 sm:grid-cols-2">
                  {product.attributes.map((attr) => (
                    <div
                      key={`${attr.key}-${attr.value}`}
                      className="rounded-xl border border-slate-100 bg-white px-4 py-3"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{attr.key}</p>
                      <p className="mt-1 text-sm text-slate-800">{attr.value || "—"}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isFullscreen && activeMedia?.type === "image" ? (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 p-4">
          <button
            type="button"
            onClick={() => setIsFullscreen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            aria-label="Close full screen"
          >
            <X className="h-6 w-6" />
          </button>

          {mediaItems.length > 1 ? (
            <>
              <button
                type="button"
                onClick={goPrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Previous image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={goNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white hover:bg-white/20"
                aria-label="Next image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}

          <div className="relative h-full w-full max-h-[90vh] max-w-6xl">
            <Image
              src={activeMedia.url}
              alt={product.name}
              fill
              unoptimized
              className="object-contain"
              sizes="100vw"
              priority
            />
          </div>
        </div>
      ) : null}
    </>
  )
}
