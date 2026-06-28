export type PlatformBranding = {
  logoUrl: string | null
  iconUrl: string | null
}

export const EMPTY_PLATFORM_BRANDING: PlatformBranding = {
  logoUrl: null,
  iconUrl: null,
}

let brandingCache: PlatformBranding = { ...EMPTY_PLATFORM_BRANDING }

export function setPlatformBrandingCache(branding: PlatformBranding) {
  brandingCache = branding
}

export function getPlatformBrandingCache(): PlatformBranding {
  return brandingCache
}

export function getDefaultCompanyLogoUrl(): string | null {
  return brandingCache.iconUrl || brandingCache.logoUrl || null
}
