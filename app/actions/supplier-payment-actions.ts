"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { recordSupplierPayment } from "./simplified-accounting"

interface PaymentAllocation {
  purchaseId: number
  allocatedAmount: number
  newStatus: string
  remainingBalance: number
}

export async function paySupplierCredit(
  supplierId: number,
  paymentAmount: number,
  userId: number,
  deviceId: number,
  paymentMethod = "Cash",
  notes?: string,
  paymentDate?: Date,
  creditToApply: number = 0,
) {
  console.log("paySupplierCredit: Starting payment process", {
    supplierId,
    paymentAmount,
    creditToApply,
    userId,
    deviceId,
    paymentMethod,
    paymentDate,
  })

  if (!supplierId || !userId || !deviceId) {
    return { success: false, message: "Missing required parameters" }
  }

  const safeCashAmount = Math.max(Number(paymentAmount) || 0, 0)
  const safeCreditAmount = Math.max(Number(creditToApply) || 0, 0)

  if (safeCashAmount <= 0 && safeCreditAmount <= 0) {
    return { success: false, message: "Please enter a valid credit amount or cash payment amount" }
  }

  resetConnectionState()

  try {
    const transactionResultData = await sql.begin(async (tx: any) => {
      const supplierResult = await tx`
        SELECT * FROM suppliers WHERE id = ${supplierId} AND created_by = ${userId}
      `

      if (supplierResult.length === 0) {
        throw new Error("Supplier not found")
      }

      const supplier = supplierResult[0]

      // 1. Fetch available credit (server-side source-of-truth)
      const summaryRes = await getSupplierCreditSummary(supplierId, userId, tx)
      if (!summaryRes.success || !summaryRes.data) {
        throw new Error("Failed to calculate available supplier credit")
      }
      const availableCredit = summaryRes.data.availableCredit

      // Validate requested credit application against available credit
      if (safeCreditAmount > availableCredit + 0.001) {
        throw new Error(`Requested credit to apply (${safeCreditAmount.toFixed(2)}) exceeds available credit (${availableCredit.toFixed(2)})`)
      }

      // 2. Fetch outstanding credit purchases
      const creditPurchases = await tx`
        SELECT 
          id,
          total_amount,
          received_amount,
          purchase_date,
          status
        FROM purchases
        WHERE TRIM(supplier) = TRIM(${supplier.name})
          AND created_by = ${userId}
          AND device_id = ${deviceId}
          AND status != 'Cancelled'
          AND (total_amount - COALESCE(received_amount, 0)) > 0
        ORDER BY purchase_date ASC, id ASC
      `

      const totalOutstanding = creditPurchases.reduce((sum: number, purchase: any) => {
        return sum + (Number(purchase.total_amount) - Number(purchase.received_amount || 0))
      }, 0)

      // Server-side validation: credit to apply cannot exceed outstanding balance
      if (safeCreditAmount > totalOutstanding + 0.001) {
        throw new Error(`Requested credit to apply (${safeCreditAmount.toFixed(2)}) exceeds outstanding balance (${totalOutstanding.toFixed(2)})`)
      }

      // Cap credit to apply at total outstanding
      const actualCreditApplied = Math.min(safeCreditAmount, totalOutstanding)
      let remainingToAllocateCredit = actualCreditApplied

      const allAllocations: PaymentAllocation[] = []

      let finalPaymentDate: Date
      if (paymentDate) {
        finalPaymentDate = new Date(paymentDate.getTime() - paymentDate.getTimezoneOffset() * 60000)
      } else {
        const now = new Date()
        finalPaymentDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      }

      // 3. Process Credit Application (if any)
      if (actualCreditApplied > 0) {
        for (const purchase of creditPurchases) {
          if (remainingToAllocateCredit <= 0) break

          const currentRec = Number(purchase.received_amount || 0)
          const currentBal = Number(purchase.total_amount) - currentRec
          const alloc = Math.min(remainingToAllocateCredit, currentBal)

          const newRec = currentRec + alloc
          const newBal = Number(purchase.total_amount) - newRec

          purchase.received_amount = newRec

          await tx`
            UPDATE purchases 
            SET received_amount = ${newRec},
                status = ${newBal <= 0.01 ? "Paid" : "Credit"}
            WHERE id = ${purchase.id}
          `

          allAllocations.push({
            purchaseId: purchase.id,
            allocatedAmount: alloc,
            newStatus: newBal <= 0.01 ? "Paid" : "Credit",
            remainingBalance: newBal,
          })

          remainingToAllocateCredit -= alloc
        }

        // Log financial transaction for credit use (NO cash movement)
        const creditNotes = JSON.stringify({
          v: 1,
          userNotes: notes?.trim() || "",
          appliedAmount: actualCreditApplied,
          allocations: allAllocations.map((a) => ({ purchaseId: a.purchaseId, amount: a.allocatedAmount })),
        })

        await tx`
          INSERT INTO financial_transactions (
            transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'supplier_credit_use', 'supplier', ${supplierId},
            ${actualCreditApplied}, ${actualCreditApplied}, 0, 0, 0,
            'Completed', 'Supplier Credit', ${`Supplier Credit Used - ${supplier.name} - Applied to purchase(s)`}, ${creditNotes},
            ${deviceId}, 1, ${userId}, ${finalPaymentDate.toISOString()}
          )
        `
      }

      // 4. Process Cash Payment (if any)
      const remainingOutstandingAfterCredit = Math.max(totalOutstanding - actualCreditApplied, 0)
      const cashApplied = Math.min(safeCashAmount, remainingOutstandingAfterCredit)
      const newExtraCreditCreated = Math.max(safeCashAmount - remainingOutstandingAfterCredit, 0)
      let remainingToAllocateCash = cashApplied

      let cashTransactionId: number | null = null

      if (safeCashAmount > 0) {
        for (const purchase of creditPurchases) {
          if (remainingToAllocateCash <= 0) break

          const currentRec = Number(purchase.received_amount || 0)
          const currentBal = Number(purchase.total_amount) - currentRec
          if (currentBal <= 0.01) continue

          const alloc = Math.min(remainingToAllocateCash, currentBal)
          const newRec = currentRec + alloc
          const newBal = Number(purchase.total_amount) - newRec

          purchase.received_amount = newRec

          await tx`
            UPDATE purchases 
            SET received_amount = ${newRec},
                status = ${newBal <= 0.01 ? "Paid" : "Credit"}
            WHERE id = ${purchase.id}
          `

          allAllocations.push({
            purchaseId: purchase.id,
            allocatedAmount: alloc,
            newStatus: newBal <= 0.01 ? "Paid" : "Credit",
            remainingBalance: newBal,
          })

          remainingToAllocateCash -= alloc
        }

        const debitAmount = safeCashAmount
        const description = newExtraCreditCreated > 0
          ? `Supplier Payment - ${supplier.name} - ${paymentMethod} - Applied: ${cashApplied.toFixed(2)}, Extra Credit: ${newExtraCreditCreated.toFixed(2)}`
          : `Supplier Payment - ${supplier.name} - ${paymentMethod}`

        const storedNotes = JSON.stringify({
          v: 1,
          userNotes: notes?.trim() || "",
          amountApplied: cashApplied,
          extraCredit: newExtraCreditCreated,
          allocations: allAllocations.map((a) => ({ purchaseId: a.purchaseId, allocatedAmount: a.allocatedAmount })),
        })

        const insertResult = await tx`
          INSERT INTO financial_transactions (
            transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'supplier_payment', 'supplier', ${supplierId},
            ${safeCashAmount}, ${safeCashAmount}, 0, ${debitAmount}, 0,
            'Completed', ${paymentMethod}, ${description}, ${storedNotes}, 
            ${deviceId}, 1, ${userId}, ${finalPaymentDate.toISOString()}
          ) RETURNING id
        `
        cashTransactionId = insertResult[0]?.id
      }

      const totalSettled = actualCreditApplied + cashApplied
      const remainingBalance = Math.max(totalOutstanding - totalSettled, 0)
      const finalAvailableCredit = Math.max(availableCredit - actualCreditApplied + newExtraCreditCreated, 0)

      return {
        success: true,
        message: "Payment processed successfully",
        data: {
          totalPaid: safeCashAmount,
          creditUsed: actualCreditApplied,
          amountApplied: totalSettled,
          extraCredit: newExtraCreditCreated,
          remainingCredit: remainingBalance,
          availableCredit: finalAvailableCredit,
          allocations: allAllocations,
          transactionId: cashTransactionId,
        },
      }
    })
    
    revalidatePath("/dashboard")
    return transactionResultData
    
  } catch (error) {
    console.error("paySupplierCredit: Error processing payment:", error)
    
    const err = error as any
    console.error("paySupplierCredit: Error details:", {
      message: err.message || String(error),
      code: err.code,
      detail: err.detail
    })
    
    // If the error was thrown by us (e.g., "Supplier not found")
    if (error instanceof Error && !(error as any).code) {
       return {
         success: false,
         message: err.message
       }
    }
    
    return {
      success: false,
      message: "Payment processing failed. Please try again.",
    }
  }
}

