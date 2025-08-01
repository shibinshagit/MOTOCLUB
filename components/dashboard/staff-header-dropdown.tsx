"use client"

import { useState, useEffect } from "react"
import {
  Users,
  ChevronDown,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  UserCheck,
} from "lucide-react"
import { useSelector, useDispatch } from "react-redux"
import {
  selectStaff,
  selectActiveStaff,
  selectStaffLoading,
  setLoading,
  setStaff,
  activateStaff as activateStaffAction,
} from "@/store/slices/staffSlice"
import { getDeviceStaff, activateStaff } from "@/app/actions/staff-actions"
import NewStaffModal from "../staff/new-staff-modal"
import EditStaffModal from "../staff/edit-staff-modal"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"

interface StaffHeaderDropdownProps {
  userId: number 
  deviceId: number
  showInSaleModal?: boolean
  selectedStaffId?: number | null
  onStaffChange?: (staffId: number | null) => void
}

export default function StaffHeaderDropdown({
  userId,
  deviceId,
  showInSaleModal = false,
  selectedStaffId,
  onStaffChange,
}: StaffHeaderDropdownProps) {
  const dispatch = useDispatch()
  const allStaff = useSelector(selectStaff)
  const activeStaff = useSelector(selectActiveStaff)
  const staffLoading = useSelector(selectStaffLoading)
  const { toast } = useToast()

  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isNewModalOpen, setIsNewModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingStaff, setEditingStaff] = useState<any | null>(null)

  useEffect(() => {
    if (deviceId && allStaff.length === 0) {
      loadStaff()
    }
  }, [deviceId])

  const loadStaff = async () => {
    if (!deviceId) return
    dispatch(setLoading(true))
    try {
      const res = await getDeviceStaff(deviceId)
      if (res.success) {
        dispatch(setStaff(res.data))
      } else {
        console.error(res.message)
      }
    } catch (err) {
      console.error("Error loading staff:", err)
    } finally {
      dispatch(setLoading(false))
    }
  }

  const resolvedStaff = selectedStaffId
    ? allStaff.find((s) => s.id === selectedStaffId) ?? null
    : activeStaff

  const displayName = resolvedStaff ? resolvedStaff.name : "No Active Staff"
  const displayPos = resolvedStaff?.position

  const triggerCls = showInSaleModal
    ? "h-9 px-3 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"

  const handleActivate = async (staffId: number) => {
    if (onStaffChange) {
      onStaffChange(staffId)
      setIsDropdownOpen(false)
      return
    }

    if (!deviceId) return
    try {
      const res = await activateStaff(staffId, deviceId)
      if (res.success) {
        dispatch(
          activateStaffAction({
            staffId,
            allStaff: res.allStaff,
          })
        )
        toast({ title: "Success", description: res.message })
        setIsDropdownOpen(false)
      } else {
        toast({
          title: "Error",
          description: res.message,
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error(err)
      toast({
        title: "Error",
        description: "Failed to activate staff",
        variant: "destructive",
      })
    }
  }

  const handleEdit = (staff: any) => {
    setEditingStaff(staff)
    setIsEditModalOpen(true)
    setIsDropdownOpen(false)
  }

  const handleOpenNewStaffModal = () => {
    if (userId && deviceId) {
      console.log("🚀 Opening NewStaffModal with:", { userId, deviceId })
      setIsNewModalOpen(true)
      setIsDropdownOpen(false)
    } else {
      console.warn("❌ Cannot open modal: Missing userId or deviceId", {
        userId,
        deviceId,
      })
    }
  }

  if (!userId || !deviceId) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Loading account... (Device: {deviceId}, User: {userId})
        </span>
      </div>
    )
  }

  if (staffLoading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
        <Users className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <span className="text-sm text-gray-600 dark:text-gray-300">
          Loading staff...
        </span>
      </div>
    )
  }

  return (
    <>
      <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className={`flex items-center gap-2 ${triggerCls} text-gray-900 dark:text-gray-100 transition-colors`}
          >
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <div className="flex flex-col items-start">
              <span className="text-sm font-medium">{displayName}</span>
              {displayPos && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {displayPos}
                </span>
              )}
            </div>
            <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-80 bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-lg"
        >
          <DropdownMenuLabel className="text-gray-900 dark:text-gray-100">
            Staff Management
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />

          {!showInSaleModal && (
            <>
              <DropdownMenuItem
                onClick={handleOpenNewStaffModal}
                className="flex items-center gap-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                Add New Staff Member
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
            </>
          )}

          <div className="max-h-64 overflow-y-auto">
            {allStaff.length === 0 ? (
              <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No staff members found</p>
                <p className="text-xs">
                  Add your first staff member to get started
                </p>
              </div>
            ) : (
              allStaff.map((staff) => (
                <div
                  key={staff.id}
                  className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div
                    className="flex items-center gap-3 flex-1 cursor-pointer"
                    onClick={() => handleActivate(staff.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {staff.name}
                        </span>
                        {staff.is_active && !selectedStaffId && (
                          <Badge className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs">
                            Active
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {staff.position} • {staff.phone}
                      </div>
                    </div>
                    {staff.is_active && !selectedStaffId && (
                      <UserCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                    )}
                  </div>

                  {!showInSaleModal && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
                      >
                        <DropdownMenuItem
                          onClick={() => handleEdit(staff)}
                          className="flex items-center gap-2 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                        >
                          <Edit className="h-4 w-4" />
                          Edit Staff
                        </DropdownMenuItem>
                        {!staff.is_active && (
                          <DropdownMenuItem
                            onClick={() => handleActivate(staff.id)}
                            className="flex items-center gap-2 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 cursor-pointer"
                          >
                            <UserCheck className="h-4 w-4" />
                            Activate Staff
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
                        <DropdownMenuItem className="flex items-center gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 cursor-pointer">
                          <Trash2 className="h-4 w-4" />
                          Delete Staff
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              ))
            )}
          </div>

          {allStaff.length > 0 && !showInSaleModal && (
            <>
              <DropdownMenuSeparator className="bg-gray-200 dark:bg-gray-700" />
              <div className="p-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                Click on a staff member to activate them
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isNewModalOpen && (
        <NewStaffModal
          isOpen={true}
          onClose={() => setIsNewModalOpen(false)}
          onStaffAdded={loadStaff}
          userId={userId}
          deviceId={deviceId}
        />
      )}


      {editingStaff && !showInSaleModal && (
        <EditStaffModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false)
            setEditingStaff(null)
          }}
          onStaffUpdated={loadStaff}
          staff={editingStaff}
          userId={userId}
          deviceId={deviceId}
        />
      )}
    </>
  )
}
