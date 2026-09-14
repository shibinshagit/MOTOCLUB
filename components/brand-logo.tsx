"use client"

import Image from "next/image"
import { useState } from "react"
import { useBranding } from "@/components/branding-provider"

type BrandLogoProps = {
  variant?: "full" | "icon"
  width?: number
  height?: number
  className?: string
  imageClassName?: string
  priority?: boolean
  centered?: boolean
  overrideSrc?: string | null
}

function BrandTextFallback({
  variant,
  className,
  centered,
  platformName,
}: {
  variant: "full" | "icon"
  className?: string
  centered?: boolean
  platformName: string
}) {
  const name = platformName || "MOTOCLUB"
  const content =
    variant === "icon" ? (
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-sm font-black text-white shadow-sm shrink-0 ${className || ""}`.trim()}
      >
        {name.charAt(0)}
      </div>
    ) : (
      <div className={`inline-flex items-center gap-2.5 font-bold text-gray-900 ${className || ""}`.trim()}>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white text-sm font-black shadow-sm shrink-0">
          {name.charAt(0)}
        </div>
        <span className="text-lg font-bold tracking-tight text-slate-900 truncate">{name}</span>
      </div>
    )

  if (centered) {
    return <div className="flex w-full justify-center">{content}</div>
  }

  return content
}

export function BrandLogo({
  variant = "full",
  width,
  height,
  className = "",
  imageClassName = "object-contain",
  priority = false,
  centered = false,
  overrideSrc,
}: BrandLogoProps) {
  const { branding, isLoading, platformName } = useBranding()
  const [imgError, setImgError] = useState(false)

  const effectivePlatformName = platformName || "MOTOCLUB"
  const rawSrc = overrideSrc || (variant === "icon" ? branding.iconUrl || branding.logoUrl : branding.logoUrl || branding.iconUrl)
  const src = imgError ? null : rawSrc

  const w = width ?? (variant === "icon" ? 40 : 220)
  const h = height ?? (variant === "icon" ? 40 : 56)

  if (!src) {
    if (isLoading && !overrideSrc) {
      return (
        <div
          className={`animate-pulse rounded-md bg-gray-200 ${variant === "icon" ? "h-10 w-10" : "h-9 w-36"} ${
            centered ? "mx-auto" : ""
          } ${className}`.trim()}
        />
      )
    }
    return <BrandTextFallback variant={variant} className={className} centered={centered} platformName={effectivePlatformName} />
  }

  const image = (
    <Image
      src={src}
      alt={`${effectivePlatformName} logo`}
      width={w}
      height={h}
      className={`${imageClassName} ${centered ? "mx-auto block" : ""} ${className}`.trim()}
      priority={priority}
      onError={() => setImgError(true)}
      unoptimized={src.includes("blob.vercel-storage.com")}
    />
  )

  if (centered) {
    return <div className="flex w-full justify-center">{image}</div>
  }

  return image
}
