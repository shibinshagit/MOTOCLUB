"use client"

import type React from "react"

import Link from "next/link"
import Image from "next/image"
import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Edit, Monitor, Search, Loader2, AlertCircle } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FormAlert } from "@/components/ui/form-alert"
import { getDevicesByCompany, createDevice, updateDevice } from "@/app/actions/admin-actions"
import ImageUploadField from "@/components/admin/image-upload-field"
import { compressBrandingLogoForUpload, formatBytes } from "@/lib/media-upload-utils"
import {
  ADMIN_DIALOG_CONTENT_CLASS,
  ADMIN_DIALOG_INPUT_CLASS,
  ADMIN_DIALOG_LABEL_CLASS,
  ADMIN_DIALOG_MUTED_CLASS,
} from "@/lib/staff-restrictions"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Device = {
  id: number
  name: string
  email: string
  company_id: number
  created_at?: string
  currency?: string
  logo_url?: string | null
}

interface DevicesTabProps {
  companyId: number
}

export default function DevicesTab({ companyId }: DevicesTabProps) {
  const [devices, setDevices] = useState<Device[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const { toast } = useToast()

  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [isCompressingLogo, setIsCompressingLogo] = useState(false)

  const resetLogoDraft = useCallback(() => {
    setLogoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setLogoFile(null)
    setRemoveLogo(false)
    setIsCompressingLogo(false)
  }, [])

  useEffect(() => {
    return () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview)
    }
  }, [logoPreview])

  const handleLogoFile = async (file: File | null) => {
    if (logoPreview) URL.revokeObjectURL(logoPreview)
    setRemoveLogo(false)

    if (!file) {
      setLogoFile(null)
      setLogoPreview(null)
      return
    }

    setIsCompressingLogo(true)
    try {
      const compressed = file.type === "image/svg+xml" ? file : await compressBrandingLogoForUpload(file)
      setLogoFile(compressed)
      setLogoPreview(URL.createObjectURL(compressed))
      if (compressed.size < file.size) {
        notifySuccess(toast, `Reduced from ${formatBytes(file.size)} to ${formatBytes(compressed.size)}.`, "Logo optimized")
      }
    } catch {
      setLogoFile(file)
      setLogoPreview(URL.createObjectURL(file))
    } finally {
      setIsCompressingLogo(false)
    }
  }

  const appendLogoToFormData = (formData: FormData) => {
    if (logoFile) formData.append("deviceLogo", logoFile)
    if (removeLogo) formData.append("removeLogo", "true")
  }

  const currencyOptions = [
    { value: "QAR", label: "Qatari Riyal (QAR)" },
    { value: "USD", label: "US Dollar (USD)" },
    { value: "EUR", label: "Euro (EUR)" },
    { value: "GBP", label: "British Pound (GBP)" },
    { value: "AED", label: "UAE Dirham (AED)" },
    { value: "SAR", label: "Saudi Riyal (SAR)" },
    { value: "KWD", label: "Kuwaiti Dinar (KWD)" },
    { value: "BHD", label: "Bahraini Dinar (BHD)" },
    { value: "OMR", label: "Omani Rial (OMR)" },
    { value: "INR", label: "Indian Rupee (INR)" },
    { value: "PKR", label: "Pakistani Rupee (PKR)" },
  ]

  useEffect(() => {
    fetchDevices()
  }, [companyId])

  const fetchDevices = async () => {
    setIsLoading(true)
    try {
      const result = await getDevicesByCompany(companyId)
      if (result.success) {
        setDevices(result.data || [])
      } else {
        notifyError(toast, result.message || "Failed to load devices")
      }
    } catch (error) {
      notifyError(toast, "An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddDevice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setFormError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData(e.currentTarget)
      formData.append("company_id", companyId.toString())
      appendLogoToFormData(formData)
      const result = await createDevice(formData)

      if (result.success) {
        notifySuccess(toast, "Device added successfully")
        setIsAddDialogOpen(false)
        resetLogoDraft()
        fetchDevices()
      } else {
        setFormError(result.message)
      }
    } catch (error) {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleUpdateDevice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!selectedDevice) return

    setFormError(null)
    setIsSubmitting(true)

    try {
      const formData = new FormData(e.currentTarget)
      formData.append("id", selectedDevice.id.toString())
      formData.append("company_id", companyId.toString())
      appendLogoToFormData(formData)
      const result = await updateDevice(formData)

      if (result.success) {
        notifySuccess(toast, "Device updated successfully")
        setIsEditDialogOpen(false)
        resetLogoDraft()
        fetchDevices()
      } else {
        setFormError(result.message)
      }
    } catch (error) {
      setFormError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A"
    return new Date(dateString).toLocaleDateString()
  }

  const filteredDevices = devices.filter(
    (device) =>
      device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      device.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Devices</h3>
          <p className="text-sm text-gray-500">Manage devices for this company</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder="Search devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 "
            />
          </div>
          <Button
            onClick={() => {
              resetLogoDraft()
              setIsAddDialogOpen(true)
            }}
            
          >
            <Plus className="mr-2 h-4 w-4" /> ADD DEVICE
          </Button>
        </div>
      </div>

      <Card className="border-gray-200 bg-white shadow-sm">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
            </div>
          ) : filteredDevices.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <Monitor className="mx-auto mb-2 h-10 w-10 text-gray-300" />
              <p>No devices found. Add your first device to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Device</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Currency</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Created</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDevices.map((device) => (
                    <tr key={device.id} className="border-b border-gray-200 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex items-center gap-3">
                          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-gray-50">
                            {device.logo_url ? (
                              <Image
                                src={device.logo_url}
                                alt=""
                                fill
                                className="object-contain p-0.5"
                                unoptimized={device.logo_url.includes("blob.vercel-storage.com")}
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center">
                                <Monitor className="h-4 w-4 text-gray-400" />
                              </div>
                            )}
                          </div>
                          <span className="font-medium">{device.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{device.email}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{device.currency || "QAR"}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{formatDate(device.created_at)}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex space-x-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            className="text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          >
                            <Link
                              href={`/admin/companies/${companyId}/devices/${device.id}`}
                              aria-label={`Open ${device.name}`}
                            >
                              <Monitor className="h-4 w-4" />
                            </Link>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              resetLogoDraft()
                              setSelectedDevice(device)
                              setIsEditDialogOpen(true)
                            }}
                            className="text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Device Dialog */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open)
          if (!open) resetLogoDraft()
        }}
      >
        <DialogContent className={`${ADMIN_DIALOG_CONTENT_CLASS} sm:max-w-lg`}>
          <DialogHeader>
            <DialogTitle className="text-xl text-gray-900">Add device</DialogTitle>
            <DialogDescription className={ADMIN_DIALOG_MUTED_CLASS}>
              Create a new device account for this company.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddDevice} className="space-y-4">
            {formError && <FormAlert type="error" message={formError} />}
            <div className="space-y-2">
              <Label htmlFor="name" className={ADMIN_DIALOG_LABEL_CLASS}>
                Device Name
              </Label>
              <Input
                id="name"
                name="name"
                required
                className={ADMIN_DIALOG_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className={ADMIN_DIALOG_LABEL_CLASS}>
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                className={ADMIN_DIALOG_INPUT_CLASS}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency" className={ADMIN_DIALOG_LABEL_CLASS}>
                Currency
              </Label>
              <Select name="currency" defaultValue="QAR">
                <SelectTrigger id="currency" className={ADMIN_DIALOG_INPUT_CLASS}>
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent >
                  {currencyOptions.map((currency) => (
                    <SelectItem key={currency.value} value={currency.value}>
                      {currency.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className={ADMIN_DIALOG_LABEL_CLASS}>
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className={ADMIN_DIALOG_INPUT_CLASS}
              />
            </div>
            <ImageUploadField
              label="Device logo"
              description="Shown on the device dashboard header and receipts. Images are resized and compressed before upload."
              currentUrl={null}
              previewUrl={logoPreview}
              onFileChange={handleLogoFile}
              onRemove={() => {
                handleLogoFile(null)
                setRemoveLogo(true)
              }}
            />
            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDialogOpen(false)}
                
              >
                CANCEL
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || isCompressingLogo}
                
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> ADDING...
                  </>
                ) : (
                  "ADD DEVICE"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Device Dialog */}
      <Dialog
        open={isEditDialogOpen}
        onOpenChange={(open) => {
          setIsEditDialogOpen(open)
          if (!open) resetLogoDraft()
        }}
      >
        <DialogContent className={`${ADMIN_DIALOG_CONTENT_CLASS} sm:max-w-lg`}>
          <DialogHeader>
            <DialogTitle className="text-xl text-gray-900">Edit device</DialogTitle>
            <DialogDescription className={ADMIN_DIALOG_MUTED_CLASS}>Update device account details.</DialogDescription>
          </DialogHeader>
          {selectedDevice && (
            <form onSubmit={handleUpdateDevice} className="space-y-4">
              {formError && <FormAlert type="error" message={formError} />}
              <div className="space-y-2">
                <Label htmlFor="edit-name" className={ADMIN_DIALOG_LABEL_CLASS}>
                  Name
                </Label>
                <Input
                  id="edit-name"
                  name="name"
                  defaultValue={selectedDevice.name}
                  required
                className={ADMIN_DIALOG_INPUT_CLASS}  
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email" className={ADMIN_DIALOG_LABEL_CLASS}>
                  Email
                </Label>
                <Input
                  id="edit-email"
                  name="email"
                  type="email"
                  defaultValue={selectedDevice.email}
                  required
                className={ADMIN_DIALOG_INPUT_CLASS}  
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-currency" className={ADMIN_DIALOG_LABEL_CLASS}>
                  Currency
                </Label>
                <Select name="currency" defaultValue={selectedDevice.currency || "QAR"}>
                  <SelectTrigger
                    id="edit-currency"
                    
                  >
                    <SelectValue placeholder="Select currency" />
                  </SelectTrigger>
                  <SelectContent >
                    {currencyOptions.map((currency) => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-password" className={ADMIN_DIALOG_LABEL_CLASS}>
                  Password (leave blank to keep current)
                </Label>
                <Input
                  id="edit-password"
                  name="password"
                  type="password"
                  
                />
              </div>
              <ImageUploadField
                label="Device logo"
                description="Shown on the device dashboard header and receipts. Images are resized and compressed before upload."
                currentUrl={removeLogo ? null : selectedDevice.logo_url || null}
                previewUrl={logoPreview}
                onFileChange={handleLogoFile}
                onRemove={() => {
                  handleLogoFile(null)
                  setRemoveLogo(true)
                }}
              />
              <div className="flex justify-end space-x-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  
                >
                  CANCEL
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || isCompressingLogo}
                  
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> UPDATING...
                    </>
                  ) : (
                    "UPDATE DEVICE"
                  )}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
