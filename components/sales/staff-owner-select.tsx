"use client"

import { useState, useEffect, useRef } from "react"
import { getDeviceStaff } from "@/app/actions/staff-actions"
import { reassignSaleOwnership } from "@/app/actions/sale-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { Loader2, ChevronDown, Check, User, UserCheck, Search, Shield } from "lucide-react"

interface StaffOwnerSelectProps {
  saleId: number
  deviceId: number
  currentStaffId: number | null
  currentStaffName?: string
  staffList?: any[]
  onUpdate?: () => void
}

// In-memory cache to prevent repeated fetching across rows
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
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const containerRef = useRef<HTMLDivElement>(null)

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

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isOpen])

  // Resolve staff member name to display
  const matchedStaff = internalStaffList.find((s) => String(s.id) === selectedStaffId)
  
  // If currentStaffId is null but currentStaffName exists, try matching by name
  let displayName = "Store / Admin"
  let displayRole = ""
  let initials = "SA"

  if (matchedStaff) {
    displayName = matchedStaff.name
    displayRole = matchedStaff.role || matchedStaff.position || "Staff"
    initials = matchedStaff.name.slice(0, 2).toUpperCase()
  } else if (currentStaffName && currentStaffName.trim() !== "") {
    displayName = currentStaffName
    initials = currentStaffName.slice(0, 2).toUpperCase()
    // Try finding in list by name
    const byName = internalStaffList.find((s) => s.name.toLowerCase().trim() === currentStaffName.toLowerCase().trim())
    if (byName) {
      displayRole = byName.role || byName.position || "Staff"
    }
  }

  const handleSelectOption = async (newVal: string) => {
    setIsOpen(false)
    const newStaffId = newVal === "" ? null : Number(newVal)
    const prevVal = selectedStaffId

    setSelectedStaffId(newVal)
    setIsUpdating(true)

    try {
      const res = await reassignSaleOwnership(saleId, deviceId, newStaffId)
      if (res.success) {
        notifySuccess(toast, "Ownership reassigned successfully!")
        if (onUpdate) onUpdate()
      } else {
        setSelectedStaffId(prevVal)
        notifyError(toast, res.message || "Failed to reassign ownership")
      }
    } catch (err: any) {
      setSelectedStaffId(prevVal)
      notifyError(toast, err.message || "Error reassigning ownership")
    } finally {
      setIsUpdating(false)
    }
  }

  const filteredStaffList = internalStaffList.filter((s) =>
    (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.position || "").toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div ref={containerRef} className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={isUpdating}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-slate-50 to-indigo-50/40 hover:from-white hover:to-indigo-100/60 border border-slate-200/90 hover:border-indigo-300 rounded-lg text-xs font-semibold text-slate-800 transition-all shadow-2xs hover:shadow-xs group disabled:opacity-50 cursor-pointer max-w-[170px]"
        title={`Assigned Owner: ${displayName}`}
      >
        {isUpdating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600 shrink-0" />
        ) : selectedStaffId === "" && (!currentStaffName || currentStaffName === "Store / Admin") ? (
          <div className="h-5 w-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
            <UserCheck className="h-3 w-3" />
          </div>
        ) : (
          <div className="h-5 w-5 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-[9px] font-extrabold shadow-2xs shrink-0">
            {initials}
          </div>
        )}

        <span className="truncate max-w-[100px] text-slate-800 font-semibold">{displayName}</span>

        <ChevronDown className={`h-3 w-3 text-slate-400 group-hover:text-slate-600 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Floating Popover Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-xl bg-white border border-slate-200/90 shadow-xl z-50 p-1.5 space-y-1 animate-in fade-in-50 zoom-in-95">
          <div className="px-2 py-1.5 border-b border-slate-100">
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
              <Shield className="h-3 w-3 text-blue-600" />
              Reassign Ownership
            </p>
          </div>

          {internalStaffList.length > 4 && (
            <div className="px-1 py-1">
              <div className="relative">
                <Search className="absolute left-2 top-2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-7 pr-2 py-1 text-xs border rounded-md bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {/* Store / Admin Default Option */}
            <button
              type="button"
              onClick={() => handleSelectOption("")}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedStaffId === "" ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-700"
              }`}
            >
              <div className="flex items-center gap-2 truncate">
                <div className="h-6 w-6 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-[10px] shrink-0 font-bold">
                  <UserCheck className="h-3.5 w-3.5" />
                </div>
                <span className="truncate">Store / Admin</span>
              </div>
              {selectedStaffId === "" && <Check className="h-3.5 w-3.5 text-blue-600 shrink-0" />}
            </button>

            {/* Staff List Options */}
            {filteredStaffList.map((s) => {
              const isSelected = String(s.id) === selectedStaffId
              const staffInitials = (s.name || "S").slice(0, 2).toUpperCase()
              const isPartner = s.role === "partner"
              const isAdminRole = s.role === "admin"

              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectOption(String(s.id))}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                    isSelected ? "bg-blue-50 text-blue-900 font-bold" : "hover:bg-slate-50 text-slate-700 font-medium"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center text-[9px] font-extrabold shrink-0 shadow-2xs">
                      {staffInitials}
                    </div>
                    <div className="truncate text-left">
                      <p className="truncate font-semibold text-slate-900 leading-tight">{s.name}</p>
                      <p className="text-[10px] text-slate-400 truncate">
                        {s.position || (isAdminRole ? "Admin" : isPartner ? "Partner" : "Staff")}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0 ml-1">
                    {isAdminRole && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-bold border border-amber-200">
                        Admin
                      </span>
                    )}
                    {isPartner && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-purple-100 text-purple-800 font-bold border border-purple-200">
                        Partner
                      </span>
                    )}
                    {isSelected && <Check className="h-3.5 w-3.5 text-blue-600" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
