"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft, Monitor } from "lucide-react"
import DeviceStaffTab from "./device-tabs/device-staff-tab"

type Device = {
  id: number
  name: string
  email: string
  company_id: number
  created_at?: string
}

interface DeviceDetailsProps {
  device: Device
  companyId: number
}

export default function DeviceDetails({ device, companyId }: DeviceDetailsProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-0.5 border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900"
          >
            <Link href={`/admin/companies/${companyId}?tab=devices`}>
              <ChevronLeft className="mr-1 h-4 w-4" />
              Devices
            </Link>
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">{device.name}</h2>
            <p className="text-sm text-gray-500">{device.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600">
          <Monitor className="h-4 w-4" />
          Device #{device.id}
        </div>
      </div>

      <DeviceStaffTab deviceId={device.id} />
    </div>
  )
}
