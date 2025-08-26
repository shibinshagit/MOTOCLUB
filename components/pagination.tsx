import React from "react"

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalCount: number
  itemsPerPage: number
  onPageChange: (page: number) => void
  isLoading?: boolean
  hasMore?: boolean
  showLoadMore?: boolean
}

const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalCount,
  itemsPerPage,
  onPageChange,
  isLoading = false,
  hasMore = false,
  showLoadMore = false,
}) => {
  if (totalCount === 0) return null

  // calculate item range
  const startItem = (currentPage - 1) * itemsPerPage + 1
  const endItem = Math.min(currentPage * itemsPerPage, totalCount)

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6">
      {/* Item count */}
      <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 sm:mb-0">
        Showing <span className="font-medium">{startItem}</span> to{" "}
        <span className="font-medium">{endItem}</span> of{" "}
        <span className="font-medium">{totalCount}</span> results
      </div>

      {/* Pagination controls */}
      {showLoadMore ? (
        // --- Load More button mode ---
        <div>
          {hasMore && (
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={isLoading}
              className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md"
            >
              {isLoading ? "Loading..." : "Load More"}
            </button>
          )}
        </div>
      ) : (
        // --- Classic numbered pagination mode ---
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 dark:border-gray-600"
          >
            Previous
          </button>

          {/* Page numbers */}
          <div className="flex space-x-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={`px-3 py-1 text-sm border rounded-md ${
                  page === currentPage
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-gray-300 dark:border-gray-600"
                }`}
                disabled={isLoading}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
            className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 dark:border-gray-600"
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default Pagination
