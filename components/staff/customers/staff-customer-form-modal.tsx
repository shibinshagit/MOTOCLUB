"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2 } from "lucide-react"
import { addStaffCustomer, updateStaffCustomer } from "@/app/actions/staff-customer-actions"
import { useToast } from "@/components/ui/use-toast"
import { notifySuccess, notifyError } from "@/lib/notifications"

interface StaffCustomerFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  customerToEdit?: any | null
}

export default function StaffCustomerFormModal({
  isOpen,
  onClose,
  onSuccess,
  customerToEdit,
}: StaffCustomerFormModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    vehicle_details: "",
    notes: "",
  })

  useEffect(() => {
    if (isOpen) {
      if (customerToEdit) {
        setFormData({
          name: customerToEdit.name || "",
          phone: customerToEdit.phone || "",
          email: customerToEdit.email || "",
          address: customerToEdit.address || "",
          vehicle_details: customerToEdit.vehicle_details || "",
          notes: customerToEdit.notes || "",
        })
      } else {
        setFormData({
          name: "",
          phone: "",
          email: "",
          address: "",
          vehicle_details: "",
          notes: "",
        })
      }
    }
  }, [isOpen, customerToEdit])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.name) {
      notifyError(toast, "Customer name is required")
      return
    }

    setIsSubmitting(true)
    
    const data = new FormData()
    data.append("name", formData.name)
    data.append("phone", formData.phone)
    data.append("email", formData.email)
    data.append("address", formData.address)
    data.append("vehicle_details", formData.vehicle_details)
    data.append("notes", formData.notes)

    try {
      let result
      if (customerToEdit?.id) {
        data.append("id", String(customerToEdit.id))
        result = await updateStaffCustomer(data)
      } else {
        result = await addStaffCustomer(data)
      }

      if (result.success) {
        notifySuccess(toast, result.message)
        onSuccess()
        onClose()
      } else {
        notifyError(toast, result.message || "Failed to save customer")
      }
    } catch (error) {
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{customerToEdit ? "Edit Customer" : "Add New Customer"}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
            <Input
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g. John Doe"
              required
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                placeholder="+971..."
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                value={formData.email}
                onChange={handleInputChange}
                placeholder="john@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address / Location</Label>
            <Input
              id="address"
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              placeholder="Full address"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="vehicle_details">Vehicle Details</Label>
            <Input
              id="vehicle_details"
              name="vehicle_details"
              value={formData.vehicle_details}
              onChange={handleInputChange}
              placeholder="Make, Model, License Plate"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              placeholder="Any additional information..."
              rows={3}
            />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                customerToEdit ? "Update Customer" : "Save Customer"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
