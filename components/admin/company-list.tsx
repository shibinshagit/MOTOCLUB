"use client"

import { Building2, Users, Loader2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

type Company = {
  id: number
  name: string
  address?: string
  phone?: string
  email?: string
  description?: string
  logo_url?: string
  device_count?: number
}

interface CompanyListProps {
  companies: Company[]
  isLoading: boolean
  onSelect: (company: Company) => void
}

export default function CompanyList({ companies, isLoading, onSelect }: CompanyListProps) {
  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <Card className="border-gray-200 bg-white shadow-sm">
        <CardContent className="flex h-64 flex-col items-center justify-center p-6">
          <Building2 className="h-12 w-12 text-gray-300" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No companies found</h3>
          <p className="mt-2 text-center text-sm text-gray-500">Add your first company to get started.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {companies.map((company) => (
        <Card
          key={company.id}
          className="cursor-pointer border-gray-200 bg-white shadow-sm transition-all hover:border-gray-300 hover:shadow-md"
          onClick={() => onSelect(company)}
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-gray-900">{company.name}</h3>
                <p className="truncate text-sm text-gray-500">{company.address || "No address provided"}</p>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>{company.device_count || 0} devices</span>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">ID {company.id}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
