"use client"

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
  onBack: () => void
}

export default function DeviceDetails({ device, onBack }: DeviceDetailsProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button onClick={onBack} variant="outline" className="mr-4 border-gray-200 bg-white text-gray-900 hover:bg-gray-50 hover:text-gray-900">
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{device.name}</h2>
            <p className="text-gray-500">{device.email}</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 sm:flex">
          <Monitor className="h-4 w-4" />
          Device #{device.id}
        </div>
      </div>

      <DeviceStaffTab deviceId={device.id} />
    </div>
  )
}
