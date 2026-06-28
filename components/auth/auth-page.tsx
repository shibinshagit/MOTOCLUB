"use client"

import { BrandLogo } from "@/components/brand-logo"
import { BRAND_NAME } from "@/lib/brand"
import LoginForm from "./login-form"

export default function AuthPage() {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="flex flex-1 flex-col justify-center px-6 py-12 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="flex justify-center">
          <BrandLogo variant="full" centered priority className="h-16 w-auto max-w-[280px]" />
          </div>
          <h2 className="mt-8 text-center text-2xl font-bold leading-9 tracking-tight text-white">
            Sign in to your account
          </h2>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="border border-gray-700 bg-gray-800 px-6 py-8 shadow-xl sm:rounded-xl sm:px-8">
            <LoginForm />
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} {BRAND_NAME}. All rights reserved.</p>
      </footer>
    </div>
  )
}
