import { createSlice, type PayloadAction } from "@reduxjs/toolkit"

export interface Product {
  id: string
  name: string
  description: string
  price: number
  wholesale_price: number
  msp: number
  imageUrl: string
  image_url: string
  category: string
  shelf: string
  currency: string
  [key: string]: any // allows for dynamic properties
}

interface ProductState {
  products: Product[]
  filteredProducts: Product[]
  loading: boolean
  silentRefreshing: boolean
  error: string | null
  searchTerm: string
  showingAll: boolean
  currency: string
  lastUpdated: Date | null
  fetchedTime: Date | null
  needsRefresh: boolean
}

const initialState: ProductState = {
  products: [],
  filteredProducts: [],
  loading: false,
  silentRefreshing: false,
  error: null,
  searchTerm: "",
  showingAll: true,
  currency: "USD",
  lastUpdated: null,
  fetchedTime: null,
  needsRefresh: false,
}

const productSlice = createSlice({
  name: "products",
  initialState,
  reducers: {
    setProducts: (state, action: PayloadAction<Product[]>) => {
      state.products = action.payload
      state.filteredProducts = action.payload
      state.lastUpdated = new Date()
      state.fetchedTime = new Date()
      state.needsRefresh = false
    },
    // Add a new product to the top of the list
    addProduct: (state, action: PayloadAction<Product>) => {
      state.products.unshift(action.payload)
      state.filteredProducts = state.products
    },

    // Replace an existing product (matched by id)
    updateProduct: (state, action: PayloadAction<Product>) => {
      const idx = state.products.findIndex((p) => p.id === action.payload.id)
      if (idx !== -1) {
        state.products[idx] = action.payload
        state.filteredProducts = state.products
      }
    },

    // Remove a product by id
    removeProduct: (state, action: PayloadAction<string>) => {
      state.products = state.products.filter((p) => p.id !== action.payload)
      state.filteredProducts = state.filteredProducts.filter((p) => p.id !== action.payload)
    },
    clearProducts: (state) => {
      state.products = []
      state.filteredProducts = []
      state.lastUpdated = null
      state.fetchedTime = null
      state.needsRefresh = false
    },
    updateProductsData: (state, action: PayloadAction<Product[]>) => {
      state.products = action.payload
      state.lastUpdated = new Date()
      state.needsRefresh = false
    },
    setFilteredProducts: (state, action: PayloadAction<Product[]>) => {
      state.filteredProducts = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
    setSilentRefreshing: (state, action: PayloadAction<boolean>) => {
      state.silentRefreshing = action.payload
    },
    setNeedsRefresh: (state, action: PayloadAction<boolean>) => {
      state.needsRefresh = action.payload
    },
    forceClearProducts: (state) => {
      state.products = []
      state.filteredProducts = []
      state.lastUpdated = null
      state.fetchedTime = null
      state.needsRefresh = true
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload
    },
    setShowingAll: (state, action: PayloadAction<boolean>) => {
      state.showingAll = action.payload
    },
    setCurrency: (state, action: PayloadAction<string>) => {
      state.currency = action.payload
    },
    clearFilters: (state) => {
      state.filteredProducts = state.products
      state.searchTerm = ""
      state.showingAll = true
    },
    resetProductsState: (state) => {
      state.products = []
      state.filteredProducts = []
      state.loading = false
      state.silentRefreshing = false
      state.error = null
      state.searchTerm = ""
      state.showingAll = true
      state.currency = "USD"
      state.lastUpdated = null
      state.fetchedTime = null
      state.needsRefresh = false
    },
  },
})

export const {
  setProducts,
  clearProducts,
  updateProductsData,
  setFilteredProducts,
  setLoading,
  setSilentRefreshing,
  setNeedsRefresh,
  forceClearProducts,
  setError,
  setSearchTerm,
  setShowingAll,
  setCurrency,
  clearFilters,
  addProduct,
  updateProduct,
  removeProduct,
  resetProductsState,
} = productSlice.actions

export default productSlice.reducer
