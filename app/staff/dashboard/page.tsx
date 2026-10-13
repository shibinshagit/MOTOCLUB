"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import StaffDashboard from "@/components/staff/staff-dashboard"
import { useAppDispatch, useAppSelector } from "@/store/hooks"
import { selectDevice, loadFromStorage } from "@/store/slices/deviceSlice"
import { selectActiveStaff, setStaff, activateStaff } from "@/store/slices/staffSlice"
import { getStaffForAuthentication } from "@/app/actions/staff-actions"

function StaffDashboardPageContent() {
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
        console.error("Failed to restore staff session:", error)
        router.replace("/")
      } finally {
        setIsRestoringSession(false)
      }
    }

    restoreSession()
  }, [mounted, device?.id, activeStaff, isRestoringSession, dispatch, router])

  if (!mounted || isRestoringSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
          <p className="text-gray-500">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return <StaffDashboard />
}

export default function StaffDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-gray-50">
          <div className="text-center">
            <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-gray-400" />
            <p className="text-gray-500">Loading dashboard...</p>
          </div>
        </div>
      }
    >
      <StaffDashboardPageContent />
    </Suspense>
  )
}
