import { redirect } from "next/navigation"
import { getStaffSession } from "@/lib/staff-session"
import { sql } from "@/lib/db"
import { getFilteredPartnerOrders } from "@/app/actions/partner-actions"
import { PartnerDashboardShell } from "../dashboard/partner-dashboard-shell"
import { PartnerSalesTable } from "../dashboard/partner-sales-table"
import { RefreshCw } from "lucide-react"

export default async function PartnerReplacementShipmentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const session = await getStaffSession()

  if (!session || session.role !== "partner") {
    redirect("/")
  }

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
  const tracking = typeof rawParams.tracking === "string" ? rawParams.tracking : "All"
  const dateRange = typeof rawParams.dateRange === "string" ? rawParams.dateRange : "All"
  const fromDate = typeof rawParams.fromDate === "string" ? rawParams.fromDate : ""
  const toDate = typeof rawParams.toDate === "string" ? rawParams.toDate : ""

  const res = await getFilteredPartnerOrders({
    page,
    pageSize: 20,
    search,
    status,
    orderType: "Replacement Shipments",
    tracking,
    dateRange,
    fromDate,
    toDate,
  })

  const replacements = res.success ? (res.data || res.replacementShipments || []) : []
  const totalCount = res.totalCount || 0
  const totalPages = res.totalPages || 1

  return (
    <PartnerDashboardShell data={data} logoUrl={logoUrl}>
      <div className="p-3.5 sm:p-6 md:p-8 w-full max-w-7xl mx-auto space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                Replacement Shipments
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              Search and filter replacement shipments assigned to your logistics account.
            </p>
          </div>
        </header>

        <div>
          <PartnerSalesTable
            initialOrders={replacements}
            initialTotalCount={totalCount}
            initialPage={page}
            initialPageSize={20}
            initialTotalPages={totalPages}
            onlyReplacements={true}
            hideOrderTypeFilter={true}
          />
        </div>
      </div>
    </PartnerDashboardShell>
  )
}
