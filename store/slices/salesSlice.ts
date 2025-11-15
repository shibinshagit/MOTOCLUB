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
  outstanding_amount?: number // Add this for credit tracking
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

    // Filter actions
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload
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
    },

    // Add new sale to the list
    addSale: (state, action: PayloadAction<Sale>) => {
      state.sales.unshift(action.payload)
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
    },
  },
})

export const {
  setSales,
  updateSalesData,
  setFilteredSales,
  setLoading,
  setRefreshing,
  setSilentRefreshing,
  setNeedsRefresh,
  setFetchedTime,
  forceClearSales,
  setError,
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
