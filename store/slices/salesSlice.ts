import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

interface Sale {
  id: number
  customer_name?: string
  sale_date: string
  total_amount: number
  received_amount?: number
  discount?: number
  payment_method?: string
  status: string
  created_at: string
  updated_at: string
  total_cost?: number
}

interface PaginationInfo {
  currentPage: number
  totalPages: number
  totalCount: number
  hasMore: boolean
  limit: number
}

interface SalesState {
  sales: Sale[]
  filteredSales: Sale[]
  isLoading: boolean
  isRefreshing: boolean
  isSilentRefreshing: boolean
  lastUpdated: string | null
  fetchedTime: number | null
  error: string | null
  needsRefresh: boolean
  
  // Pagination state
  pagination: PaginationInfo

  // Filter states
  searchTerm: string
  statusFilter: string
  paymentMethodFilter: string
  dateFromFilter: string
  dateToFilter: string
  minAmountFilter: string
  maxAmountFilter: string
  showFilters: boolean

  // UI states
  currency: string
}

const initialState: SalesState = {
  sales: [],
  filteredSales: [],
  isLoading: false,
  isRefreshing: false,
  isSilentRefreshing: false,
  lastUpdated: null,
  fetchedTime: null,
  error: null,
  needsRefresh: false,
  
  // Pagination state
  pagination: {
    currentPage: 1,
    totalPages: 1,
    totalCount: 0,
    hasMore: false,
    limit: 5
  },

  // Filter states
  searchTerm: "",
  statusFilter: "all",
  paymentMethodFilter: "all",
  dateFromFilter: "",
  dateToFilter: "",
  minAmountFilter: "",
  maxAmountFilter: "",
  showFilters: false,

  // UI states
  currency: "AED",
}

interface SetSalesWithPaginationPayload {
  data: Sale[]
  pagination: {
    currentPage: number
    totalPages: number
    totalCount: number
    hasMore: boolean
  }
  append?: boolean // For load more functionality
}

const salesSlice = createSlice({
  name: "sales",
  initialState,
  reducers: {
    setSales: (state, action: PayloadAction<Sale[]>) => {
      state.sales = action.payload
      state.fetchedTime = Date.now()
      state.lastUpdated = new Date().toISOString()
      state.error = null
      state.needsRefresh = false
    },

    setSalesWithPagination: (state, action: PayloadAction<SetSalesWithPaginationPayload>) => {
      const { data, pagination, append = false } = action.payload
      
      if (append) {
        // Append new data for "load more"
        const existingIds = new Set(state.sales.map(sale => sale.id))
        const newSales = data.filter(sale => !existingIds.has(sale.id))
        state.sales = [...state.sales, ...newSales]
      } else {
        // Replace all data for new search/filter
        state.sales = data
      }
      
      state.pagination = {
        ...state.pagination,
        currentPage: pagination.currentPage,
        totalPages: pagination.totalPages,
        totalCount: pagination.totalCount,
        hasMore: pagination.hasMore
      }
      
      state.fetchedTime = Date.now()
      state.lastUpdated = new Date().toISOString()
      state.error = null
      state.needsRefresh = false
    },

    setFilteredSales: (state, action: PayloadAction<Sale[]>) => {
      state.filteredSales = action.payload
    },

    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },

    setRefreshing: (state, action: PayloadAction<boolean>) => {
      state.isRefreshing = action.payload
    },

    setSilentRefreshing: (state, action: PayloadAction<boolean>) => {
      state.isSilentRefreshing = action.payload
    },

    setNeedsRefresh: (state, action: PayloadAction<boolean>) => {
      state.needsRefresh = action.payload
    },

    setFetchedTime: (state, action: PayloadAction<number>) => {
      state.fetchedTime = action.payload
    },

    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },

    setPaginationLimit: (state, action: PayloadAction<number>) => {
      state.pagination.limit = action.payload
    },

    resetPagination: (state) => {
      state.pagination = {
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        hasMore: false,
        limit: state.pagination.limit
      }
    },

    // Filter actions
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload
      // Reset pagination when search changes
      state.pagination.currentPage = 1
    },

    setStatusFilter: (state, action: PayloadAction<string>) => {
      state.statusFilter = action.payload
    },

    setPaymentMethodFilter: (state, action: PayloadAction<string>) => {
      state.paymentMethodFilter = action.payload
    },

    setDateFromFilter: (state, action: PayloadAction<string>) => {
      state.dateFromFilter = action.payload
    },

    setDateToFilter: (state, action: PayloadAction<string>) => {
      state.dateToFilter = action.payload
    },

    setMinAmountFilter: (state, action: PayloadAction<string>) => {
      state.minAmountFilter = action.payload
    },

    setMaxAmountFilter: (state, action: PayloadAction<string>) => {
      state.maxAmountFilter = action.payload
    },

    setShowFilters: (state, action: PayloadAction<boolean>) => {
      state.showFilters = action.payload
    },

    setCurrency: (state, action: PayloadAction<string>) => {
      state.currency = action.payload
    },

    // Clear all filters
    clearFilters: (state) => {
      state.searchTerm = ""
      state.statusFilter = "all"
      state.paymentMethodFilter = "all"
      state.dateFromFilter = ""
      state.dateToFilter = ""
      state.minAmountFilter = ""
      state.maxAmountFilter = ""
      state.pagination.currentPage = 1
    },

    // Add new sale to the list
    addSale: (state, action: PayloadAction<Sale>) => {
      state.sales.unshift(action.payload)
      state.pagination.totalCount += 1
      state.lastUpdated = new Date().toISOString()
    },

    // Update existing sale
    updateSale: (state, action: PayloadAction<Sale>) => {
      const index = state.sales.findIndex((sale) => sale.id === action.payload.id)
      if (index !== -1) {
        state.sales[index] = action.payload
        state.lastUpdated = new Date().toISOString()
      }
    },

    // Remove sale from the list
    removeSale: (state, action: PayloadAction<number>) => {
      state.sales = state.sales.filter((sale) => sale.id !== action.payload)
      state.pagination.totalCount = Math.max(0, state.pagination.totalCount - 1)
      state.lastUpdated = new Date().toISOString()
    },

    // Reset state
    resetSalesState: (state) => {
      return initialState
    },

    updateSalesData: (state, action: PayloadAction<Sale[]>) => {
      state.sales = action.payload
      state.fetchedTime = Date.now()
      state.lastUpdated = new Date().toISOString()
      state.error = null
      state.needsRefresh = false
      state.isSilentRefreshing = false
    },

    // Force clear all data (for refresh button)
    forceClearSales: (state) => {
      state.sales = []
      state.filteredSales = []
      state.fetchedTime = null
      state.lastUpdated = null
      state.needsRefresh = false
      state.error = null
      state.pagination = {
        currentPage: 1,
        totalPages: 1,
        totalCount: 0,
        hasMore: false,
        limit: state.pagination.limit
      }
    },
  },
})