/**
 * FIXED: Get supplier payment by ID from financial_transactions
 * 
 * The table structure uses:
 * - reference_type = 'supplier'
 * - reference_id = supplier_id (NOT a separate supplier_id column!)
 * - description contains the supplier name
 */
export async function getSupplierPaymentById(paymentId: number) {
  try {
    console.log('Fetching supplier payment with ID:', paymentId)
    
    // FIXED: Query without the non-existent supplier_id column
    const payment = await sql`
      SELECT *
      FROM financial_transactions
      WHERE id = ${paymentId}
        AND transaction_type = 'supplier_payment'
      LIMIT 1
    `

    console.log('Payment query result:', payment.length > 0 ? 'Found' : 'Not found')

    if (payment.length === 0) {
      return {
        success: false,
        message: "Payment not found",
        data: null,
      }
    }

    const paymentRecord = payment[0]
    
    // Extract supplier name from description
    // Format: "Supplier Payment - {supplier_name} - {payment_method} - {X} purchase(s) affected"
    const description = paymentRecord.description || ""
    const supplierNameMatch = description.match(/Supplier Payment - (.*?) - /)
    let supplierName = supplierNameMatch ? supplierNameMatch[1] : "Unknown Supplier"
    
    // Extract affected purchases count
    const purchasesMatch = description.match(/(\d+)\s+purchase\(s\)\s+affected/i)
    const affectedPurchases = purchasesMatch ? parseInt(purchasesMatch[1]) : 0

    // CRITICAL: Use reference_id as supplier_id (this is your table structure!)
    const supplierId = paymentRecord.reference_id

    // Optional: Get actual supplier name from suppliers table
    if (supplierId) {
      try {
        const supplierDetails = await sql`
          SELECT name FROM suppliers WHERE id = ${supplierId} LIMIT 1
        `
        if (supplierDetails.length > 0) {
          supplierName = supplierDetails[0].name
          console.log('Found supplier name from suppliers table:', supplierName)
        }
      } catch (error) {
        console.log("Could not fetch supplier details, using name from description")
      }
    }

    const paymentData = {
      id: paymentRecord.id,
      supplier_id: supplierId, // reference_id is the supplier_id!
      supplier_name: supplierName,
      amount: Number(paymentRecord.amount),
      payment_method: paymentRecord.payment_method || "Cash",
      payment_date: paymentRecord.transaction_date,
      notes: paymentRecord.notes,
      description: paymentRecord.description,
      reference_number: `SP-${paymentRecord.id}`,
      affected_purchases: affectedPurchases,
      created_at: paymentRecord.created_at,
      updated_at: paymentRecord.updated_at || paymentRecord.created_at,
      device_id: paymentRecord.device_id,
      user_id: paymentRecord.created_by,
      status: paymentRecord.status || "Completed",
    }

    console.log('Returning payment data:', {
      id: paymentData.id,
      supplier_id: paymentData.supplier_id,
      supplier_name: paymentData.supplier_name,
      amount: paymentData.amount
    })

    return {
      success: true,
      data: paymentData,
    }
  } catch (error) {
    console.error("Error fetching supplier payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch supplier payment",
      data: null,
    }
  }
}

