export interface CourierAllocatablePurchaseItem {
  quantity: number
  price: number
  tax_percentage?: number
  tax_amount?: number
}

export interface CourierAllocation {
  allocationPercentage: number
  courierCharge: number
}

export interface PurchaseCostAllocation {
  allocationPercentage: number
  courierCharge: number
  discountAmount: number
  taxAmount: number
  lineSubtotal: number
  lineTotalCost: number
  unitAcquisitionCost: number
}

const toCurrency = (value: number) => Number(value.toFixed(2))

/**
 * Applies the device-configured courier percentage to the pre-tax item subtotal.
 * Shared by UI and server actions so displayed allocations and persisted allocations match.
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

/**
 * Allocates purchase-level courier charge and discount across items,
 * and calculates the exact Unit Acquisition Cost for each line item.
 */
export function allocatePurchaseCosts<T extends CourierAllocatablePurchaseItem>(
  items: T[],
  courierCharge: number,
  discountAmount: number = 0,
): PurchaseCostAllocation[] {
  const subtotal = items.reduce(
    (sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.price) || 0),
    0,
  )
  const totalCourier = Math.max(0, Number(courierCharge) || 0)
  const totalDiscount = Math.max(0, Number(discountAmount) || 0)

  let allocatedCourierSum = 0
  let allocatedDiscountSum = 0

  return items.map((item, index) => {
    const qty = Math.max(0, Number(item.quantity) || 0)
    const price = Math.max(0, Number(item.price) || 0)
    const lineSubtotal = qty * price
    const isLastItem = index === items.length - 1

    const allocationPercentage = subtotal > 0 ? (lineSubtotal / subtotal) * 100 : 0

    // Courier allocation
    const itemCourier = subtotal <= 0 || totalCourier <= 0
      ? 0
      : isLastItem
        ? toCurrency(totalCourier - allocatedCourierSum)
        : toCurrency((lineSubtotal / subtotal) * totalCourier)
    allocatedCourierSum += itemCourier

    // Discount allocation
    const itemDiscount = subtotal <= 0 || totalDiscount <= 0
      ? 0
      : isLastItem
        ? toCurrency(totalDiscount - allocatedDiscountSum)
        : toCurrency((lineSubtotal / subtotal) * totalDiscount)
    allocatedDiscountSum += itemDiscount

    // Tax calculation
    const taxPct = Number(item.tax_percentage) || 0
    const taxAmount = item.tax_amount !== undefined
      ? Number(item.tax_amount) || 0
      : toCurrency(lineSubtotal * (taxPct / 100))

    // Line acquisition cost = subtotal + tax + courier - discount
    const lineTotalCost = toCurrency(lineSubtotal + taxAmount + itemCourier - itemDiscount)

    // Unit acquisition cost
    const unitAcquisitionCost = qty > 0 ? toCurrency(lineTotalCost / qty) : 0

    return {
      allocationPercentage,
      courierCharge: itemCourier,
      discountAmount: itemDiscount,
      taxAmount,
      lineSubtotal,
      lineTotalCost,
      unitAcquisitionCost,
    }
  })
}

