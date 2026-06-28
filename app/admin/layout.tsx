import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-admin",
})

export const metadata: Metadata = {
  title: `${BRAND_NAME} Admin`,
  description: `${BRAND_NAME} admin dashboard — ${BRAND_TAGLINE}`,
}

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className={`admin-portal ${inter.variable} min-h-screen w-full font-sans`}>
      {children}
      <Toaster />
    </div>
  )
}