export type SupplierPaymentListRow = {
  id: number
  amount: number
  payment_method: string
  transaction_date: string
  transaction_type: string
  description?: string | null
  notes: string | null
}

export interface SupplierCreditSummary {
  outstandingBalance: number
  originalCredit: number
  refundedCredit: number
  creditUsed: number
  availableCredit: number
}

/**
 * Calculate supplier credit breakdown (outstanding, original credit created, refunded credit, credit used, available credit)
 */
export async function getSupplierCreditSummary(
  supplierId: number,
  userId: number,
  client: any = sql,
): Promise<{ success: boolean; message?: string; data: SupplierCreditSummary }> {
  try {
    const supplierRows = await client`
      SELECT * FROM suppliers WHERE id = ${supplierId} AND created_by = ${userId} LIMIT 1
    `
    if (supplierRows.length === 0) {
      return {
        success: false,
        message: "Supplier not found",
        data: {
          outstandingBalance: 0,
          originalCredit: 0,
          refundedCredit: 0,
          creditUsed: 0,
          availableCredit: 0,
        },
      }
    }
    const supplier = supplierRows[0]

    const purchaseStats = await client`
      SELECT 
        COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN total_amount ELSE 0 END), 0) as total_purchases_amount,
        COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END), 0) as outstanding_balance,
        COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN COALESCE(received_amount, 0) ELSE 0 END), 0) as total_received_on_purchases
      FROM purchases
      WHERE TRIM(supplier) = TRIM(${supplier.name}) AND created_by = ${userId}
    `
    const totalPurchasesAmount = Number(purchaseStats[0]?.total_purchases_amount || 0)
    const outstandingBalance = Math.max(Number(purchaseStats[0]?.outstanding_balance || 0), 0)
    const totalReceivedOnPurchases = Number(purchaseStats[0]?.total_received_on_purchases || 0)

    const transactions = await client`
      SELECT id, amount, transaction_type, description, notes
      FROM financial_transactions
      WHERE reference_id = ${supplierId}
        AND reference_type = 'supplier'
        AND created_by = ${userId}
        AND (status IS NULL OR status != 'Cancelled')
    `

    let originalCredit = 0
    let refundedCredit = 0
    let creditUsed = 0

    for (const tx of transactions) {
      const type = tx.transaction_type
      const amt = Number(tx.amount) || 0

      if (type === "supplier_payment") {
        let extra = 0
        if (tx.notes) {
          try {
            const parsed = JSON.parse(tx.notes)
            if (typeof parsed.extraCredit === "number") {
              extra = parsed.extraCredit
            }
          } catch {
            // Not JSON
          }
        }
        if (extra === 0 && tx.description) {
          const match = tx.description.match(/Supplier Credit:\s*([\d.]+)/i)
          if (match) {
            extra = Number(match[1]) || 0
          }
        }
        originalCredit += Math.max(extra, 0)
      } else if (type === "supplier_refund") {
        refundedCredit += amt
      } else if (type === "supplier_credit_use") {
        creditUsed += amt
      }
    }

    // Fallback for legacy supplier_payment entries created before extraCredit tracking
    const totalPaymentsFromTx = transactions
      .filter((tx: any) => tx.transaction_type === "supplier_payment")
      .reduce((sum: number, tx: any) => sum + (Number(tx.amount) || 0), 0)

    const effectiveTotalPaid = Math.max(totalPaymentsFromTx, totalReceivedOnPurchases)
    const settledPurchases = Math.max(totalPurchasesAmount - outstandingBalance, 0)
    const calculatedOverpayment = Math.max(effectiveTotalPaid - settledPurchases, 0)

    const legacyCredit = Math.max(totalPaymentsFromTx - Math.max(totalReceivedOnPurchases - creditUsed, 0), calculatedOverpayment, 0)

    if (originalCredit < legacyCredit) {
      originalCredit = legacyCredit
    }

    const availableCredit = Math.max(originalCredit - refundedCredit - creditUsed, 0)

    return {
      success: true,
      data: {
        outstandingBalance,
        originalCredit,
        refundedCredit,
        creditUsed,
        availableCredit,
      },
    }
  } catch (error) {
    console.error("Error calculating supplier credit summary:", error)
    return {
      success: false,
      message: "Failed to calculate supplier credit summary",
      data: {
        outstandingBalance: 0,
        originalCredit: 0,
        refundedCredit: 0,
        creditUsed: 0,
        availableCredit: 0,
      },
    }
  }
}

