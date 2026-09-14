"use client"

import { useState } from "react"
import Link from "next/link"
import { LayoutDashboard, UserCircle, Menu, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BrandLogo } from "@/components/brand-logo"
import { LogoutButton } from "./logout-button"

export function PartnerDashboardShell({
  data,
  logoUrl,
  children,
}: {
  data: {
    partner_name: string
    device_name?: string
    company_name?: string
  }
  logoUrl?: string | null
  children: React.ReactNode
}) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-20 bg-white border-r">
        <div className="flex flex-col flex-grow pt-5 overflow-y-auto">
          <div className="flex items-center px-4 mb-4">
            <BrandLogo overrideSrc={logoUrl || undefined} className="h-9 w-auto" />
          </div>
          <div className="px-4 pb-4 border-b border-gray-100">
            <h2 className="text-base font-bold tracking-tight text-slate-800 truncate" title={data.company_name || "MOTO CLUB"}>
              {data.company_name || "MOTO CLUB"}
            </h2>
            {data.device_name && (
              <p className="text-xs text-slate-500 mt-0.5 truncate" title={data.device_name}>
                {data.device_name}
              </p>
            )}
          </div>
          <div className="p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Partner Portal
            </p>
            <nav className="space-y-1">
              <Link
                href="/partner/dashboard"
                className="flex items-center gap-3 px-3 py-2 bg-slate-100 text-slate-900 rounded-lg font-medium text-sm transition-colors"
              >
                <LayoutDashboard className="h-4 w-4 text-slate-600" />
                Dashboard
              </Link>
            </nav>
          </div>
        </div>
        <div className="mt-auto p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-4 px-2">
            <UserCircle className="h-8 w-8 text-slate-400 shrink-0" />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-slate-800 truncate" title={data.partner_name}>
                {data.partner_name}
              </span>
              <span className="text-xs text-slate-500 font-medium">Partner</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Mobile Top Header Navbar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-white border-b flex justify-between items-center px-4 py-3 h-16 shadow-2xs">
        <div className="flex items-center min-w-0 overflow-hidden">
          <BrandLogo overrideSrc={logoUrl || undefined} className="h-8 w-auto max-h-8 object-contain" />
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(true)} aria-label="Open navigation menu">
          <Menu className="h-6 w-6 text-slate-700" />
        </Button>
      </div>

      {/* Mobile Sidebar Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-gray-600/75 backdrop-blur-xs transition-opacity" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white shadow-xl">
            <div className="absolute top-0 right-0 -mr-12 pt-2">
              <Button variant="ghost" size="icon" className="text-white hover:bg-white/10" onClick={() => setIsMobileMenuOpen(false)}>
                <X className="h-6 w-6" />
              </Button>
            </div>
            <div className="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
              <div className="flex-shrink-0 flex items-center px-4 mb-4">
                <BrandLogo overrideSrc={logoUrl || undefined} className="h-9 w-auto" />
              </div>
              <div className="px-4 pb-4 border-b border-gray-100">
                <h2 className="text-base font-bold text-slate-800 truncate" title={data.company_name || "MOTO CLUB"}>
                  {data.company_name || "MOTO CLUB"}
                </h2>
                {data.device_name && (
                  <p className="text-xs text-slate-500 mt-0.5 truncate" title={data.device_name}>
                    {data.device_name}
                  </p>
                )}
              </div>
              <div className="p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Partner Portal
                </p>
                <nav className="space-y-1">
                  <Link
                    href="/partner/dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 bg-slate-100 text-slate-900 rounded-lg font-medium text-sm"
                  >
                    <LayoutDashboard className="h-5 w-5 text-slate-600" />
                    Dashboard
                  </Link>
                </nav>
              </div>
            </div>
            <div className="mt-auto flex-shrink-0 border-t border-gray-200 p-4">
              <div className="flex items-center gap-3 mb-4 px-2">
                <UserCircle className="h-8 w-8 text-slate-400 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold text-slate-800 truncate" title={data.partner_name}>
                    {data.partner_name}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Partner</span>
                </div>
              </div>
              <LogoutButton />
            </div>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <div className="flex flex-col flex-1 w-full min-w-0 md:pl-64 pt-16 md:pt-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
