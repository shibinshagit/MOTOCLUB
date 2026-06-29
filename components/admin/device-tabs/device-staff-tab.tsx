"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, Loader2, KeyRound, UserCheck, Pencil, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { addStaff, deleteStaff, getDeviceStaff, updateStaff, updateStaffStatus } from "@/app/actions/staff-actions"
import {
  ADMIN_DIALOG_SCROLL_CLASS,
  ADMIN_DIALOG_INPUT_CLASS,
  ADMIN_DIALOG_LABEL_CLASS,
  DEFAULT_STAFF_VALUE_RESTRICTIONS,
  STAFF_PAGE_OPTIONS,
  STAFF_VALUE_OPTIONS,
  parseStringArray,
  type StaffPageId,
  type StaffValueRestriction,
} from "@/lib/staff-restrictions"

type StaffMember = {
  id: number
  name: string
  phone: string
  email?: string
  role?: "admin" | "staff"
  restricted_pages?: StaffPageId[] | string[] | null
  restricted_values?: StaffValueRestriction[] | string[] | null
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
  role: "admin" | "staff"
  restrictedPages: StaffPageId[]
  restrictedValues: StaffValueRestriction[]
  position: string
  salary: string
  salaryDate: string
  joinedOn: string
  age: string
  idCardNumber: string
  address: string
  password: string
  isActive: boolean
}

const emptyForm: StaffFormState = {
  name: "",
  phone: "",
  email: "",
  role: "staff",
  restrictedPages: [],
  restrictedValues: [...DEFAULT_STAFF_VALUE_RESTRICTIONS],
  position: "",
  salary: "",
  salaryDate: "",
  joinedOn: "",
  age: "",
  idCardNumber: "",
  address: "",
  password: "",
  isActive: true,
}

function toDateInputValue(value: unknown): string {
  if (!value) return ""
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10)
  }
  const raw = String(value)
  const isoMatch = raw.match(/^\d{4}-\d{2}-\d{2}/)
  if (isoMatch) return isoMatch[0]
  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }
  return ""
}

