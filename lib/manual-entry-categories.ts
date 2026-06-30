export const MANUAL_ENTRY_MASTER_CATEGORY = "manual_category" as const

export const DEFAULT_MANUAL_ENTRY_CATEGORIES = [
  { name: "Rent", code: "rent", sortOrder: 1 },
  { name: "Bank & Finance", code: "bank_finance", sortOrder: 2 },
  { name: "Courier & Delivery", code: "courier_delivery", sortOrder: 3 },
  { name: "Fuel & Vehicle", code: "fuel_vehicle", sortOrder: 4 },
  { name: "Tea & Refreshments", code: "tea_refreshments", sortOrder: 5 },
  { name: "Office Supplies", code: "office_supplies", sortOrder: 6 },
  { name: "Salary & Wages", code: "salary_wages", sortOrder: 7 },
  { name: "Utilities & Telecom", code: "utilities_telecom", sortOrder: 8 },
  { name: "Water", code: "water", sortOrder: 9 },
  { name: "Food & Meals", code: "food_meals", sortOrder: 10 },
  { name: "Maintenance & Repairs", code: "maintenance_repairs", sortOrder: 11 },
  { name: "Marketing & Advertising", code: "marketing", sortOrder: 12 },
  { name: "Incentives & Bonuses", code: "incentives", sortOrder: 13 },
  { name: "Customer Adjustments", code: "customer_adjustments", sortOrder: 14 },
  { name: "Business Purchases", code: "business_purchases", sortOrder: 15 },
  { name: "Service Charges", code: "service_charges", sortOrder: 16 },
  { name: "Office Expenses", code: "office_expenses", sortOrder: 17 },
  { name: "Other", code: "other", sortOrder: 99 },
] as const

export type ManualEntryCategoryName = (typeof DEFAULT_MANUAL_ENTRY_CATEGORIES)[number]["name"]

const ALIAS_TO_CANONICAL: Record<string, ManualEntryCategoryName> = {
  rent: "Rent",
  bank: "Bank & Finance",
  "ribu bank": "Bank & Finance",
  "bank ribu": "Bank & Finance",
  pos: "Bank & Finance",
  bills: "Bank & Finance",
  "fronex bill": "Bank & Finance",
  "quarier charge": "Courier & Delivery",
  "quarrier charge": "Courier & Delivery",
  "courier charge": "Courier & Delivery",
  courier: "Courier & Delivery",
  "courier advance": "Courier & Delivery",
  "delivery trans": "Courier & Delivery",
  "delivery trans zygo": "Courier & Delivery",
  "auto charge": "Courier & Delivery",
  "transportation charge": "Courier & Delivery",
  "parcel van": "Courier & Delivery",
  "portter charge": "Courier & Delivery",
  "potter charge": "Courier & Delivery",
  bus: "Courier & Delivery",
  "quarier charge paid": "Courier & Delivery",
  fuel: "Fuel & Vehicle",
  "fuel charge": "Fuel & Vehicle",
  petrol: "Fuel & Vehicle",
  "work vehicle fule": "Fuel & Vehicle",
  tea: "Tea & Refreshments",
  tes: "Tea & Refreshments",
  stationery: "Office Supplies",
  stationary: "Office Supplies",
  staionery: "Office Supplies",
  "office supplies": "Office Supplies",
  "petty purchase": "Office Supplies",
  tape: "Office Supplies",
  "tinner paint": "Office Supplies",
  "masking tap": "Office Supplies",
  salary: "Salary & Wages",
  "salary advance": "Salary & Wages",
  "advance salary": "Salary & Wages",
  water: "Water",
  "drinking water": "Water",
  food: "Food & Meals",
  "movie ticket": "Food & Meals",
  kseb: "Utilities & Telecom",
  "electicity bill": "Utilities & Telecom",
  "network recharge": "Utilities & Telecom",
  recharge: "Utilities & Telecom",
  "mobile bill": "Utilities & Telecom",
  "baisic buy": "Utilities & Telecom",
  "recharge sales number": "Utilities & Telecom",
  maintainance: "Maintenance & Repairs",
  repairing: "Maintenance & Repairs",
  painting: "Maintenance & Repairs",
  cooling: "Maintenance & Repairs",
  "habeeb cooling": "Maintenance & Repairs",
  habeeb: "Maintenance & Repairs",
  "full work spair": "Maintenance & Repairs",
  "facebook ads": "Marketing & Advertising",
  "meta ads": "Marketing & Advertising",
  incentive: "Incentives & Bonuses",
  bonus: "Incentives & Bonuses",
  "debit balance": "Customer Adjustments",
  "credit paid": "Customer Adjustments",
  "return payment": "Customer Adjustments",
  "customer return": "Customer Adjustments",
  "credit returns": "Customer Adjustments",
  "credit amount": "Customer Adjustments",
  purchase: "Business Purchases",
  purchasing: "Business Purchases",
  "credit purchase": "Business Purchases",
  "roater cover": "Business Purchases",
  "seat cover": "Business Purchases",
  "acd spoiler": "Business Purchases",
  "creta fog puzzle": "Business Purchases",
  "horn switch": "Business Purchases",
  "auto lock": "Business Purchases",
  electronics: "Business Purchases",
  "super market": "Business Purchases",
  "service charge": "Service Charges",
  "office expence": "Office Expenses",
  expence: "Office Expenses",
  "haritha karma sena": "Office Expenses",
  gokulam: "Office Expenses",
  traveling: "Office Expenses",
  insurence: "Office Expenses",
  test: "Other",
  nothing: "Other",
}

const CANONICAL_NAMES = new Set<string>(DEFAULT_MANUAL_ENTRY_CATEGORIES.map((item) => item.name))

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

export function normalizeManualEntryCategory(raw: string | null | undefined): ManualEntryCategoryName {
  if (!raw?.trim()) return "Other"

  const key = normalizeKey(raw)
  if (ALIAS_TO_CANONICAL[key]) return ALIAS_TO_CANONICAL[key]

  const titled = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())

  if (CANONICAL_NAMES.has(titled)) {
    return titled as ManualEntryCategoryName
  }

  return "Other"
}

export function parseManualEntryCategoryFromDescription(description: string | null | undefined): string | null {
  if (!description?.trim()) return null
  const match = description.match(/^Manual Entry - (.+?) - /)
  return match ? match[1].trim() : null
}

export function parseManualEntryDetailFromDescription(description: string | null | undefined): string {
  if (!description?.trim()) return ""
  const match = description.match(/^Manual Entry - .+? - (.+)$/)
  if (match) return match[1].trim()
  return description.trim()
}

export function buildManualEntryDescription(category: string, detail: string) {
  const cleanCategory = category.trim() || "Other"
  const cleanDetail = detail.trim() || `${cleanCategory} entry`
  return `Manual Entry - ${cleanCategory} - ${cleanDetail}`
}

export function resolveManualEntryCategory(
  categoryName: string | null | undefined,
  description: string | null | undefined,
): ManualEntryCategoryName {
  if (categoryName?.trim()) {
    return normalizeManualEntryCategory(categoryName)
  }
  const parsed = parseManualEntryCategoryFromDescription(description)
  return normalizeManualEntryCategory(parsed)
}
