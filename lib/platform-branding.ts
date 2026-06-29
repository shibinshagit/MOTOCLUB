import { resolvePlatformName } from "@/lib/brand"

export type PlatformBranding = {
  logoUrl: string | null
  iconUrl: string | null
  name: string | null
}

export const EMPTY_PLATFORM_BRANDING: PlatformBranding = {
  logoUrl: null,
  iconUrl: null,
  name: null,
}

let brandingCache: PlatformBranding = { ...EMPTY_PLATFORM_BRANDING }

export function setPlatformBrandingCache(branding: PlatformBranding) {
  brandingCache = branding
}

export function getPlatformBrandingCache(): PlatformBranding {
  return brandingCache
}

export function getCachedPlatformName(): string {
  return resolvePlatformName(brandingCache.name)
}

export function getDefaultDeviceLogoUrl(): string | null {
  return brandingCache.iconUrl || brandingCache.logoUrl || null
}

/** @deprecated Use getDefaultDeviceLogoUrl() */
export function getDefaultCompanyLogoUrl(): string | null {
  return getDefaultDeviceLogoUrl()
}
