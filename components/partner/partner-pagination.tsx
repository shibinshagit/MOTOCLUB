"use client"

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"

interface PartnerPaginationProps {
  page: number
  pageSize: number
  totalCount: number
  totalPages: number
  onPageChange: (newPage: number) => void
  isLoading?: boolean
}

export function PartnerPagination({
  page,
  pageSize,
  totalCount,
  totalPages,
  onPageChange,
  isLoading = false,
}: PartnerPaginationProps) {
  if (totalCount === 0) return null

  const startRecord = Math.min((page - 1) * pageSize + 1, totalCount)
  const endRecord = Math.min(page * pageSize, totalCount)

  // Generate page numbers range around current page
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const delta = 1

    for (let i = 1; i <= totalPages; i++) {
      if (
        i === 1 ||
        i === totalPages ||
        (i >= page - delta && i <= page + delta)
      ) {
        pages.push(i)
      } else if (
        (i === page - delta - 1 && i > 1) ||
        (i === page + delta + 1 && i < totalPages)
      ) {
        pages.push("...")
      }
    }

    // Filter out consecutive duplicate ellipses
    return pages.filter((item, index, array) => {
      return item !== "..." || array[index - 1] !== "..."
    })
  }

  const pageNumbers = getPageNumbers()

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-600 font-medium">
      {/* Records count summary */}
      <div>
        Showing <span className="font-bold text-slate-900">{startRecord}</span> to{" "}
        <span className="font-bold text-slate-900">{endRecord}</span> of{" "}
        <span className="font-bold text-slate-900">{totalCount}</span> orders
      </div>

      {/* Pagination controls */}
      <div className="flex items-center gap-1">
        {/* First Page */}
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={page <= 1 || isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="First Page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </button>

        {/* Previous Page */}
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Previous Page"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {/* Numeric Page Buttons */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (typeof p === "string") {
              return (
                <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400">
                  ...
                </span>
              )
            }
            const isCurrent = p === page
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                disabled={isLoading}
                className={`h-8 min-w-[32px] px-2 flex items-center justify-center rounded-lg font-bold transition-all ${
                  isCurrent
                    ? "bg-indigo-600 text-white shadow-2xs"
                    : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {p}
              </button>
            )
          })}
        </div>

        {/* Mobile Simple Page Indicator */}
        <span className="sm:hidden px-2 font-bold text-slate-800">
          Page {page} of {totalPages}
        </span>

        {/* Next Page */}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Next Page"
        >
          <ChevronRight className="h-4 w-4" />
        </button>

        {/* Last Page */}
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages || isLoading}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Last Page"
        >
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
