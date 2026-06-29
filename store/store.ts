import "@/lib/server-safe-storage" // ⬅ side-effect import; MUST come first

import { configureStore } from "@reduxjs/toolkit"

import deviceReducer from "./slices/deviceSlice"
import accountingReducer from "./slices/accountingSlice"
import productReducer from "./slices/productSlice"
import purchaseReducer from "./slices/purchaseSlice"
import salesReducer from "./slices/salesSlice"
import customerReducer from "./slices/customerSlice"
import supplierReducer from "./slices/supplierSlice"
import staffReducer from "./slices/staffSlice"

export const store = configureStore({
  reducer: {
    device: deviceReducer,
    accounting: accountingReducer,
    product: productReducer,
    purchase: purchaseReducer,
    sales: salesReducer,
    customer: customerReducer,
    supplier: supplierReducer,
    staff: staffReducer,
  },
})

// Inferred types
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
