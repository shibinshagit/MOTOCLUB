import "server-only"
import { sql } from "@/lib/db"

function isEcomAllowedDevice(deviceId: number): boolean {
  const allowed = process.env.ECOMMERCE_DEVICE_IDS
    ? process.env.ECOMMERCE_DEVICE_IDS.split(",").map((id) => Number(id.trim()))
    : [1, 4]
  return allowed.includes(Number(deviceId))
}

function getExclusiveEndDate(dateTo: string): string {
  const d = new Date(dateTo)
  d.setDate(d.getDate() + 1)
  return d.toISOString().split("T")[0]
}

export interface ExpenseCategoryBreakdown {
  category: string
  amount: number
}

export interface ShippingSummary {
  customerShippingCollected: number
  actualCourierCost: number
  netShippingDifference: number
}

export interface ExcludedMoneyOut {
  inventoryPurchases: number
  supplierPayments: number
  customerRefunds: number
  otherAdjustments: number
}

export interface AuthoritativeProfitSummary {
  validOrders: number
  totalQuantity: number
  salesRevenue: number
  salesCogs: number
  orderGrossProfit: number
  otherIncome: number
  pettyCashProfit: number
  otherProfit: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  expenseBreakdown: ExpenseCategoryBreakdown[]
  shippingSummary: ShippingSummary
  excludedMoneyOut: ExcludedMoneyOut
}

