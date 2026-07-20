"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Dashboard from "@/components/dashboard/dashboard"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { selectDevice, loadFromStorage, clearDeviceData } from "@/store/slices/deviceSlice"
import { clearStaff } from "@/store/slices/staffSlice"
import { logout } from "@/app/actions/auth-actions"

function DashboardPageContent() {
  const [mounted, setMounted] = useState(false)

  const device = useAppSelector(selectDevice)
  const dispatch = useAppDispatch()
  const router = useRouter()

  // Step 1: Hydrate Redux from localStorage on first mount
  useEffect(() => {
    dispatch(loadFromStorage())
    setMounted(true)
  }, [dispatch])

  // Step 2: After hydration, check auth. If not authenticated redirect to login.
  useEffect(() => {
    if (!mounted) return
    if (!device.id || !device.user?.token) {
      router.replace("/")
    }
  }, [mounted, device.id, device.user?.token, router])

  const handleLogout = async () => {
    // Clear all localStorage keys for this device
    if (device?.id && typeof window !== "undefined") {
      localStorage.removeItem(`staff_session_device_${device.id}`)
    }
    // Clear Redux state first
    dispatch(clearDeviceData())
    dispatch(clearStaff())
    // Then clear server-side cookies (both authToken + ims_staff_session)
    await logout()
    router.replace("/")
  }

  // Show loading spinner until localStorage has been read
  if (!mounted || !device.id || !device.user?.token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  return <Dashboard onLogout={handleLogout} />
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <DashboardPageContent />
    </Suspense>
  )
}