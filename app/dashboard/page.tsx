"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Dashboard from "@/components/dashboard/dashboard"
import { useAppSelector, useAppDispatch } from "@/store/hooks"
import { selectDevice, loadFromStorage, clearDeviceData } from "@/store/slices/deviceSlice"

function DashboardPageContent() {
  const [isLoading, setIsLoading] = useState(true)
  
  const device = useAppSelector(selectDevice)
  const dispatch = useAppDispatch()
  const router = useRouter()

  useEffect(() => {
    // Load saved data from localStorage
    dispatch(loadFromStorage())
    
    // Small delay to ensure Redux hydration
    setTimeout(() => {
      // Check if user is authenticated
      if (!device.id || !device.user?.token) {
        router.replace("/")
        return
      }
      
      setIsLoading(false)
    }, 100)
  }, [device.id, device.user?.token, dispatch, router])

  // Handle logout
  const handleLogout = () => {
    dispatch(clearDeviceData())
    router.replace("/")
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto" />
          <p>Loading...</p>
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
            <p>Loading...</p>
          </div>
        </div>
      }
    >
      <DashboardPageContent />
    </Suspense>
  )
}