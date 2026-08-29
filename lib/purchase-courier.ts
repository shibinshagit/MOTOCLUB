export interface CourierAllocatablePurchaseItem {
  quantity: number
  price: number
}

export interface CourierAllocation {
  allocationPercentage: number
  courierCharge: number
}

const toCurrency = (value: number) => Number(value.toFixed(2))

/**
 * Applies the device-configured courier percentage to the pre-tax item subtotal.
 * This module is intentionally shared by the purchase UI and server actions so
 * displayed allocations and persisted allocations use the same rounding rules.
 */
export function calculatePurchaseCourierCharge(subtotal: number, percentage: number): number {
  const validSubtotal = Number(subtotal) || 0
  const validPercentage = Number(percentage) || 0

  return validSubtotal > 0 && validPercentage > 0
    ? toCurrency((validSubtotal * validPercentage) / 100)
    : 0
}

/** Allocates the total courier charge by each item's pre-tax purchase value. */
export function allocatePurchaseCourierCharge<T extends CourierAllocatablePurchaseItem>(
  items: T[],
  courierCharge: number,
): CourierAllocation[] {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.price) || 0),
    0,
  )
  const totalCourier = Math.max(0, Number(courierCharge) || 0)
  let allocated = 0

  return items.map((item, index) => {
    const itemTotal = Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.price) || 0)
    const allocationPercentage = subtotal > 0 ? (itemTotal / subtotal) * 100 : 0
    const isLastItem = index === items.length - 1
    const itemCourier = subtotal <= 0 || totalCourier <= 0
      ? 0
      : isLastItem
        ? toCurrency(totalCourier - allocated)
        : toCurrency((itemTotal / subtotal) * totalCourier)

    allocated += itemCourier
    return { allocationPercentage, courierCharge: itemCourier }
  })
}
