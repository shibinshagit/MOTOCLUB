"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EyeIcon, EyeOffIcon, MailIcon, LockIcon, Loader2 } from "lucide-react"
import { login } from "@/app/actions/auth-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifySuccess } from "@/lib/notifications"
import { FormAlert } from "@/components/ui/form-alert"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { setDeviceData, selectDevice, loadFromStorage } from "@/store/slices/deviceSlice"

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const { toast } = useToast()
  const dispatch = useAppDispatch()
  const device = useAppSelector(selectDevice)

  useEffect(() => {
    dispatch(loadFromStorage())
  }, [dispatch])

  useEffect(() => {
    if (device.id && device.user?.token) {
      router.replace("/dashboard")
    }
  }, [device.id, device.user?.token, router])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const formData = new FormData(e.currentTarget)
      const result = await login(formData)

      if (result.success) {
        if (result.data) {
          dispatch(
            setDeviceData({
              device: result.data.device,
              company: result.data.company,
              user: result.data.user,
            }),
          )
        }

        notifySuccess(toast, "Welcome back! You've been logged in successfully.", "Login Successful")

        router.push(result.redirect || "/dashboard")
      } else {
        setError(result.message)
      }
    } catch (loginError) {
      console.error("Login error:", loginError)
      setError("An unexpected error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (device.id && device.user?.token) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <FormAlert type="error" message={error} />}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <MailIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="name@example.com"
            required
            autoComplete="email"
            className="border-gray-200 bg-white pl-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <LockIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            className="border-gray-200 bg-white pl-10 pr-10"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4 text-gray-400" /> : <EyeIcon className="h-4 w-4 text-gray-400" />}
            <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
          </Button>
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
  )
}
