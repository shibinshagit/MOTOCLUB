import StaffDashboard from "@/components/staff/staff-dashboard"
import { Suspense } from "react"
import { Loader2 } from "lucide-react"

export default function StaffDashboardPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>}>
      <StaffDashboard />
    </Suspense>
  )
}
