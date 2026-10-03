"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { updateCustomer } from "@/app/actions/customer-actions"
import { FormAlert } from "@/components/ui/form-alert"
import { smartCapChange } from "@/lib/text-format"

interface EditCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  customer: any
  userId: number
}

export default function EditCustomerModal({ isOpen, onClose, customer, userId }: EditCustomerModalProps) {
  const [name, setName] = useState(customer.name || "")
  const [email, setEmail] = useState(customer.email || "")
  const [phone, setPhone] = useState(customer.phone || "")
  const [address, setAddress] = useState(customer.address || "")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [errors, setErrors] = useState<{
    name?: string
    email?: string
    phone?: string
    address?: string
  }>({})

  const { toast } = useToast()

  // Auto-dismiss form alerts after 5 seconds
  useEffect(() => {
    if (formAlert) {
      const timer = setTimeout(() => {
        setFormAlert(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [formAlert])

  useEffect(() => {
    if (customer) {
      setName(customer.name || "")
      setEmail(customer.email || "")
      setPhone(customer.phone || "")
      setAddress(customer.address || "")
      setErrors({})
    }
  }, [customer])

  const validateForm = () => {
    const newErrors: {
      name?: string
      email?: string
      phone?: string
      address?: string
    } = {}

    if (!name.trim()) {
      newErrors.name = "Customer name is required"
    }

    if (!phone.trim()) {
      newErrors.phone = "Phone number is required"
    }

    // Email is optional, but validate format if provided
    if (email.trim() && !/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email format is invalid"
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      setFormAlert({
        type: "error",
        message: "Please correct the errors in the form",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append("id", customer.id.toString())
      formData.append("name", name)
      formData.append("email", email)
      formData.append("phone", phone)
      formData.append("address", address)
      formData.append("user_id", userId.toString())

      const result = await updateCustomer(formData)

      if (result.success) {
        setFormAlert({
          type: "success",
          message: "Customer updated successfully",
        })
        // Close after a short delay
        setTimeout(() => {
          onClose()
        }, 1500)
      } else {
        setFormAlert({
          type: "error",
          message: result.message || "Failed to update customer",
        })
      }
    } catch (error) {
      console.error("Update customer error:", error)
      setFormAlert({
        type: "error",
        message: "An unexpected error occurred",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Customer</DialogTitle>
        </DialogHeader>

        {formAlert && <FormAlert type={formAlert.type} message={formAlert.message} className="mt-2 mb-2" />}

        <div className="grid gap-4 py-4">
          <div className="space-y-1">
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => smartCapChange(e, name, setName)}
              placeholder="Customer name"
              className={errors.name ? "border-red-500" : ""}
              required
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">
              Phone <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
              className={errors.phone ? "border-red-500" : ""}
              required
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="customer@example.com"
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => smartCapChange(e, address, setAddress)}
              placeholder="Customer address"
              rows={3}
              className={errors.address ? "border-red-500" : ""}
            />
            {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="relative">
            {isSubmitting ? (
              <>
                <span className="opacity-0">Update Customer</span>
                <span className="absolute inset-0 flex items-center justify-center">
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                </span>
              </>
            ) : (
              "Update Customer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
