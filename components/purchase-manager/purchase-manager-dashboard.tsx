"use client"

import { Button } from "@/components/ui/button"
import { LogOut, UserCircle2 } from "lucide-react"

interface PurchaseManagerDashboardProps {
  staffName: string
  onLogout: () => void
}

export function PurchaseManagerDashboard({ staffName, onLogout }: PurchaseManagerDashboardProps) {
  return (
    <div className="flex flex-col h-screen bg-gray-50 items-center justify-center relative w-full">
      {/* Logout Button in Top Right */}
      <div className="absolute top-4 right-4">
        <Button onClick={onLogout} variant="outline" className="flex items-center gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>

      <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center max-w-lg w-full mx-4">
        <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <UserCircle2 className="h-10 w-10 text-indigo-600" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Hello, {staffName}</h1>
        <p className="text-gray-500 mb-8">Welcome to the Purchase Manager Dashboard.</p>
        <div className="inline-flex items-center justify-center px-4 py-2 bg-indigo-50 rounded-full text-sm font-medium text-indigo-700">
          Purchase Manager Role
        </div>
      </div>
    </div>
  )
}
