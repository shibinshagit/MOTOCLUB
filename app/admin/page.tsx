"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FormAlert } from "@/components/ui/form-alert"
import { Loader2, LockIcon, MailIcon } from "lucide-react"
import { BrandLogo } from "@/components/brand-logo"
import { useBranding } from "@/components/branding-provider"
import { adminLogin, getAdminSession } from "@/app/actions/admin-auth-actions"

export default function AdminPage() {
  const router = useRouter()
  const { platformName } = useBranding()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  useEffect(() => {
    getAdminSession()
      .then((session) => {
        if (session.authenticated) {
          router.replace("/admin/companies")
        }
      })
      .finally(() => setIsCheckingAuth(false))
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.set("email", email)
      formData.set("password", password)

      const result = await adminLogin(formData)

      if (result.success && result.admin) {
        setPassword("")
        router.push("/admin/companies")
        router.refresh()
      } else {
        setError(result.message || "Invalid email or password")
      }
    } catch (loginError) {
      console.error("Admin login failed:", loginError)
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo variant="full" centered priority className="h-14 w-auto max-w-[260px]" />
        </div>

        <Card className="border-gray-200 bg-white shadow-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Use your admin email and password</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && <FormAlert type="error" message={error} />}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <MailIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="border-gray-200 bg-white pl-10 text-gray-900 placeholder:text-gray-400"
                    placeholder="admin@example.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <LockIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="border-gray-200 bg-white pl-10 text-gray-900 placeholder:text-gray-400"
                    placeholder="Enter your password"
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  "Sign in"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-gray-400">{platformName} Admin</p>
      </div>
    </div>
  )
}
