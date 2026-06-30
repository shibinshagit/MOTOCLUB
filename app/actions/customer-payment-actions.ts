"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordCustomerPayment } from "./simplified-accounting"

export interface CustomerPaymentAllocation {
  saleId: number
  allocatedAmount: number
  newStatus: string
  remainingBalance: number
}

export type CustomerPaymentListRow = {
  id: number
  amount: number
  payment_method: string
  transaction_date: string
  user_notes: string
}

type StoredAllocation = { saleId: number; allocatedAmount: number }

type StoredPaymentNotes = {
  v: 1
  userNotes?: string
  allocations: StoredAllocation[]
}

function parseStoredPaymentNotes(raw: string | null | undefined): StoredPaymentNotes | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed?.v === 1 && Array.isArray(parsed.allocations)) {
      return parsed as StoredPaymentNotes
    }
  } catch {
    return { v: 1, userNotes: raw, allocations: [] }
  }
  return null
}

function deriveSaleStatus(totalAmount: number, receivedAmount: number): string {
  const remaining = totalAmount - receivedAmount
  if (remaining <= 0.01) return "Completed"
  return "Credit"
}

async function getSaleCogs(saleId: number): Promise<number> {
  const rows = await sql`
    SELECT COALESCE(SUM(si.quantity * COALESCE(si.cost, si.wholesale_price, 0)), 0) AS total_cogs
    FROM sale_items si
    WHERE si.sale_id = ${saleId}
  `
  return Number(rows[0]?.total_cogs || 0)
}

async function reverseSalePayment(saleId: number, reverseAmount: number) {
  const rows = (await sql`
    SELECT
      id,
      COALESCE(total_amount, 0)::numeric AS total_amount,
      COALESCE(received_amount, 0)::numeric AS received_amount
    FROM sales
    WHERE id = ${saleId}
    LIMIT 1
  `) as any[]

  if (rows.length === 0) return

  const totalAmount = Number(rows[0].total_amount || 0)
  const currentReceived = Number(rows[0].received_amount || 0)
  const amountToReverse = Math.min(reverseAmount, currentReceived)
  if (amountToReverse <= 0) return

  const newReceivedAmount = Number(Math.max(0, currentReceived - amountToReverse).toFixed(2))
  const newStatus = deriveSaleStatus(totalAmount, newReceivedAmount)

  await sql`
    UPDATE sales
    SET received_amount = ${newReceivedAmount},
        status = ${newStatus},
        updated_at = NOW()
    WHERE id = ${saleId}
  `
}

async function applyPaymentToSales(params: {
  customerId: number
  deviceId: number
  userId: number
  paymentAmount: number
  paymentMethod: string
}): Promise<{ allocations: CustomerPaymentAllocation[]; remainingCredit: number; totalCogs: number }> {
  const creditSales = await sql`
    SELECT
      s.id,
      COALESCE(s.total_amount, 0)::numeric AS total_amount,
      COALESCE(s.received_amount, 0)::numeric AS received_amount,
      s.sale_date
    FROM sales s
    JOIN customers c ON c.id = s.customer_id
    WHERE s.customer_id = ${params.customerId}
      AND s.device_id = ${params.deviceId}
      AND c.created_by = ${params.userId}
      AND LOWER(COALESCE(s.status, '')) != 'cancelled'
      AND (COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0)) > 0.01
    ORDER BY s.sale_date ASC, s.id ASC
  `

  const totalOutstanding = creditSales.reduce((sum: number, sale: any) => {
    return sum + (Number(sale.total_amount) - Number(sale.received_amount || 0))
  }, 0)

  if (creditSales.length === 0) {
    throw new Error("No outstanding sales found for this customer")
  }

  if (params.paymentAmount > totalOutstanding + 0.01) {
    throw new Error(
      `Payment amount (${params.paymentAmount.toFixed(2)}) exceeds outstanding balance (${totalOutstanding.toFixed(2)})`,
    )
  }

  let remainingPayment = params.paymentAmount
  const allocations: CustomerPaymentAllocation[] = []
  let totalCogs = 0

  for (const sale of creditSales) {
    if (remainingPayment <= 0) break

    const totalAmount = Number(sale.total_amount || 0)
    const currentReceived = Number(sale.received_amount || 0)
    const currentBalance = totalAmount - currentReceived
    const allocationAmount = Math.min(remainingPayment, currentBalance)
    const newReceivedAmount = Number((currentReceived + allocationAmount).toFixed(2))
    const newRemainingBalance = Number((totalAmount - newReceivedAmount).toFixed(2))
    const newStatus = deriveSaleStatus(totalAmount, newReceivedAmount)

    const saleCogs = await getSaleCogs(Number(sale.id))
    if (totalAmount > 0 && allocationAmount > 0) {
      totalCogs += saleCogs * (allocationAmount / totalAmount)
    }

    await sql`
      UPDATE sales
      SET received_amount = ${newReceivedAmount},
          status = ${newStatus},
          payment_method = ${params.paymentMethod},
          updated_at = NOW()
      WHERE id = ${sale.id}
    `

    allocations.push({
      saleId: Number(sale.id),
      allocatedAmount: allocationAmount,
      newStatus,
      remainingBalance: Math.max(0, newRemainingBalance),
    })

    remainingPayment -= allocationAmount
  }

  return {
    allocations,
    remainingCredit: Number((totalOutstanding - params.paymentAmount).toFixed(2)),
    totalCogs: Number(totalCogs.toFixed(2)),
  }
}

