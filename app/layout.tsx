import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import { Inter } from "next/font/google"
import { Toaster } from "@/components/ui/toaster"
import { NotificationProvider } from "@/components/ui/global-notification"
import { ClientProvider } from "@/components/client-provider"
import { BrandingProvider } from "@/components/branding-provider"
import { CustomThemeProvider } from "@/hooks/use-custom-theme"
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: BRAND_NAME,
  description: BRAND_TAGLINE,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ClientProvider>
          <BrandingProvider>
            <CustomThemeProvider>
              <NotificationProvider>
                {children}
                <Toaster />
              </NotificationProvider>
            </CustomThemeProvider>
          </BrandingProvider>
        </ClientProvider>
      </body>
    </html>
  )
}
