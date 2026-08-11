"use client"

import { useState, useEffect } from "react"
import { getDeviceStaff } from "@/app/actions/staff-actions"
import { reassignSaleOwnership } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { Loader2 } from "lucide-react"

interface StaffOwnerSelectProps {
  saleId: number
  deviceId: number
  currentStaffId: number | null
  currentStaffName?: string
  staffList?: any[]
  onUpdate?: () => void
}

// Simple in-memory cache to prevent repeated fetching across rows
const staffCache: Record<number, any[]> = {}

export function StaffOwnerSelect({
  saleId,
  deviceId,
  currentStaffId,
  currentStaffName,
  staffList: propStaffList,
  onUpdate,
}: StaffOwnerSelectProps) {
  const { toast } = useToast()
  const [internalStaffList, setInternalStaffList] = useState<any[]>(
    propStaffList || (deviceId ? staffCache[deviceId] || [] : [])
  )
  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    currentStaffId == null ? "" : String(currentStaffId)
  )
  const [isUpdating, setIsUpdating] = useState(false)

  // Sync selected staff ID when currentStaffId prop changes
  useEffect(() => {
    setSelectedStaffId(currentStaffId == null ? "" : String(currentStaffId))
  }, [currentStaffId])

  // Sync propStaffList if passed
  useEffect(() => {
    if (propStaffList && propStaffList.length > 0) {
      setInternalStaffList(propStaffList)
      if (deviceId) staffCache[deviceId] = propStaffList
    }
  }, [propStaffList, deviceId])

  // Fetch staff list if not in cache or props
  useEffect(() => {
    if (propStaffList && propStaffList.length > 0) return
    if (!deviceId) return
    if (staffCache[deviceId]) {
      setInternalStaffList(staffCache[deviceId])
      return
    }

    let mounted = true
    async function loadStaff() {
      try {
        const res = await getDeviceStaff(deviceId)
        if (mounted && res.success && res.data) {
          staffCache[deviceId] = res.data
          setInternalStaffList(res.data)
        }
      } catch (err) {
        console.error("Failed to load staff list for select:", err)
      }
    }

    loadStaff()
    return () => {
      mounted = false
    }
  }, [deviceId, propStaffList])

  const handleChange = async (newVal: string) => {
    const newStaffId = newVal === "" ? null : Number(newVal)
    const prevVal = selectedStaffId

    // Optimistic UI update for ZERO lag feeling
    setSelectedStaffId(newVal)
    setIsUpdating(true)

    try {
      const res = await reassignSaleOwnership(saleId, deviceId, newStaffId)
      if (res.success) {
        notifySuccess(toast, "Ownership reassigned successfully!")
        if (onUpdate) onUpdate()
      } else {
        setSelectedStaffId(prevVal) // Revert on failure
        notifyError(toast, res.message || "Failed to reassign ownership")
      }
    } catch (err: any) {
      setSelectedStaffId(prevVal) // Revert on error
      notifyError(toast, err.message || "Error reassigning ownership")
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="flex items-center gap-1.5 min-w-[130px]" onClick={(e) => e.stopPropagation()}>
      {isUpdating && <Loader2 className="h-3 w-3 animate-spin text-blue-600 shrink-0" />}
      <select
        value={selectedStaffId}
        disabled={isUpdating}
        onChange={(e) => handleChange(e.target.value)}
        className="h-7 text-[11px] font-medium bg-slate-50 hover:bg-white border border-slate-200 hover:border-slate-300 rounded px-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs w-full truncate transition-colors"
      >
        <option value="">Store / Admin</option>
        {internalStaffList.map((s: any) => (
          <option key={s.id} value={String(s.id)}>
            {s.name} ({s.position || "Staff"})
          </option>
        ))}
      </select>
    </div>
  )
}
