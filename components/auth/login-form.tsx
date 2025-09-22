"use client"u

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EyeIcon, EyeOffIcon, AlertCircle, MailIcon, LockIcon, InfoIcon } from "lucide-react"
import { login } from "@/app/actions/auth-actions"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { setDeviceData, selectDevice, loadFromStorage } from "@/store/slices/deviceSlice"

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)

  const router = useRouter()
  const { toast } = useToast()
  const dispatch = useAppDispatch()
  const device = useAppSelector(selectDevice)

  // Load Redux state from localStorage on component mount
  useEffect(() => {
    dispatch(loadFromStorage())
  }, [dispatch])

  // Check if user is already logged in
  useEffect(() => {
    if (device.id && device.user?.token) {
      // User is already logged in, redirect to dashboard
      router.replace("/dashboard")
    }
  }, [device.id, device.user?.token, router])

  // Check if we're in demo mode based on URL parameters
  useEffect(() => {
    setIsDemoMode(false)
  }, [])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData(e.currentTarget)

      // If demo mode is explicitly enabled via URL, use demo credentials
      if (isDemoMode) {
        formData.set("email", "demo@example.com")
        formData.set("password", "demo123")
      }

      const result = await login(formData)

      if (result.success) {
        // Store device and company data in Redux (will be persisted)
        if (result.data) {
          dispatch(
            setDeviceData({
              device: result.data.device,
              company: result.data.company,
              user: result.data.user,
            }),
          )
        }

        // Check if we're in demo mode based on the response
        const isDemo = result.message.includes("Demo Mode")

        if (isDemo) {
          toast({
            title: "Demo Mode Active",
            description: "You're using the application in demo mode with sample data.",
            duration: 5000,
          })
        } else {
          toast({
            title: "Login Successful",
            description: "Welcome back! You've been logged in successfully.",
          })
        }

        // Use router.push for navigation within Next.js
        router.push(result.redirect || "/dashboard")
      } else {
        setError(result.message)
      }
    } catch (error) {
      console.error("Login error:", error)
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  // Function to enable demo mode
  const enableDemoMode = () => {
    toast({
      title: "Demo Mode Disabled",
      description: "Demo mode has been disabled in this application.",
      duration: 5000,
    })
  }

  // Don't render login form if user is already logged in
  if (device.id && device.user?.token) {
    return (
      <div className="flex items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto"></div>
          <p>Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <Alert
          variant="destructive"
          className="border-red-800 bg-red-900/50 text-red-200 animate-in slide-in-from-top duration-300"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="ml-2">{error}</AlertDescription>
        </Alert>
      )}

      {isDemoMode && (
        <Alert className="border-blue-800 bg-blue-900/50 text-blue-200 animate-in slide-in-from-top duration-300">
          <InfoIcon className="h-4 w-4" />
          <AlertDescription className="ml-2">
            Demo mode is active. You can log in without credentials to use sample data.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-medium text-blue-300">
          Email
        </Label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <MailIcon className="h-5 w-5 text-gray-500" />
          </div>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder={isDemoMode ? "demo@example.com (auto-filled)" : "name@example.com"}
            className="h-11 pl-10 rounded-lg bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring focus:ring-blue-500/30"
            required={!isDemoMode}
            disabled={isDemoMode}
            defaultValue={isDemoMode ? "demo@example.com" : ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center">
          <Label htmlFor="password" className="text-sm font-medium text-blue-300">
            Password
          </Label>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <LockIcon className="h-5 w-5 text-gray-500" />
          </div>
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder={isDemoMode ? "••••••• (auto-filled)" : "•••••••"}
            className="h-11 pl-10 rounded-lg bg-gray-700 border-gray-600 text-white placeholder-gray-400 focus:border-blue-500 focus:ring focus:ring-blue-500/30"
            required={!isDemoMode}
            disabled={isDemoMode}
            defaultValue={isDemoMode ? "demo123" : ""}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent text-gray-400 hover:text-blue-300"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
          </Button>
        </div>
      </div>

      <div className="pt-2">
        <Button
          type="submit"
          className="w-full h-11 rounded-lg bg-blue-600 py-2 font-medium text-white hover:bg-blue-700 focus:ring-4 focus:ring-blue-500/30"
          disabled={isLoading}
        >
          {isLoading ? (
            <div className="flex items-center justify-center">
              <svg
                className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Signing in...
            </div>
          ) : isDemoMode ? (
            "Sign in (Demo Mode)"
          ) : (
            "Sign in"
          )}
        </Button>
      </div>
    </form>
  )
}
