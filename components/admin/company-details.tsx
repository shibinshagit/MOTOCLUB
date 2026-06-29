"use client"

import type React from "react"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Building2, Edit, Save, X, Loader2, Monitor } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import { FormAlert } from "@/components/ui/form-alert"
import { updateCompany } from "@/app/actions/admin-actions"
import DevicesTab from "./devices-tab"

type Company = {
  id: number
  name: string
  address?: string
  phone?: string
  email?: string
  description?: string
}

interface CompanyDetailsProps {
  company: Company
  activeTab: "details" | "devices"
}

export default function CompanyDetails({ company, activeTab }: CompanyDetailsProps) {
  const router = useRouter()
  const [isEditing, setIsEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: company.name || "",
    address: company.address || "",
    phone: company.phone || "",
    email: company.email || "",
    description: company.description || "",
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { toast } = useToast()

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
        notifySuccess(toast, "Company updated successfully")
        setIsEditing(false)
        router.refresh()
      } else {
        setError(result.message || "Failed to update company")
      }
    } catch {
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
    })
    setIsEditing(false)
    setError(null)
  }

  const handleTabChange = (value: string) => {
    const tab = value === "devices" ? "devices" : "details"
    const href =
      tab === "devices" ? `/admin/companies/${company.id}?tab=devices` : `/admin/companies/${company.id}`
    router.push(href)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-semibold text-gray-900">{company.name}</h2>
        </div>
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
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" /> Save changes
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {error && <FormAlert type="error" message={error} />}

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-6 grid w-full max-w-md grid-cols-2 gap-2 rounded-lg border border-gray-200 bg-gray-50 p-1">
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
                      <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
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
                      <Input id="phone" name="phone" value={formData.phone} onChange={handleChange} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-gray-500">
                      Address
                    </Label>
                    <Input id="address" name="address" value={formData.address} onChange={handleChange} />
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
                </form>
              ) : (
                <div className="space-y-6">
                  <div className="rounded-lg bg-gray-50 p-6">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        <p className="text-gray-900">{company.email || "Not provided"}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-500">Phone</p>
                        <p className="text-gray-900">{company.phone || "Not provided"}</p>
                      </div>
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium text-gray-500">Address</p>
                        <p className="text-gray-900">{company.address || "Not provided"}</p>
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
          <DevicesTab companyId={company.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