export async function getAuthoritativeProfitSummary(
  deviceId: number,
  options: {
    dateFrom?: string
    dateTo?: string
    staffId?: number | "all"
    courierPartnerId?: number | "all"
    courierServiceName?: string | "all"
    paymentMethod?: string | "all"
    statusFilter?: string | "all"
  } = {}
): Promise<AuthoritativeProfitSummary> {
  const allowEcom = deviceId === 0 || isEcomAllowedDevice(deviceId)
  const endExclusive = options.dateTo ? getExclusiveEndDate(options.dateTo) : null
  const dateFrom = options.dateFrom || null

  const staffFilter = options.staffId && options.staffId !== "all" ? Number(options.staffId) : null
  const courierPartnerFilter =
    options.courierPartnerId && options.courierPartnerId !== "all" ? Number(options.courierPartnerId) : null
  const courierServiceFilter =
    options.courierServiceName && options.courierServiceName !== "all" ? options.courierServiceName.trim() : null
  const paymentMethodFilter =
    options.paymentMethod && options.paymentMethod !== "all" ? options.paymentMethod.trim() : null

  // 1. Sales, COGS & Order Gross Profit
  const salesRes = await sql`
    WITH filtered_sales AS (
      SELECT s.id, s.total_amount, COALESCE(s.sale_date, s.created_at) as sale_date
      FROM sales s
      WHERE s.total_amount != 'NaN'::numeric
        AND (${deviceId === 0} OR s.device_id = ${deviceId} OR (${allowEcom} = true AND s.source = 'ECOMMERCE'))
        AND (${allowEcom} = true OR s.source IS NULL OR s.source != 'ECOMMERCE')
        AND (${dateFrom}::timestamp IS NULL OR COALESCE(s.sale_date, s.created_at) >= ${dateFrom}::timestamp)
        AND (${endExclusive}::timestamp IS NULL OR COALESCE(s.sale_date, s.created_at) < ${endExclusive}::timestamp)
        AND LOWER(COALESCE(s.status, '')) NOT IN ('cancelled', 'returned')
        AND LOWER(COALESCE(s.payment_status, '')) != 'cancelled'
        AND LOWER(COALESCE(s.delivery_status, '')) NOT IN ('returned', 'failed')
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
      COALESCE(COUNT(fs.id), 0)::int AS valid_orders,
      COALESCE(SUM(fs.total_amount), 0)::numeric AS sales_revenue,
      (SELECT total_quantity FROM items_agg)::int AS total_quantity,
      (SELECT total_cogs FROM items_agg)::numeric AS sales_cogs
    FROM filtered_sales fs
  `

  // 2. Total Operating Expenses (strictly manual entries as confirmed by accountant)
  const expRes = await sql`
    SELECT COALESCE(SUM(debit_amount), 0)::numeric AS total_expenses
    FROM financial_transactions
    WHERE (${dateFrom}::timestamp IS NULL OR transaction_date >= ${dateFrom}::timestamp)
      AND (${endExclusive}::timestamp IS NULL OR transaction_date < ${endExclusive}::timestamp)
      AND (${deviceId === 0} OR device_id = ${deviceId} OR device_id = 0)
      AND (
        (transaction_type = 'manual' AND debit_amount > 0)
      )
  `

  const actualPaidSalary = 0 // Not pulling from salary_payments to avoid double-counting manual entries

  // 3. Other Business Income
  const incomeRes = await sql`
    SELECT COALESCE(SUM(credit_amount), 0)::numeric AS total_other_income
    FROM financial_transactions
    WHERE (${dateFrom}::timestamp IS NULL OR transaction_date >= ${dateFrom}::timestamp)
      AND (${endExclusive}::timestamp IS NULL OR transaction_date < ${endExclusive}::timestamp)
      AND (${deviceId === 0} OR device_id = ${deviceId})
      AND (
        transaction_type IN ('other_income', 'service_income')
        AND reference_type NOT IN ('sale', 'customer_payment')
      )
  `

  // 4. Expense Category Breakdown
  const expRows = await sql`
    SELECT 
      transaction_type,
      description,
      debit_amount
    FROM financial_transactions
    WHERE (${dateFrom}::timestamp IS NULL OR transaction_date >= ${dateFrom}::timestamp)
      AND (${endExclusive}::timestamp IS NULL OR transaction_date < ${endExclusive}::timestamp)
      AND (${deviceId === 0} OR device_id = ${deviceId} OR device_id = 0)
      AND (
        (transaction_type = 'manual' AND debit_amount > 0)
      )
  `

  const categoryMap: Record<string, number> = {}
  
  expRows.forEach((r: any) => {
    const type = r.transaction_type
    const debit = Number(r.debit_amount) || 0
    if (debit <= 0) return

    let category = "Other Expenses"
    if (type === "manual") {
      const desc = r.description || ""
      const catMatch = desc.match(/Manual Entry - ([^-]+)/)
      if (catMatch) {
        category = catMatch[1].trim()
      } else {
        category = "Other Expenses"
      }
    }

    categoryMap[category] = (categoryMap[category] || 0) + debit
  })

  const expenseBreakdown: ExpenseCategoryBreakdown[] = Object.entries(categoryMap)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount)

  // 5. Shipping & Courier Summary
  const shippingRes = await sql`
    SELECT 
      COALESCE(SUM(credit_amount), 0)::numeric AS customer_shipping_collected,
      COALESCE(SUM(debit_amount), 0)::numeric AS actual_courier_cost
    FROM financial_transactions
    WHERE (${dateFrom}::timestamp IS NULL OR transaction_date >= ${dateFrom}::timestamp)
      AND (${endExclusive}::timestamp IS NULL OR transaction_date < ${endExclusive}::timestamp)
      AND (${deviceId === 0} OR device_id = ${deviceId} OR device_id = 0)
      AND transaction_type = 'sale_shipping'
  `

  const customerShippingCollected = Number(shippingRes[0]?.customer_shipping_collected || 0)
  const actualCourierCostDirect = Number(shippingRes[0]?.actual_courier_cost || 0)
  const manualCourierCost = categoryMap["Courier & Delivery"] || 0
  const actualCourierCost = Math.max(actualCourierCostDirect, manualCourierCost)
  const netShippingDifference = customerShippingCollected - actualCourierCost

  // 6. Excluded Money Out (Purchases, Supplier Payments, Adjustments)
  const excludedRes = await sql`
    SELECT 
      COALESCE(SUM(CASE WHEN transaction_type = 'purchase' THEN debit_amount ELSE 0 END), 0)::numeric AS inventory_purchases,
      COALESCE(SUM(CASE WHEN transaction_type = 'supplier_payment' THEN debit_amount ELSE 0 END), 0)::numeric AS supplier_payments,
      COALESCE(SUM(CASE WHEN transaction_type = 'adjustment' THEN debit_amount ELSE 0 END), 0)::numeric AS other_adjustments
    FROM financial_transactions
    WHERE (${dateFrom}::timestamp IS NULL OR transaction_date >= ${dateFrom}::timestamp)
      AND (${endExclusive}::timestamp IS NULL OR transaction_date < ${endExclusive}::timestamp)
      AND (${deviceId === 0} OR device_id = ${deviceId} OR device_id = 0)
  `

  const inventoryPurchases = Number(excludedRes[0]?.inventory_purchases || 0)
  const supplierPayments = Number(excludedRes[0]?.supplier_payments || 0)
  const otherAdjustments = Number(excludedRes[0]?.other_adjustments || 0)
  const customerRefunds = 0

  const validOrders = Number(salesRes[0]?.valid_orders || 0)
  const salesRevenue = Number(salesRes[0]?.sales_revenue || 0)
  const salesCogs = Number(salesRes[0]?.sales_cogs || 0)
  const totalQuantity = Number(salesRes[0]?.total_quantity || 0)
  const orderGrossProfit = salesRevenue - salesCogs

  const operatingExpenses = Number(expRes[0]?.total_expenses || 0)
  const otherIncome = Number(incomeRes[0]?.total_other_income || 0)
  const pettyCashProfit = otherIncome
  const otherProfit = 0

  const grossProfit = orderGrossProfit + otherIncome + otherProfit + netShippingDifference
  const netProfit = grossProfit - operatingExpenses

  return {
    validOrders,
    totalQuantity,
    salesRevenue,
    salesCogs,
    orderGrossProfit,
    otherIncome,
    pettyCashProfit,
    otherProfit,
    grossProfit,
    operatingExpenses,
    netProfit,
    expenseBreakdown,
    shippingSummary: {
      customerShippingCollected,
      actualCourierCost,
      netShippingDifference,
    },
    excludedMoneyOut: {
      inventoryPurchases,
      supplierPayments,
      customerRefunds,
      otherAdjustments,
    },
  }
}