/**
 * Record a Supplier Refund for unused supplier credit
 */
export async function refundSupplierCredit(
  supplierId: number,
  refundAmount: number,
  userId: number,
  deviceId: number,
  paymentMethod = "Cash",
  notes?: string,
  refundDate?: Date,
) {
  console.log("refundSupplierCredit: Starting refund process", {
    supplierId,
    refundAmount,
    userId,
    deviceId,
    paymentMethod,
    refundDate,
  })

  if (!supplierId || !refundAmount || !userId || !deviceId) {
    return { success: false, message: "Missing required parameters" }
  }

  if (refundAmount <= 0) {
    return { success: false, message: "Refund amount must be greater than zero" }
  }

  resetConnectionState()

  try {
    const transactionResultData = await sql.begin(async (tx: any) => {
      const summaryRes = await getSupplierCreditSummary(supplierId, userId, tx)
      if (!summaryRes.success || !summaryRes.data) {
        throw new Error(summaryRes.message || "Failed to calculate available credit")
      }

      const { availableCredit, originalCredit, refundedCredit, creditUsed } = summaryRes.data

      if (refundAmount > availableCredit + 0.001) {
        throw new Error(`Refund amount (${refundAmount.toFixed(2)}) cannot exceed available refundable credit (${availableCredit.toFixed(2)})`)
      }

      const supplierResult = await tx`
        SELECT name FROM suppliers WHERE id = ${supplierId} AND created_by = ${userId} LIMIT 1
      `
      if (supplierResult.length === 0) {
        throw new Error("Supplier not found")
      }
      const supplierName = supplierResult[0].name

      let finalRefundDate: Date
      if (refundDate) {
        finalRefundDate = new Date(refundDate.getTime() - refundDate.getTimezoneOffset() * 60000)
      } else {
        const now = new Date()
        finalRefundDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      }

      const description = `Supplier Refund - ${supplierName} - ${paymentMethod}`
      const storedNotes = JSON.stringify({
        v: 1,
        userNotes: notes?.trim() || "",
        refundAmount,
        originalCredit,
        previousRefunded: refundedCredit,
        creditUsed,
      })

      const insertResult = await tx`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'supplier_refund', 'supplier', ${supplierId},
          ${refundAmount}, ${refundAmount}, 0, 0, ${refundAmount},
          'Completed', ${paymentMethod}, ${description}, ${storedNotes},
          ${deviceId}, 1, ${userId}, ${finalRefundDate.toISOString()}
        ) RETURNING id
      `

      const transactionId = insertResult[0]?.id

      return {
        success: true,
        message: "Supplier credit refund recorded successfully",
        data: {
          transactionId,
          refundAmount,
          remainingAvailableCredit: Math.max(availableCredit - refundAmount, 0),
        },
      }
    })

    revalidatePath("/dashboard")
    return transactionResultData
  } catch (error: any) {
    console.error("refundSupplierCredit error:", error)
    if (error instanceof Error && !(error as any).code) {
      return { success: false, message: error.message }
    }
    return { success: false, message: "Failed to process supplier refund. Please try again." }
  }
}

