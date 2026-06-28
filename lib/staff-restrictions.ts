export type StaffPageId =
  | "home"
  | "sale"
  | "sales"
  | "purchase"
  | "product"
  | "customer"
  | "supplier"
  | "transfer"
  | "platform"
  | "accounting"

export type StaffValueRestriction = "cogs" | "stock_count"

export const STAFF_PAGE_OPTIONS: { id: StaffPageId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "sale", label: "New Sale" },
  { id: "sales", label: "Sales" },
  { id: "purchase", label: "Purchase" },
  { id: "product", label: "Inventory" },
  { id: "customer", label: "Customers" },
  { id: "supplier", label: "Suppliers" },
  { id: "transfer", label: "Transfers" },
  { id: "platform", label: "Platforms" },
  { id: "accounting", label: "Accounting" },
]

export const STAFF_VALUE_OPTIONS: { id: StaffValueRestriction; label: string }[] = [
  { id: "cogs", label: "COGS / product cost" },
  { id: "stock_count", label: "Stock counts" },
]

export const DEFAULT_STAFF_VALUE_RESTRICTIONS: StaffValueRestriction[] = ["cogs", "stock_count"]

export type StaffRestrictionSource = {
  role?: "admin" | "staff" | string | null
  restricted_pages?: StaffPageId[] | string[] | null
  restricted_values?: StaffValueRestriction[] | string[] | null
}

export function parseStringArray<T extends string>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is T => typeof item === "string")
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed.filter((item): item is T => typeof item === "string") : []
    } catch {
      return []
    }
  }
  return []
}

export function isStaffAdmin(staff: StaffRestrictionSource | null | undefined): boolean {
  return staff?.role === "admin"
}

export function getRestrictedPages(staff: StaffRestrictionSource | null | undefined): StaffPageId[] {
  return parseStringArray<StaffPageId>(staff?.restricted_pages)
}

export function getRestrictedValues(staff: StaffRestrictionSource | null | undefined): StaffValueRestriction[] {
  if (!staff || isStaffAdmin(staff)) return []
  return parseStringArray<StaffValueRestriction>(staff?.restricted_values)
}

export function canStaffAccessPage(
  staff: StaffRestrictionSource | null | undefined,
  page: StaffPageId,
): boolean {
  if (!staff) return false
  if (isStaffAdmin(staff)) return true
  return !getRestrictedPages(staff).includes(page)
}

export function isStaffValueHidden(
  staff: StaffRestrictionSource | null | undefined,
  value: StaffValueRestriction,
): boolean {
  if (!staff) return true
  if (isStaffAdmin(staff)) return false
  return getRestrictedValues(staff).includes(value)
}

export const ADMIN_DIALOG_CONTENT_CLASS =
  "border-gray-200 bg-white text-gray-900 shadow-lg max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto sm:w-full"
export const ADMIN_DIALOG_SCROLL_CLASS =
  "flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden border-gray-200 bg-white p-0 text-gray-900 shadow-lg sm:w-full"
export const ADMIN_DIALOG_INPUT_CLASS =
  "border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus-visible:ring-gray-300"
export const ADMIN_DIALOG_LABEL_CLASS = "text-gray-700"
export const ADMIN_DIALOG_MUTED_CLASS = "text-gray-500"
