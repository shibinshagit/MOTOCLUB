"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ExternalLink, Sparkles, ShoppingBag } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { getEcommerceBannerMetadata, type MasterDataItem } from "@/lib/master-data"

interface EcommerceBannerCarouselProps {
  banners?: MasterDataItem[]
  autoPlayInterval?: number
  className?: string
  previewMode?: boolean
}

type SlideItem = {
  id: string | number
  name: string
  notes: string
  imageUrl: string
  subtitle: string
  ctaText: string
  ctaUrl: string
  badgeText: string
  themeColor: string
}

const THEME_STYLES: Record<string, { badgeBg: string; gradientBg: string; buttonBg: string }> = {
  violet: {
    badgeBg: "bg-violet-500/80 text-white border-violet-400/40",
    gradientBg: "from-purple-950/85 via-slate-950/75 to-transparent",
    buttonBg: "bg-violet-600 hover:bg-violet-500 text-white shadow-violet-500/25",
  },
  blue: {
    badgeBg: "bg-blue-500/80 text-white border-blue-400/40",
    gradientBg: "from-slate-950/85 via-blue-950/75 to-transparent",
    buttonBg: "bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25",
  },
  emerald: {
    badgeBg: "bg-emerald-500/80 text-white border-emerald-400/40",
    gradientBg: "from-emerald-950/85 via-slate-950/75 to-transparent",
    buttonBg: "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25",
  },
  amber: {
    badgeBg: "bg-amber-500/90 text-slate-950 font-bold border-amber-400/40",
    gradientBg: "from-stone-950/85 via-amber-950/65 to-transparent",
    buttonBg: "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25",
  },
  rose: {
    badgeBg: "bg-rose-500/80 text-white border-rose-400/40",
    gradientBg: "from-rose-950/85 via-slate-950/75 to-transparent",
    buttonBg: "bg-rose-600 hover:bg-rose-500 text-white shadow-rose-500/25",
  },
  dark: {
    badgeBg: "bg-slate-800 text-slate-200 border-slate-700",
    gradientBg: "from-black/90 via-slate-950/75 to-transparent",
    buttonBg: "bg-slate-100 hover:bg-white text-slate-950 shadow-black/30",
  },
}

