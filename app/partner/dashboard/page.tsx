import { redirect } from "next/navigation"
import { getStaffSession } from "@/lib/staff-session"
import { sql } from "@/lib/db"
import Link from "next/link"
import { LogOut, LayoutDashboard, UserCircle } from "lucide-react"
import { LogoutButton } from "./logout-button"
import { getPartnerSales, getPartnerDashboardStats } from "@/app/actions/partner-actions"
import { PartnerSalesTable } from "./partner-sales-table"
import { PartnerSalesChart } from "./partner-sales-chart"
import { Package, Banknote, Calendar, Truck } from "lucide-react"

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
      c.name as company_name,
      s.linked_partner_id
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

  let sales: any[] = []
  let stats = { totalOrders: 0, activeOrders: 0, totalEarnings: 0, todayActivity: 0 }
  
  const [salesResult, statsResult] = await Promise.all([
    getPartnerSales(session.staffId),
    getPartnerDashboardStats(session.staffId)
  ])

  if (salesResult.success && salesResult.data) {
    sales = salesResult.data
  }
  if (statsResult.success && statsResult.data) {
    stats = statsResult.data
  }

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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {/* Total Orders */}
            <div className="bg-gradient-to-br from-[#2979ff] to-[#1565c0] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                <Package className="h-20 w-20" />
              </div>
              <div className="relative z-10">
                <div className="flex justify-between items-start">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Orders</p>
                  <Package className="h-5 w-5 text-blue-200" />
                </div>
                <h3 className="mt-2 text-3xl font-extrabold">{stats.totalOrders}</h3>
                <p className="mt-2 text-[11px] font-medium text-blue-100">All time entries</p>
              </div>
            </div>

            {/* My Earnings */}
            <div className="bg-gradient-to-br from-[#00c853] to-[#00b0ff] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                <Banknote className="h-20 w-20" />
              </div>
              <div className="relative z-10">
                <div className="flex justify-between items-start">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-100">My Earnings</p>
                  <Banknote className="h-5 w-5 text-emerald-200" />
                </div>
                <h3 className="mt-2 text-3xl font-extrabold truncate">
                  ₹{stats.totalEarnings.toFixed(2)}
                </h3>
                <p className="mt-2 text-[11px] font-medium text-emerald-100">From Courier Cost</p>
              </div>
            </div>

            {/* Today's Activity */}
            <div className="bg-gradient-to-br from-[#7c4dff] to-[#651fff] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                <Calendar className="h-20 w-20" />
              </div>
              <div className="relative z-10">
                <div className="flex justify-between items-start">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-purple-100">Today's Activity</p>
                  <Calendar className="h-5 w-5 text-purple-200" />
                </div>
                <h3 className="mt-2 text-3xl font-extrabold">{stats.todayActivity}</h3>
                <p className="mt-2 text-[11px] font-medium text-purple-100">Orders processing</p>
              </div>
            </div>

            {/* Active Orders */}
            <div className="bg-gradient-to-br from-[#ff6d00] to-[#ff3d00] p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
              <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
                <Truck className="h-20 w-20" />
              </div>
              <div className="relative z-10">
                <div className="flex justify-between items-start">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-orange-100">Active Orders</p>
                  <Truck className="h-5 w-5 text-orange-200" />
                </div>
                <h3 className="mt-2 text-3xl font-extrabold">{stats.activeOrders}</h3>
                <p className="mt-2 text-[11px] font-medium text-orange-100">In Progress</p>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <PartnerSalesChart partnerId={session.staffId} />
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Assigned Orders</h2>
            <PartnerSalesTable initialSales={sales} />
          </div>
        </div>
      </main>
    </div>
  )
}
