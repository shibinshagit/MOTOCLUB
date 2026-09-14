"use client"

import { BrandLogo } from "@/components/brand-logo"
import { useBranding } from "@/components/branding-provider"
import LoginForm from "./login-form"

export default function AuthPage() {
  const { platformName } = useBranding()

  return (
    <div className="relative min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6 text-slate-900 font-sans overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Simple Subtle Background Pattern & Ambient Lighting */}
      <div className="absolute inset-0 pointer-events-none z-0">
        {/* Soft top gradient radial glow */}
        <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-blue-100/70 via-indigo-50/40 to-transparent blur-3xl rounded-full" />
        
        {/* Modern subtle dot grid pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] [background-size:24px_24px] opacity-50" />

        {/* Soft corner glow */}
        <div className="absolute -bottom-20 -right-20 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl" />
        <div className="absolute -top-20 -left-20 w-96 h-96 bg-indigo-100/30 rounded-full blur-3xl" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center py-10 sm:py-12">
        <div className="w-full max-w-md mx-auto space-y-6">
          {/* Centered Brand Logo */}
          <div className="flex flex-col items-center justify-center">
            <div className="p-3 bg-white/80 rounded-2xl shadow-sm border border-slate-200/60 backdrop-blur-sm">
              <BrandLogo variant="full" centered priority className="h-14 w-auto max-w-[260px] object-contain" />
            </div>
            <h1 className="mt-6 text-center text-2xl font-bold tracking-tight text-slate-900">
              Sign in to your account
            </h1>
          </div>

          {/* Minimal Centered Login Card with Soft Shadow */}
          <div className="rounded-2xl border border-slate-200/90 bg-white/95 backdrop-blur-md p-6 sm:p-8 shadow-xl shadow-slate-200/60">
            <LoginForm />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 py-4 text-center text-xs text-slate-500 font-medium">
        <p>
          © {new Date().getFullYear()} {platformName}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