export const {
  setSales,
  setSalesWithPagination,
  updateSalesData,
  setFilteredSales,
  setLoading,
  setRefreshing,
  setSilentRefreshing,
  setNeedsRefresh,
  setFetchedTime,
  forceClearSales,
  setError,
  setPaginationLimit,
  resetPagination,
  setSearchTerm,
  setStatusFilter,
  setPaymentMethodFilter,
  setDateFromFilter,
  setDateToFilter,
  setMinAmountFilter,
  setMaxAmountFilter,
  setShowFilters,
  setCurrency,
  clearFilters,
  addSale,
  updateSale,
  removeSale,
  resetSalesState,
} = salesSlice.actions

// Selectors
export const selectSales = (state: { sales: SalesState }) => state.sales.sales
export const selectFilteredSales = (state: { sales: SalesState }) => state.sales.filteredSales
export const selectSalesLoading = (state: { sales: SalesState }) => state.sales.isLoading
export const selectSalesRefreshing = (state: { sales: SalesState }) => state.sales.isRefreshing
export const selectSalesLastUpdated = (state: { sales: SalesState }) => state.sales.lastUpdated
export const selectSalesError = (state: { sales: SalesState }) => state.sales.error

// Pagination selectors
export const selectSalesPagination = (state: { sales: SalesState }) => state.sales.pagination
export const selectSalesHasMore = (state: { sales: SalesState }) => state.sales.pagination.hasMore
export const selectSalesCurrentPage = (state: { sales: SalesState }) => state.sales.pagination.currentPage
export const selectSalesTotalPages = (state: { sales: SalesState }) => state.sales.pagination.totalPages
export const selectSalesTotalCount = (state: { sales: SalesState }) => state.sales.pagination.totalCount

// Filter selectors
export const selectSalesSearchTerm = (state: { sales: SalesState }) => state.sales.searchTerm
export const selectSalesStatusFilter = (state: { sales: SalesState }) => state.sales.statusFilter
export const selectSalesPaymentMethodFilter = (state: { sales: SalesState }) => state.sales.paymentMethodFilter
export const selectSalesDateFromFilter = (state: { sales: SalesState }) => state.sales.dateFromFilter
export const selectSalesDateToFilter = (state: { sales: SalesState }) => state.sales.dateToFilter
export const selectSalesMinAmountFilter = (state: { sales: SalesState }) => state.sales.minAmountFilter
export const selectSalesMaxAmountFilter = (state: { sales: SalesState }) => state.sales.maxAmountFilter
export const selectSalesShowFilters = (state: { sales: SalesState }) => state.sales.showFilters
export const selectSalesCurrency = (state: { sales: SalesState }) => state.sales.currency

export const selectSalesFetchedTime = (state: { sales: SalesState }) => state.sales.fetchedTime
export const selectSalesNeedsRefresh = (state: { sales: SalesState }) => state.sales.needsRefresh
export const selectSalesSilentRefreshing = (state: { sales: SalesState }) => state.sales.isSilentRefreshing

export default salesSlice.reducer
