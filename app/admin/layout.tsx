import type React from "react"
import type { Metadata } from "next"
import { Toaster } from "@/components/ui/toaster"
import { DEFAULT_PLATFORM_NAME, BRAND_TAGLINE } from "@/lib/brand"

export const metadata: Metadata = {
  title: `${DEFAULT_PLATFORM_NAME} Admin`,
  description: `${DEFAULT_PLATFORM_NAME} admin dashboard — ${BRAND_TAGLINE}`,
}

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="admin-portal min-h-screen w-full font-sans">
      {children}
      <Toaster />
    </div>
  )
}
