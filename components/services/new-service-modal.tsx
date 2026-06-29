"use client"

import type React from "react"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { addService } from "@/app/actions/service-actions"
import { Loader2, Settings } from "lucide-react"
import { useAppSelector } from "@/store/hooks"
import { selectDeviceId } from "@/store/slices/deviceSlice"

interface NewServiceModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (serviceId: number, serviceName: string, price: number) => void
  userId: number
}

export default function NewServiceModal({ isOpen, onClose, onSuccess, userId }: NewServiceModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    price: "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  // Get deviceId from Redux store
  const deviceId = useAppSelector(selectDeviceId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.name.trim()) {
      notifyError(toast, "Service name is required")
      return
    }

    if (!formData.price || Number.parseFloat(formData.price) < 0) {
      notifyError(toast, "Valid price is required")
      return
    }

    // Validate deviceId is available
    if (!deviceId) {
      notifyError(toast, "Device ID is not available. Please refresh the page and try again.")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await addService({
        name: formData.name.trim(),
        price: Number.parseFloat(formData.price),
        deviceId,
        userId,
      })

      if (result.success) {
        notifySuccess(toast, "Service added successfully")

        onSuccess(result.data.id, result.data.name, result.data.price)

        // Reset form
        setFormData({
          name: "",
          price: "",
        })

        onClose()
      } else {
        notifyError(toast, result.message || "Failed to add service")
      }
    } catch (error) {
      console.error("Error adding service:", error)
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        name: "",
        price: "",
      })
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-blue-600" />
            Add New Service
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-name">Service Name *</Label>
            <Input
              id="service-name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Phone Screen Repair"
              disabled={isSubmitting}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="service-price">Price *</Label>
            <Input
              id="service-price"
              type="number"
              min="0"
              step="0.01"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.00"
              disabled={isSubmitting}
            />
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
                "Add Service"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
