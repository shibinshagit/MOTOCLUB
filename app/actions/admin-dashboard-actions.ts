"use server"

import { sql } from "@/lib/db"
import {
  getAdminActor,
  verifyDashboardPin,
  setDashboardUnlockedSession,
  clearDashboardUnlockedSession,
  isDashboardUnlockedSession,
} from "@/lib/admin-dashboard-security"
import {
  startOfDay,
  endOfDay,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  subYears,
  format,
  parseISO,
  isValid,
  differenceInCalendarDays,
  addDays,
} from "date-fns"

export type DatePreset = "today" | "last_7_days" | "this_month" | "last_month" | "custom"
export type ComparisonType = "previous_period" | "previous_month" | "previous_year"
export type DashboardMetric = "sales" | "profit" | "expenses" | "cogs" | "quantity" | "orders"

export interface AdminDashboardQuery {
  deviceId?: number
  datePreset: DatePreset
  customFrom?: string
  customTo?: string
  comparisonType: ComparisonType
  staffId?: number | "all"
  courierPartnerId?: number | "all"
  courierServiceName?: string | "all"
  paymentMethod?: string | "all"
  status?: string | "all"
}

export interface MetricCardValue {
  current: number
  previous: number
  diffPercent: number
  isIncrease: boolean
  isPositiveDirection: boolean // Whether an increase is good (true for sales/profit, false for expenses)
}

export interface ChartDataPoint {
  label: string
  currentDate: string
  previousDate: string
  currentVal: number
  previousVal: number
}

export interface StaffSummaryData {
  totalStaff: number
  activeStaff: number
  todayLogins: number
  activity: Array<{
    id: number
    name: string
    role: string
    position: string
    lastLogin: string | null
    isActive: boolean
  }>
}

export interface AdminDashboardData {
  currency: string
  periodLabel: string
  comparisonLabel: string
  cards: {
    totalSales: MetricCardValue
    totalProfit: MetricCardValue & {
      currentGross: number
      currentNet: number
      previousGross?: number
      previousNet?: number
      netDiffPercent?: number
      isNetIncrease?: boolean
      isFiltered?: boolean
    }
    totalExpenses: MetricCardValue
    totalCogs: MetricCardValue
    totalProductsSold: MetricCardValue
    totalOrders: MetricCardValue
  }
  chartData: Record<DashboardMetric, ChartDataPoint[]>
  staffSummary: StaffSummaryData
}

// ---------------------------------------------------------------------------
// 1. PIN & Lock Status Server Actions
// ---------------------------------------------------------------------------

export async function getAdminDashboardLockStatus() {
  try {
    const actor = await getAdminActor()
    if (!actor.isAuthorized) {
      return {
        unlocked: false,
        isAdmin: false,
        adminRole: null,
        message: actor.error || "Unauthorized",
      }
    }

    const unlocked = await isDashboardUnlockedSession()
    return {
      unlocked,
      isAdmin: true,
      adminRole: actor.adminRole,
      adminName: actor.name,
      deviceId: actor.deviceId,
    }
  } catch (error) {
    console.error("getAdminDashboardLockStatus error:", error)
    return {
      unlocked: false,
      isAdmin: false,
      adminRole: null,
      message: "Failed to determine lock state",
    }
  }
}

export async function unlockAdminDashboard(pin: string) {
  try {
    const actor = await getAdminActor()
    if (!actor.isAuthorized) {
      return {
        success: false,
        message: actor.error || "Only administrators can unlock the dashboard.",
      }
    }

    const isValidPin = await verifyDashboardPin(pin)
    if (!isValidPin) {
      return {
        success: false,
        message: "Incorrect Admin PIN. Please try again.",
      }
    }

    await setDashboardUnlockedSession({
      adminRole: actor.adminRole!,
      actorId: actor.actorId,
      deviceId: actor.deviceId,
    })

    return {
      success: true,
      message: "Dashboard unlocked successfully.",
    }
  } catch (error) {
    console.error("unlockAdminDashboard error:", error)
    return {
      success: false,
      message: "An error occurred while verifying the PIN.",
    }
  }
}

export async function lockAdminDashboard() {
  try {
    await clearDashboardUnlockedSession()
    return { success: true, message: "Dashboard locked." }
  } catch (error) {
    console.error("lockAdminDashboard error:", error)
    return { success: true }
  }
}

// ---------------------------------------------------------------------------
// 2. Filter Options Server Action
// ---------------------------------------------------------------------------

