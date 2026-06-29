"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Building2, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react"
import { Loader2 } from "lucide-react"

type Company = {
  id: number
  name: string
  device_count?: number
}

interface AdminSidebarProps {
  companies: Company[]
  isLoading: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onClose?: () => void
}

function getActiveCompanyId(pathname: string): number | null {
  const match = pathname.match(/\/admin\/companies\/(\d+)/)
  return match ? Number.parseInt(match[1], 10) : null
}

export default function AdminSidebar({
  companies,
  isLoading,
  collapsed = false,
  onToggleCollapse,
  onClose,
}: AdminSidebarProps) {
  const pathname = usePathname()
  const activeCompanyId = getActiveCompanyId(pathname)
  const isCompaniesHome = pathname === "/admin/companies"
  const isDrawer = Boolean(onClose)
  const isCollapsed = isDrawer ? false : collapsed

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-3 py-3">
        {!isCollapsed && <h2 className="text-sm font-medium text-gray-700">Navigation</h2>}
        {isDrawer ? (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
            aria-label="Close menu"
          >
            <ChevronLeft size={18} />
          </button>
        ) : (
          onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`rounded-md p-1.5 text-gray-500 hover:bg-gray-100 ${isCollapsed ? "mx-auto" : "ml-auto"}`}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          )
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        <Link
          href="/admin/companies"
          onClick={onClose}
          className={`mb-4 flex w-full items-center rounded-lg border border-transparent p-3 text-left transition-colors hover:border-border hover:bg-muted/60 ${
            isCompaniesHome ? "border-l-2 border-l-primary bg-accent text-accent-foreground" : ""
          } ${isCollapsed ? "justify-center" : "gap-3"}`}
        >
          <LayoutGrid className={`h-4 w-4 shrink-0 ${isCompaniesHome ? "text-primary" : "text-muted-foreground"}`} />
          {!isCollapsed && <span className="text-sm font-medium text-gray-900">Overview</span>}
        </Link>

        {!isCollapsed && (
          <p className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-gray-400">Companies</p>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : companies.length === 0 ? (
          !isCollapsed && <p className="px-1 text-sm text-gray-500">No companies yet.</p>
        ) : (
          <div className="space-y-1">
            {companies.map((company) => {
              const isActive = activeCompanyId === company.id

              return (
                <Link
                  key={company.id}
                  href={`/admin/companies/${company.id}`}
                  onClick={onClose}
                  className={`flex w-full items-center rounded-lg border border-transparent p-3 text-left transition-colors hover:border-border hover:bg-muted/60 ${
                    isActive ? "border-l-2 border-l-primary bg-accent text-accent-foreground" : ""
                  } ${isCollapsed ? "justify-center" : "gap-3"}`}
                  title={isCollapsed ? company.name : undefined}
                >
                  <Building2 className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                  {!isCollapsed && (
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{company.name}</p>
                      <p className="text-xs text-gray-500">{company.device_count || 0} devices</p>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
