"use client"

import Image from "next/image"
import { BRAND_NAME } from "@/lib/brand"
import { useBranding } from "@/components/branding-provider"

type BrandLogoProps = {
  variant?: "full" | "icon"
  width?: number
  height?: number
  className?: string
  imageClassName?: string
  priority?: boolean
  centered?: boolean
}

function BrandTextFallback({
  variant,
  className,
  centered,
}: {
  variant: "full" | "icon"
  className?: string
  centered?: boolean
}) {
  const content =
    variant === "icon" ? (
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-sm font-bold text-white ${className || ""}`.trim()}
      >
        {BRAND_NAME.charAt(0)}
      </div>
    ) : (
      <span className={`text-xl font-semibold text-gray-900 ${className || ""}`.trim()}>{BRAND_NAME}</span>
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
}: BrandLogoProps) {
  const { branding, isLoading } = useBranding()
  const src = variant === "icon" ? branding.iconUrl || branding.logoUrl : branding.logoUrl || branding.iconUrl
  const w = width ?? (variant === "icon" ? 40 : 220)
  const h = height ?? (variant === "icon" ? 40 : 56)

  if (!src) {
    if (isLoading) {
      return (
        <div
          className={`animate-pulse rounded-md bg-gray-200 ${variant === "icon" ? "h-10 w-10" : "h-14 w-44"} ${
            centered ? "mx-auto" : ""
          } ${className}`.trim()}
        />
      )
    }
    return <BrandTextFallback variant={variant} className={className} centered={centered} />
  }

  const image = (
    <Image
      src={src}
      alt={`${BRAND_NAME} logo`}
      width={w}
      height={h}
      className={`${imageClassName} ${centered ? "mx-auto block" : ""} ${className}`.trim()}
      priority={priority}
      unoptimized={src.includes("blob.vercel-storage.com")}
    />
  )

  if (centered) {
    return <div className="flex w-full justify-center">{image}</div>
  }

  return image
}
