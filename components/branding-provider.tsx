"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { getPlatformBranding } from "@/app/actions/brand-actions"
import {
  EMPTY_PLATFORM_BRANDING,
  setPlatformBrandingCache,
  type PlatformBranding,
} from "@/lib/platform-branding"

type BrandingContextValue = {
  branding: PlatformBranding
  refreshBranding: () => Promise<void>
  isLoading: boolean
}

const BrandingContext = createContext<BrandingContextValue>({
  branding: EMPTY_PLATFORM_BRANDING,
  refreshBranding: async () => {},
  isLoading: true,
})

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<PlatformBranding>(EMPTY_PLATFORM_BRANDING)
  const [isLoading, setIsLoading] = useState(true)

  const refreshBranding = async () => {
    const next = await getPlatformBranding()
    setBranding(next)
    setPlatformBrandingCache(next)
  }

  useEffect(() => {
    let active = true

    const load = async () => {
      try {
        const next = await getPlatformBranding()
        if (!active) return
        setBranding(next)
        setPlatformBrandingCache(next)
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => {
      active = false
    }
  }, [])

  const value = useMemo(
    () => ({
      branding,
      refreshBranding,
      isLoading,
    }),
    [branding, isLoading],
  )

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
}

export function useBranding() {
  return useContext(BrandingContext)
}
