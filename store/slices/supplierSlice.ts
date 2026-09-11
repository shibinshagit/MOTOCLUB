import { createSlice, createAsyncThunk, type PayloadAction } from "@reduxjs/toolkit"
import type { RootState } from "../store"

// Types
export interface Supplier {
  id: number
  name: string
  phone: string
  email?: string
  address?: string
  total_purchases?: number
  total_amount?: number
  paid_amount?: number
  balance_amount?: number
  outstanding_balance?: number
  original_credit?: number
  refunded_credit?: number
  credit_used?: number
  available_credit?: number
  supplier_credit?: number
  created_at?: string
  updated_at?: string
}

export interface SupplierState {
  suppliers: Supplier[]
  isLoading: boolean
  isRefreshing: boolean // For background refresh
  error: string | null
  lastFetch: number | null
  searchTerm: string
  currency: string
  selectedSupplierId: number | null
  // Cache management
  cacheExpiry: number // 5 minutes in milliseconds
  isStale: boolean
}

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

// Initial state
const initialState: SupplierState = {
  suppliers: [],
  isLoading: false,
  isRefreshing: false,
  error: null,
  lastFetch: null,
  searchTerm: "",
  currency: "AED",
  selectedSupplierId: null,
  cacheExpiry: CACHE_DURATION,
  isStale: false,
}

// Async thunks
export const fetchSuppliers = createAsyncThunk(
  "supplier/fetchSuppliers",
  async (
    params: {
      userId: number
      searchTerm?: string
      forceRefresh?: boolean
      isBackground?: boolean
    },
    { getState, rejectWithValue },
  ) => {
    try {
      const { getSuppliers } = await import("@/app/actions/supplier-actions")
      const response = await getSuppliers(params.userId, undefined, params.searchTerm)

      if (!response.success) {
        return rejectWithValue(response.message || "Failed to fetch suppliers")
      }

      // Clean and format the data
      const cleanedData = response.data.map((supplier: any) => ({
        id: supplier.id,
        name: supplier.name || "Unknown",
        phone: supplier.phone || "N/A",
        email: supplier.email || "",
        address: supplier.address || "",
        total_purchases: Number(supplier.total_purchases) || 0,
        total_amount: Number(supplier.total_amount) || 0,
        paid_amount: Number(supplier.paid_amount) || 0,
        balance_amount: Number(supplier.balance_amount) || 0,
        outstanding_balance: Number(supplier.outstanding_balance ?? supplier.balance_amount) || 0,
        original_credit: Number(supplier.original_credit) || 0,
        refunded_credit: Number(supplier.refunded_credit) || 0,
        credit_used: Number(supplier.credit_used) || 0,
        available_credit: Number(supplier.available_credit ?? supplier.supplier_credit) || 0,
        supplier_credit: Number(supplier.supplier_credit ?? supplier.available_credit) || 0,
        created_at: supplier.created_at,
        updated_at: supplier.updated_at,
      }))

      return {
        suppliers: cleanedData,
        searchTerm: params.searchTerm || "",
        isBackground: params.isBackground || false,
      }
    } catch (error) {
      console.error("Fetch suppliers error:", error)
      return rejectWithValue("An unexpected error occurred while fetching suppliers")
    }
  },
)

export const fetchDeviceCurrency = createAsyncThunk(
  "supplier/fetchDeviceCurrency",
  async (userId: number, { rejectWithValue }) => {
    try {
      const { getDeviceCurrency } = await import("@/app/actions/dashboard-actions")
      const currency = await getDeviceCurrency(userId)
      return currency || "AED"
    } catch (error) {
      console.error("Fetch currency error:", error)
      return rejectWithValue("Failed to fetch currency")
    }
  },
)

export const createSupplier = createAsyncThunk(
  "supplier/createSupplier",
  async (formData: FormData, { dispatch, getState, rejectWithValue }) => {
    try {
      const { createSupplier } = await import("@/app/actions/supplier-actions")
      const response = await createSupplier(formData)

      if (!response.success) {
        return rejectWithValue(response.message || "Failed to create supplier")
      }

      // Refresh the suppliers list after creation
      const state = getState() as RootState
      const userId = Number.parseInt(formData.get("user_id") as string)

      dispatch(
        fetchSuppliers({
          userId,
          searchTerm: state.supplier.searchTerm,
          forceRefresh: true,
        }),
      )

      return response.data
    } catch (error) {
      console.error("Create supplier error:", error)
      return rejectWithValue("An unexpected error occurred while creating supplier")
    }
  },
)

export const updateSupplier = createAsyncThunk(
  "supplier/updateSupplier",
  async (formData: FormData, { dispatch, getState, rejectWithValue }) => {
    try {
      const { updateSupplier } = await import("@/app/actions/supplier-actions")
      const response = await updateSupplier(formData)

      if (!response.success) {
        return rejectWithValue(response.message || "Failed to update supplier")
      }

      // Refresh the suppliers list after update
      const state = getState() as RootState
      const userId = Number.parseInt(formData.get("user_id") as string)

      dispatch(
        fetchSuppliers({
          userId,
          searchTerm: state.supplier.searchTerm,
          forceRefresh: true,
        }),
      )

      return response.data
    } catch (error) {
      console.error("Update supplier error:", error)
      return rejectWithValue("An unexpected error occurred while updating supplier")
    }
  },
)