export function EcommerceBannerCarousel({
  banners = [],
  autoPlayInterval = 5000,
  className,
  previewMode = false,
}: EcommerceBannerCarouselProps) {
  const activeBanners = banners.filter((item) => item.is_active !== false)

  // Construct slides list from active banners (handling multi-image and single image per banner)
  const displayItems: SlideItem[] = []

  if (activeBanners.length > 0) {
    activeBanners.forEach((item) => {
      const meta = getEcommerceBannerMetadata(item.metadata)
      const imagesList = meta.images && meta.images.length > 0 ? meta.images : [{ url: meta.imageUrl || "" }]

      imagesList.forEach((imgObj, imgIdx) => {
        if (!imgObj.url) return
        displayItems.push({
          id: `${item.id}-${imgIdx}`,
          name: imgObj.title || item.name,
          notes: imgObj.subtitle || item.notes || meta.subtitle || "",
          imageUrl: imgObj.url,
          subtitle: meta.subtitle || "",
          ctaText: meta.ctaText || "Shop Now",
          ctaUrl: meta.ctaUrl || item.website || "#",
          badgeText: meta.badgeText || "",
          themeColor: meta.themeColor || "violet",
        })
      })
    })
  }

  // Fallback if no active banners exist
  if (displayItems.length === 0) {
    displayItems.push({
      id: "fallback-1",
      name: "Welcome to Our Store",
      notes: "Discover high quality products and exclusive promotional offers.",
      imageUrl: "",
      subtitle: "Official Catalogue",
      ctaText: "Browse Collection",
      ctaUrl: "#",
      badgeText: "FEATURED",
      themeColor: "violet",
    })
  }

  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  const count = displayItems.length

  const goNext = useCallback(() => {
    if (count <= 1) return
    setCurrentIndex((prev) => (prev + 1) % count)
  }, [count])

  const goPrev = useCallback(() => {
    if (count <= 1) return
    setCurrentIndex((prev) => (prev - 1 + count) % count)
  }, [count])

  useEffect(() => {
    if (isPaused || count <= 1) return
    const timer = setInterval(() => {
      goNext()
    }, autoPlayInterval)
    return () => clearInterval(timer)
  }, [autoPlayInterval, count, goNext, isPaused])

  const activeItem = displayItems[currentIndex] || displayItems[0]
  const theme = THEME_STYLES[activeItem?.themeColor || "violet"] || THEME_STYLES.violet

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl transition-all duration-300",
        className
      )}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Banner Hero Display */}
      <div className="relative aspect-[16/9] min-h-[300px] w-full sm:aspect-[21/9] sm:min-h-[360px] lg:min-h-[420px]">
        {/* Background Image / Placeholder */}
        {activeItem.imageUrl ? (
          <Image
            key={String(activeItem.id) + activeItem.imageUrl}
            src={activeItem.imageUrl}
            alt={activeItem.name}
            fill
            priority
            unoptimized
            className="object-cover object-center transition-all duration-700 ease-out"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-slate-600">
            <Sparkles className="h-16 w-16 opacity-30 animate-pulse" />
          </div>
        )}

        {/* Gradient Overlay for Text Readability */}
        <div className={cn("absolute inset-0 bg-gradient-to-r", theme.gradientBg)} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/30 to-transparent" />

        {/* Content Box */}
        <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10 lg:p-14">
          <div className="max-w-2xl space-y-3 sm:space-y-4">
            {/* Badge */}
            {activeItem.badgeText ? (
              <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-md shadow-sm", theme.badgeBg)}>
                <Sparkles className="h-3.5 w-3.5" />
                <span>{activeItem.badgeText}</span>
              </div>
            ) : null}

            {/* Title */}
            <h2 className="text-2xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl drop-shadow-md">
              {activeItem.name}
            </h2>

            {/* Subtitle / Description */}
            {activeItem.subtitle || activeItem.notes ? (
              <p className="line-clamp-2 text-sm font-medium text-slate-200/90 sm:text-base lg:text-lg max-w-xl">
                {activeItem.subtitle ? <span className="block font-semibold text-slate-100 mb-1">{activeItem.subtitle}</span> : null}
                {activeItem.notes}
              </p>
            ) : null}

            {/* CTA Button */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {activeItem.ctaUrl && activeItem.ctaUrl !== "#" ? (
                <a href={activeItem.ctaUrl} target={activeItem.ctaUrl.startsWith("http") ? "_blank" : "_self"} rel="noreferrer">
                  <Button size="lg" className={cn("h-11 rounded-xl px-6 font-semibold shadow-lg transition-all", theme.buttonBg)}>
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    {activeItem.ctaText || "Shop Now"}
                    <ExternalLink className="ml-2 h-3.5 w-3.5 opacity-70" />
                  </Button>
                </a>
              ) : (
                <Button size="lg" className={cn("h-11 rounded-xl px-6 font-semibold shadow-lg transition-all", theme.buttonBg)}>
                  <ShoppingBag className="mr-2 h-4 w-4" />
                  {activeItem.ctaText || "Shop Now"}
                </Button>
              )}

              {previewMode && (
                <span className="rounded-md bg-slate-900/80 backdrop-blur border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300">
                  Slide {currentIndex + 1} of {count}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Navigation Arrows */}
        {count > 1 && (
          <div className="absolute inset-x-4 top-1/2 flex -translate-y-1/2 justify-between pointer-events-none z-20">
            <button
              type="button"
              onClick={goPrev}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-slate-950/60 text-white backdrop-blur-md transition-all hover:bg-slate-900 hover:scale-105 active:scale-95 shadow-lg"
              aria-label="Previous Slide"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <button
              type="button"
              onClick={goNext}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-slate-950/60 text-white backdrop-blur-md transition-all hover:bg-slate-900 hover:scale-105 active:scale-95 shadow-lg"
              aria-label="Next Slide"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          </div>
        )}

        {/* Indicators Dots */}
        {count > 1 && (
          <div className="absolute bottom-4 right-6 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/60 px-3 py-1.5 backdrop-blur-md">
            {displayItems.map((item, idx) => (
              <button
                key={String(item.id) + "-" + idx}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  idx === currentIndex ? "w-6 bg-white" : "w-2 bg-white/40 hover:bg-white/70"
                )}
                aria-label={`Go to slide ${idx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
