import { sql } from "@/lib/db"
import {
  canStaffAccessPage,
  isStaffValueHidden,
  type StaffPageId,
  type StaffRestrictionSource,
  type StaffValueRestriction,
} from "@/lib/staff-restrictions"
import { getStaffSessionStaffId } from "@/lib/staff-session"

export type StaffSessionContext = StaffRestrictionSource & {
  id: number
  is_active?: boolean
}

export async function resolveStaffSessionContext(deviceId: number): Promise<StaffSessionContext | null> {
  if (!deviceId) return null

  const staffId = await getStaffSessionStaffId(deviceId)
  if (!staffId) return null

  const rows = await sql`
    SELECT id, role, restricted_pages, restricted_values, is_active
    FROM staff
    WHERE id = ${staffId}
      AND device_id = ${deviceId}
      AND is_active = true
    LIMIT 1
  `

  return (rows[0] as StaffSessionContext | undefined) || null
}

export async function assertStaffPageAccess(deviceId: number, page: StaffPageId) {
  const staff = await resolveStaffSessionContext(deviceId)
  if (!staff) {
    return { allowed: false as const, message: "Staff login required" }
  }
  if (!canStaffAccessPage(staff, page)) {
    return { allowed: false as const, message: "This page is not available for your staff role" }
  }
  return { allowed: true as const, staff }
}

export async function assertStaffValueAccess(deviceId: number, value: StaffValueRestriction) {
  const staff = await resolveStaffSessionContext(deviceId)
  if (!staff) {
    return { allowed: false as const, message: "Staff login required" }
  }
  if (isStaffValueHidden(staff, value)) {
    return { allowed: false as const, message: "This action is restricted for your staff role" }
  }
  return { allowed: true as const, staff }
}

export function filterProductForStaff<T extends Record<string, unknown>>(
  product: T,
  staff: StaffSessionContext | null,
): T {
  if (!staff) return product

  const filtered: Record<string, unknown> = { ...product }
  if (isStaffValueHidden(staff, "cogs")) {
    filtered.wholesale_price = null
    if ("cost" in filtered) filtered.cost = null
  }
  if (isStaffValueHidden(staff, "stock_count")) {
    filtered.stock = null
    if ("other_devices_stock" in filtered) filtered.other_devices_stock = null
  }
  return filtered as T
}

export async function filterProductsForStaff<T extends Record<string, unknown>>(
  products: T[],
  deviceId?: number,
): Promise<T[]> {
  if (!deviceId || products.length === 0) return products
  const staff = await resolveStaffSessionContext(deviceId)
  if (!staff) return products
  return products.map((product) => filterProductForStaff(product, staff))
}

export function filterSaleForStaff<T extends Record<string, unknown>>(sale: T, staff: StaffSessionContext | null): T {
  if (!staff || !isStaffValueHidden(staff, "cogs")) return sale
  return {
    ...sale,
    total_cost: null,
  }
}

export async function filterSalesForStaff<T extends Record<string, unknown>>(
  sales: T[],
  deviceId?: number,
): Promise<T[]> {
  if (!deviceId || sales.length === 0) return sales
  const staff = await resolveStaffSessionContext(deviceId)
  if (!staff) return sales
  return sales.map((sale) => filterSaleForStaff(sale, staff))
}

export function filterFinanceResponseForStaff<T extends Record<string, unknown>>(
  payload: T,
  staff: StaffSessionContext | null,
): T {
  if (!staff || !isStaffValueHidden(staff, "cogs")) return payload
  const filtered: Record<string, unknown> = { ...payload, cogs: 0 }
  if (Array.isArray(filtered.data)) {
    filtered.data = (filtered.data as Record<string, unknown>[]).map((row) => ({
      ...row,
      cost: null,
    }))
  }
  return filtered as T
}
