"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/use-toast"
import { addCustomer, getCustomers } from "@/app/actions/customer-actions"
import { FormAlert } from "@/components/ui/form-alert"
import { Loader2 } from "lucide-react"

interface NewCustomerModalProps {
  isOpen: boolean
  onClose: () => void
  onCustomerAdded: (customerId: number, customerName: string, customerObj?: any) => void
  userId: number
}

export default function NewCustomerModal({ isOpen, onClose, onCustomerAdded, userId }: NewCustomerModalProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formAlert, setFormAlert] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null)
  const [errors, setErrors] = useState<{
    name?: string
    email?: string
    phone?: string
    address?: string
  }>({})
  const [touched, setTouched] = useState<{
    name: boolean
    email: boolean
    phone: boolean
    address: boolean
  }>({ name: false, email: false, phone: false, address: false })
  const [existingCustomers, setExistingCustomers] = useState<any[]>([])
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false)

  const { toast } = useToast()

  // Reset form when modal opens and fetch existing customers
  useEffect(() => {
    if (isOpen) {
      resetForm()
      fetchExistingCustomers()
    }
  }, [isOpen, userId])

  // Auto-dismiss form alerts after 5 seconds
  useEffect(() => {
    if (formAlert) {
      const timer = setTimeout(() => {
        setFormAlert(null)
      }, 5000)
      return () => clearTimeout(timer)
    }
  }, [formAlert])

  // Fetch existing customers to check for duplicates
  const fetchExistingCustomers = async () => {
    try {
      setIsLoadingCustomers(true)
      const result = await getCustomers(userId)
      if (result.success) {
        setExistingCustomers(result.data)
      } else {
        console.error("Failed to load customers:", result.message)
      }
    } catch (error) {
      console.error("Error fetching customers:", error)
    } finally {
      setIsLoadingCustomers(false)
    }
  }

  const validateForm = () => {
    const newErrors: {
      name?: string
      email?: string
      phone?: string
      address?: string
    } = {}

    // Name validation - MANDATORY
    if (!name.trim()) {
      newErrors.name = "Customer name is required"
    }

    // Phone validation - MANDATORY
    if (!phone.trim()) {
      newErrors.phone = "Phone number is required"
    } else if (phone.trim().length < 10) {
      newErrors.phone = "Phone number must be at least 10 digits"
    } else if (!/^\d+$/.test(phone.trim())) {
      newErrors.phone = "Phone number must contain only digits"
    }

    // Check for duplicate phone - PREVENT DUPLICATES
    const duplicatePhone = existingCustomers.find((customer) => customer.phone === phone.trim() && phone.trim() !== "")
    if (duplicatePhone) {
      newErrors.phone = `Phone number already exists for customer: ${duplicatePhone.name}`
    }

    // Email validation (optional)
    if (email.trim() && !/\S+@\S+\.\S+/.test(email)) {
      newErrors.email = "Email format is invalid"
    }

    // Check for duplicate email
    if (email.trim()) {
      const duplicateEmail = existingCustomers.find(
        (customer) => customer.email === email.trim() && email.trim() !== "",
      )
      if (duplicateEmail) {
        newErrors.email = `Email already exists for customer: ${duplicateEmail.name}`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleBlur = (field: "name" | "email" | "phone" | "address") => {
    setTouched({ ...touched, [field]: true })
    validateForm()
  }

  const handleSubmit = async () => {
    // Mark all fields as touched
    setTouched({ name: true, email: true, phone: true, address: true })

    if (!validateForm()) {
      // Show form alert for validation errors
      setFormAlert({
        type: "error",
        message: "Please correct the errors in the form",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const formData = new FormData()
      formData.append("name", name)
      formData.append("email", email)
      formData.append("phone", phone)
      formData.append("address", address)
      formData.append("user_id", userId.toString())

      const result = await addCustomer(formData)

      if (result.success) {
        setFormAlert({
          type: "success",
          message: "Customer added successfully",
        })

        // Pass both id, name, and the full object to the callback
        onCustomerAdded(result.data.id, result.data.name, result.data)

        // Don't reset form immediately to show success message
        setTimeout(() => {
          resetForm()
          onClose()
        }, 1000)
      } else {
        setFormAlert({
          type: "error",
          message: result.message || "Failed to add customer",
        })
      }
    } catch (error) {
      console.error("Add customer error:", error)
      setFormAlert({
        type: "error",
        message: "An unexpected error occurred",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setName("")
    setEmail("")
    setPhone("")
    setAddress("")
    setErrors({})
    setTouched({ name: false, email: false, phone: false, address: false })
    setFormAlert(null)
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md transition-all duration-300 ease-in-out">
        <DialogHeader>
          <DialogTitle>Add New Customer</DialogTitle>
        </DialogHeader>

        {formAlert && <FormAlert type={formAlert.type} message={formAlert.message} className="mt-2 mb-2" />}

        {isLoadingCustomers && (
          <div className="flex items-center justify-center py-2">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600 mr-2" />
            <span className="text-sm text-gray-500">Loading customer data...</span>
          </div>
        )}

        <div className="grid gap-4 py-4">
          <div className="space-y-1">
            <Label htmlFor="name">
              Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (touched.name) validateForm()
              }}
              onBlur={() => handleBlur("name")}
              placeholder="Customer name"
              className={errors.name ? "border-red-500" : ""}
              required
            />
            {errors.name && touched.name && (
              <p className="text-red-500 text-xs mt-1 animate-in fade-in slide-in-from-top-1">{errors.name}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="phone">
              Phone <span className="text-red-500">*</span>
            </Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => {
                // Only allow digits
                const value = e.target.value.replace(/\D/g, "")
                setPhone(value)
                if (touched.phone) validateForm()
              }}
              onBlur={() => handleBlur("phone")}
              placeholder="Phone number (min 10 digits)"
              className={errors.phone ? "border-red-500" : ""}
              required
              maxLength={15}
            />
            {errors.phone && touched.phone && (
              <p className="text-red-500 text-xs mt-1 animate-in fade-in slide-in-from-top-1">{errors.phone}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (touched.email) validateForm()
              }}
              onBlur={() => handleBlur("email")}
              placeholder="customer@example.com"
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && touched.email && (
              <p className="text-red-500 text-xs mt-1 animate-in fade-in slide-in-from-top-1">{errors.email}</p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="address">Address</Label>
            <Textarea
              id="address"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value)
                if (touched.address) validateForm()
              }}
              onBlur={() => handleBlur("address")}
              placeholder="Customer address"
              rows={3}
              className={errors.address ? "border-red-500" : ""}
            />
            {errors.address && touched.address && (
              <p className="text-red-500 text-xs mt-1 animate-in fade-in slide-in-from-top-1">{errors.address}</p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="transition-all duration-200 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="transition-all duration-200 relative">
            {isSubmitting ? (
              <>
                <span className="opacity-0">Add Customer</span>
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
              "Add Customer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
