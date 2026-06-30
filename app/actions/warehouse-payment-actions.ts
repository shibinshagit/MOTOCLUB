"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  derivePaymentStatus,
  refreshTransferPaymentLedger,
} from "./transfer-actions"
import { recordWarehousePayment } from "./simplified-accounting"

export interface WarehousePaymentAllocation {
  transferId: number
  allocatedAmount: number
  newStatus: string
  remainingBalance: number
}

export type WarehousePaymentListRow = {
  id: number
  amount: number
  payment_method: string
  transaction_date: string
  user_notes: string
}

type StoredAllocation = { transferId: number; allocatedAmount: number }

type StoredPaymentNotes = {
  v: 1
  userNotes?: string
  allocations: StoredAllocation[]
}

function stripBulkPaymentSegments(notes: string): string {
  return notes
    .split(" | ")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) return false
      if (/^Bulk payment [\d.]+ via /.test(part)) return false
      if (/^Bulk payments total: [\d.]+ via /.test(part)) return false
      return true
    })
    .join(" | ")
}

function parseBulkPaymentSegments(notes: string): Array<{ text: string; amount: number }> {
  const segments: Array<{ text: string; amount: number }> = []
  for (const part of notes.split(" | ").map((s) => s.trim()).filter(Boolean)) {
    const singleMatch = part.match(/^Bulk payment ([\d.]+) via /)
    if (singleMatch) {
      segments.push({ text: part, amount: Number(singleMatch[1]) || 0 })
      continue
    }
    const totalMatch = part.match(/^Bulk payments total: ([\d.]+) via /)
    if (totalMatch) {
      segments.push({ text: part, amount: Number(totalMatch[1]) || 0 })
    }
  }
  return segments
}