/**
 * Apply available supplier credit against outstanding purchases
 */
export async function applySupplierCredit(
  supplierId: number,
  creditAmountToApply: number,
  userId: number,
  deviceId: number,
  notes?: string,
  useDate?: Date,
) {
  if (!supplierId || !creditAmountToApply || !userId || !deviceId) {
    return { success: false, message: "Missing required parameters" }
  }

  if (creditAmountToApply <= 0) {
    return { success: false, message: "Credit amount must be greater than zero" }
  }

  resetConnectionState()

  try {
    const transactionResultData = await sql.begin(async (tx: any) => {
      const summaryRes = await getSupplierCreditSummary(supplierId, userId, tx)
      if (!summaryRes.success || !summaryRes.data) {
        throw new Error("Failed to calculate available credit")
      }

      const { availableCredit } = summaryRes.data

      if (creditAmountToApply > availableCredit + 0.001) {
        throw new Error(`Amount to apply (${creditAmountToApply.toFixed(2)}) cannot exceed available credit (${availableCredit.toFixed(2)})`)
      }

      const supplierResult = await tx`
        SELECT name FROM suppliers WHERE id = ${supplierId} AND created_by = ${userId} LIMIT 1
      `
      if (supplierResult.length === 0) {
        throw new Error("Supplier not found")
      }
      const supplierName = supplierResult[0].name

      const creditPurchases = await tx`
        SELECT 
          id, total_amount, received_amount, purchase_date, status
        FROM purchases
        WHERE TRIM(supplier) = TRIM(${supplierName})
          AND created_by = ${userId}
          AND device_id = ${deviceId}
          AND status != 'Cancelled'
          AND (total_amount - COALESCE(received_amount, 0)) > 0
        ORDER BY purchase_date ASC, id ASC
      `

      const totalOutstanding = creditPurchases.reduce((sum: number, purchase: any) => {
        return sum + (Number(purchase.total_amount) - Number(purchase.received_amount || 0))
      }, 0)

      const amountToAllocate = Math.min(creditAmountToApply, totalOutstanding)

      if (amountToAllocate <= 0) {
        throw new Error("No outstanding purchases found to apply credit against")
      }

      let remainingToAllocate = amountToAllocate
      const allocations: PaymentAllocation[] = []

      for (const purchase of creditPurchases) {
        if (remainingToAllocate <= 0) break

        const currentBalance = Number(purchase.total_amount) - Number(purchase.received_amount || 0)
        const allocationAmount = Math.min(remainingToAllocate, currentBalance)
        const newReceivedAmount = Number(purchase.received_amount || 0) + allocationAmount
        const newRemainingBalance = Number(purchase.total_amount) - newReceivedAmount

        await tx`
          UPDATE purchases 
          SET received_amount = ${newReceivedAmount},
              status = ${newRemainingBalance <= 0.01 ? "Paid" : "Credit"}
          WHERE id = ${purchase.id}
        `

        allocations.push({
          purchaseId: purchase.id,
          allocatedAmount: allocationAmount,
          newStatus: newRemainingBalance <= 0.01 ? "Paid" : "Credit",
          remainingBalance: newRemainingBalance,
        })

        remainingToAllocate -= allocationAmount
      }

      let finalUseDate: Date
      if (useDate) {
        finalUseDate = new Date(useDate.getTime() - useDate.getTimezoneOffset() * 60000)
      } else {
        const now = new Date()
        finalUseDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      }

      const description = `Supplier Credit Used - ${supplierName} - ${allocations.length} purchase(s) affected`
      const storedNotes = JSON.stringify({
        v: 1,
        userNotes: notes?.trim() || "",
        appliedAmount: amountToAllocate,
        allocations: allocations.map((a) => ({ purchaseId: a.purchaseId, amount: a.allocatedAmount })),
      })

      const insertResult = await tx`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'supplier_credit_use', 'supplier', ${supplierId},
          ${amountToAllocate}, ${amountToAllocate}, 0, 0, 0,
          'Completed', 'Supplier Credit', ${description}, ${storedNotes},
          ${deviceId}, 1, ${userId}, ${finalUseDate.toISOString()}
        ) RETURNING id
      `

      return {
        success: true,
        message: "Supplier credit applied successfully",
        data: {
          transactionId: insertResult[0]?.id,
          totalPaid: amountToAllocate,
          amountApplied: amountToAllocate,
          remainingAvailableCredit: Math.max(availableCredit - amountToAllocate, 0),
          allocations,
        },
      }
    })

    revalidatePath("/dashboard")
    return transactionResultData
  } catch (error: any) {
    console.error("applySupplierCredit error:", error)
    if (error instanceof Error && !(error as any).code) {
      return { success: false, message: error.message }
    }
    return { success: false, message: "Failed to apply supplier credit. Please try again." }
  }
}