export async function collectCustomerCredit(
  customerId: number,
  paymentAmount: number,
  userId: number,
  deviceId: number,
  paymentMethod = "Cash",
  notes?: string,
  paymentDate?: Date,
) {
  if (!customerId || !paymentAmount || !userId || !deviceId) {
    return { success: false, message: "Missing required parameters" }
  }

  if (paymentAmount <= 0) {
    return { success: false, message: "Payment amount must be greater than zero" }
  }

  resetConnectionState()

  try {
    await sql`BEGIN`

    const customerRows = await sql`
      SELECT id, name FROM customers
      WHERE id = ${customerId} AND created_by = ${userId}
      LIMIT 1
    `

    if (customerRows.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Customer not found" }
    }

    const customerName = String(customerRows[0].name || `Customer #${customerId}`)

    const { allocations, remainingCredit, totalCogs } = await applyPaymentToSales({
      customerId,
      deviceId,
      userId,
      paymentAmount,
      paymentMethod,
    })

    let finalPaymentDate: Date
    if (paymentDate) {
      finalPaymentDate = new Date(paymentDate.getTime() - paymentDate.getTimezoneOffset() * 60000)
    } else {
      const now = new Date()
      finalPaymentDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    }

    const transactionResult = await recordCustomerPayment({
      customerId,
      customerName,
      paymentAmount,
      costAmount: totalCogs,
      paymentMethod,
      allocations,
      deviceId,
      userId,
      paymentDate: finalPaymentDate,
      notes,
    })

    if (!transactionResult.success) {
      console.error("Failed to record customer payment transaction:", transactionResult.error)
    }

    await sql`COMMIT`
    revalidatePath("/dashboard")

    return {
      success: true,
      message: "Payment collected successfully",
      data: {
        totalPaid: paymentAmount,
        allocations,
        remainingCredit,
        transactionId: transactionResult.transactionId,
        customerName,
      },
    }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("collectCustomerCredit error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : `Payment processing failed: ${getLastError()?.message || "Unknown error"}`,
    }
  }
}

export async function listCustomerPaymentsForCustomer(
  customerId: number,
  deviceId: number,
  userId: number,
): Promise<{ success: boolean; message?: string; data: CustomerPaymentListRow[] }> {
  if (!customerId || !deviceId || !userId) {
    return { success: false, message: "Missing required parameters", data: [] }
  }

  resetConnectionState()

  try {
    const rows = await sql`
      SELECT id, amount, payment_method, transaction_date, notes
      FROM financial_transactions
      WHERE transaction_type = 'customer_payment'
        AND reference_id = ${customerId}
        AND device_id = ${deviceId}
        AND created_by = ${userId}
      ORDER BY transaction_date DESC, id DESC
    `

    const data: CustomerPaymentListRow[] = rows.map((row: any) => {
      const stored = parseStoredPaymentNotes(row.notes)
      return {
        id: row.id,
        amount: Number(row.amount) || 0,
        payment_method: row.payment_method || "Cash",
        transaction_date: row.transaction_date,
        user_notes: stored?.userNotes || "",
      }
    })

    return { success: true, data }
  } catch (error) {
    console.error("Error listing customer payments:", error)
    return {
      success: false,
      message: getLastError()?.message || "Failed to list customer payments",
      data: [],
    }
  }
}

export async function getCustomerPaymentById(paymentId: number) {
  try {
    const payment = await sql`
      SELECT *
      FROM financial_transactions
      WHERE id = ${paymentId}
        AND transaction_type = 'customer_payment'
      LIMIT 1
    `

    if (payment.length === 0) {
      return { success: false, message: "Payment not found", data: null }
    }

    const paymentRecord = payment[0]
    const stored = parseStoredPaymentNotes(paymentRecord.notes)
    const customerId = Number(paymentRecord.reference_id)

    let customerName = `Customer #${customerId}`
    const customerRows = await sql`SELECT name FROM customers WHERE id = ${customerId} LIMIT 1`
    if (customerRows.length > 0) {
      customerName = customerRows[0].name
    }

    return {
      success: true,
      data: {
        id: paymentRecord.id,
        customer_id: customerId,
        customer_name: customerName,
        amount: Number(paymentRecord.amount),
        payment_method: paymentRecord.payment_method || "Cash",
        payment_date: paymentRecord.transaction_date,
        user_notes: stored?.userNotes || "",
        allocations: stored?.allocations || [],
        device_id: paymentRecord.device_id,
        user_id: paymentRecord.created_by,
      },
    }
  } catch (error) {
    console.error("Error fetching customer payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch customer payment",
      data: null,
    }
  }
}

