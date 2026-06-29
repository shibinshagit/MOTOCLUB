"use client"

import Link from "next/link"
import { ChevronRight } from "lucide-react"

export type BreadcrumbItem = {
  label: string
  href?: string
}

interface AdminBreadcrumbsProps {
  items: BreadcrumbItem[]
}

export default function AdminBreadcrumbs({ items }: AdminBreadcrumbsProps) {
  if (items.length === 0) return null

  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1">
              {index > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />}
              {item.href && !isLast ? (
                <Link href={item.href} className="rounded px-1 py-0.5 transition-colors hover:text-gray-900">
                  {item.label}
                </Link>
              ) : (
                <span className={`px-1 py-0.5 ${isLast ? "font-medium text-gray-900" : ""}`}>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