/**
 * List supplier financial records (payments, refunds, credit usage) for a supplier.
 */
export async function listSupplierPaymentsForSupplier(
  supplierId: number,
  deviceId: number,
  userId: number,
): Promise<{ success: boolean; message?: string; data: SupplierPaymentListRow[] }> {
  if (!supplierId || !deviceId || !userId) {
    return { success: false, message: "Missing required parameters", data: [] }
  }

  resetConnectionState()

  try {
    const rows = await sql`
      SELECT id, amount, payment_method, transaction_date, transaction_type, notes, description
      FROM financial_transactions
      WHERE reference_id = ${supplierId}
        AND reference_type = 'supplier'
        AND transaction_type IN ('supplier_payment', 'supplier_refund', 'supplier_credit_use')
        AND device_id = ${deviceId}
        AND created_by = ${userId}
        AND (status IS NULL OR status != 'Cancelled')
      ORDER BY transaction_date DESC, id DESC
    `

    const data: SupplierPaymentListRow[] = rows.map((r: any) => ({
      id: r.id,
      amount: Number(r.amount) || 0,
      payment_method: r.payment_method || "Cash",
      transaction_date: r.transaction_date,
      transaction_type: r.transaction_type || "supplier_payment",
      description: r.description ?? null,
      notes: r.notes ?? null,
    }))

    return { success: true, data }
  } catch (error) {
    console.error("Error listing supplier payments:", error)
    return {
      success: false,
      message: getLastError()?.message || "Failed to list supplier payments",
      data: [],
    }
  }
}

/**
 * FIXED: Delete supplier payment from financial_transactions
 */
