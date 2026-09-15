import { redirect } from "next/navigation"
import { getStaffSession } from "@/lib/staff-session"
import { sql } from "@/lib/db"
import { getFilteredPartnerOrders, getPartnerDashboardStats } from "@/app/actions/partner-actions"
import { PartnerSalesTable } from "./partner-sales-table"
import { PartnerSalesChart } from "./partner-sales-chart"
import { PartnerDashboardShell } from "./partner-dashboard-shell"
import { Package, Banknote, Calendar, Truck } from "lucide-react"

export default async function PartnerDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
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
      d.logo_url as device_logo_url,
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
  const logoUrl = data.device_logo_url || null

  const rawParams = (await searchParams) || {}
  const page = Math.max(1, Number(rawParams.page) || 1)
  const search = typeof rawParams.search === "string" ? rawParams.search : ""
  const status = typeof rawParams.status === "string" ? rawParams.status : "All"
  const orderType = typeof rawParams.orderType === "string" ? rawParams.orderType : "All"
  const tracking = typeof rawParams.tracking === "string" ? rawParams.tracking : "All"
  const dateRange = typeof rawParams.dateRange === "string" ? rawParams.dateRange : "All"
  const fromDate = typeof rawParams.fromDate === "string" ? rawParams.fromDate : ""
  const toDate = typeof rawParams.toDate === "string" ? rawParams.toDate : ""

  let orders: any[] = []
  let totalCount = 0
  let totalPages = 1
  let pendingReplacementsCount = 0
  let stats = { totalOrders: 0, activeOrders: 0, totalEarnings: 0, todayActivity: 0 }

  const [salesResult, statsResult] = await Promise.all([
    getFilteredPartnerOrders({
      page,
      pageSize: 20,
      search,
      status,
      orderType,
      tracking,
      dateRange,
      fromDate,
      toDate,
    }),
    getPartnerDashboardStats(session.staffId),
  ])

  if (salesResult.success) {
    orders = salesResult.data || []
    totalCount = salesResult.totalCount || 0
    totalPages = salesResult.totalPages || 1
    pendingReplacementsCount = salesResult.pendingReplacementsCount || 0
  }
  if (statsResult.success && statsResult.data) {
    stats = statsResult.data
  }

  return (
    <PartnerDashboardShell data={data} logoUrl={logoUrl}>
      <div className="p-3.5 sm:p-6 md:p-8 w-full max-w-7xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            Welcome, {data.partner_name}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
            Here's an overview of your partner account.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {/* Total Orders */}
          <div className="bg-gradient-to-br from-[#2979ff] to-[#1565c0] p-3.5 sm:p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
              <Package className="h-16 w-16 sm:h-20 sm:w-20" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-blue-100">Total Orders</p>
                <Package className="h-4 w-4 sm:h-5 sm:w-5 text-blue-200" />
              </div>
              <h3 className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold">{stats.totalOrders}</h3>
              <p className="mt-1 sm:mt-2 text-[10px] sm:text-[11px] font-medium text-blue-100">Assigned</p>
            </div>
          </div>

          {/* Earnings */}
          <div className="bg-gradient-to-br from-[#00c853] to-[#009624] p-3.5 sm:p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
              <Banknote className="h-16 w-16 sm:h-20 sm:w-20" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-emerald-100">My Earnings</p>
                <Banknote className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-200" />
              </div>
              <h3 className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold truncate">
                ₹{stats.totalEarnings.toFixed(2)}
              </h3>
              <p className="mt-1 sm:mt-2 text-[10px] sm:text-[11px] font-medium text-emerald-100">From Courier Cost</p>
            </div>
          </div>

          {/* Today's Activity */}
          <div className="bg-gradient-to-br from-[#7c4dff] to-[#651fff] p-3.5 sm:p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
              <Calendar className="h-16 w-16 sm:h-20 sm:w-20" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-purple-100">Today's Activity</p>
                <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-purple-200" />
              </div>
              <h3 className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold">{stats.todayActivity}</h3>
              <p className="mt-1 sm:mt-2 text-[10px] sm:text-[11px] font-medium text-purple-100">Orders processing</p>
            </div>
          </div>

          {/* Active Orders */}
          <div className="bg-gradient-to-br from-[#ff6d00] to-[#ff3d00] p-3.5 sm:p-4 rounded-xl shadow-md border-0 flex flex-col justify-between text-white relative overflow-hidden group">
            <div className="absolute -right-4 -top-4 opacity-20 transform group-hover:scale-110 transition-transform duration-300">
              <Truck className="h-16 w-16 sm:h-20 sm:w-20" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-start">
                <p className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-orange-100">Active Orders</p>
                <Truck className="h-4 w-4 sm:h-5 sm:w-5 text-orange-200" />
              </div>
              <h3 className="mt-1.5 sm:mt-2 text-2xl sm:text-3xl font-extrabold">{stats.activeOrders}</h3>
              <p className="mt-1 sm:mt-2 text-[10px] sm:text-[11px] font-medium text-orange-100">In Progress</p>
            </div>
          </div>
        </div>

        <div>
          <PartnerSalesChart partnerId={session.staffId} />
        </div>

        <div>
          <PartnerSalesTable
            initialOrders={orders}
            initialTotalCount={totalCount}
            initialPage={page}
            initialPageSize={20}
            initialTotalPages={totalPages}
            pendingReplacementsCount={pendingReplacementsCount}
          />
        </div>
      </div>
    </PartnerDashboardShell>
  )
}
