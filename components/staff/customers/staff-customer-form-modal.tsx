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
  })

  useEffect(() => {
    if (isOpen) {
      if (customerToEdit) {
        setFormData({
          name: customerToEdit.name || "",
          phone: customerToEdit.phone || "",
          email: customerToEdit.email || "",
          address: customerToEdit.address || "",
        })
      } else {
        setFormData({
          name: "",
          phone: "",
          email: "",
          address: "",
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
      <DialogContent className="w-[95vw] sm:max-w-[500px]">
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <DialogFooter className="bg-slate-50 px-4 sm:px-6 py-4 border-t border-slate-200 mt-2 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting} className="w-full sm:w-auto">
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto bg-brand-blue hover:bg-brand-blue/90">
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
