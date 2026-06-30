import type { AppDispatch } from "@/store/store"
import { setNeedsRefresh } from "@/store/slices/productSlice"

/** Call after sales, purchases, transfers, etc. so inventory refreshes when opened or already visible. */
export function markInventoryStale(dispatch: AppDispatch) {
  dispatch(setNeedsRefresh(true))
}
