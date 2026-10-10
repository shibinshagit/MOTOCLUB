"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { PurchaseManagerDashboard } from "@/components/purchase-manager/purchase-manager-dashboard"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { selectDevice, loadFromStorage, clearDeviceData } from "@/store/slices/deviceSlice"
import { clearStaff, selectActiveStaff, setStaff, activateStaff } from "@/store/slices/staffSlice"
import { getStaffForAuthentication } from "@/app/actions/staff-actions"
import { staffLogout } from "@/app/actions/staff-auth-actions"

function PurchaseManagerPageContent() {
  const [mounted, setMounted] = useState(false)
  const [isRestoringSession, setIsRestoringSession] = useState(false)
  const router = useRouter()
  const dispatch = useAppDispatch()
  
  const device = useAppSelector(selectDevice)
  const activeStaff = useAppSelector(selectActiveStaff)

  useEffect(() => {
    dispatch(loadFromStorage())
    setMounted(true)
  }, [dispatch])

  useEffect(() => {
    const restoreSession = async () => {
      if (!mounted || !device?.id || activeStaff || isRestoringSession) return

      setIsRestoringSession(true)
      try {
        const sessionKey = `staff_session_device_${device.id}`
        const storedStaffIdRaw = typeof window !== "undefined" ? localStorage.getItem(sessionKey) : null
        const storedStaffId = storedStaffIdRaw ? Number.parseInt(storedStaffIdRaw, 10) : NaN

        if (!storedStaffId || Number.isNaN(storedStaffId)) {
          router.replace("/")
          return
        }

        const staffRes = await getStaffForAuthentication(device.id)
        if (!staffRes.success || !staffRes.data?.length) {
          router.replace("/")
          return
        }

        const staffList = staffRes.data as any[]
        const matchedStaff = staffList.find((member) => member.id === storedStaffId)
        if (!matchedStaff) {
          localStorage.removeItem(sessionKey)
          router.replace("/")
          return
        }

        dispatch(setStaff(staffList))
        dispatch(
          activateStaff({
            staffId: storedStaffId,
            allStaff: staffList,
          }),
        )
      } catch (error) {
        console.error("Failed to restore session:", error)
        router.replace("/")
      } finally {
        setIsRestoringSession(false)
      }
    }

    restoreSession()
  }, [mounted, device?.id, activeStaff, isRestoringSession, dispatch, router])

  const handleLogout = async () => {
    try {
      if (device?.id && typeof window !== "undefined") {
        localStorage.removeItem(`staff_session_device_${device.id}`)
      }
      dispatch(clearDeviceData())
      dispatch(clearStaff())
      await staffLogout()
      router.replace("/")
    } catch (error) {
      dispatch(clearDeviceData())
      dispatch(clearStaff())
      router.replace("/")
    }
  }

  if (!mounted || isRestoringSession || !activeStaff) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <PurchaseManagerDashboard 
      staffName={activeStaff.name} 
      onLogout={handleLogout} 
    />
  )
}

export default function PurchaseManagerDashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    }>
      <PurchaseManagerPageContent />
    </Suspense>
  )
}
