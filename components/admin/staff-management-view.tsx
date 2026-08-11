"use client"

import React, { useState } from "react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Users, Banknote, FileText } from "lucide-react"
import DeviceStaffTab from "@/components/admin/device-tabs/device-staff-tab"
import PayrollRequestsTab from "@/components/admin/payroll-requests-tab"
import { useSelector } from "react-redux"
import { selectDevice, selectDeviceCurrency } from "@/store/slices/deviceSlice"

interface StaffManagementViewProps {
  userId?: number
}

export default function StaffManagementView({ userId }: StaffManagementViewProps) {
  const device = useSelector(selectDevice)
  const currency = useSelector(selectDeviceCurrency)
  const [activeTab, setActiveTab] = useState<"members" | "payroll" | "requests">("members")

  if (!device?.id) {
    return (
      <div className="p-8 text-center text-slate-500">
        Please select a device/branch to manage staff.
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">Staff Management</h2>
          <p className="text-xs text-slate-500">Manage device staff members, permissions, total sales, payroll, and staff requests.</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(val: any) => setActiveTab(val)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-slate-100">
          <TabsTrigger value="members" className="text-xs font-semibold">
            <Users className="mr-1.5 h-4 w-4 text-blue-600" /> Staff Members & Sales
          </TabsTrigger>
          <TabsTrigger value="payroll" className="text-xs font-semibold">
            <Banknote className="mr-1.5 h-4 w-4 text-emerald-600" /> Payroll & Salaries
          </TabsTrigger>
          <TabsTrigger value="requests" className="text-xs font-semibold">
            <FileText className="mr-1.5 h-4 w-4 text-purple-600" /> Staff Requests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          <DeviceStaffTab deviceId={device.id} />
        </TabsContent>

        <TabsContent value="payroll">
          <PayrollRequestsTab deviceId={device.id} currency={currency} initialSubTab="payroll" />
        </TabsContent>

        <TabsContent value="requests">
          <PayrollRequestsTab deviceId={device.id} currency={currency} initialSubTab="requests" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
