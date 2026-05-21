"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, LockKeyhole, UserCircle2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/use-toast"
import { useAppDispatch } from "@/store/hooks"
import { activateStaff, setStaff } from "@/store/slices/staffSlice"
import { authenticateStaff, getStaffForAuthentication } from "@/app/actions/staff-actions"

interface StaffAuthModalProps {
  deviceId: number
  isOpen: boolean
  onAuthenticated: () => void
}

type LoginStaff = {
  id: number
  name: string
  position: string
  is_active: boolean
}

export default function StaffAuthModal({ deviceId, isOpen, onAuthenticated }: StaffAuthModalProps) {
  const dispatch = useAppDispatch()
  const { toast } = useToast()

  const [staff, setStaffList] = useState<LoginStaff[]>([])
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null)
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const selectedStaff = useMemo(
    () => staff.find((member) => member.id === selectedStaffId) || null,
    [staff, selectedStaffId],
  )

  useEffect(() => {
    if (!isOpen) return

    const loadStaff = async () => {
      setIsLoading(true)
      setAuthError(null)
      try {
        const result = await getStaffForAuthentication(deviceId)
        if (!result.success) {
          throw new Error(result.message || "Failed to load staff")
        }

        const loadedStaff = (result.data || []) as LoginStaff[]
        setStaffList(loadedStaff)

        const firstActive = loadedStaff.find((member) => member.is_active)
        setSelectedStaffId(firstActive?.id || loadedStaff[0]?.id || null)
      } catch (error) {
        toast({
          title: "Unable to load staff",
          description: error instanceof Error ? error.message : "Failed to load staff list",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }

    loadStaff()
  }, [deviceId, isOpen, toast])

  const handleAuthenticate = async () => {
    setAuthError(null)

    if (!selectedStaffId || !password.trim()) {
      setAuthError("Select a staff member and enter password.")
      return
    }

    setIsChecking(true)
    try {
      const result = await authenticateStaff(selectedStaffId, deviceId, password.trim())
      if (!result.success) {
        throw new Error(result.message || "Authentication failed")
      }

      dispatch(setStaff(result.allStaff || []))
      dispatch(
        activateStaff({
          staffId: selectedStaffId,
          allStaff: result.allStaff || [],
        }),
      )

      setPassword("")
      setAuthError(null)
      toast({ title: "Staff unlocked", description: `${selectedStaff?.name || "Staff"} session is active.` })
      onAuthenticated()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Invalid staff credentials")
    } finally {
      setIsChecking(false)
    }
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-blue-600" />
            Staff Login Required
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading staff list...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Staff Member</Label>
              <div className="max-h-48 overflow-y-auto rounded-md border">
                {staff.length === 0 ? (
                  <div className="p-3 text-sm text-muted-foreground">No staff configured for this device.</div>
                ) : (
                  staff.map((member) => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => setSelectedStaffId(member.id)}
                      className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                        selectedStaffId === member.id ? "bg-blue-50 text-blue-700" : "hover:bg-muted/50"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <UserCircle2 className="h-4 w-4" />
                        {member.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{member.position}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="staff-login-password">Password</Label>
              <Input
                id="staff-login-password"
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (authError) setAuthError(null)
                }}
                placeholder="Enter staff password"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    handleAuthenticate()
                  }
                }}
              />
              {authError ? <p className="text-sm text-red-600 dark:text-red-400">{authError}</p> : null}
            </div>

            <Button
              className="w-full"
              onClick={handleAuthenticate}
              disabled={isChecking || staff.length === 0}
            >
              {isChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Unlock Session
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
