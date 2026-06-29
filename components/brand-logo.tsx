"use client"

import Image from "next/image"
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
  platformName,
}: {
  variant: "full" | "icon"
  className?: string
  centered?: boolean
  platformName: string
}) {
  const content =
    variant === "icon" ? (
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white ${className || ""}`.trim()}
      >
        {platformName.charAt(0)}
      </div>
    ) : (
      <span className={`text-xl font-semibold text-gray-900 ${className || ""}`.trim()}>{platformName}</span>
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
  const { branding, isLoading, platformName } = useBranding()
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
    return <BrandTextFallback variant={variant} className={className} centered={centered} platformName={platformName} />
  }

  const image = (
    <Image
      src={src}
      alt={`${platformName} logo`}
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
