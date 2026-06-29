"use client"

import { BrandLogo } from "@/components/brand-logo"
import { useBranding } from "@/components/branding-provider"

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return "Good morning"
  if (hour < 17) return "Good afternoon"
  return "Good evening"
}

function WelcomeSkeleton() {
  return (
    <div className="flex flex-col items-center">
      <div className="mt-10 h-9 w-48 animate-pulse rounded-lg bg-violet-100/60" />
      <div className="mt-4 h-5 w-32 animate-pulse rounded-md bg-violet-100/50" />
      <div className="mt-3 h-4 w-56 animate-pulse rounded-md bg-violet-100/40" />
    </div>
  )
}

export default function CompaniesHome() {
  const { branding, platformName, isLoading } = useBranding()
  const hasFullLogo = Boolean(branding.logoUrl)
  const greeting = getGreeting()

  return (
    <div className="relative flex min-h-[calc(100vh-8rem)] items-center justify-center overflow-hidden rounded-2xl">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-background via-card to-brand-violet-soft/40" />
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-brand-violet-soft/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 h-64 w-64 rounded-full bg-brand-blue-soft/40 blur-3xl" />

      <div className="relative z-10 w-full max-w-lg px-4">
        <div className="rounded-3xl border border-border bg-card/90 p-10 text-center backdrop-blur-sm sm:p-12">
          {isLoading ? (
            <WelcomeSkeleton />
          ) : (
            <>
              <div className="mx-auto inline-flex rounded-2xl border border-border bg-muted/30 p-5">
                {hasFullLogo ? (
                  <BrandLogo variant="full" centered priority className="h-14 w-auto max-w-[240px]" />
                ) : (
                  <BrandLogo variant="icon" width={72} height={72} centered priority className="h-[72px] w-[72px] rounded-xl" />
                )}
              </div>

              <p className="mt-10 text-sm font-medium uppercase tracking-[0.2em] text-primary/80">{greeting}</p>

              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-[2.75rem] sm:leading-tight">
                Welcome
              </h1>

              <p className="mt-4 text-lg text-muted-foreground">{platformName}</p>

              <div className="mx-auto mt-8 h-px w-16 bg-gradient-to-r from-transparent via-border to-transparent" />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
