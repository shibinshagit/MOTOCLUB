import { redirect } from "next/navigation"
import { getAdminSession } from "@/app/actions/admin-auth-actions"
import AdminShell from "@/components/admin/admin-shell"

export default async function AdminPortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getAdminSession()

  if (!session.authenticated) {
    redirect("/admin")
  }

  return <AdminShell>{children}</AdminShell>
}
