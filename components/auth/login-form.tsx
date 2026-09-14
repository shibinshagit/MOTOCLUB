"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EyeIcon, EyeOffIcon, LockIcon, Loader2, PhoneIcon } from "lucide-react"
import { login } from "@/app/actions/auth-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifySuccess } from "@/lib/notifications"
import { FormAlert } from "@/components/ui/form-alert"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { setDeviceData, selectDevice } from "@/store/slices/deviceSlice"
import { setStaff, activateStaff } from "@/store/slices/staffSlice"

export default function LoginForm() {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const { toast } = useToast()
  const dispatch = useAppDispatch()
  const device = useAppSelector(selectDevice)

  useEffect(() => {
    // Only redirect if we have a confirmed authenticated state
    if (device.id && device.user?.token) {
      if (device.user.role === "STAFF") {
        router.replace("/staff/dashboard")
      } else if (device.user.role === "PARTNER") {
        router.replace("/partner/dashboard")
      } else {
        router.replace("/dashboard")
      }
    }
  }, [device.id, device.user?.token, device.user?.role, router])

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
              device: result.data.device ?? {
                id: 0,
                name: "",
                currency: "AED",
                logo_url: null,
              },
              company: result.data.company ?? { id: 0, name: "" },
              user: result.data.user,
            }),
          )

          if (result.data.staff) {
            dispatch(setStaff([result.data.staff]))
            dispatch(
              activateStaff({
                staffId: result.data.staff.id,
                allStaff: [result.data.staff],
              }),
            )
            if (typeof window !== "undefined" && result.data.device?.id) {
              const sessionKey = `staff_session_device_${result.data.device.id}`
              localStorage.setItem(sessionKey, String(result.data.staff.id))
            }
          }
        }

        notifySuccess(toast, "Welcome back! You've been logged in successfully.", "Login Successful")
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

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <FormAlert type="error" message={error} />}

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-sm font-semibold text-slate-700">
          Email or Phone
        </Label>
        <div className="relative">
          <PhoneIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="phone"
            name="phone"
            type="text"
            placeholder="Enter your email or phone number"
            required
            autoComplete="username"
            className="h-11 border-slate-200 bg-white pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-sm font-semibold text-slate-700">
          Password
        </Label>
        <div className="relative">
          <LockIcon className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="Enter your password"
            required
            autoComplete="current-password"
            className="h-11 border-slate-200 bg-white pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-600/20 rounded-xl"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 p-0 text-slate-400 hover:bg-slate-100 hover:text-slate-700 rounded-lg"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
            <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
          </Button>
        </div>
      </div>

      <Button
        type="submit"
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl shadow-sm transition-all duration-200 active:scale-[0.99]"
        disabled={isLoading}
      >
        {isLoading ? (
          <div className="flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-white" />
            <span>Signing in...</span>
          </div>
        ) : (
          "Sign In"
        )}
      </Button>
    </form>
  )
}
