"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Loader2, KeyRound, UserCheck, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/components/ui/use-toast"
import { addStaff, activateStaff, deleteStaff, getDeviceStaff, updateStaff } from "@/app/actions/staff-actions"

type StaffMember = {
  id: number
  name: string
  phone: string
  email?: string
  position: string
  salary: number
  salary_date: string
  joined_on: string
  age?: number
  id_card_number?: string
  address?: string
  is_active: boolean
}

type StaffFormState = {
  name: string
  phone: string
  email: string
  position: string
  salary: string
  salaryDate: string
  joinedOn: string
  age: string
  idCardNumber: string
  address: string
  password: string
}

const emptyForm: StaffFormState = {
  name: "",
  phone: "",
  email: "",
  position: "",
  salary: "",
  salaryDate: "",
  joinedOn: "",
  age: "",
  idCardNumber: "",
  address: "",
  password: "",
}

interface DeviceStaffTabProps {
  deviceId: number
}

export default function DeviceStaffTab({ deviceId }: DeviceStaffTabProps) {
  const { toast } = useToast()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [form, setForm] = useState<StaffFormState>(emptyForm)

  const activeStaff = useMemo(() => staff.find((member) => member.is_active) || null, [staff])

  const loadStaff = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getDeviceStaff(deviceId)
      if (!result.success) {
        throw new Error(result.message || "Failed to fetch staff")
      }
      setStaff(result.data as StaffMember[])
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load staff",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [deviceId, toast])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const openCreateDialog = () => {
    setEditingStaff(null)
    setForm(emptyForm)
    setIsDialogOpen(true)
  }

  const openEditDialog = (member: StaffMember) => {
    setEditingStaff(member)
    setForm({
      name: member.name || "",
      phone: member.phone || "",
      email: member.email || "",
      position: member.position || "",
      salary: String(member.salary || ""),
      salaryDate: member.salary_date || "",
      joinedOn: member.joined_on || "",
      age: member.age ? String(member.age) : "",
      idCardNumber: member.id_card_number || "",
      address: member.address || "",
      password: "",
    })
    setIsDialogOpen(true)
  }

  const handleActivate = async (staffId: number) => {
    try {
      const result = await activateStaff(staffId, deviceId)
      if (!result.success) {
        throw new Error(result.message || "Failed to activate staff")
      }
      setStaff(result.allStaff as StaffMember[])
      toast({ title: "Staff activated", description: result.message || "Active staff updated" })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to activate staff",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async (staffId: number) => {
    try {
      const result = await deleteStaff(staffId, deviceId)
      if (!result.success) {
        throw new Error(result.message || "Failed to delete staff")
      }
      toast({ title: "Deleted", description: result.message || "Staff member deleted" })
      await loadStaff()
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete staff",
        variant: "destructive",
      })
    }
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.position.trim() || !form.salary || !form.salaryDate || !form.joinedOn) {
      toast({
        title: "Missing fields",
        description: "Name, phone, position, salary, salary date, and joined date are required.",
        variant: "destructive",
      })
      return
    }

    if (!editingStaff && !form.password.trim()) {
      toast({
        title: "Password required",
        description: "Set a password for this staff member.",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)
    try {
      if (editingStaff) {
        const result = await updateStaff(editingStaff.id, {
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          position: form.position.trim(),
          salary: Number.parseFloat(form.salary),
          salaryDate: form.salaryDate,
          joinedOn: form.joinedOn,
          age: form.age ? Number.parseInt(form.age, 10) : undefined,
          idCardNumber: form.idCardNumber.trim() || undefined,
          address: form.address.trim() || undefined,
          deviceId,
          password: form.password.trim() || undefined,
        })

        if (!result.success) {
          throw new Error(result.message || "Failed to update staff")
        }
      } else {
        const result = await addStaff({
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || undefined,
          position: form.position.trim(),
          salary: Number.parseFloat(form.salary),
          salaryDate: form.salaryDate,
          joinedOn: form.joinedOn,
          age: form.age ? Number.parseInt(form.age, 10) : undefined,
          idCardNumber: form.idCardNumber.trim() || undefined,
          address: form.address.trim() || undefined,
          deviceId,
          userId: deviceId,
          password: form.password.trim(),
        })

        if (!result.success) {
          throw new Error(result.message || "Failed to add staff")
        }
      }

      setIsDialogOpen(false)
      setEditingStaff(null)
      setForm(emptyForm)
      await loadStaff()
      toast({
        title: editingStaff ? "Staff updated" : "Staff created",
        description: editingStaff
          ? "Staff details were updated successfully."
          : "Staff member created with login password.",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save staff member",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Staff Access</h3>
          <p className="text-sm text-[#94A3B8]">Manage staff and passwords for this device.</p>
        </div>
        <Button
          onClick={openCreateDialog}
          className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED]"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Staff
        </Button>
      </div>

      <div className="rounded-lg border border-[#334155] bg-[#1E293B]">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-[#94A3B8]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading staff...
          </div>
        ) : staff.length === 0 ? (
          <div className="py-10 text-center text-[#94A3B8]">No staff members available for this device.</div>
        ) : (
          <div className="divide-y divide-[#334155]">
            {staff.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white">{member.name}</span>
                    {member.is_active && (
                      <Badge className="bg-green-600/20 text-green-300 border-green-600/30">Active</Badge>
                    )}
                  </div>
                  <p className="text-sm text-[#94A3B8]">
                    {member.position} · {member.phone}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!member.is_active && (
                    <Button variant="outline" size="sm" className="border-[#334155] bg-transparent text-[#94A3B8]" onClick={() => handleActivate(member.id)}>
                      <UserCheck className="mr-1 h-4 w-4" />
                      Activate
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#334155] bg-transparent text-[#94A3B8]"
                    onClick={() => openEditDialog(member)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-700/40 bg-transparent text-red-300 hover:bg-red-900/20"
                    onClick={() => handleDelete(member.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="border-[#334155] bg-[#1E293B] text-white sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff" : "Add Staff"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className="text-[#94A3B8]">Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} className="mt-1 border-[#334155] bg-[#0F172A]" />
            </div>
            <div>
              <Label className="text-[#94A3B8]">Phone *</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} className="mt-1 border-[#334155] bg-[#0F172A]" />
            </div>
            <div>
              <Label className="text-[#94A3B8]">Position *</Label>
              <Input value={form.position} onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))} className="mt-1 border-[#334155] bg-[#0F172A]" />
            </div>
            <div>
              <Label className="text-[#94A3B8]">Salary *</Label>
              <Input type="number" value={form.salary} onChange={(e) => setForm((prev) => ({ ...prev, salary: e.target.value }))} className="mt-1 border-[#334155] bg-[#0F172A]" />
            </div>
            <div>
              <Label className="text-[#94A3B8]">Salary Date *</Label>
              <Input type="date" value={form.salaryDate} onChange={(e) => setForm((prev) => ({ ...prev, salaryDate: e.target.value }))} className="mt-1 border-[#334155] bg-[#0F172A]" />
            </div>
            <div>
              <Label className="text-[#94A3B8]">Joined On *</Label>
              <Input type="date" value={form.joinedOn} onChange={(e) => setForm((prev) => ({ ...prev, joinedOn: e.target.value }))} className="mt-1 border-[#334155] bg-[#0F172A]" />
            </div>
            <div className="md:col-span-2">
              <Label className="text-[#94A3B8] flex items-center">
                <KeyRound className="mr-1 h-4 w-4" />
                {editingStaff ? "New Password (optional)" : "Staff Password *"}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className="mt-1 border-[#334155] bg-[#0F172A]"
                placeholder={editingStaff ? "Leave empty to keep current password" : "Set staff login password"}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <div className="text-xs text-[#94A3B8]">
              Current active staff: <span className="text-white">{activeStaff?.name || "None"}</span>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="border-[#334155] bg-transparent text-[#94A3B8]" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] hover:from-[#4F46E5] hover:to-[#7C3AED]"
              >
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {editingStaff ? "Save Changes" : "Create Staff"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
