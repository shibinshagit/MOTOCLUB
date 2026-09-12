import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { inter } from "@/lib/fonts"
import { Toaster } from "@/components/ui/toaster"
import { ClientProvider } from "@/components/client-provider"
import { BrandingProvider } from "@/components/branding-provider"
import { DEFAULT_PLATFORM_NAME, BRAND_TAGLINE } from "@/lib/brand"

export const metadata: Metadata = {
  title: DEFAULT_PLATFORM_NAME,
  description: BRAND_TAGLINE,
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: "/icon.png",
    apple: "/icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <ClientProvider>
          <BrandingProvider>
            {children}
            <Toaster />
          </BrandingProvider>
        </ClientProvider>
      </body>
    </html>
  )
}