export async function getAdminDashboardFilterOptions(deviceId?: number) {
  try {
    const actor = await getAdminActor()
    if (!actor.isAuthorized) {
      return {
        success: false,
        message: "Unauthorized",
        data: null,
      }
    }

    const effectiveDeviceId = deviceId || actor.deviceId || 0

    // Run parallel option queries
    const [staffRows, courierRows, paymentRows, statusRows] = await Promise.all([
      effectiveDeviceId > 0
        ? sql`SELECT id, name, role FROM staff WHERE device_id = ${effectiveDeviceId} ORDER BY name ASC`
        : sql`SELECT id, name, role FROM staff ORDER BY name ASC`,

      effectiveDeviceId > 0
        ? sql`
            SELECT DISTINCT courier_service_name as name
            FROM sales
            WHERE courier_service_name IS NOT NULL AND courier_service_name != '' AND device_id = ${effectiveDeviceId}
            UNION
            SELECT name FROM master_data WHERE category = 'courier' AND (device_id = ${effectiveDeviceId} OR device_id = 0)
            ORDER BY name ASC
          `
        : sql`
            SELECT DISTINCT courier_service_name as name
            FROM sales
            WHERE courier_service_name IS NOT NULL AND courier_service_name != ''
            UNION
            SELECT name FROM master_data WHERE category = 'courier'
            ORDER BY name ASC
          `,

      effectiveDeviceId > 0
        ? sql`
            SELECT DISTINCT payment_method as name
            FROM sales
            WHERE payment_method IS NOT NULL AND payment_method != '' AND device_id = ${effectiveDeviceId}
            ORDER BY name ASC
          `
        : sql`
            SELECT DISTINCT payment_method as name
            FROM sales
            WHERE payment_method IS NOT NULL AND payment_method != ''
            ORDER BY name ASC
          `,

      effectiveDeviceId > 0
        ? sql`
            SELECT DISTINCT status as name
            FROM sales
            WHERE status IS NOT NULL AND status != '' AND device_id = ${effectiveDeviceId}
            ORDER BY name ASC
          `
        : sql`
            SELECT DISTINCT status as name
            FROM sales
            WHERE status IS NOT NULL AND status != ''
            ORDER BY name ASC
          `,
    ])

    // Courier partners from staff/master_data
    const partnerRows = effectiveDeviceId > 0
      ? await sql`
          SELECT id, name FROM staff WHERE role = 'partner' AND device_id = ${effectiveDeviceId}
          UNION
          SELECT id, name FROM master_data WHERE category = 'courier' AND (device_id = ${effectiveDeviceId} OR device_id = 0)
          ORDER BY name ASC
        `
      : await sql`
          SELECT id, name FROM staff WHERE role = 'partner'
          UNION
          SELECT id, name FROM master_data WHERE category = 'courier'
          ORDER BY name ASC
        `

    return {
      success: true,
      data: {
        staff: staffRows.map((s: any) => ({ id: s.id, name: s.name, role: s.role })),
        courierServices: courierRows.map((c: any) => c.name).filter(Boolean),
        courierPartners: partnerRows.map((p: any) => ({ id: p.id, name: p.name })),
        paymentMethods: paymentRows.map((p: any) => p.name).filter(Boolean),
        statuses: statusRows.map((s: any) => s.name).filter(Boolean),
      },
    }
  } catch (error) {
    console.error("getAdminDashboardFilterOptions error:", error)
    return {
      success: false,
      message: "Failed to load dashboard filter options.",
      data: null,
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Main Dashboard Data Aggregation Action
// ---------------------------------------------------------------------------

function calculatePercentageDiff(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    return { diff: 0, isIncrease: false }
  }
  if (previous === 0) {
    if (current > 0) return { diff: 100, isIncrease: true }
    if (current < 0) return { diff: -100, isIncrease: false }
    return { diff: 0, isIncrease: false }
  }
  const rawDiff = ((current - previous) / Math.abs(previous)) * 100
  return {
    diff: Number.isFinite(rawDiff) ? Math.round(Math.abs(rawDiff) * 10) / 10 : 0,
    isIncrease: rawDiff >= 0,
  }
}

function resolveDateRanges(query: AdminDashboardQuery) {
  const now = new Date()
  let currentStart: Date
  let currentEnd: Date

  switch (query.datePreset) {
    case "today":
      currentStart = startOfDay(now)
      currentEnd = endOfDay(now)
      break
    case "last_7_days":
      currentStart = startOfDay(subDays(now, 6))
      currentEnd = endOfDay(now)
      break
    case "last_month":
      const lastMonthDate = subMonths(now, 1)
      currentStart = startOfMonth(lastMonthDate)
      currentEnd = endOfMonth(lastMonthDate)
      break
    case "custom":
      const parsedFrom = query.customFrom ? parseISO(query.customFrom) : null
      const parsedTo = query.customTo ? parseISO(query.customTo) : null
      currentStart = parsedFrom && isValid(parsedFrom) ? startOfDay(parsedFrom) : startOfMonth(now)
      currentEnd = parsedTo && isValid(parsedTo) ? endOfDay(parsedTo) : endOfDay(now)
      break
    case "this_month":
    default:
      currentStart = startOfMonth(now)
      currentEnd = endOfDay(now)
      break
  }

  const durationDays = differenceInCalendarDays(currentEnd, currentStart) + 1

  let prevStart: Date
  let prevEnd: Date

  switch (query.comparisonType) {
    case "previous_month":
      prevStart = subMonths(currentStart, 1)
      prevEnd = subMonths(currentEnd, 1)
      break
    case "previous_year":
      prevStart = subYears(currentStart, 1)
      prevEnd = subYears(currentEnd, 1)
      break
    case "previous_period":
    default:
      prevStart = subDays(currentStart, durationDays)
      prevEnd = subDays(currentEnd, durationDays)
      break
  }

  return {
    currentStart,
    currentEnd,
    prevStart,
    prevEnd,
    durationDays,
  }
}

export async function getAdminDashboardData(query: AdminDashboardQuery) {
  try {
    // Security check 1: Admin authorization
    const actor = await getAdminActor()
    if (!actor.isAuthorized) {
      return {
        success: false,
        unauthorized: true,
        message: actor.error || "Unauthorized. Admin privileges required.",
        data: null,
      }
    }

    // Security check 2: Dashboard unlock state
    const isUnlocked = await isDashboardUnlockedSession()
    if (!isUnlocked) {
      return {
        success: false,
        locked: true,
        message: "Dashboard is locked. Please enter your Admin PIN to view financial metrics.",
        data: null,
      }
    }

    const effectiveDeviceId = query.deviceId || actor.deviceId || 0
    const { currentStart, currentEnd, prevStart, prevEnd, durationDays } = resolveDateRanges(query)

    const currStartStr = format(currentStart, "yyyy-MM-dd HH:mm:ss")
    const currEndStr = format(currentEnd, "yyyy-MM-dd HH:mm:ss")
    const prevStartStr = format(prevStart, "yyyy-MM-dd HH:mm:ss")
    const prevEndStr = format(prevEnd, "yyyy-MM-dd HH:mm:ss")

    // Device currency
    let currency = "INR"
    if (effectiveDeviceId > 0) {
      try {
        const deviceRes = await sql`SELECT currency FROM devices WHERE id = ${effectiveDeviceId} LIMIT 1`
        if (deviceRes[0]?.currency) currency = deviceRes[0].currency
      } catch {}
    }

    // Dynamic Filter Clauses
    const staffFilter = query.staffId && query.staffId !== "all" ? Number(query.staffId) : null
    const courierPartnerFilter =
      query.courierPartnerId && query.courierPartnerId !== "all" ? Number(query.courierPartnerId) : null
    const courierServiceFilter =
      query.courierServiceName && query.courierServiceName !== "all" ? query.courierServiceName.trim() : null
    const paymentMethodFilter =
      query.paymentMethod && query.paymentMethod !== "all" ? query.paymentMethod.trim() : null
    const statusFilter = query.status && query.status !== "all" ? query.status.trim() : null

    // -------------------------------------------------------------------------
    // Query 1: Sales, Orders, Quantity, COGS for Current Period
    // -------------------------------------------------------------------------
    const currentSalesAgg = await sql`
      WITH filtered_sales AS (
        SELECT s.id, s.total_amount, s.sale_date
        FROM sales s
        WHERE s.total_amount != 'NaN'::numeric
          AND s.sale_date >= ${currStartStr}::timestamp
          AND s.sale_date <= ${currEndStr}::timestamp
          AND (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
          AND (
            (${statusFilter === null} AND LOWER(TRIM(s.status)) != 'cancelled')
            OR (${statusFilter !== null} AND LOWER(TRIM(s.status)) = LOWER(${statusFilter}))
          )
          AND (${staffFilter === null} OR s.staff_id = ${staffFilter})
          AND (${courierPartnerFilter === null} OR s.courier_partner_id = ${courierPartnerFilter})
          AND (${courierServiceFilter === null} OR LOWER(TRIM(COALESCE(s.courier_service_name, ''))) = LOWER(${courierServiceFilter}))
          AND (${paymentMethodFilter === null} OR LOWER(TRIM(COALESCE(s.payment_method, ''))) = LOWER(${paymentMethodFilter}))
      ),
      items_agg AS (
        SELECT 
          COALESCE(SUM(si.quantity), 0) AS total_quantity,
          COALESCE(SUM(
            COALESCE(
              (SELECT SUM(sba.quantity * sba.cost_price) FROM sale_batch_allocations sba WHERE sba.sale_item_id = si.id),
              si.quantity * COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0)
            )
          ), 0) AS total_cogs
        FROM sale_items si
        JOIN filtered_sales fs ON si.sale_id = fs.id
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
      )
      SELECT 
        COALESCE(COUNT(fs.id), 0)::int AS order_count,
        COALESCE(SUM(fs.total_amount), 0)::numeric AS total_sales,
        (SELECT total_quantity FROM items_agg)::int AS total_quantity,
        (SELECT total_cogs FROM items_agg)::numeric AS total_cogs
      FROM filtered_sales fs
    `

    // -------------------------------------------------------------------------
    // Query 2: Sales, Orders, Quantity, COGS for Previous Period
    // -------------------------------------------------------------------------
    const previousSalesAgg = await sql`
      WITH filtered_sales AS (
        SELECT s.id, s.total_amount, s.sale_date
        FROM sales s
        WHERE s.total_amount != 'NaN'::numeric
          AND s.sale_date >= ${prevStartStr}::timestamp
          AND s.sale_date <= ${prevEndStr}::timestamp
          AND (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
          AND (
            (${statusFilter === null} AND LOWER(TRIM(s.status)) != 'cancelled')
            OR (${statusFilter !== null} AND LOWER(TRIM(s.status)) = LOWER(${statusFilter}))
          )
          AND (${staffFilter === null} OR s.staff_id = ${staffFilter})
          AND (${courierPartnerFilter === null} OR s.courier_partner_id = ${courierPartnerFilter})
          AND (${courierServiceFilter === null} OR LOWER(TRIM(COALESCE(s.courier_service_name, ''))) = LOWER(${courierServiceFilter}))
          AND (${paymentMethodFilter === null} OR LOWER(TRIM(COALESCE(s.payment_method, ''))) = LOWER(${paymentMethodFilter}))
      ),
      items_agg AS (
        SELECT 
          COALESCE(SUM(si.quantity), 0) AS total_quantity,
          COALESCE(SUM(
            COALESCE(
              (SELECT SUM(sba.quantity * sba.cost_price) FROM sale_batch_allocations sba WHERE sba.sale_item_id = si.id),
              si.quantity * COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0)
            )
          ), 0) AS total_cogs
        FROM sale_items si
        JOIN filtered_sales fs ON si.sale_id = fs.id
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
      )
      SELECT 
        COALESCE(COUNT(fs.id), 0)::int AS order_count,
        COALESCE(SUM(fs.total_amount), 0)::numeric AS total_sales,
        (SELECT total_quantity FROM items_agg)::int AS total_quantity,
        (SELECT total_cogs FROM items_agg)::numeric AS total_cogs
      FROM filtered_sales fs
    `

    // -------------------------------------------------------------------------
    // Query 3: Operating Expenses for Current and Previous Period
    // -------------------------------------------------------------------------
    const [currentExpensesAgg, previousExpensesAgg] = await Promise.all([
      sql`
        SELECT COALESCE(SUM(debit_amount), 0)::numeric AS total_expenses
        FROM financial_transactions
        WHERE transaction_date >= ${currStartStr}::timestamp
          AND transaction_date <= ${currEndStr}::timestamp
          AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
          AND (
            transaction_type IN ('expense', 'sale_shipping', 'salary')
            OR (transaction_type = 'manual' AND debit_amount > 0)
          )
      `,
      sql`
        SELECT COALESCE(SUM(debit_amount), 0)::numeric AS total_expenses
        FROM financial_transactions
        WHERE transaction_date >= ${prevStartStr}::timestamp
          AND transaction_date <= ${prevEndStr}::timestamp
          AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
          AND (
            transaction_type IN ('expense', 'sale_shipping', 'salary')
            OR (transaction_type = 'manual' AND debit_amount > 0)
          )
      `,
    ])

    // Safe Numeric Parser
    const toNum = (val: any) => {
      const n = Number(val)
      return Number.isFinite(n) ? n : 0
    }

    // Current Values
    const currSales = toNum(currentSalesAgg[0]?.total_sales)
    const currOrders = toNum(currentSalesAgg[0]?.order_count)
    const currQuantity = toNum(currentSalesAgg[0]?.total_quantity)
    const currCogs = toNum(currentSalesAgg[0]?.total_cogs)
    const currExpenses = toNum(currentExpensesAgg[0]?.total_expenses)
    const currGrossProfit = currSales - currCogs
    const currNetProfit = currGrossProfit - currExpenses

    // Previous Values
    const prevSales = toNum(previousSalesAgg[0]?.total_sales)
    const prevOrders = toNum(previousSalesAgg[0]?.order_count)
    const prevQuantity = toNum(previousSalesAgg[0]?.total_quantity)
    const prevCogs = toNum(previousSalesAgg[0]?.total_cogs)
    const prevExpenses = toNum(previousExpensesAgg[0]?.total_expenses)
    const prevGrossProfit = prevSales - prevCogs
    const prevNetProfit = prevGrossProfit - prevExpenses

    const hasSalesFilter = Boolean(
      staffFilter !== null ||
      courierPartnerFilter !== null ||
      courierServiceFilter !== null ||
      paymentMethodFilter !== null ||
      statusFilter !== null
    )

    // Differences
    const salesDiff = calculatePercentageDiff(currSales, prevSales)
    const profitDiff = calculatePercentageDiff(currGrossProfit, prevGrossProfit)
    const netProfitDiff = calculatePercentageDiff(currNetProfit, prevNetProfit)
    const expensesDiff = calculatePercentageDiff(currExpenses, prevExpenses)
    const cogsDiff = calculatePercentageDiff(currCogs, prevCogs)
    const quantityDiff = calculatePercentageDiff(currQuantity, prevQuantity)
    const ordersDiff = calculatePercentageDiff(currOrders, prevOrders)

    // -------------------------------------------------------------------------
    // Query 4: Breakdown for Current and Previous Period (Chart Data)
    // -------------------------------------------------------------------------
    const isHourly = durationDays <= 1

    const [currentDailyRows, previousDailyRows, currentDailyExpenses, previousDailyExpenses] =
      await Promise.all([
        isHourly
          ? sql`
              WITH filtered_sales AS (
                SELECT s.id, s.total_amount, s.sale_date, EXTRACT(HOUR FROM s.sale_date)::int as hour_val
                FROM sales s
                WHERE s.total_amount != 'NaN'::numeric
                  AND s.sale_date >= ${currStartStr}::timestamp
                  AND s.sale_date <= ${currEndStr}::timestamp
                  AND (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
                  AND (
                    (${statusFilter === null} AND LOWER(TRIM(s.status)) != 'cancelled')
                    OR (${statusFilter !== null} AND LOWER(TRIM(s.status)) = LOWER(${statusFilter}))
                  )
                  AND (${staffFilter === null} OR s.staff_id = ${staffFilter})
                  AND (${courierPartnerFilter === null} OR s.courier_partner_id = ${courierPartnerFilter})
                  AND (${courierServiceFilter === null} OR LOWER(TRIM(COALESCE(s.courier_service_name, ''))) = LOWER(${courierServiceFilter}))
                  AND (${paymentMethodFilter === null} OR LOWER(TRIM(COALESCE(s.payment_method, ''))) = LOWER(${paymentMethodFilter}))
              ),
              sales_agg AS (
                SELECT 
                  hour_val,
                  COUNT(id)::int as order_count,
                  COALESCE(SUM(total_amount), 0)::numeric as total_sales
                FROM filtered_sales
                GROUP BY hour_val
              ),
              items_agg AS (
                SELECT 
                  fs.hour_val,
                  COALESCE(SUM(si.quantity), 0)::int as total_quantity,
                  COALESCE(SUM(
                    COALESCE(
                      (SELECT SUM(sba.quantity * sba.cost_price) FROM sale_batch_allocations sba WHERE sba.sale_item_id = si.id),
                      si.quantity * COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0)
                    )
                  ), 0)::numeric as total_cogs
                FROM sale_items si
                JOIN filtered_sales fs ON si.sale_id = fs.id
                LEFT JOIN products p ON si.product_id = p.id
                LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
                GROUP BY fs.hour_val
              )
              SELECT 
                sa.hour_val,
                sa.order_count,
                sa.total_sales,
                COALESCE(ia.total_quantity, 0)::int as total_quantity,
                COALESCE(ia.total_cogs, 0)::numeric as total_cogs
              FROM sales_agg sa
              LEFT JOIN items_agg ia ON sa.hour_val = ia.hour_val
              ORDER BY sa.hour_val ASC
            `
          : sql`
              WITH filtered_sales AS (
                SELECT s.id, s.total_amount, s.sale_date, DATE(s.sale_date) as day_date
                FROM sales s
                WHERE s.total_amount != 'NaN'::numeric
                  AND s.sale_date >= ${currStartStr}::timestamp
                  AND s.sale_date <= ${currEndStr}::timestamp
                  AND (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
                  AND (
                    (${statusFilter === null} AND LOWER(TRIM(s.status)) != 'cancelled')
                    OR (${statusFilter !== null} AND LOWER(TRIM(s.status)) = LOWER(${statusFilter}))
                  )
                  AND (${staffFilter === null} OR s.staff_id = ${staffFilter})
                  AND (${courierPartnerFilter === null} OR s.courier_partner_id = ${courierPartnerFilter})
                  AND (${courierServiceFilter === null} OR LOWER(TRIM(COALESCE(s.courier_service_name, ''))) = LOWER(${courierServiceFilter}))
                  AND (${paymentMethodFilter === null} OR LOWER(TRIM(COALESCE(s.payment_method, ''))) = LOWER(${paymentMethodFilter}))
              ),
              sales_agg AS (
                SELECT 
                  day_date,
                  COUNT(id)::int as order_count,
                  COALESCE(SUM(total_amount), 0)::numeric as total_sales
                FROM filtered_sales
                GROUP BY day_date
              ),
              items_agg AS (
                SELECT 
                  fs.day_date,
                  COALESCE(SUM(si.quantity), 0)::int as total_quantity,
                  COALESCE(SUM(
                    COALESCE(
                      (SELECT SUM(sba.quantity * sba.cost_price) FROM sale_batch_allocations sba WHERE sba.sale_item_id = si.id),
                      si.quantity * COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0)
                    )
                  ), 0)::numeric as total_cogs
                FROM sale_items si
                JOIN filtered_sales fs ON si.sale_id = fs.id
                LEFT JOIN products p ON si.product_id = p.id
                LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
                GROUP BY fs.day_date
              )
              SELECT 
                sa.day_date,
                sa.order_count,
                sa.total_sales,
                COALESCE(ia.total_quantity, 0)::int as total_quantity,
                COALESCE(ia.total_cogs, 0)::numeric as total_cogs
              FROM sales_agg sa
              LEFT JOIN items_agg ia ON sa.day_date = ia.day_date
              ORDER BY sa.day_date ASC
            `,
        isHourly
          ? sql`
              WITH filtered_sales AS (
                SELECT s.id, s.total_amount, s.sale_date, EXTRACT(HOUR FROM s.sale_date)::int as hour_val
                FROM sales s
                WHERE s.total_amount != 'NaN'::numeric
                  AND s.sale_date >= ${prevStartStr}::timestamp
                  AND s.sale_date <= ${prevEndStr}::timestamp
                  AND (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
                  AND (
                    (${statusFilter === null} AND LOWER(TRIM(s.status)) != 'cancelled')
                    OR (${statusFilter !== null} AND LOWER(TRIM(s.status)) = LOWER(${statusFilter}))
                  )
                  AND (${staffFilter === null} OR s.staff_id = ${staffFilter})
                  AND (${courierPartnerFilter === null} OR s.courier_partner_id = ${courierPartnerFilter})
                  AND (${courierServiceFilter === null} OR LOWER(TRIM(COALESCE(s.courier_service_name, ''))) = LOWER(${courierServiceFilter}))
                  AND (${paymentMethodFilter === null} OR LOWER(TRIM(COALESCE(s.payment_method, ''))) = LOWER(${paymentMethodFilter}))
              ),
              sales_agg AS (
                SELECT 
                  hour_val,
                  COUNT(id)::int as order_count,
                  COALESCE(SUM(total_amount), 0)::numeric as total_sales
                FROM filtered_sales
                GROUP BY hour_val
              ),
              items_agg AS (
                SELECT 
                  fs.hour_val,
                  COALESCE(SUM(si.quantity), 0)::int as total_quantity,
                  COALESCE(SUM(
                    COALESCE(
                      (SELECT SUM(sba.quantity * sba.cost_price) FROM sale_batch_allocations sba WHERE sba.sale_item_id = si.id),
                      si.quantity * COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0)
                    )
                  ), 0)::numeric as total_cogs
                FROM sale_items si
                JOIN filtered_sales fs ON si.sale_id = fs.id
                LEFT JOIN products p ON si.product_id = p.id
                LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
                GROUP BY fs.hour_val
              )
              SELECT 
                sa.hour_val,
                sa.order_count,
                sa.total_sales,
                COALESCE(ia.total_quantity, 0)::int as total_quantity,
                COALESCE(ia.total_cogs, 0)::numeric as total_cogs
              FROM sales_agg sa
              LEFT JOIN items_agg ia ON sa.hour_val = ia.hour_val
              ORDER BY sa.hour_val ASC
            `
          : sql`
              WITH filtered_sales AS (
                SELECT s.id, s.total_amount, s.sale_date, DATE(s.sale_date) as day_date
                FROM sales s
                WHERE s.total_amount != 'NaN'::numeric
                  AND s.sale_date >= ${prevStartStr}::timestamp
                  AND s.sale_date <= ${prevEndStr}::timestamp
                  AND (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
                  AND (
                    (${statusFilter === null} AND LOWER(TRIM(s.status)) != 'cancelled')
                    OR (${statusFilter !== null} AND LOWER(TRIM(s.status)) = LOWER(${statusFilter}))
                  )
                  AND (${staffFilter === null} OR s.staff_id = ${staffFilter})
                  AND (${courierPartnerFilter === null} OR s.courier_partner_id = ${courierPartnerFilter})
                  AND (${courierServiceFilter === null} OR LOWER(TRIM(COALESCE(s.courier_service_name, ''))) = LOWER(${courierServiceFilter}))
                  AND (${paymentMethodFilter === null} OR LOWER(TRIM(COALESCE(s.payment_method, ''))) = LOWER(${paymentMethodFilter}))
              ),
              sales_agg AS (
                SELECT 
                  day_date,
                  COUNT(id)::int as order_count,
                  COALESCE(SUM(total_amount), 0)::numeric as total_sales
                FROM filtered_sales
                GROUP BY day_date
              ),
              items_agg AS (
                SELECT 
                  fs.day_date,
                  COALESCE(SUM(si.quantity), 0)::int as total_quantity,
                  COALESCE(SUM(
                    COALESCE(
                      (SELECT SUM(sba.quantity * sba.cost_price) FROM sale_batch_allocations sba WHERE sba.sale_item_id = si.id),
                      si.quantity * COALESCE(si.cost, pv.wholesale_price, p.wholesale_price, 0)
                    )
                  ), 0)::numeric as total_cogs
                FROM sale_items si
                JOIN filtered_sales fs ON si.sale_id = fs.id
                LEFT JOIN products p ON si.product_id = p.id
                LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
                GROUP BY fs.day_date
              )
              SELECT 
                sa.day_date,
                sa.order_count,
                sa.total_sales,
                COALESCE(ia.total_quantity, 0)::int as total_quantity,
                COALESCE(ia.total_cogs, 0)::numeric as total_cogs
              FROM sales_agg sa
              LEFT JOIN items_agg ia ON sa.day_date = ia.day_date
              ORDER BY sa.day_date ASC
            `,
        isHourly
          ? sql`
              SELECT 
                EXTRACT(HOUR FROM transaction_date)::int as hour_val,
                COALESCE(SUM(debit_amount), 0)::numeric as total_expenses
              FROM financial_transactions
              WHERE transaction_date >= ${currStartStr}::timestamp
                AND transaction_date <= ${currEndStr}::timestamp
                AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
                AND (
                  transaction_type IN ('expense', 'sale_shipping', 'salary')
                  OR (transaction_type = 'manual' AND debit_amount > 0)
                )
              GROUP BY EXTRACT(HOUR FROM transaction_date)::int
              ORDER BY hour_val ASC
            `
          : sql`
              SELECT 
                DATE(transaction_date) as day_date,
                COALESCE(SUM(debit_amount), 0)::numeric as total_expenses
              FROM financial_transactions
              WHERE transaction_date >= ${currStartStr}::timestamp
                AND transaction_date <= ${currEndStr}::timestamp
                AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
                AND (
                  transaction_type IN ('expense', 'sale_shipping', 'salary')
                  OR (transaction_type = 'manual' AND debit_amount > 0)
                )
              GROUP BY DATE(transaction_date)
              ORDER BY day_date ASC
            `,
        isHourly
          ? sql`
              SELECT 
                EXTRACT(HOUR FROM transaction_date)::int as hour_val,
                COALESCE(SUM(debit_amount), 0)::numeric as total_expenses
              FROM financial_transactions
              WHERE transaction_date >= ${prevStartStr}::timestamp
                AND transaction_date <= ${prevEndStr}::timestamp
                AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
                AND (
                  transaction_type IN ('expense', 'sale_shipping', 'salary')
                  OR (transaction_type = 'manual' AND debit_amount > 0)
                )
              GROUP BY EXTRACT(HOUR FROM transaction_date)::int
              ORDER BY hour_val ASC
            `
          : sql`
              SELECT 
                DATE(transaction_date) as day_date,
                COALESCE(SUM(debit_amount), 0)::numeric as total_expenses
              FROM financial_transactions
              WHERE transaction_date >= ${prevStartStr}::timestamp
                AND transaction_date <= ${prevEndStr}::timestamp
                AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
                AND (
                  transaction_type IN ('expense', 'sale_shipping', 'salary')
                  OR (transaction_type = 'manual' AND debit_amount > 0)
                )
              GROUP BY DATE(transaction_date)
              ORDER BY day_date ASC
            `,
      ])

    // Map data by key (hour number or date string YYYY-MM-DD)
    const currSalesMap = new Map<number | string, any>()
    currentDailyRows.forEach((r: any) => {
      const key = isHourly ? Number(r.hour_val) : format(new Date(r.day_date), "yyyy-MM-dd")
      currSalesMap.set(key, r)
    })

    const prevSalesMap = new Map<number | string, any>()
    previousDailyRows.forEach((r: any) => {
      const key = isHourly ? Number(r.hour_val) : format(new Date(r.day_date), "yyyy-MM-dd")
      prevSalesMap.set(key, r)
    })

    const currExpenseMap = new Map<number | string, number>()
    currentDailyExpenses.forEach((r: any) => {
      const key = isHourly ? Number(r.hour_val) : format(new Date(r.day_date), "yyyy-MM-dd")
      currExpenseMap.set(key, Number(r.total_expenses || 0))
    })

    const prevExpenseMap = new Map<number | string, number>()
    previousDailyExpenses.forEach((r: any) => {
      const key = isHourly ? Number(r.hour_val) : format(new Date(r.day_date), "yyyy-MM-dd")
      prevExpenseMap.set(key, Number(r.total_expenses || 0))
    })

    // Build timeline points
    const salesChart: ChartDataPoint[] = []
    const profitChart: ChartDataPoint[] = []
    const expensesChart: ChartDataPoint[] = []
    const cogsChart: ChartDataPoint[] = []
    const quantityChart: ChartDataPoint[] = []
    const ordersChart: ChartDataPoint[] = []

    if (isHourly) {
      for (let h = 0; h < 24; h++) {
        const hourLabel = `${String(h).padStart(2, "0")}:00`
        const currKey = `${format(currentStart, "yyyy-MM-dd")} ${hourLabel}`
        const prevKey = `${format(prevStart, "yyyy-MM-dd")} ${hourLabel}`

        const currData = currSalesMap.get(h) || { total_sales: 0, order_count: 0, total_quantity: 0, total_cogs: 0 }
        const prevData = prevSalesMap.get(h) || { total_sales: 0, order_count: 0, total_quantity: 0, total_cogs: 0 }

        const currDaySales = Number(currData.total_sales || 0)
        const prevDaySales = Number(prevData.total_sales || 0)

        const currDayOrders = Number(currData.order_count || 0)
        const prevDayOrders = Number(prevData.order_count || 0)

        const currDayQty = Number(currData.total_quantity || 0)
        const prevDayQty = Number(prevData.total_quantity || 0)

        const currDayCogs = Number(currData.total_cogs || 0)
        const prevDayCogs = Number(prevData.total_cogs || 0)

        const currDayExp = currExpenseMap.get(h) || 0
        const prevDayExp = prevExpenseMap.get(h) || 0

        const currDayProfit = currDaySales - currDayCogs
        const prevDayProfit = prevDaySales - prevDayCogs

        salesChart.push({
          label: hourLabel,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDaySales,
          previousVal: prevDaySales,
        })

        profitChart.push({
          label: hourLabel,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayProfit,
          previousVal: prevDayProfit,
        })

        expensesChart.push({
          label: hourLabel,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayExp,
          previousVal: prevDayExp,
        })

        cogsChart.push({
          label: hourLabel,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayCogs,
          previousVal: prevDayCogs,
        })

        quantityChart.push({
          label: hourLabel,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayQty,
          previousVal: prevDayQty,
        })

        ordersChart.push({
          label: hourLabel,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayOrders,
          previousVal: prevDayOrders,
        })
      }
    } else {
      for (let i = 0; i < Math.min(durationDays, 366); i++) {
        const currDay = addDays(currentStart, i)
        const prevDay = addDays(prevStart, i)

        const currKey = format(currDay, "yyyy-MM-dd")
        const prevKey = format(prevDay, "yyyy-MM-dd")

        const currData = currSalesMap.get(currKey) || { total_sales: 0, order_count: 0, total_quantity: 0, total_cogs: 0 }
        const prevData = prevSalesMap.get(prevKey) || { total_sales: 0, order_count: 0, total_quantity: 0, total_cogs: 0 }

        const currDaySales = Number(currData.total_sales || 0)
        const prevDaySales = Number(prevData.total_sales || 0)

        const currDayOrders = Number(currData.order_count || 0)
        const prevDayOrders = Number(prevData.order_count || 0)

        const currDayQty = Number(currData.total_quantity || 0)
        const prevDayQty = Number(prevData.total_quantity || 0)

        const currDayCogs = Number(currData.total_cogs || 0)
        const prevDayCogs = Number(prevData.total_cogs || 0)

        const currDayExp = currExpenseMap.get(currKey) || 0
        const prevDayExp = prevExpenseMap.get(currKey) || 0

        const currDayProfit = currDaySales - currDayCogs
        const prevDayProfit = prevDaySales - prevDayCogs

        const label = format(currDay, "dd MMM")

        salesChart.push({
          label,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDaySales,
          previousVal: prevDaySales,
        })

        profitChart.push({
          label,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayProfit,
          previousVal: prevDayProfit,
        })

        expensesChart.push({
          label,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayExp,
          previousVal: prevDayExp,
        })

        cogsChart.push({
          label,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayCogs,
          previousVal: prevDayCogs,
        })

        quantityChart.push({
          label,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayQty,
          previousVal: prevDayQty,
        })

        ordersChart.push({
          label,
          currentDate: currKey,
          previousDate: prevKey,
          currentVal: currDayOrders,
          previousVal: prevDayOrders,
        })
      }
    }

    // -------------------------------------------------------------------------
    // Query 5: Staff Statistics & Activity List
    // -------------------------------------------------------------------------
    const [staffStats, staffActivityRows] = await Promise.all([
      sql`
        SELECT 
          COUNT(*)::int as total_staff,
          COALESCE(SUM(CASE WHEN is_active = true THEN 1 ELSE 0 END), 0)::int as active_staff,
          (
            SELECT COUNT(DISTINCT staff_id)::int
            FROM staff_attendance
            WHERE date = CURRENT_DATE
              AND (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
          ) as today_logins
        FROM staff
        WHERE (${effectiveDeviceId === 0} OR device_id = ${effectiveDeviceId})
      `,
      sql`
        SELECT 
          s.id,
          s.name,
          s.role,
          s.position,
          s.is_active,
          COALESCE(
            (SELECT MAX(sa.check_in) FROM staff_attendance sa WHERE sa.staff_id = s.id),
            s.updated_at
          ) as last_login
        FROM staff s
        WHERE (${effectiveDeviceId === 0} OR s.device_id = ${effectiveDeviceId})
        ORDER BY last_login DESC NULLS LAST, s.name ASC
        LIMIT 10
      `,
    ])

    const totalStaff = Number(staffStats[0]?.total_staff || 0)
    const activeStaff = Number(staffStats[0]?.active_staff || 0)
    const todayLogins = Number(staffStats[0]?.today_logins || 0)

    const staffActivity = staffActivityRows.map((row: any) => ({
      id: row.id,
      name: row.name,
      role: row.role || "staff",
      position: row.position || "Staff Member",
      lastLogin: row.last_login ? new Date(row.last_login).toISOString() : null,
      isActive: Boolean(row.is_active),
    }))

    // Period Labels
    const periodLabel = `${format(currentStart, "dd MMM yyyy")} - ${format(currentEnd, "dd MMM yyyy")}`
    const comparisonLabel = `${format(prevStart, "dd MMM yyyy")} - ${format(prevEnd, "dd MMM yyyy")}`

    const payload: AdminDashboardData = {
      currency,
      periodLabel,
      comparisonLabel,
      cards: {
        totalSales: {
          current: currSales,
          previous: prevSales,
          diffPercent: salesDiff.diff,
          isIncrease: salesDiff.isIncrease,
          isPositiveDirection: true,
        },
        totalProfit: {
          current: currGrossProfit,
          previous: prevGrossProfit,
          diffPercent: profitDiff.diff,
          isIncrease: profitDiff.isIncrease,
          isPositiveDirection: true,
          currentGross: currGrossProfit,
          currentNet: currNetProfit,
          previousGross: prevGrossProfit,
          previousNet: prevNetProfit,
          netDiffPercent: netProfitDiff.diff,
          isNetIncrease: netProfitDiff.isIncrease,
          isFiltered: hasSalesFilter,
        },
        totalExpenses: {
          current: currExpenses,
          previous: prevExpenses,
          diffPercent: expensesDiff.diff,
          isIncrease: expensesDiff.isIncrease,
          isPositiveDirection: false, // Expense increase is considered red
        },
        totalCogs: {
          current: currCogs,
          previous: prevCogs,
          diffPercent: cogsDiff.diff,
          isIncrease: cogsDiff.isIncrease,
          isPositiveDirection: false,
        },
        totalProductsSold: {
          current: currQuantity,
          previous: prevQuantity,
          diffPercent: quantityDiff.diff,
          isIncrease: quantityDiff.isIncrease,
          isPositiveDirection: true,
        },
        totalOrders: {
          current: currOrders,
          previous: prevOrders,
          diffPercent: ordersDiff.diff,
          isIncrease: ordersDiff.isIncrease,
          isPositiveDirection: true,
        },
      },
      chartData: {
        sales: salesChart,
        profit: profitChart,
        expenses: expensesChart,
        cogs: cogsChart,
        quantity: quantityChart,
        orders: ordersChart,
      },
      staffSummary: {
        totalStaff,
        activeStaff,
        todayLogins,
        activity: staffActivity,
      },
    }

    return {
      success: true,
      data: payload,
    }
  } catch (error) {
    console.error("getAdminDashboardData error:", error)
    return {
      success: false,
      message: "An unexpected error occurred while calculating dashboard metrics.",
      data: null,
    }
  }
}
