"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2 } from "lucide-react"
import Image from "next/image"
import AdminDashboard from "@/components/admin/admin-dashboard"

// The hardcoded password for admin access
const ADMIN_PASSWORD = "mcodevdemo"
const ADMIN_AUTH_KEY = "admin_authenticated"

export default function AdminPage() {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)

  // Check if already authenticated
  useEffect(() => {
    const checkAuth = () => {
      const isAuth = localStorage.getItem(ADMIN_AUTH_KEY) === "true"
      setIsAuthenticated(isAuth)
      setIsCheckingAuth(false)
    }

    checkAuth()
  }, [])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    // Simple timeout to simulate authentication process
    setTimeout(() => {
      if (password === ADMIN_PASSWORD) {
        localStorage.setItem(ADMIN_AUTH_KEY, "true")
        setIsAuthenticated(true)
      } else {
        setError("Invalid password. Please try again.")
      }
      setIsLoading(false)
    }, 1000)
  }

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_AUTH_KEY)
    setIsAuthenticated(false)
  }

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F172A]">
        <div className="h-16 w-16 animate-spin rounded-full border-4 border-t-transparent border-[#6366F1]"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    return <AdminDashboard onLogout={handleLogout} />
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#0F172A] p-4 md:p-0">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="relative mx-auto mb-6 h-24 w-24">
            <Image
              src="https://www.opencoders.icu/oc.png"
              alt="EzzyCartz Logo"
              width={96}
              height={96}
              className="object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-white md:text-4xl">ADMIN PORTAL</h1>
          <p className="mt-2 text-[#94A3B8]">Command your retail empire</p>
        </div>

        <Card className="border-0 bg-[#1E293B] p-1 shadow-[0_0_15px_rgba(99,102,241,0.5)]">
          <div className="relative overflow-hidden rounded-2xl">
            <div className="absolute inset-0 bg-gradient-to-br from-[#6366F1] via-[#8B5CF6] to-[#EC4899] opacity-10"></div>
            <div className="relative p-6">
              <h2 className="mb-6 text-center text-2xl font-bold text-white">ACCESS TERMINAL</h2>
              <form onSubmit={handleLogin} className="space-y-6">
                {error && (
                  <Alert variant="destructive" className="border-red-500 bg-red-900/20 text-red-200">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="ml-2">{error}</AlertDescription>
                  </Alert>
                )}
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-[#94A3B8]">
                    SECURITY CODE
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="h-12 border-[#4C5E7E] bg-[#1E293B]/80 text-white placeholder:text-[#4C5E7E] focus:border-[#6366F1] focus:ring-[#6366F1]"
                      placeholder="Enter your access code"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                      <div className={`h-2 w-2 rounded-full ${password ? "bg-[#6366F1]" : "bg-[#4C5E7E]"}`}></div>
                    </div>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="relative w-full overflow-hidden bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] py-3 text-white transition-all hover:from-[#4F46E5] hover:to-[#7C3AED] hover:shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> AUTHENTICATING...
                    </>
                  ) : (
                    <>AUTHENTICATE</>
                  )}
                  <div className="absolute bottom-0 left-0 h-1 w-full bg-white/10"></div>
                </Button>
              </form>
            </div>
          </div>
        </Card>

        <div className="mt-8 text-center text-sm text-[#64748B]">
          <p>EZZY CARTZ ADMIN SYSTEM v2.0</p>
          <p className="mt-1">SECURE CONNECTION ESTABLISHED</p>
        </div>
      </div>
    </div>
  )
}