function sumBulkPaymentInNotes(notes: string): number {
  return parseBulkPaymentSegments(notes).reduce((sum, segment) => sum + segment.amount, 0)
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

async function getCompanyIdForDevice(deviceId: number): Promise<number | null> {
  const rows = await sql`SELECT company_id FROM devices WHERE id = ${deviceId} LIMIT 1`
  return rows.length > 0 ? Number(rows[0].company_id) : null
}

async function reverseTransferPayment(
  transferId: number,
  reverseAmount: number,
  userId: number,
  options?: { bulkOnly?: boolean },
) {
  const rows = (await sql`
    SELECT
      id,
      COALESCE(total_amount, 0)::numeric AS total_amount,
      COALESCE(paid_amount, 0)::numeric AS paid_amount,
      COALESCE(payment_notes, '') AS payment_notes
    FROM stock_transfers
    WHERE id = ${transferId}
    LIMIT 1
  `) as any[]

  if (rows.length === 0) return

  const totalAmount = Number(rows[0].total_amount || 0)
  const currentPaid = Number(rows[0].paid_amount || 0)
  const paymentNotes = String(rows[0].payment_notes || "")

  let amountToReverse = Math.min(reverseAmount, currentPaid)
  if (options?.bulkOnly) {
    amountToReverse = Math.min(amountToReverse, sumBulkPaymentInNotes(paymentNotes))
  }

  if (amountToReverse <= 0) return

  const newPaidAmount = Number(Math.max(0, currentPaid - amountToReverse).toFixed(2))
  const newStatus = derivePaymentStatus(totalAmount, newPaidAmount)

  await sql`
    UPDATE stock_transfers
    SET paid_amount = ${newPaidAmount},
        payment_status = ${newStatus},
        updated_at = NOW()
    WHERE id = ${transferId}
  `

  await refreshTransferPaymentLedger(transferId, userId)
}

async function rebuildBulkPaymentNotesForWarehousePair(
  creditorWarehouseId: number,
  payerDeviceId: number,
  userId: number,
) {
  const transfers = await sql`
    SELECT id, payment_notes
    FROM stock_transfers
    WHERE LOWER(status) = 'completed'
      AND from_device_id = ${creditorWarehouseId}
      AND to_device_id = ${payerDeviceId}
  `

  const payments = await sql`
    SELECT notes, payment_method
    FROM financial_transactions
    WHERE transaction_type = 'warehouse_payment'
      AND reference_id = ${creditorWarehouseId}
      AND device_id = ${payerDeviceId}
    ORDER BY transaction_date ASC, id ASC
  `

  const bulkByTransfer = new Map<number, { total: number; method: string }>()
  for (const payment of payments) {
    const stored = parseStoredPaymentNotes(payment.notes)
    const method = String(payment.payment_method || "Cash")
    for (const alloc of stored?.allocations || []) {
      const transferId = Number(alloc.transferId)
      const existing = bulkByTransfer.get(transferId) || { total: 0, method }
      existing.total += Number(alloc.allocatedAmount || 0)
      existing.method = method
      bulkByTransfer.set(transferId, existing)
    }
  }

  for (const transfer of transfers) {
    const transferId = Number(transfer.id)
    const nonBulkNotes = stripBulkPaymentSegments(String(transfer.payment_notes || ""))
    const bulkInfo = bulkByTransfer.get(transferId)
    const newNotes =
      bulkInfo && bulkInfo.total > 0.009
        ? `${nonBulkNotes}${nonBulkNotes ? " | " : ""}Bulk payments total: ${bulkInfo.total.toFixed(2)} via ${bulkInfo.method}`
        : nonBulkNotes || null

    await sql`
      UPDATE stock_transfers
      SET payment_notes = ${newNotes},
          updated_at = NOW()
      WHERE id = ${transferId}
    `
  }
}

export async function repairWarehousePaymentNotes(
  creditorWarehouseId: number,
  payerDeviceId: number,
  userId: number,
) {
  if (!creditorWarehouseId || !payerDeviceId || !userId) {
    return { success: false, message: "Missing required parameters" }
  }

  resetConnectionState()
  try {
    await rebuildBulkPaymentNotesForWarehousePair(creditorWarehouseId, payerDeviceId, userId)
    revalidatePath("/dashboard")
    return { success: true, message: "Payment notes refreshed" }
  } catch (error) {
    console.error("repairWarehousePaymentNotes error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to refresh payment notes",
    }
  }
}

async function reverseBulkPaymentsFromTransfers(params: {
  companyId: number
  creditorWarehouseId: number
  payerDeviceId: number
  reverseAmount: number
  userId: number
}) {
  const transfers = await sql`
    SELECT id, COALESCE(payment_notes, '') AS payment_notes
    FROM stock_transfers
    WHERE company_id = ${params.companyId}
      AND LOWER(status) = 'completed'
      AND from_device_id = ${params.creditorWarehouseId}
      AND to_device_id = ${params.payerDeviceId}
      AND COALESCE(payment_notes, '') LIKE '%Bulk payment %'
    ORDER BY transfer_date DESC, id DESC
  `

  let remaining = params.reverseAmount
  for (const transfer of transfers) {
    if (remaining <= 0) break
    const bulkTotal = sumBulkPaymentInNotes(String(transfer.payment_notes || ""))
    if (bulkTotal <= 0) continue

    const reverseOnTransfer = Math.min(remaining, bulkTotal)
    await reverseTransferPayment(Number(transfer.id), reverseOnTransfer, params.userId, {
      bulkOnly: true,
    })
    remaining -= reverseOnTransfer
  }

  if (remaining > 0.01) {
    throw new Error(
      `Could only reverse ${(params.reverseAmount - remaining).toFixed(2)} of ${params.reverseAmount.toFixed(2)} from bulk payments`,
    )
  }
}

async function applyPaymentToTransfers(params: {
  companyId: number
  creditorWarehouseId: number
  payerDeviceId: number
  paymentAmount: number
  paymentMethod: string
  userNotes?: string
  userId: number
}): Promise<{ allocations: WarehousePaymentAllocation[]; remainingCredit: number }> {
  const creditTransfers = await sql`
    SELECT
      id,
      COALESCE(total_amount, 0)::numeric AS total_amount,
      COALESCE(paid_amount, 0)::numeric AS paid_amount,
      COALESCE(payment_notes, '') AS payment_notes,
      COALESCE(transfer_date, created_at) AS transfer_date
    FROM stock_transfers
    WHERE company_id = ${params.companyId}
      AND LOWER(status) = 'completed'
      AND from_device_id = ${params.creditorWarehouseId}
      AND to_device_id = ${params.payerDeviceId}
      AND (COALESCE(total_amount, 0) - COALESCE(paid_amount, 0)) > 0.01
    ORDER BY transfer_date ASC, id ASC
  `

  const totalOutstanding = creditTransfers.reduce((sum: number, transfer: any) => {
    return sum + (Number(transfer.total_amount) - Number(transfer.paid_amount || 0))
  }, 0)

  if (creditTransfers.length === 0) {
    throw new Error("No outstanding transfer balances found for this warehouse")
  }

  if (params.paymentAmount > totalOutstanding + 0.01) {
    throw new Error(
      `Payment amount (${params.paymentAmount.toFixed(2)}) exceeds outstanding balance (${totalOutstanding.toFixed(2)})`,
    )
  }

  let remainingPayment = params.paymentAmount
  const allocations: WarehousePaymentAllocation[] = []

  for (const transfer of creditTransfers) {
    if (remainingPayment <= 0) break

    const totalAmount = Number(transfer.total_amount || 0)
    const currentPaid = Number(transfer.paid_amount || 0)
    const currentBalance = totalAmount - currentPaid
    const allocationAmount = Math.min(remainingPayment, currentBalance)
    const newPaidAmount = Number((currentPaid + allocationAmount).toFixed(2))
    const newRemainingBalance = Number((totalAmount - newPaidAmount).toFixed(2))
    const newStatus = derivePaymentStatus(totalAmount, newPaidAmount)

    await sql`
      UPDATE stock_transfers
      SET paid_amount = ${newPaidAmount},
          payment_status = ${newStatus},
          payment_method = ${params.paymentMethod},
          updated_at = NOW()
      WHERE id = ${transfer.id}
    `

    await refreshTransferPaymentLedger(Number(transfer.id), params.userId)

    allocations.push({
      transferId: Number(transfer.id),
      allocatedAmount: allocationAmount,
      newStatus,
      remainingBalance: Math.max(0, newRemainingBalance),
    })

    remainingPayment -= allocationAmount
  }

  return {
    allocations,
    remainingCredit: Number((totalOutstanding - params.paymentAmount).toFixed(2)),
  }
}

export async function payWarehouseCredit(
  creditorWarehouseId: number,
  paymentAmount: number,
  userId: number,
  payerDeviceId: number,
  paymentMethod = "Cash",
  notes?: string,
  paymentDate?: Date,
) {
  if (!creditorWarehouseId || !paymentAmount || !userId || !payerDeviceId) {
    return { success: false, message: "Missing required parameters" }
  }

  if (paymentAmount <= 0) {
    return { success: false, message: "Payment amount must be greater than zero" }
  }

  resetConnectionState()

  try {
    await sql`BEGIN`

    const companyId = await getCompanyIdForDevice(payerDeviceId)
    if (!companyId) {
      await sql`ROLLBACK`
      return { success: false, message: "Payer warehouse not found" }
    }

    const creditorRows = await sql`
      SELECT id, name FROM devices
      WHERE id = ${creditorWarehouseId} AND company_id = ${companyId}
      LIMIT 1
    `
    if (creditorRows.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Creditor warehouse not found" }
    }
    const creditorName = String(creditorRows[0].name || `Warehouse #${creditorWarehouseId}`)

    const { allocations, remainingCredit } = await applyPaymentToTransfers({
      companyId,
      creditorWarehouseId,
      payerDeviceId,
      paymentAmount,
      paymentMethod,
      userNotes: notes,
      userId,
    })

    let finalPaymentDate: Date
    if (paymentDate) {
      finalPaymentDate = new Date(paymentDate.getTime() - paymentDate.getTimezoneOffset() * 60000)
    } else {
      const now = new Date()
      finalPaymentDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    }

    const transactionResult = await recordWarehousePayment({
      warehouseId: creditorWarehouseId,
      warehouseName: creditorName,
      paymentAmount,
      paymentMethod,
      allocations,
      deviceId: payerDeviceId,
      userId,
      paymentDate: finalPaymentDate,
      notes,
    })

    if (!transactionResult.success) {
      console.error("Failed to record warehouse payment transaction:", transactionResult.error)
    }

    await rebuildBulkPaymentNotesForWarehousePair(creditorWarehouseId, payerDeviceId, userId)

    await sql`COMMIT`
    revalidatePath("/dashboard")

    return {
      success: true,
      message: "Warehouse payment processed successfully",
      data: {
        totalPaid: paymentAmount,
        allocations,
        remainingCredit,
        transactionId: transactionResult.transactionId,
        warehouseName: creditorName,
      },
    }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("payWarehouseCredit error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : `Payment processing failed: ${getLastError()?.message || "Unknown error"}`,
    }
  }
}

export async function listWarehousePaymentsForWarehouse(
  warehouseId: number,
  deviceId: number,
  userId: number,
): Promise<{ success: boolean; message?: string; data: WarehousePaymentListRow[] }> {
  if (!warehouseId || !deviceId || !userId) {
    return { success: false, message: "Missing required parameters", data: [] }
  }

  resetConnectionState()

  try {
    const rows = await sql`
      SELECT id, amount, payment_method, transaction_date, notes
      FROM financial_transactions
      WHERE transaction_type = 'warehouse_payment'
        AND reference_id = ${warehouseId}
        AND device_id = ${deviceId}
        AND created_by = ${userId}
      ORDER BY transaction_date DESC, id DESC
    `

    const data: WarehousePaymentListRow[] = rows.map((row: any) => {
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
    console.error("Error listing warehouse payments:", error)
    return {
      success: false,
      message: getLastError()?.message || "Failed to list warehouse payments",
      data: [],
    }
  }
}

export async function getWarehousePaymentById(paymentId: number) {
  try {
    const payment = await sql`
      SELECT *
      FROM financial_transactions
      WHERE id = ${paymentId}
        AND transaction_type = 'warehouse_payment'
      LIMIT 1
    `

    if (payment.length === 0) {
      return { success: false, message: "Payment not found", data: null }
    }

    const paymentRecord = payment[0]
    const stored = parseStoredPaymentNotes(paymentRecord.notes)
    const warehouseId = Number(paymentRecord.reference_id)

    let warehouseName = `Warehouse #${warehouseId}`
    const warehouseRows = await sql`SELECT name FROM devices WHERE id = ${warehouseId} LIMIT 1`
    if (warehouseRows.length > 0) {
      warehouseName = warehouseRows[0].name
    }

    return {
      success: true,
      data: {
        id: paymentRecord.id,
        warehouse_id: warehouseId,
        warehouse_name: warehouseName,
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
    console.error("Error fetching warehouse payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch warehouse payment",
      data: null,
    }
  }
}

async function reverseWarehousePaymentOnTransfers(params: {
  companyId: number
  creditorWarehouseId: number
  payerDeviceId: number
  paymentAmount: number
  storedAllocations?: StoredAllocation[]
  userId: number
}) {
  if (params.storedAllocations?.length) {
    for (let i = params.storedAllocations.length - 1; i >= 0; i--) {
      const alloc = params.storedAllocations[i]
      await reverseTransferPayment(alloc.transferId, alloc.allocatedAmount, params.userId, {
        bulkOnly: true,
      })
    }
    return
  }

  await reverseBulkPaymentsFromTransfers({
    companyId: params.companyId,
    creditorWarehouseId: params.creditorWarehouseId,
    payerDeviceId: params.payerDeviceId,
    reverseAmount: params.paymentAmount,
    userId: params.userId,
  })
}

export async function deleteWarehousePayment(paymentId: number, deviceId: number, userId: number) {
  resetConnectionState()

  try {
    const paymentRows = await sql`
      SELECT *
      FROM financial_transactions
      WHERE id = ${paymentId}
        AND device_id = ${deviceId}
        AND transaction_type = 'warehouse_payment'
      LIMIT 1
    `

    if (paymentRows.length === 0) {
      return { success: false, message: "Payment not found" }
    }

    const payment = paymentRows[0]
    const stored = parseStoredPaymentNotes(payment.notes)
    const paymentAmount = Number(payment.amount || 0)
    const creditorWarehouseId = Number(payment.reference_id)
    const companyId = await getCompanyIdForDevice(deviceId)

    if (!companyId) {
      return { success: false, message: "Warehouse not found" }
    }

    await sql`BEGIN`

    await reverseWarehousePaymentOnTransfers({
      companyId,
      creditorWarehouseId,
      payerDeviceId: deviceId,
      paymentAmount,
      storedAllocations: stored?.allocations,
      userId,
    })

    await sql`
      DELETE FROM financial_transactions
      WHERE id = ${paymentId} AND device_id = ${deviceId}
    `

    await rebuildBulkPaymentNotesForWarehousePair(creditorWarehouseId, deviceId, userId)

    await sql`COMMIT`
    revalidatePath("/dashboard")

    return { success: true, message: "Payment undone successfully" }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Error deleting warehouse payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to undo payment",
    }
  }
}

export async function updateWarehousePayment(data: {
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
        AND transaction_type = 'warehouse_payment'
      LIMIT 1
    `

    if (paymentRows.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Payment not found" }
    }

    const payment = paymentRows[0]
    const stored = parseStoredPaymentNotes(payment.notes)
    const originalAmount = Number(payment.amount || 0)
    const creditorWarehouseId = Number(payment.reference_id)
    const companyId = await getCompanyIdForDevice(data.deviceId)

    if (!companyId) {
      await sql`ROLLBACK`
      return { success: false, message: "Warehouse not found" }
    }

    const warehouseRows = await sql`SELECT name FROM devices WHERE id = ${creditorWarehouseId} LIMIT 1`
    const warehouseName =
      warehouseRows.length > 0 ? warehouseRows[0].name : `Warehouse #${creditorWarehouseId}`

    const hasStoredAllocations = Boolean(stored?.allocations?.length)
    const amountDiff = Number((data.amount - originalAmount).toFixed(2))
    let allocations: WarehousePaymentAllocation[] = stored?.allocations
      ? stored.allocations.map((allocation) => ({
          transferId: allocation.transferId,
          allocatedAmount: allocation.allocatedAmount,
          newStatus: "paid",
          remainingBalance: 0,
        }))
      : []

    if (hasStoredAllocations) {
      if (Math.abs(amountDiff) > 0.01) {
        await reverseWarehousePaymentOnTransfers({
          companyId,
          creditorWarehouseId,
          payerDeviceId: data.deviceId,
          paymentAmount: originalAmount,
          storedAllocations: stored?.allocations,
          userId: data.userId,
        })

        const applied = await applyPaymentToTransfers({
          companyId,
          creditorWarehouseId,
          payerDeviceId: data.deviceId,
          paymentAmount: data.amount,
          paymentMethod: data.paymentMethod,
          userNotes: data.notes,
          userId: data.userId,
        })
        allocations = applied.allocations
      }
    } else if (Math.abs(amountDiff) > 0.01) {
      await reverseBulkPaymentsFromTransfers({
        companyId,
        creditorWarehouseId,
        payerDeviceId: data.deviceId,
        reverseAmount: originalAmount,
        userId: data.userId,
      })

      if (data.amount > 0.01) {
        const applied = await applyPaymentToTransfers({
          companyId,
          creditorWarehouseId,
          payerDeviceId: data.deviceId,
          paymentAmount: data.amount,
          paymentMethod: data.paymentMethod,
          userNotes: data.notes,
          userId: data.userId,
        })
        allocations = applied.allocations
      } else {
        allocations = []
      }
    }

    const finalPaymentDate = new Date(
      data.paymentDate.getTime() - data.paymentDate.getTimezoneOffset() * 60000,
    )

    const storedNotes = JSON.stringify({
      v: 1,
      userNotes: data.notes?.trim() || "",
      allocations: allocations.map((a) => ({
        transferId: a.transferId,
        allocatedAmount: a.allocatedAmount,
      })),
    })

    const description = `Warehouse Payment - ${warehouseName} - ${data.paymentMethod} - ${allocations.length} transfer(s) affected`

    await sql`
      UPDATE financial_transactions
      SET
        amount = ${data.amount},
        received_amount = ${data.amount},
        debit_amount = ${data.amount},
        credit_amount = 0,
        payment_method = ${data.paymentMethod},
        transaction_date = ${finalPaymentDate.toISOString()},
        notes = ${storedNotes},
        description = ${description},
        updated_at = NOW()
      WHERE id = ${data.paymentId}
        AND device_id = ${data.deviceId}
    `

    await rebuildBulkPaymentNotesForWarehousePair(creditorWarehouseId, data.deviceId, data.userId)

    await sql`COMMIT`
    revalidatePath("/dashboard")

    return { success: true, message: "Payment updated successfully" }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("Error updating warehouse payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update payment",
    }
  }
}
