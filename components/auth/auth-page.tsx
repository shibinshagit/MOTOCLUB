"use client"

import { BrandLogo } from "@/components/brand-logo"
import { useBranding } from "@/components/branding-provider"
import LoginForm from "./login-form"

export default function AuthPage() {
  const { platformName } = useBranding()

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
            <BrandLogo variant="full" centered priority className="h-16 w-auto max-w-[280px]" />
          </div>
          <h2 className="mt-8 text-center text-2xl font-semibold tracking-tight text-gray-900">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="rounded-xl border border-border bg-card px-6 py-8 sm:px-8">
            <LoginForm />
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-sm text-gray-500">
        <p>
          © {new Date().getFullYear()} {platformName}. All rights reserved.
        </p>
      </footer>
    </div>
  )
}
