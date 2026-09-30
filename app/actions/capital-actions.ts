"use server"

import { sql } from "@/lib/db"
import { getServerActor, resolveAuthorizedDeviceId } from "@/lib/device-access"
import { resolveStaffSessionContext } from "@/lib/staff-restrictions-server"
import { canStaffAccessPage } from "@/lib/staff-restrictions"

/**
 * Standalone capital ledger (capital_transactions). It never reads or writes
 * financial_transactions, so it cannot affect any accounting total.
 */

export interface CapitalTransaction {
  id: number
  transaction_type: "IN" | "OUT"
  amount: number
  description: string | null
  payment_method: string | null
  transaction_date: string
  running_balance: number
}

export interface CapitalSummary {
  currentBalance: number
  periodIn: number
  periodOut: number
  transactions: CapitalTransaction[]
}

class CapitalError extends Error {}

/** Server-side gate: resolves the device from the session and enforces Accounting page access. */
async function authorize(
  requestedDeviceId: number,
): Promise<{ deviceId: number; staffId: number | null } | { error: string }> {
  const actor = await getServerActor()
  if (!actor) return { error: "Not authorized" }
  const deviceId = await resolveAuthorizedDeviceId(Number(requestedDeviceId))
  if (!deviceId) return { error: "Device not found" }
  if (actor.kind === "staff" || actor.kind === "staff_admin") {
    const staff = await resolveStaffSessionContext(deviceId)
    if (!staff || !canStaffAccessPage(staff, "accounting")) {
      return { error: "Accounting is not available for your staff role" }
    }
    return { deviceId, staffId: staff.id }
  }
  return { deviceId, staffId: null }
}

const money = (v: unknown) => Math.round(Number(v || 0) * 100) / 100

function formatAmount(amount: number, currency: string) {
  return `${currency} ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
}

/**
 * Current balance is always over the full history; only the transaction list and the
 * period in/out totals follow the selected date range. dateFrom/dateTo are yyyy-MM-dd (inclusive).
 */
export async function getCapitalSummary(
  requestedDeviceId: number,
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<{ success: boolean; data?: CapitalSummary; message?: string }> {
  try {
    const auth = await authorize(requestedDeviceId)
    if ("error" in auth) return { success: false, message: auth.error }

    const from = range.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(range.dateFrom) ? range.dateFrom : null
    const to = range.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(range.dateTo) ? range.dateTo : null

    const rows = await sql`
      WITH ledger AS (
        SELECT id, transaction_type, amount, description, payment_method, transaction_date,
               SUM(CASE WHEN transaction_type = 'IN' THEN amount ELSE -amount END)
                 OVER (ORDER BY transaction_date, id) AS running_balance
        FROM capital_transactions
        WHERE device_id = ${auth.deviceId}
      )
      SELECT * FROM ledger
      WHERE (${from}::date IS NULL OR transaction_date >= ${from}::date)
        AND (${to}::date IS NULL OR transaction_date < (${to}::date + INTERVAL '1 day'))
      ORDER BY transaction_date DESC, id DESC
    `
    const balRows = await sql`
      SELECT COALESCE(SUM(CASE WHEN transaction_type = 'IN' THEN amount ELSE -amount END), 0) AS balance
      FROM capital_transactions WHERE device_id = ${auth.deviceId}
    `

    const transactions: CapitalTransaction[] = rows.map((r: any) => ({
      id: Number(r.id),
      transaction_type: r.transaction_type,
      amount: money(r.amount),
      description: r.description,
      payment_method: r.payment_method,
      transaction_date: new Date(r.transaction_date).toISOString(),
      running_balance: money(r.running_balance),
    }))

    return {
      success: true,
      data: {
        currentBalance: money(balRows[0]?.balance),
        periodIn: money(transactions.filter((t) => t.transaction_type === "IN").reduce((s, t) => s + t.amount, 0)),
        periodOut: money(transactions.filter((t) => t.transaction_type === "OUT").reduce((s, t) => s + t.amount, 0)),
        transactions,
      },
    }
  } catch (error) {
    console.error("getCapitalSummary error:", error)
    return { success: false, message: "Failed to load capital ledger" }
  }
}

export async function addCapitalTransaction(input: {
  deviceId: number
  type: "IN" | "OUT"
  amount: number
  description?: string
  paymentMethod?: string
  transactionDate?: string
}): Promise<{ success: boolean; message?: string; balance?: number }> {
  try {
    const auth = await authorize(input.deviceId)
    if ("error" in auth) return { success: false, message: auth.error }

    const type = input.type === "IN" || input.type === "OUT" ? input.type : null
    const amount = money(input.amount)
    if (!type) return { success: false, message: "Invalid transaction type" }
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, message: "Amount must be greater than zero" }
    const date =
      input.transactionDate && /^\d{4}-\d{2}-\d{2}/.test(input.transactionDate) ? input.transactionDate.slice(0, 10) : null

    const balance = await sql.begin(async (tx: any) => {
      // Locking the device row serialises every capital write for this ledger, so two
      // concurrent withdrawals cannot both pass the balance check.
      const dev = await tx`SELECT company_id, currency FROM devices WHERE id = ${auth.deviceId} FOR UPDATE`
      if (dev.length === 0 || dev[0].company_id == null) throw new CapitalError("Device not found")
      const currency = dev[0].currency || "INR"

      await tx`
        INSERT INTO capital_transactions
          (company_id, device_id, transaction_type, amount, description, payment_method, transaction_date, created_by)
        VALUES (
          ${dev[0].company_id}, ${auth.deviceId}, ${type}, ${amount},
          ${input.description?.trim() || null}, ${input.paymentMethod?.trim() || null},
          COALESCE(${date}::date, CURRENT_DATE)::timestamp + LOCALTIME, ${auth.staffId ?? auth.deviceId}
        )
      `

      // The pool must never go negative at any point in time (also protects back-dated entries)
      const check = await tx`
        SELECT
          (SELECT MIN(bal) FROM (
            SELECT SUM(CASE WHEN transaction_type = 'IN' THEN amount ELSE -amount END) OVER (ORDER BY transaction_date, id) AS bal
            FROM capital_transactions WHERE device_id = ${auth.deviceId}
          ) x) AS min_balance,
          (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'IN' THEN amount ELSE -amount END), 0)
             FROM capital_transactions WHERE device_id = ${auth.deviceId}) AS balance
      `
      if (Number(check[0].min_balance) < 0) {
        const available = money(Number(check[0].balance) + (type === "OUT" ? amount : 0))
        throw new CapitalError(
          `Insufficient capital balance. Available capital: ${formatAmount(Math.max(0, available), currency)}.`,
        )
      }
      return money(check[0].balance)
    })

    return { success: true, balance }
  } catch (error) {
    if (error instanceof CapitalError) return { success: false, message: error.message }
    console.error("addCapitalTransaction error:", error)
    return { success: false, message: "Failed to save capital transaction" }
  }
}
