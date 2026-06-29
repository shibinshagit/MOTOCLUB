import { notFound } from "next/navigation"
import { getDeviceById } from "@/app/actions/admin-actions"
import AdminBreadcrumbs from "@/components/admin/admin-breadcrumbs"
import DeviceDetails from "@/components/admin/device-details"

type DevicePageProps = {
  params: Promise<{ companyId: string; deviceId: string }>
}

export default async function DevicePage({ params }: DevicePageProps) {
  const { companyId: companyIdParam, deviceId: deviceIdParam } = await params
  const companyId = Number.parseInt(companyIdParam, 10)
  const deviceId = Number.parseInt(deviceIdParam, 10)

  if (Number.isNaN(companyId) || Number.isNaN(deviceId)) {
    notFound()
  }

  const result = await getDeviceById(deviceId)

  if (!result.success || !result.data) {
    notFound()
  }

  if (result.data.company_id !== companyId) {
    notFound()
  }

  return (
    <>
      <AdminBreadcrumbs
        items={[
          { label: "Companies", href: "/admin/companies" },
          { label: result.data.company_name, href: `/admin/companies/${companyId}` },
          { label: "Devices", href: `/admin/companies/${companyId}?tab=devices` },
          { label: result.data.name },
        ]}
      />
      <DeviceDetails
        device={{
          id: result.data.id,
          name: result.data.name,
          email: result.data.email,
          company_id: result.data.company_id,
          created_at: result.data.created_at,
        }}
        companyId={companyId}
      />
    </>
  )
}