async function reverseCustomerPaymentOnSales(params: {
  storedAllocations?: StoredAllocation[]
  paymentAmount: number
}) {
  if (params.storedAllocations?.length) {
    for (let i = params.storedAllocations.length - 1; i >= 0; i--) {
      const alloc = params.storedAllocations[i]
      await reverseSalePayment(alloc.saleId, alloc.allocatedAmount)
    }
    return
  }

  throw new Error("Cannot undo payment without stored sale allocations")
}

export async function deleteCustomerPayment(paymentId: number, deviceId: number, userId: number) {
  resetConnectionState()

  try {
    const paymentRows = await sql`
      SELECT *
      FROM financial_transactions
      WHERE id = ${paymentId}
        AND device_id = ${deviceId}
        AND transaction_type = 'customer_payment'
      LIMIT 1
    `

    if (paymentRows.length === 0) {
      return { success: false, message: "Payment not found" }
    }

    const payment = paymentRows[0]
    const stored = parseStoredPaymentNotes(payment.notes)
    const paymentAmount = Number(payment.amount || 0)

    await sql`BEGIN`

    await reverseCustomerPaymentOnSales({
      storedAllocations: stored?.allocations,
      paymentAmount,
    })

    await sql`
      DELETE FROM financial_transactions
      WHERE id = ${paymentId} AND device_id = ${deviceId}
    `

    await sql`COMMIT`
    revalidatePath("/dashboard")

    return { success: true, message: "Payment undone successfully" }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Error deleting customer payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to undo payment",
    }
  }
}

export async function updateCustomerPayment(data: {
  paymentId: number
  amount: number
  paymentMethod: string
  paymentDate: Date
  notes?: string
  deviceId: number
  userId: number
}) {
  if (!data.paymentId || !data.deviceId || !data.userId) {
    return { success: false, message: "Missing required parameters" }
  }

  if (data.amount <= 0) {
    return { success: false, message: "Payment amount must be greater than zero" }
  }

  resetConnectionState()

  try {
    await sql`BEGIN`

    const paymentRows = await sql`
      SELECT *
      FROM financial_transactions
      WHERE id = ${data.paymentId}
        AND device_id = ${data.deviceId}
        AND transaction_type = 'customer_payment'
      LIMIT 1
    `

    if (paymentRows.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Payment not found" }
    }

    const payment = paymentRows[0]
    const stored = parseStoredPaymentNotes(payment.notes)
    const originalAmount = Number(payment.amount || 0)
    const customerId = Number(payment.reference_id)
    const amountDiff = Number((data.amount - originalAmount).toFixed(2))

    const customerRows = await sql`SELECT name FROM customers WHERE id = ${customerId} LIMIT 1`
    const customerName =
      customerRows.length > 0 ? customerRows[0].name : `Customer #${customerId}`

    let allocations: CustomerPaymentAllocation[] = stored?.allocations
      ? stored.allocations.map((allocation) => ({
          saleId: allocation.saleId,
          allocatedAmount: allocation.allocatedAmount,
          newStatus: "Completed",
          remainingBalance: 0,
        }))
      : []
    let totalCogs = Number(payment.cost_amount || 0)

    if (Math.abs(amountDiff) > 0.01) {
      if (!stored?.allocations?.length) {
        await sql`ROLLBACK`
        return { success: false, message: "Cannot edit payment without stored sale allocations" }
      }

      await reverseCustomerPaymentOnSales({
        storedAllocations: stored.allocations,
        paymentAmount: originalAmount,
      })

      const applied = await applyPaymentToSales({
        customerId,
        deviceId: data.deviceId,
        userId: data.userId,
        paymentAmount: data.amount,
        paymentMethod: data.paymentMethod,
      })
      allocations = applied.allocations
      totalCogs = applied.totalCogs
    }

    const finalPaymentDate = new Date(
      data.paymentDate.getTime() - data.paymentDate.getTimezoneOffset() * 60000,
    )

    const storedNotes = JSON.stringify({
      v: 1,
      userNotes: data.notes?.trim() || "",
      allocations: allocations.map((a) => ({
        saleId: a.saleId,
        allocatedAmount: a.allocatedAmount,
      })),
    })

    const description = `Customer Payment - ${customerName} - ${data.paymentMethod} - ${allocations.length} sale(s) affected`

    await sql`
      UPDATE financial_transactions
      SET
        amount = ${data.amount},
        received_amount = ${data.amount},
        cost_amount = ${totalCogs},
        debit_amount = 0,
        credit_amount = ${data.amount},
        payment_method = ${data.paymentMethod},
        transaction_date = ${finalPaymentDate.toISOString()},
        notes = ${storedNotes},
        description = ${description},
        updated_at = NOW()
      WHERE id = ${data.paymentId}
        AND device_id = ${data.deviceId}
    `

    await sql`COMMIT`
    revalidatePath("/dashboard")

    return { success: true, message: "Payment updated successfully" }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Error updating customer payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update payment",
    }
  }
}
