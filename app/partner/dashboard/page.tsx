import { redirect } from "next/navigation"
import { getStaffSession } from "@/lib/staff-session"
import { sql } from "@/lib/db"
import Link from "next/link"
import { LogOut, LayoutDashboard, UserCircle } from "lucide-react"
import { LogoutButton } from "./logout-button"

export default async function PartnerDashboardPage() {
  const session = await getStaffSession()

  if (!session || session.role !== "partner") {
    redirect("/")
  }

  // Fetch full details
  const result = await sql`
    SELECT 
      s.name as partner_name,
      d.name as device_name,
      c.name as company_name
    FROM staff s
    JOIN devices d ON s.device_id = d.id
    LEFT JOIN companies c ON d.company_id = c.id
    WHERE s.id = ${session.staffId}
    LIMIT 1
  `

  if (result.length === 0) {
    redirect("/")
  }

  const data = result[0]

  return (
    <div className="flex h-full w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col hidden md:flex">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-xl font-bold tracking-tight">{data.company_name || "MOTO CLUB"}</h2>
          <p className="text-sm text-gray-400 mt-1">{data.device_name}</p>
        </div>
        <div className="p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Partner Portal
          </p>
          <nav className="space-y-1">
            <Link
              href="/partner/dashboard"
              className="flex items-center gap-3 px-3 py-2 bg-gray-800 text-white rounded-md"
            >
              <LayoutDashboard className="h-5 w-5" />
              Dashboard
            </Link>
          </nav>
        </div>
        <div className="mt-auto p-4 border-t border-gray-800">
          <div className="flex items-center gap-3 mb-4 px-2">
            <UserCircle className="h-8 w-8 text-gray-400" />
            <div className="flex flex-col">
              <span className="text-sm font-medium">{data.partner_name}</span>
              <span className="text-xs text-gray-400">Partner</span>
            </div>
          </div>
          <LogoutButton />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-5xl mx-auto">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome, {data.partner_name}
            </h1>
            <p className="text-gray-500 mt-2">
              Here's an overview of your partner account.
            </p>
          </header>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                Company
              </h3>
              <p className="text-xl font-semibold text-gray-900">
                {data.company_name || "MOTO CLUB"}
              </p>
            </div>
            
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                Assigned Branch
              </h3>
              <p className="text-xl font-semibold text-gray-900">
                {data.device_name}
              </p>
            </div>
          </div>

          <div className="mt-8 bg-white rounded-xl shadow-sm border border-gray-200 p-12 flex flex-col items-center justify-center text-center">
            <LayoutDashboard className="h-16 w-16 text-gray-300 mb-4" />
            <h2 className="text-xl font-medium text-gray-900">Dashboard Ready</h2>
            <p className="text-gray-500 mt-2 max-w-md">
              Your partner account is successfully set up. Future modules (sales, reports, customers) will appear here.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