export const deleteSupplier = createAsyncThunk(
  "supplier/deleteSupplier",
  async (params: { supplierId: number; userId: number }, { dispatch, getState, rejectWithValue }) => {
    try {
      const { deleteSupplier } = await import("@/app/actions/supplier-actions")
      const response = await deleteSupplier(params.supplierId, params.userId)

      if (!response.success) {
        return rejectWithValue(response.message || "Failed to delete supplier")
      }

      // Refresh the suppliers list after deletion
      const state = getState() as RootState

      dispatch(
        fetchSuppliers({
          userId: params.userId,
          searchTerm: state.supplier.searchTerm,
          forceRefresh: true,
        }),
      )

      return params.supplierId
    } catch (error) {
      console.error("Delete supplier error:", error)
      return rejectWithValue("An unexpected error occurred while deleting supplier")
    }
  },
)

// Slice
const supplierSlice = createSlice({
  name: "supplier",
  initialState,
  reducers: {
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload
    },
    setSelectedSupplierId: (state, action: PayloadAction<number | null>) => {
      state.selectedSupplierId = action.payload
    },
    setCurrency: (state, action: PayloadAction<string>) => {
      state.currency = action.payload
    },
    markAsStale: (state) => {
      state.isStale = true
    },
    clearError: (state) => {
      state.error = null
    },
    clearSuppliers: (state) => {
      state.suppliers = []
      state.lastFetch = null
      state.isStale = false
    },
    // Check if cache is expired
    checkCacheExpiry: (state) => {
      if (state.lastFetch && Date.now() - state.lastFetch > state.cacheExpiry) {
        state.isStale = true
      }
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch suppliers
      .addCase(fetchSuppliers.pending, (state, action) => {
        // Only show loading for initial fetch, not background refresh
        if (!action.meta.arg.isBackground) {
          state.isLoading = true
        } else {
          state.isRefreshing = true
        }
        state.error = null
      })
      .addCase(fetchSuppliers.fulfilled, (state, action) => {
        state.isLoading = false
        state.isRefreshing = false
        state.suppliers = action.payload.suppliers
        state.searchTerm = action.payload.searchTerm
        state.lastFetch = Date.now()
        state.isStale = false
        state.error = null
      })
      .addCase(fetchSuppliers.rejected, (state, action) => {
        state.isLoading = false
        state.isRefreshing = false
        state.error = action.payload as string
      })
      // Fetch currency
      .addCase(fetchDeviceCurrency.fulfilled, (state, action) => {
        state.currency = action.payload
      })
      // Create supplier
      .addCase(createSupplier.pending, (state) => {
        state.error = null
      })
      .addCase(createSupplier.rejected, (state, action) => {
        state.error = action.payload as string
      })
      // Update supplier
      .addCase(updateSupplier.pending, (state) => {
        state.error = null
      })
      .addCase(updateSupplier.rejected, (state, action) => {
        state.error = action.payload as string
      })
      // Delete supplier
      .addCase(deleteSupplier.pending, (state) => {
        state.error = null
      })
      .addCase(deleteSupplier.rejected, (state, action) => {
        state.error = action.payload as string
      })
  },
})

// Actions
export const {
  setSearchTerm,
  setSelectedSupplierId,
  setCurrency,
  markAsStale,
  clearError,
  clearSuppliers,
  checkCacheExpiry,
} = supplierSlice.actions

// Selectors
export const selectSuppliers = (state: RootState) => state.supplier.suppliers
export const selectSuppliersLoading = (state: RootState) => state.supplier.isLoading
export const selectSuppliersRefreshing = (state: RootState) => state.supplier.isRefreshing
export const selectSuppliersError = (state: RootState) => state.supplier.error
export const selectSupplierSearchTerm = (state: RootState) => state.supplier.searchTerm
export const selectSupplierCurrency = (state: RootState) => state.supplier.currency
export const selectSelectedSupplierId = (state: RootState) => state.supplier.selectedSupplierId
export const selectSuppliersLastFetch = (state: RootState) => state.supplier.lastFetch
export const selectSuppliersIsStale = (state: RootState) => state.supplier.isStale

// Computed selectors
export const selectSupplierById = (state: RootState, id: number) =>
  state.supplier.suppliers.find((supplier) => supplier.id === id)

export const selectFilteredSuppliers = (state: RootState) => {
  const { suppliers, searchTerm } = state.supplier
  if (!searchTerm.trim()) return suppliers

  const term = searchTerm.toLowerCase()
  return suppliers.filter(
    (supplier) =>
      supplier.name.toLowerCase().includes(term) ||
      supplier.phone.toLowerCase().includes(term) ||
      supplier.email?.toLowerCase().includes(term) ||
      supplier.address?.toLowerCase().includes(term),
  )
}

export const selectSuppliersStats = (state: RootState) => {
  const suppliers = state.supplier.suppliers
  return {
    total: suppliers.length,
    totalPurchases: suppliers.reduce((sum, s) => sum + (s.total_purchases || 0), 0),
    totalAmount: suppliers.reduce((sum, s) => sum + (s.total_amount || 0), 0),
    totalBalance: suppliers.reduce((sum, s) => sum + (s.balance_amount || 0), 0),
  }
}

export const selectShouldRefresh = (state: RootState) => {
  const { lastFetch, cacheExpiry, isStale } = state.supplier
  return isStale || !lastFetch || Date.now() - lastFetch > cacheExpiry
}

export default supplierSlice.reducer