export async function deleteSupplierPayment(paymentId: number, deviceId: number) {
  try {
    console.log('Deleting supplier payment:', paymentId, 'for device:', deviceId)
    
    const payment = await sql`
      SELECT * FROM financial_transactions
      WHERE id = ${paymentId} 
        AND device_id = ${deviceId}
        AND transaction_type = 'supplier_payment'
    `

    if (payment.length === 0) {
      return {
        success: false,
        message: "Payment not found",
      }
    }

    // FIXED: Get supplier_id from reference_id
    const supplierId = payment[0].reference_id
    const amount = Number(payment[0].amount)

    if (!supplierId) {
      return {
        success: false,
        message: "Invalid supplier ID",
      }
    }

    console.log('Reversing payment:', { supplierId, amount })

    // await sql`BEGIN`

    try {
      // Get supplier name
      const supplierResult = await sql`
        SELECT name FROM suppliers WHERE id = ${supplierId} LIMIT 1
      `
      
      const supplierName = supplierResult.length > 0 ? supplierResult[0].name : null

      if (!supplierName) {
        // await sql`ROLLBACK`
        return {
          success: false,
          message: "Supplier not found",
        }
      }

      // Find affected purchases to restore their balances
      const purchases = await sql`
        SELECT 
          id, 
          total_amount, 
          received_amount,
          status
        FROM purchases
        WHERE TRIM(supplier) = TRIM(${supplierName})
        AND device_id = ${deviceId}
        AND status IN ('Paid', 'Credit')
        ORDER BY purchase_date ASC
      `

      console.log('Found purchases to potentially restore:', purchases.length)

      // Restore purchase balances by reducing received_amount
      let remainingAmount = amount
      
      for (const purchase of purchases) {
        if (remainingAmount <= 0) break
        
        const currentReceived = Number(purchase.received_amount) || 0
        const totalAmount = Number(purchase.total_amount)
        
        // Can only reverse up to what was received
        const amountToReverse = Math.min(remainingAmount, currentReceived)
        
        if (amountToReverse > 0) {
          const newReceivedAmount = currentReceived - amountToReverse
          const newBalance = totalAmount - newReceivedAmount
          
          // Determine new status
          let newStatus = 'Credit'
          if (newReceivedAmount <= 0) {
            newStatus = 'Credit'
          } else if (newBalance <= 0.01) {
            newStatus = 'Paid'
          } else {
            newStatus = 'Credit'
          }
          
          console.log(`Reversing purchase ${purchase.id}: ${currentReceived} -> ${newReceivedAmount}, status: ${newStatus}`)
          
          await sql`
            UPDATE purchases
            SET 
              received_amount = ${newReceivedAmount},
              status = ${newStatus}
            WHERE id = ${purchase.id}
          `
          
          remainingAmount -= amountToReverse
        }
      }

      // Delete the payment transaction
      await sql`
        DELETE FROM financial_transactions
        WHERE id = ${paymentId} AND device_id = ${deviceId}
      `

      // await sql`COMMIT`

      console.log('Supplier payment deleted successfully')

      revalidatePath("/dashboard")
      revalidatePath("/dashboard?tab=accounting")
      
      return {
        success: true,
        message: "Supplier payment deleted successfully",
      }
    } catch (error) {
      // await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Error deleting supplier payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete supplier payment",
    }
  }
}

/**
 * FIXED: Update supplier payment in financial_transactions
 * This handles changes to amount, payment method, date, and notes
 * 
 * CRITICAL FIX: Now updates debit_amount and credit_amount to ensure 
 * the accounting tab displays "Spend" and "Net Impact" correctly
 */
