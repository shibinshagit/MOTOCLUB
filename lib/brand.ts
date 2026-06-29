export const DEFAULT_PLATFORM_NAME = "opencoders IMS"
export const BRAND_TAGLINE = "Inventory & business management"

/** @deprecated Use DEFAULT_PLATFORM_NAME or useBranding().platformName */
export const BRAND_NAME = DEFAULT_PLATFORM_NAME

export function resolvePlatformName(name: string | null | undefined): string {
  const trimmed = name?.trim()
  return trimmed || DEFAULT_PLATFORM_NAME
}

/** @deprecated Use useBranding() or getPlatformBranding() instead */
export const BRAND_LOGO = ""
/** @deprecated Use useBranding() or getPlatformBranding() instead */
export const BRAND_ICON = ""
/** @deprecated Use getDefaultDeviceLogoUrl() instead */
export const DEFAULT_COMPANY_LOGO = ""
