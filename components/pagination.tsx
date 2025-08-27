import React, { useState, useEffect } from "react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  hasMore?: boolean;
  showLoadMore?: boolean;
  siblingCount?: number; // Number of page buttons to show on each side of current page
  boundaryCount?: number; // Number of always visible pages at start/end
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
  siblingCount = 1,
  boundaryCount = 1,
}) => {
  const [isMobile, setIsMobile] = useState(false);

  // Check screen size on mount and resize
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 640);
    };

    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  if (totalCount === 0) return null;

  // Generate page numbers with ellipsis logic
  const generatePageNumbers = () => {
    const totalPageNumbers = siblingCount * 2 + 3 + boundaryCount * 2;
    if (totalPages <= totalPageNumbers) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, boundaryCount);
    const rightSiblingIndex = Math.min(
      currentPage + siblingCount,
      totalPages - boundaryCount
    );

    const shouldShowLeftEllipsis = leftSiblingIndex > boundaryCount + 1;
    const shouldShowRightEllipsis =
      rightSiblingIndex < totalPages - boundaryCount;

    if (!shouldShowLeftEllipsis && shouldShowRightEllipsis) {
      const leftItemCount = 2 + siblingCount * 2;
      const leftRange = Array.from(
        { length: leftItemCount },
        (_, i) => i + 1
      );
      return [...leftRange, "...", totalPages];
    }

    if (shouldShowLeftEllipsis && !shouldShowRightEllipsis) {
      const rightItemCount = 2 + siblingCount * 2;
      const rightRange = Array.from(
        { length: rightItemCount },
        (_, i) => totalPages - rightItemCount + i + 1
      );
      return [1, "...", ...rightRange];
    }

    if (shouldShowLeftEllipsis && shouldShowRightEllipsis) {
      const middleRange = Array.from(
        { length: rightSiblingIndex - leftSiblingIndex + 1 },
        (_, i) => leftSiblingIndex + i
      );
      return [1, "...", ...middleRange, "...", totalPages];
    }

    return Array.from({ length: totalPages }, (_, i) => i + 1);
  };

  const pageNumbers = generatePageNumbers();

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3 sm:px-6">
      {/* Item count - simplified version */}
      <div className="text-sm text-gray-700 dark:text-gray-300 mb-2 sm:mb-0">
        <span className="font-medium">{totalCount}</span> items
      </div>

      {/* Pagination controls */}
      {showLoadMore ? (
        // --- Load More button mode ---
        <div>
          {hasMore && (
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={isLoading}
              className="relative inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors duration-200"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Loading...
                </span>
              ) : (
                "Load More"
              )}
            </button>
          )}
        </div>
      ) : (
        // --- Classic numbered pagination mode ---
        <div className="flex items-center space-x-1">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1 || isLoading}
            className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 flex items-center"
            aria-label="Previous page"
          >
            {isMobile ? "←" : "Previous"}
          </button>

          {/* Page numbers with ellipsis */}
          <div className="flex space-x-1">
            {pageNumbers.map((page, index) => {
              if (page === "...") {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="px-3 py-1 text-sm text-gray-500"
                  >
                    …
                  </span>
                );
              }

              return (
                <button
                  key={page}
                  onClick={() => onPageChange(page as number)}
                  className={`px-3 py-1 text-sm border rounded-md min-w-[2.25rem] ${
                    page === currentPage
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                  } transition-colors duration-200`}
                  disabled={isLoading}
                  aria-label={`Page ${page}`}
                  aria-current={page === currentPage ? "page" : undefined}
                >
                  {page}
                </button>
              );
            })}
          </div>

          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages || isLoading}
            className="px-3 py-1 text-sm border rounded-md disabled:opacity-50 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 flex items-center"
            aria-label="Next page"
          >
            {isMobile ? "→" : "Next"}
          </button>
        </div>
      )}
    </div>
  );
};

export default Pagination;
