import AdminDashboardView from "@/components/admin/dashboard/admin-dashboard-view"
import AdminBreadcrumbs from "@/components/admin/admin-breadcrumbs"

export const metadata = {
  title: "Admin Dashboard | MOTOCLUB",
  description: "Financial performance, COGS, margins, and staff activity",
}

export default function AdminPortalDashboardPage() {
  return (
    <div className="space-y-4">
      <AdminBreadcrumbs
        items={[
          { label: "Admin Portal", href: "/admin/companies" },
          { label: "Dashboard" },
        ]}
      />
      <AdminDashboardView title="Platform Admin Dashboard" />
    </div>
  )
}
