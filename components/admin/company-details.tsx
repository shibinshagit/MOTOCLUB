"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Building2, Edit, Save, X, Loader2, AlertCircle, Monitor } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { updateCompany, getDevicesByCompany } from "@/app/actions/admin-actions"
import { getMockModeStatus } from "@/app/actions/db-status-actions"
import DevicesTab from "./devices-tab"
import DeviceDetails from "./device-details"

type Company = {
  id: number
  name: string
  address?: string
  phone?: string
  email?: string
  description?: string
  logo_url?: string
}

type Device = {
  id: number
  name: string
  email: string
  company_id: number
  created_at?: string
}

interface CompanyDetailsProps {
  company: Company
  onBack: () => void
  onUpdate: (company: Company) => void
}

export default function CompanyDetails({ company, onBack, onUpdate }: CompanyDetailsProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: company.name || "",
    address: company.address || "",
    phone: company.phone || "",
    email: company.email || "",
    description: company.description || "",
    logo_url: company.logo_url || "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [isLoadingDevices, setIsLoadingDevices] = useState(true)
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const { toast } = useToast()
  const [isMockModeActive, setIsMockModeActive] = useState(false)

  useEffect(() => {
    getMockModeStatus().then(setIsMockModeActive)
    fetchDevices()
  }, [company.id])

  const fetchDevices = async () => {
    setIsLoadingDevices(true)
    try {
      const result = await getDevicesByCompany(company.id)
      if (result.success) {
        setDevices(result.data || [])
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to load devices",
          variant: "destructive",
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoadingDevices(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const formDataObj = new FormData()
      formDataObj.append("id", company.id.toString())
      Object.entries(formData).forEach(([key, value]) => {
        formDataObj.append(key, value)
      })

      const result = await updateCompany(formDataObj)

      if (result.success) {
        toast({
          title: "Success",
          description: "Company updated successfully",
        })
        onUpdate({ ...company, ...formData })
        setIsEditing(false)
      } else {
        setError(result.message || "Failed to update company")
      }
    } catch (error) {
      setError("An unexpected error occurred")
    } finally {
      setIsSubmitting(false)
    }
  }

  const cancelEdit = () => {
    setFormData({
      name: company.name || "",
      address: company.address || "",
      phone: company.phone || "",
      email: company.email || "",
      description: company.description || "",
      logo_url: company.logo_url || "",
    })
    setIsEditing(false)
    setError(null)
  }

  const handleDeviceSelect = (device: Device) => {
    setSelectedDevice(device)
  }

  const handleBackToDevices = () => {
    setSelectedDevice(null)
    fetchDevices() // Refresh devices list
  }

  // If a device is selected, show device details
  if (selectedDevice) {
    return <DeviceDetails device={selectedDevice} onBack={handleBackToDevices} />
  }

  return (
    <div className="space-y-6">
      {isMockModeActive && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            Running in mock mode. Database operations will be simulated.
          </AlertDescription>
        </Alert>
      )}

      <div className="hidden items-center justify-between md:flex">
        <h2 className="text-2xl font-bold text-gray-900">{company.name}</h2>
        {!isEditing ? (
          <Button
            onClick={() => setIsEditing(true)}
            variant="outline"
            className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
          >
            <Edit className="mr-2 h-4 w-4" />
            Edit company
          </Button>
        ) : (
          <div className="flex space-x-2">
            <Button
              onClick={cancelEdit}
              variant="outline"
              className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
            >
              <X className="mr-2 h-4 w-4" />
              CANCEL
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> SAVING...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> SAVE CHANGES
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="ml-2">{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
          <TabsTrigger
            value="details"
            className="rounded-md data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
          >
            <Building2 className="mr-2 h-4 w-4" />
            Details
          </TabsTrigger>
          <TabsTrigger
            value="devices"
            className="rounded-md data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm"
          >
            <Monitor className="mr-2 h-4 w-4" />
            Devices
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card className="border-gray-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl text-gray-900">Company details</CardTitle>
              <CardDescription className="text-gray-500">View and edit company information</CardDescription>
            </CardHeader>
            <CardContent>
              {isEditing ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-gray-500">
                        Company Name
                      </Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        required
                        
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-500">
                        Email
                      </Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-gray-500">
                        Phone
                      </Label>
                      <Input
                        id="phone"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="logo_url" className="text-gray-500">
                        Logo URL
                      </Label>
                      <Input
                        id="logo_url"
                        name="logo_url"
                        value={formData.logo_url}
                        onChange={handleChange}
                        
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-gray-500">
                      Address
                    </Label>
                    <Input
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleChange}
                      
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-gray-500">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      name="description"
                      rows={3}
                      value={formData.description}
                      onChange={handleChange}
                      
                    />
                  </div>
                  <div className="flex justify-end space-x-2 pt-4 md:hidden">
                    <Button
                      type="button"
                      onClick={cancelEdit}
                      variant="outline"
                      
                    >
                      <X className="mr-2 h-4 w-4" />
                      CANCEL
                    </Button>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> SAVING...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" /> SAVE
                        </>
                      )}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="flex md:hidden">
                    <Button
            onClick={() => setIsEditing(true)}
            variant="outline"
            className="border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
          >
                      <Edit className="mr-2 h-4 w-4" />
                      Edit company
                    </Button>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-6">
                    <div className="mb-6 flex items-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <div className="ml-4">
                        <h3 className="text-xl font-bold text-gray-900">{company.name}</h3>
                        <p className="text-sm text-gray-500">ID: {company.id}</p>
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        <p className="text-gray-900">{company.email || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Phone</p>
                        <p className="text-gray-900">{company.phone || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Address</p>
                        <p className="text-gray-900">{company.address || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Logo URL</p>
                        <p className="text-gray-900">{company.logo_url || "Not provided"}</p>
                      </div>
                    </div>
                    {company.description && (
                      <div className="mt-4">
                        <p className="text-sm font-medium text-gray-500">Description</p>
                        <p className="text-gray-900">{company.description}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="devices">
          <DevicesTab companyId={company.id} onDeviceSelect={handleDeviceSelect} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
