import { notFound } from "next/navigation"
import { getCompanyById } from "@/app/actions/admin-actions"
import AdminBreadcrumbs from "@/components/admin/admin-breadcrumbs"
import CompanyDetails from "@/components/admin/company-details"

type CompanyPageProps = {
  params: Promise<{ companyId: string }>
  searchParams: Promise<{ tab?: string }>
}

export default async function CompanyPage({ params, searchParams }: CompanyPageProps) {
  const { companyId: companyIdParam } = await params
  const { tab } = await searchParams
  const companyId = Number.parseInt(companyIdParam, 10)

  if (Number.isNaN(companyId)) {
    notFound()
  }

  const result = await getCompanyById(companyId)

  if (!result.success || !result.data) {
    notFound()
  }

  const activeTab = tab === "devices" ? "devices" : "details"

  return (
    <>
      <AdminBreadcrumbs
        items={[
          { label: "Companies", href: "/admin/companies" },
          { label: result.data.name },
        ]}
      />
      <CompanyDetails company={result.data} activeTab={activeTab} />
    </>
  )
}
