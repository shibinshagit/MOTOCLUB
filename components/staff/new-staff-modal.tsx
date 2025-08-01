"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useNotification } from "@/components/ui/custom-notification"
import { addStaff } from "@/app/actions/staff-actions"
import { Loader2, User } from "lucide-react"

interface NewStaffModalProps {
  isOpen: boolean
  onClose: () => void
  onStaffAdded: (newStaff: any) => void
  userId: number 
  deviceId: number 
}

export default function NewStaffModal({
  isOpen,
  onClose,
  onStaffAdded,
  userId ,
  deviceId,
}: NewStaffModalProps) {
  const [formData, setFormData] = useState({
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
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { showNotification, NotificationContainer } = useNotification()

  // Add this right after the component definition, before the handleSubmit function
  if (!deviceId || !userId) {
    console.log("❌ Missing required props:", { deviceId, userId })
    return (
      <>
        <Dialog open={isOpen} onOpenChange={onClose}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-red-600">Configuration Error</DialogTitle>
            </DialogHeader>
            <div className="p-4">
              <p className="text-gray-600 mb-4">
                Unable to load staff form. Missing device or user information.
                <br />
                <small className="text-gray-500">
                  Device ID: {deviceId || "missing"}, User ID: {userId || "missing"}
                </small>
              </p>
              <Button onClick={onClose} className="w-full">
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <NotificationContainer />
      </>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    console.log("🚀 NEW STAFF MODAL DEBUG:")
    console.log("- deviceId from props:", deviceId)
    console.log("- deviceId type:", typeof deviceId)
    console.log("- userId from props:", userId)
    console.log("- userId type:", typeof userId)

    // Validate deviceId and userId first
    if (!deviceId || deviceId === null || deviceId === undefined) {
      showNotification({
        message: "Device ID is missing. Please refresh the page and try again.",
        type: "error",
      })
      return
    }

    if (!userId || userId === null || userId === undefined) {
      showNotification({
        message: "User ID is missing. Please refresh the page and try again.",
        type: "error",
      })
      return
    }

    // Validate required fields
    if (!formData.name.trim()) {
      showNotification({
        message: "Name is required",
        type: "error",
      })
      return
    }

    if (!formData.phone.trim()) {
      showNotification({
        message: "Phone is required",
        type: "error",
      })
      return
    }

    if (!formData.position.trim()) {
      showNotification({
        message: "Position is required",
        type: "error",
      })
      return
    }

    if (!formData.salary || Number.parseFloat(formData.salary) < 0) {
      showNotification({
        message: "Valid salary is required",
        type: "error",
      })
      return
    }

    if (!formData.salaryDate) {
      showNotification({
        message: "Salary date is required",
        type: "error",
      })
      return
    }

    if (!formData.joinedOn) {
      showNotification({
        message: "Joined date is required",
        type: "error",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const staffDataToSend = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim() || undefined,
        position: formData.position.trim(),
        salary: Number.parseFloat(formData.salary),
        salaryDate: formData.salaryDate,
        joinedOn: formData.joinedOn,
        age: formData.age ? Number.parseInt(formData.age) : undefined,
        idCardNumber: formData.idCardNumber.trim() || undefined,
        address: formData.address.trim() || undefined,
        deviceId,
        userId,
      }

      console.log("- Data being sent to addStaff:", staffDataToSend)

      const result = await addStaff(staffDataToSend)

      console.log("- Result from addStaff:", result)

      if (result.success) {
        showNotification({
          message: "Staff member added successfully",
          type: "success",
        })

        // Call the onStaffAdded callback with the new staff data
        onStaffAdded(result.data)

        // Reset form
        setFormData({
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
        })

        onClose()
      } else {
        showNotification({
          message: result.message || "Failed to add staff member",
          type: "error",
        })
      }
    } catch (error) {
      console.error("Error adding staff:", error)
      showNotification({
        message: "An unexpected error occurred",
        type: "error",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
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
      })
      onClose()
    }
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-blue-600" />
              Add New Staff Member
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Required Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="staff-name">Name *</Label>
                <Input
                  id="staff-name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Full name"
                  disabled={isSubmitting}
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-phone">Phone *</Label>
                <Input
                  id="staff-phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Phone number"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-position">Position *</Label>
                <Input
                  id="staff-position"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  placeholder="e.g., Technician, Manager"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-salary">Salary *</Label>
                <Input
                  id="staff-salary"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.salary}
                  onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
                  placeholder="0.00"
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-salary-date">Salary Date *</Label>
                <Input
                  id="staff-salary-date"
                  type="date"
                  value={formData.salaryDate}
                  onChange={(e) => setFormData({ ...formData, salaryDate: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="staff-joined">Joined On *</Label>
                <Input
                  id="staff-joined"
                  type="date"
                  value={formData.joinedOn}
                  onChange={(e) => setFormData({ ...formData, joinedOn: e.target.value })}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Optional Fields */}
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3">Optional Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="staff-email">Email</Label>
                  <Input
                    id="staff-email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-age">Age</Label>
                  <Input
                    id="staff-age"
                    type="number"
                    min="18"
                    max="100"
                    value={formData.age}
                    onChange={(e) => setFormData({ ...formData, age: e.target.value })}
                    placeholder="25"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="staff-id-card">ID Card Number</Label>
                  <Input
                    id="staff-id-card"
                    value={formData.idCardNumber}
                    onChange={(e) => setFormData({ ...formData, idCardNumber: e.target.value })}
                    placeholder="ID card number"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2 mt-4">
                <Label htmlFor="staff-address">Address</Label>
                <Textarea
                  id="staff-address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Full address"
                  disabled={isSubmitting}
                  rows={3}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
                  </>
                ) : (
                  "Add Staff Member"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <NotificationContainer />
    </>
  )
}