interface DeviceStaffTabProps {
  deviceId: number
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
      <span className="text-sm text-gray-700">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

export default function DeviceStaffTab({ deviceId }: DeviceStaffTabProps) {
  const { toast } = useToast()
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [form, setForm] = useState<StaffFormState>(emptyForm)

  const activeStaffCount = useMemo(() => staff.filter((member) => member.is_active).length, [staff])

  const loadStaff = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await getDeviceStaff(deviceId)
      if (!result.success) {
        throw new Error(result.message || "Failed to fetch staff")
      }
      setStaff(result.data as StaffMember[])
    } catch (error) {
      notifyError(toast, error instanceof Error ? error.message : "Failed to load staff")
    } finally {
      setIsLoading(false)
    }
  }, [deviceId, toast])

  useEffect(() => {
    loadStaff()
  }, [loadStaff])

  const toggleRestrictedPage = (pageId: StaffPageId, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      restrictedPages: checked
        ? [...prev.restrictedPages, pageId]
        : prev.restrictedPages.filter((page) => page !== pageId),
    }))
  }

  const toggleRestrictedValue = (valueId: StaffValueRestriction, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      restrictedValues: checked
        ? [...prev.restrictedValues, valueId]
        : prev.restrictedValues.filter((value) => value !== valueId),
    }))
  }

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
      role: member.role === "admin" ? "admin" : "staff",
      restrictedPages: parseStringArray<StaffPageId>(member.restricted_pages),
      restrictedValues:
        member.role === "admin"
          ? []
          : parseStringArray<StaffValueRestriction>(member.restricted_values),
      position: member.position || "",
      salary: String(member.salary || ""),
      salaryDate: toDateInputValue(member.salary_date),
      joinedOn: toDateInputValue(member.joined_on),
      age: member.age ? String(member.age) : "",
      idCardNumber: member.id_card_number || "",
      address: member.address || "",
      password: "",
      isActive: member.is_active,
    })
    setIsDialogOpen(true)
  }

  const handleToggleActive = async (member: StaffMember) => {
    try {
      const result = await updateStaffStatus(member.id, deviceId, !member.is_active)
      if (!result.success) {
        throw new Error(result.message || "Failed to update staff status")
      }
      setStaff(result.allStaff as StaffMember[])
      notifySuccess(
        toast,
        result.message || (member.is_active ? "Staff member deactivated" : "Staff member activated"),
        member.is_active ? "Staff deactivated" : "Staff activated",
      )
    } catch (error) {
      notifyError(toast, error instanceof Error ? error.message : "Failed to update staff status")
    }
  }

  const handleDelete = async (staffId: number) => {
    try {
      const result = await deleteStaff(staffId, deviceId)
      if (!result.success) {
        throw new Error(result.message || "Failed to delete staff")
      }
      notifySuccess(toast, result.message || "Staff member deleted" , "Deleted")
      await loadStaff()
    } catch (error) {
      notifyError(toast, error instanceof Error ? error.message : "Failed to delete staff")
    }
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.phone.trim() || !form.position.trim() || !form.salary || !form.salaryDate || !form.joinedOn) {
      notifyError(toast, "Name, phone, position, salary, salary date, and joined date are required.", "Missing fields")
      return
    }

    if (!editingStaff && !form.password.trim()) {
      notifyError(toast, "Set a password for this staff member.", "Password required")
      return
    }

    setIsSaving(true)
    const wasEditing = Boolean(editingStaff)
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
        restrictedPages: form.role === "staff" ? form.restrictedPages : [],
        restrictedValues: form.role === "staff" ? form.restrictedValues : [],
        position: form.position.trim(),
        salary: Number.parseFloat(form.salary),
        salaryDate: form.salaryDate,
        joinedOn: form.joinedOn,
        age: form.age ? Number.parseInt(form.age, 10) : undefined,
        idCardNumber: form.idCardNumber.trim() || undefined,
        address: form.address.trim() || undefined,
        deviceId,
        password: form.password.trim() || undefined,
        isActive: form.isActive,
      }

      if (wasEditing && editingStaff) {
        const result = await updateStaff(editingStaff.id, payload)
        if (!result.success) {
          throw new Error(result.message || "Failed to update staff")
        }
        if (result.data) {
          setStaff((prev) =>
            prev.map((member) =>
              member.id === editingStaff.id ? ({ ...member, ...result.data } as StaffMember) : member,
            ),
          )
        }
      } else {
        const result = await addStaff({
          ...payload,
          userId: deviceId,
          password: form.password.trim(),
          isActive: form.isActive,
        })
        if (!result.success) {
          throw new Error(result.message || "Failed to add staff")
        }
      }

      setIsDialogOpen(false)
      setEditingStaff(null)
      setForm(emptyForm)
      await loadStaff()
      notifySuccess(
        toast,
        wasEditing ? "Staff details were updated successfully." : "Staff member created with login password.",
        wasEditing ? "Staff updated" : "Staff created",
      )
    } catch (error) {
      notifyError(toast, error instanceof Error ? error.message : "Failed to save staff member")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Staff Access</h3>
          <p className="text-sm text-gray-500">
            Manage staff logins, roles, and access restrictions.
            {activeStaffCount > 0 ? ` ${activeStaffCount} active.` : ""}
          </p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Staff
        </Button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading staff...
          </div>
        ) : staff.length === 0 ? (
          <div className="py-10 text-center text-gray-500">No staff members available for this device.</div>
        ) : (
          <div className="divide-y divide-gray-200">
            {staff.map((member) => (
              <div key={member.id} className="flex items-center justify-between p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{member.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        member.role === "admin"
                          ? "border-gray-300 bg-gray-100 text-gray-700"
                          : "border-gray-200 bg-white text-gray-600"
                      }
                    >
                      {member.role === "admin" ? "Admin" : "Normal Staff"}
                    </Badge>
                    {member.is_active && (
                      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {member.position} · {member.phone}
                  </p>
                  {member.role === "staff" && (
                    <p className="mt-1 text-xs text-gray-400">
                      {parseStringArray<StaffPageId>(member.restricted_pages).length} blocked pages ·{" "}
                      {parseStringArray<StaffValueRestriction>(member.restricted_values).length} hidden values
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className={
                      member.is_active
                        ? "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                        : "border-green-200 bg-white text-green-700 hover:bg-green-50"
                    }
                    onClick={() => handleToggleActive(member)}
                  >
                    <UserCheck className="mr-1 h-4 w-4" />
                    {member.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                    onClick={() => openEditDialog(member)}
                  >
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 bg-white text-red-600 hover:bg-red-50"
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
        <DialogContent className={`${ADMIN_DIALOG_SCROLL_CLASS} sm:max-w-2xl`}>
          <DialogHeader className="shrink-0 space-y-1 border-b border-gray-100 px-6 py-4 text-left">
            <DialogTitle className="text-gray-900">{editingStaff ? "Edit Staff" : "Add Staff"}</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
              />
            </div>
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Phone *</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
              />
            </div>
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Role *</Label>
              <select
                value={form.role}
                onChange={(e) => {
                  const role = e.target.value === "admin" ? "admin" : "staff"
                  setForm((prev) => ({
                    ...prev,
                    role,
                    restrictedPages: role === "admin" ? [] : prev.restrictedPages,
                    restrictedValues:
                      role === "admin"
                        ? []
                        : prev.restrictedValues.length > 0 || editingStaff
                          ? prev.restrictedValues
                          : [...DEFAULT_STAFF_VALUE_RESTRICTIONS],
                  }))
                }}
                className={`mt-1 h-10 w-full rounded-md border px-3 text-sm ${ADMIN_DIALOG_INPUT_CLASS}`}
              >
                <option value="staff">Normal Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Position *</Label>
              <Input
                value={form.position}
                onChange={(e) => setForm((prev) => ({ ...prev, position: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
              />
            </div>
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Salary *</Label>
              <Input
                type="number"
                value={form.salary}
                onChange={(e) => setForm((prev) => ({ ...prev, salary: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
              />
            </div>
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Salary Date *</Label>
              <Input
                type="date"
                value={form.salaryDate}
                onChange={(e) => setForm((prev) => ({ ...prev, salaryDate: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
              />
            </div>
            <div>
              <Label className={ADMIN_DIALOG_LABEL_CLASS}>Joined On *</Label>
              <Input
                type="date"
                value={form.joinedOn}
                onChange={(e) => setForm((prev) => ({ ...prev, joinedOn: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
              />
            </div>
            <div className="md:col-span-2">
              <ToggleRow
                label="Active staff member"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
            <div className="md:col-span-2">
              <Label className={`${ADMIN_DIALOG_LABEL_CLASS} flex items-center`}>
                <KeyRound className="mr-1 h-4 w-4" />
                {editingStaff ? "New Password (optional)" : "Staff Password *"}
              </Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                className={`mt-1 ${ADMIN_DIALOG_INPUT_CLASS}`}
                placeholder={editingStaff ? "Leave empty to keep current password" : "Set staff login password"}
              />
            </div>
          </div>

          {form.role === "staff" && (
            <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900">Page restrictions</h4>
                <div className="mt-3 space-y-2">
                  {STAFF_PAGE_OPTIONS.map((page) => (
                    <ToggleRow
                      key={page.id}
                      label={page.label}
                      checked={form.restrictedPages.includes(page.id)}
                      onCheckedChange={(checked) => toggleRestrictedPage(page.id, checked)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900">Value restrictions</h4>
                <p className="mt-1 text-xs text-gray-500">Turn on to hide that value from this staff member on the device.</p>
                <div className="mt-3 space-y-2">
                  {STAFF_VALUE_OPTIONS.map((value) => (
                    <ToggleRow
                      key={value.id}
                      label={`Hide ${value.label.toLowerCase()}`}
                      checked={form.restrictedValues.includes(value.id)}
                      onCheckedChange={(checked) => toggleRestrictedValue(value.id, checked)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          </div>

          <div className="shrink-0 border-t border-gray-100 px-6 py-4">
            <div className="flex gap-2 sm:justify-end">
              <Button
                variant="outline"
                className="flex-1 border-gray-200 bg-white text-gray-900 hover:bg-gray-50 sm:flex-none"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1 sm:flex-none" onClick={handleSave} disabled={isSaving}>
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