export async function updateSupplierPayment(data: {
  paymentId: number
  amount: number
  paymentMethod: string
  paymentDate: Date
  notes?: string
  deviceId: number
  userId: number
}) {
  try {
    console.log('Updating supplier payment:', data.paymentId)
    
    resetConnectionState()
    
    // Validate inputs
    if (!data.paymentId || !data.deviceId || !data.userId) {
      return {
        success: false,
        message: "Missing required parameters",
      }
    }

    if (data.amount <= 0) {
      return {
        success: false,
        message: "Payment amount must be greater than zero",
      }
    }

    // await sql`BEGIN`

    try {
      // Get the original payment
      const originalPayment = await sql`
        SELECT * FROM financial_transactions
        WHERE id = ${data.paymentId} 
          AND device_id = ${data.deviceId}
          AND transaction_type = 'supplier_payment'
      `

      if (originalPayment.length === 0) {
        // await sql`ROLLBACK`
        return {
          success: false,
          message: "Payment not found",
        }
      }

      const payment = originalPayment[0]
      const originalAmount = Number(payment.amount)
      const newAmount = Number(data.amount)
      const amountDifference = newAmount - originalAmount

      console.log('Payment update details:', {
        originalAmount,
        newAmount,
        amountDifference,
        supplierId: payment.reference_id
      })

      // Get supplier details using reference_id
      const supplierId = payment.reference_id
      
      if (!supplierId) {
        // await sql`ROLLBACK`
        return {
          success: false,
          message: "Invalid supplier ID in payment record",
        }
      }

      const supplierResult = await sql`
        SELECT name FROM suppliers WHERE id = ${supplierId} LIMIT 1
      `
      
      if (supplierResult.length === 0) {
        // await sql`ROLLBACK`
        return {
          success: false,
          message: "Supplier not found",
        }
      }

      const supplierName = supplierResult[0].name

      // If amount changed, we need to adjust purchase balances
      if (amountDifference !== 0) {
        console.log(`Amount changed by ${amountDifference}, adjusting purchase balances...`)

        // Get affected purchases
        const purchases = await sql`
          SELECT 
            id, 
            total_amount, 
            received_amount,
            status,
            purchase_date
          FROM purchases
          WHERE TRIM(supplier) = TRIM(${supplierName})
            AND device_id = ${data.deviceId}
            AND status IN ('Paid', 'Credit')
          ORDER BY purchase_date ASC
        `

        if (amountDifference > 0) {
          // Increase payment - need to allocate additional amount
          console.log(`Allocating additional ${amountDifference} to purchases`)
          
          let remainingToAllocate = amountDifference
          
          for (const purchase of purchases) {
            if (remainingToAllocate <= 0) break
            
            const totalAmount = Number(purchase.total_amount)
            const currentReceived = Number(purchase.received_amount) || 0
            const currentBalance = totalAmount - currentReceived
            
            // Can only allocate up to the remaining balance
            const allocationAmount = Math.min(remainingToAllocate, currentBalance)
            
            if (allocationAmount > 0) {
              const newReceivedAmount = currentReceived + allocationAmount
              const newBalance = totalAmount - newReceivedAmount
              
              // Determine new status
              const newStatus = newBalance <= 0.01 ? 'Paid' : 'Credit'
              
              console.log(`Allocating ${allocationAmount} to purchase ${purchase.id}: ${currentReceived} -> ${newReceivedAmount}, status: ${newStatus}`)
              
              await sql`
                UPDATE purchases
                SET 
                  received_amount = ${newReceivedAmount},
                  status = ${newStatus}
                WHERE id = ${purchase.id}
              `
              
              remainingToAllocate -= allocationAmount
            }
          }
          
          if (remainingToAllocate > 0) {
            console.log(`Unallocated payment amount of ${remainingToAllocate} recorded as excess supplier credit.`)
          }
        } else {
          // Decrease payment - need to reverse allocation
          console.log(`Reversing ${Math.abs(amountDifference)} from purchases`)
          
          let remainingToReverse = Math.abs(amountDifference)
          
          // Reverse from most recently paid purchases first (reverse order)
          for (let i = purchases.length - 1; i >= 0; i--) {
            if (remainingToReverse <= 0) break
            
            const purchase = purchases[i]
            const totalAmount = Number(purchase.total_amount)
            const currentReceived = Number(purchase.received_amount) || 0
            
            // Can only reverse up to what was received
            const reversalAmount = Math.min(remainingToReverse, currentReceived)
            
            if (reversalAmount > 0) {
              const newReceivedAmount = currentReceived - reversalAmount
              const newBalance = totalAmount - newReceivedAmount
              
              // Determine new status
              let newStatus = 'Credit'
              if (newReceivedAmount <= 0) {
                newStatus = 'Credit'
              } else if (newBalance <= 0.01) {
                newStatus = 'Paid'
              }
              
              console.log(`Reversing ${reversalAmount} from purchase ${purchase.id}: ${currentReceived} -> ${newReceivedAmount}, status: ${newStatus}`)
              
              await sql`
                UPDATE purchases
                SET 
                  received_amount = ${newReceivedAmount},
                  status = ${newStatus}
                WHERE id = ${purchase.id}
              `
              
              remainingToReverse -= reversalAmount
            }
          }
        }
      }

      // Format the payment date (handle timezone)
      const finalPaymentDate = new Date(data.paymentDate.getTime() - data.paymentDate.getTimezoneOffset() * 60000)

      // Count affected purchases for description
      const affectedPurchases = await sql`
        SELECT COUNT(*) as count
        FROM purchases
        WHERE TRIM(supplier) = TRIM(${supplierName})
          AND device_id = ${data.deviceId}
          AND status IN ('Paid', 'Credit')
          AND received_amount > 0
      `
      
      const purchaseCount = affectedPurchases[0]?.count || 0

      // Build updated description
      const updatedDescription = `Supplier Payment - ${supplierName} - ${data.paymentMethod} - ${purchaseCount} purchase(s) affected`

      // ✅ CRITICAL FIX: Update ALL financial fields including debit_amount and credit_amount
      // This ensures the accounting tab displays Spend and Net Impact correctly
      await sql`
        UPDATE financial_transactions
        SET 
          amount = ${newAmount},
          debit_amount = ${newAmount},
          credit_amount = 0,
          payment_method = ${data.paymentMethod},
          transaction_date = ${finalPaymentDate},
          notes = ${data.notes || null},
          description = ${updatedDescription},
          updated_at = NOW()
        WHERE id = ${data.paymentId}
          AND device_id = ${data.deviceId}
      `

      // await sql`COMMIT`

      console.log('Supplier payment updated successfully - all financial fields synchronized')

      // Revalidate paths to clear cache
      revalidatePath("/dashboard")
      revalidatePath("/dashboard?tab=accounting")
      revalidatePath("/", "layout")
      
      return {
        success: true,
        message: "Supplier payment updated successfully",
        data: {
          paymentId: data.paymentId,
          oldAmount: originalAmount,
          newAmount: newAmount,
          amountDifference: amountDifference,
        }
      }
    } catch (error) {
      // await sql`ROLLBACK`
      throw error
    }
  } catch (error) {
    console.error("Error updating supplier payment:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update supplier payment",
    }
  }
}
