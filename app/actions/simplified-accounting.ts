"use server"

import { format, addDays, parseISO } from "date-fns"
import { getDeviceCompanyId } from "@/lib/device-company"
import { sql } from "@/lib/db"
import { getAuthoritativeProfitSummary } from "@/lib/profit-calculation"
import { ensureDateTime } from "@/lib/utils"

// Record supplier payment transaction
export async function recordSupplierPayment(paymentData: {
  supplierId: number
  supplierName: string
  paymentAmount: number
  paymentMethod: string
  allocations: any[]
  deviceId: number
  userId: number
  paymentDate: Date
  notes?: string
}) {
  try {
    console.log("Recording supplier payment transaction:", {
      supplierId: paymentData.supplierId,
      supplierName: paymentData.supplierName,
      paymentAmount: paymentData.paymentAmount,
      paymentMethod: paymentData.paymentMethod,
      deviceId: paymentData.deviceId,
      userId: paymentData.userId,
      notes: paymentData.notes,
    })

    // For supplier payments: debit = payment amount (money going out), credit = 0
    const paymentAmount = Number(paymentData.paymentAmount) || 0
    const debitAmount = paymentAmount // Cash going out to pay supplier
    const creditAmount = 0 // No income from this transaction

    // Create detailed description including allocations and notes
    const purchaseAllocations = (paymentData.allocations || []).filter((a: any) => Number(a.allocatedAmount || a.amount || 0) > 0)
    const allocationSummary = purchaseAllocations.length > 0
      ? purchaseAllocations.map((a: any) => `Purchase #${a.purchaseId || a.purchase_id}: ${Number(a.allocatedAmount || a.amount || 0).toFixed(2)}`).join(", ")
      : ""

    let description = `Supplier Payment - ${paymentData.supplierName} - ${paymentData.paymentMethod}`
    if (allocationSummary) {
      description += ` - [${allocationSummary}]`
    }
    if (paymentData.notes && paymentData.notes.trim()) {
      description += ` - Notes: ${paymentData.notes.trim()}`
    }

    const storedNotes = JSON.stringify({
      v: 1,
      userNotes: paymentData.notes?.trim() || "",
      allocations: purchaseAllocations.map((a: any) => ({
        purchaseId: a.purchaseId || a.purchase_id,
        allocatedAmount: Number(a.allocatedAmount || a.amount || 0),
      })),
    })

    const finalPaymentDate = ensureDateTime(paymentData.paymentDate)

    // Insert the supplier payment transaction
    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'supplier_payment', 'supplier', ${paymentData.supplierId},
        ${paymentAmount}, ${paymentAmount}, 0, ${debitAmount}, ${creditAmount},
        'Completed', ${paymentData.paymentMethod}, ${description}, ${storedNotes}, 
        ${paymentData.deviceId}, ${await getDeviceCompanyId(paymentData.deviceId)}, ${paymentData.userId}, ${finalPaymentDate.toISOString()}
      ) RETURNING id
    `

    console.log(`Supplier payment transaction recorded successfully: ID ${result[0]?.id}`)
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording supplier payment transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function recordCustomerPayment(paymentData: {
  customerId: number
  customerName: string
  paymentAmount: number
  costAmount: number
  paymentMethod: string
  allocations: Array<{ saleId: number; allocatedAmount: number }>
  deviceId: number
  userId: number
  paymentDate: Date
  notes?: string
}) {
  try {
    const paymentAmount = Number(paymentData.paymentAmount) || 0
    const costAmount = Number(paymentData.costAmount) || 0
    const debitAmount = 0
    const creditAmount = paymentAmount

    const allocationSummary = paymentData.allocations && paymentData.allocations.length > 0
      ? paymentData.allocations.map((a) => `Sale #${a.saleId}: ${Number(a.allocatedAmount).toFixed(2)}`).join(", ")
      : ""

    let description = `Customer Payment - ${paymentData.customerName} - ${paymentData.paymentMethod}`
    if (allocationSummary) {
      description += ` - [${allocationSummary}]`
    }
    if (paymentData.notes?.trim()) {
      description += ` - Notes: ${paymentData.notes.trim()}`
    }

    const companyId = await getDeviceCompanyId(paymentData.deviceId)

    const storedNotes = JSON.stringify({
      v: 1,
      userNotes: paymentData.notes?.trim() || "",
      allocations: paymentData.allocations.map((a) => ({
        saleId: a.saleId,
        allocatedAmount: a.allocatedAmount,
      })),
    })

    const finalPaymentDate = ensureDateTime(paymentData.paymentDate)

    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'customer_payment', 'customer', ${paymentData.customerId},
        ${paymentAmount}, ${paymentAmount}, ${costAmount}, ${debitAmount}, ${creditAmount},
        'Completed', ${paymentData.paymentMethod}, ${description}, ${storedNotes},
        ${paymentData.deviceId}, ${companyId}, ${paymentData.userId}, ${finalPaymentDate.toISOString()}
      ) RETURNING id
    `

    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording customer payment transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function recordWarehousePayment(paymentData: {
  warehouseId: number
  warehouseName: string
  paymentAmount: number
  paymentMethod: string
  allocations: Array<{ transferId: number; allocatedAmount: number }>
  deviceId: number
  userId: number
  paymentDate: Date
  notes?: string
}) {
  try {
    const paymentAmount = Number(paymentData.paymentAmount) || 0
    const debitAmount = paymentAmount
    const creditAmount = 0

    let description = `Warehouse Payment - ${paymentData.warehouseName} - ${paymentData.paymentMethod} - ${paymentData.allocations.length} transfer(s) affected`
    if (paymentData.notes?.trim()) {
      description += ` - Notes: ${paymentData.notes.trim()}`
    }

    const companyId = await getDeviceCompanyId(paymentData.deviceId)

    const storedNotes = JSON.stringify({
      v: 1,
      userNotes: paymentData.notes?.trim() || "",
      allocations: paymentData.allocations.map((a) => ({
        transferId: a.transferId,
        allocatedAmount: a.allocatedAmount,
      })),
    })

    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'warehouse_payment', 'warehouse', ${paymentData.warehouseId},
        ${paymentAmount}, ${paymentAmount}, 0, ${debitAmount}, ${creditAmount},
        'Completed', ${paymentData.paymentMethod}, ${description}, ${storedNotes},
        ${paymentData.deviceId}, ${companyId}, ${paymentData.userId}, ${paymentData.paymentDate.toISOString()}
      ) RETURNING id
    `

    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording warehouse payment transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// FIXED: Create a comprehensive transaction entry for sales - PROPER partial credit sale handling
export async function recordSaleTransaction(saleData: {
  saleId: number
  totalAmount: number
  cogsAmount: number
  receivedAmount: number
  outstandingAmount: number
  status: string
  paymentMethod: string
  deviceId: number
  userId: number
  customerId?: number | null
  saleDate?: Date
  productCreditAmount?: number
  payments?: Array<{ paymentMethod: string; amount: number; referenceNumber?: string; notes?: string }>
}) {
  try {
    console.log("Recording sale transaction with data:", {
      saleId: saleData.saleId,
      totalAmount: saleData.totalAmount,
      cogsAmount: saleData.cogsAmount,
      receivedAmount: saleData.receivedAmount,
      status: saleData.status,
      deviceId: saleData.deviceId,
      userId: saleData.userId,
      saleDate: saleData.saleDate,
      paymentsCount: saleData.payments?.length || 0
    })

    // Validate required fields
    if (!saleData.saleId || !saleData.deviceId || !saleData.userId) {
      console.error("Missing required fields:", {
        saleId: saleData.saleId,
        deviceId: saleData.deviceId,
        userId: saleData.userId,
      })
      return { success: false, error: "Missing required fields: saleId, deviceId, or userId" }
    }

    // Clear existing financial_transactions for this sale to avoid duplicate ledger entries
    await sql`
      DELETE FROM financial_transactions
      WHERE transaction_type = 'sale' AND reference_type = 'sale' AND reference_id = ${saleData.saleId}
    `

    // Calculate accounting values based on sale status
    let debitAmount = 0
    let creditAmount = 0
    let costAmount = 0
    let description = ""
    const totalAmount = Number(saleData.totalAmount) || 0
    const receivedAmount = Number(saleData.receivedAmount) || 0
    const productCredit =
      saleData.productCreditAmount != null ? Number(saleData.productCreditAmount) || 0 : null
    const hasShippingSplit =
      productCredit != null && totalAmount > 0 && productCredit < totalAmount
    const productBillAmount = hasShippingSplit ? productCredit : totalAmount

    const isPaidOrCompleted =
      saleData.status === "Completed" ||
      saleData.status === "Paid" ||
      (totalAmount > 0 && receivedAmount >= totalAmount)

    // For partial payments, record exactly the money received (never dilute with fractional courier ratios)
    const productReceived = isPaidOrCompleted
      ? (hasShippingSplit ? productCredit : receivedAmount)
      : (hasShippingSplit ? Math.min(receivedAmount, productCredit) : receivedAmount)

    let receivedAmountForRecord = productReceived

    if (saleData.status === "Cancelled") {
      debitAmount = Number(saleData.receivedAmount) || 0
      creditAmount = 0
      costAmount = 0
      receivedAmountForRecord = 0
      description = `Sale #${saleData.saleId} - Cancelled - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"}`
    } else if (saleData.status === "Credit" || saleData.status === "Partial" || saleData.status === "Pending") {
      creditAmount = productReceived
      debitAmount = 0

      if (productReceived > 0 && productBillAmount > 0) {
        const paymentRatio = productReceived / productBillAmount
        costAmount = (Number(saleData.cogsAmount) || 0) * paymentRatio
      } else {
        costAmount = 0
      }

      description = `Sale #${saleData.saleId} - ${saleData.status} - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"} - Received: ${receivedAmountForRecord}`
    } else {
      creditAmount = hasShippingSplit ? productCredit : receivedAmount
      debitAmount = 0
      costAmount = Number(saleData.cogsAmount) || 0
      description = `Sale #${saleData.saleId} - Completed - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"}`
    }

    const isCod = (m?: string | null) => {
      const s = (m || "").toUpperCase().trim()
      return s === "COD" || s === "CASH ON DELIVERY"
    }

    const activePayments = Array.isArray(saleData.payments)
      ? saleData.payments.filter((p) => Number(p.amount) > 0)
      : []

    // If no money entered or left the business (e.g. 100% credit or zero down), do NOT create dummy transactions
    if (saleData.status !== "Cancelled" && receivedAmountForRecord <= 0 && activePayments.length === 0) {
      console.log(`Sale #${saleData.saleId} recorded with 0 cash received: skipped financial_transactions entry (tracked under Receivables)`)
      return { success: true, transactionId: null, message: "No cash received, skipped transaction entry" }
    }

    let lastInsertedId: number | undefined

    if (activePayments.length > 1) {
      // Create separate ledger entry for each payment method in split payment
      const totalSplitPaid = activePayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

      for (const p of activePayments) {
        const pAmt = Number(p.amount) || 0
        if (pAmt <= 0) continue

        const isThisCod = isCod(p.paymentMethod)
        if (isThisCod && (saleData.status === "Partial" || saleData.status === "Credit" || saleData.status === "Pending")) {
          // COD uncollected portion does not enter transaction ledger yet
          continue
        }

        const pCreditAmount = pAmt
        const pReceived = pAmt
        const pDebitAmount = 0
        const pCostAmount = productBillAmount > 0
          ? (pAmt / productBillAmount) * (Number(saleData.cogsAmount) || 0)
          : 0

        const refStr = p.referenceNumber ? ` (Ref: ${p.referenceNumber})` : ""
        const pDesc = `Sale #${saleData.saleId} - ${p.paymentMethod} Payment${refStr} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"}`

        const res = await sql`
          INSERT INTO financial_transactions (
            transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'sale', 'sale', ${saleData.saleId},
            ${pAmt.toFixed(2)}, ${pReceived.toFixed(2)}, ${pCostAmount.toFixed(2)}, ${pDebitAmount.toFixed(2)}, ${pCreditAmount.toFixed(2)},
            ${saleData.status}, ${p.paymentMethod || "Cash"}, ${pDesc}, 
            ${saleData.deviceId}, ${await getDeviceCompanyId(saleData.deviceId)}, ${saleData.userId}, ${saleData.saleDate}
          ) RETURNING id
        `
        lastInsertedId = res[0]?.id
      }
    } else {
      // Only insert if money actually came in or out (e.g. cancellation refund)
      if (creditAmount > 0 || debitAmount > 0) {
        const pm = activePayments[0]?.paymentMethod || saleData.paymentMethod || "Cash"
        const res = await sql`
          INSERT INTO financial_transactions (
            transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'sale', 'sale', ${saleData.saleId},
            ${productBillAmount}, ${receivedAmountForRecord}, ${costAmount}, ${debitAmount}, ${creditAmount},
            ${saleData.status}, ${pm}, ${description}, 
            ${saleData.deviceId}, ${await getDeviceCompanyId(saleData.deviceId)}, ${saleData.userId}, ${saleData.saleDate}
          ) RETURNING id
        `
        lastInsertedId = res[0]?.id
      }
    }

    console.log(`Sale transaction recorded successfully: ID ${lastInsertedId}`, {
      status: saleData.status,
      creditAmount,
      receivedAmount: receivedAmountForRecord,
      totalAmount: saleData.totalAmount,
      costAmount
    })
    return { success: true, transactionId: lastInsertedId }
  } catch (error) {
    console.error("Error recording sale transaction:", error)
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code,
      detail: (error as { detail?: string }).detail,
      saleData: {
        saleId: saleData.saleId,
        deviceId: saleData.deviceId,
        userId: saleData.userId,
        totalAmount: saleData.totalAmount,
      },
    })
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// FIXED: Record sale adjustments (edits, cancellations, payments) - PROPER partial credit sale payment handling
export async function recordSaleAdjustment(adjustmentData: {
  saleId: number
  changeType: "edit" | "cancel" | "payment" | "status_change" | "consolidated_edit"
  previousValues: any
  newValues: any
  deviceId: number
  userId: number
  description: string
  adjustmentDate?: Date
}) {
  try {
    // Ensure table exists
    // Calculate the differences
    const previousAmount = Number(adjustmentData.previousValues.totalAmount) || 0
    const newAmount = Number(adjustmentData.newValues.totalAmount) || 0
    const amountDiff = newAmount - previousAmount

    const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
    const newReceived = Number(adjustmentData.newValues.receivedAmount) || 0
    const receivedDiff = newReceived - previousReceived

    const previousCogs = Number(adjustmentData.previousValues.cogsAmount) || 0
    const newCogs = Number(adjustmentData.newValues.cogsAmount) || 0
    const cogsDiff = newCogs - previousCogs

    // Handle discount changes
    const previousDiscount = Number(adjustmentData.previousValues.discount) || 0
    const newDiscount = Number(adjustmentData.newValues.discount) || 0
    const discountDiff = newDiscount - previousDiscount

    let debitAmount = 0
    let creditAmount = 0
    let description = adjustmentData.description
    let status = "Adjustment"
    let costAmount = 0 // Default to 0 for adjustments

    if (adjustmentData.changeType === "consolidated_edit") {
      // FIXED: Handle received amount changes - For credit sales, record actual money received with proportional COGS
      const previousStatus = adjustmentData.previousValues.status?.toLowerCase() || ""
      const newStatus = adjustmentData.newValues.status?.toLowerCase() || ""

      // When a completed sale gets a discount, received drops by the same amount — record once
      const discountMirrorsReceived =
        discountDiff !== 0 && Math.abs(receivedDiff + discountDiff) < 0.01

      // Handle discount changes (revenue reduction / reversal)
      if (discountDiff !== 0) {
        console.log(`Discount change detected: ${previousDiscount} → ${newDiscount} (diff: ${discountDiff})`)

        if (discountDiff > 0) {
          debitAmount += discountDiff
        } else {
          creditAmount += Math.abs(discountDiff)
        }
      }

      // Special handling for CREDIT / PARTIAL SALES - record cash when money is actually received with proportional COGS
      if ((previousStatus === "credit" || previousStatus === "partial") && receivedDiff > 0) {
        // Payment received for credit sale: credit = received amount increase, cost = proportional COGS
        creditAmount += receivedDiff
        const paymentRatio = receivedDiff / newAmount
        costAmount = newCogs * paymentRatio // Only recognize COGS for the portion paid
        
        console.log(`Credit sale payment: Received ${receivedDiff}, COGS recognized: ${costAmount}`)
      } else if (!discountMirrorsReceived && receivedDiff > 0 && newStatus !== "credit") {
        // More money received for non-credit sales: credit = received amount increase
        creditAmount += receivedDiff
        costAmount = cogsDiff
      } else if (!discountMirrorsReceived && receivedDiff < 0) {
        // Money refunded: debit = received amount decrease
        debitAmount += Math.abs(receivedDiff)
        if (cogsDiff !== 0) {
          costAmount = -Math.abs(cogsDiff) // Reverse COGS for refunds
        }
      }

      // Handle status changes for COGS and returns
      // Special handling for RETURNS (completed -> cancelled)
      if (previousStatus === "completed" && newStatus === "cancelled") {
        // This is a RETURN - include negative COGS to reverse the original cost
        costAmount = -previousCogs

        // For returns, we need to refund the full received amount
        const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
        if (previousReceived > 0) {
          debitAmount = previousReceived // Full refund
          creditAmount = 0 // No income from return
        }

        console.log(
          `Processing RETURN: Sale #${adjustmentData.saleId} - Refunding ${previousReceived}, Reversing COGS ${previousCogs}`,
        )
      } else if (previousStatus === "cancelled" && newStatus !== "cancelled") {
        // Changing from cancelled to active status - include COGS
        costAmount = newCogs
      } else if (previousStatus !== "cancelled" && newStatus === "cancelled") {
        // Changing to cancelled (but not from completed) - include negative COGS
        costAmount = -previousCogs
      }

      // Update description to show actual changes and returns
      const descriptionParts = [`Sale #${adjustmentData.saleId} - Updated`]

      // Special description for returns
      if (previousStatus === "completed" && newStatus === "cancelled") {
        descriptionParts[0] = `Sale #${adjustmentData.saleId} - RETURNED`
        descriptionParts.push(`Full refund processed`)
        descriptionParts.push(`COGS reversed: ${previousCogs}`)
      } else if (previousStatus === "credit" && receivedDiff > 0) {
        descriptionParts[0] = `Sale #${adjustmentData.saleId} - Credit Payment Received`
        descriptionParts.push(`Payment: ${receivedDiff}`)
        descriptionParts.push(`COGS recognized: ${costAmount}`)
      } else {
        // Only add discount change to description if there's an actual change
        if (discountDiff !== 0) {
          const changeText = discountDiff > 0 ? `+${discountDiff}` : `${discountDiff}`
          descriptionParts.push(`Discount change: ${changeText}`)
        }

        if (previousStatus !== newStatus) {
          descriptionParts.push(`Status: ${previousStatus} → ${newStatus}`)
        }
      }

      description = descriptionParts.join(" | ")
      status = previousStatus === "completed" && newStatus === "cancelled" ? "Returned" : "Updated"

      // Always create a transaction for returns or if there are any changes
      console.log(
        `Sale adjustment summary: Debit=${debitAmount}, Credit=${creditAmount}, Cost=${costAmount}, Status=${status}`,
      )
    } else if (adjustmentData.changeType === "payment") {
      // FIXED: Payment adjustments for credit sales - record actual money received with proportional COGS
      if (receivedDiff > 0) {
        const previousStatus = adjustmentData.previousValues.status?.toLowerCase() || ""
        
        if (previousStatus === "credit" || previousStatus === "partial") {
          // Credit sale payment: record cash received with proportional COGS
          creditAmount = receivedDiff
          debitAmount = 0
          const paymentRatio = receivedDiff / adjustmentData.newValues.totalAmount
          costAmount = adjustmentData.newValues.cogsAmount * paymentRatio
          status = "Credit Payment"
          description = `Sale #${adjustmentData.saleId} - Credit Payment - Received ${receivedDiff} - COGS ${costAmount}`
        } else {
          // Regular payment
          creditAmount = receivedDiff
          debitAmount = 0
          costAmount = 0
          status = "Payment"
          description = `Sale #${adjustmentData.saleId} - Payment - Received ${receivedDiff}`
        }
      } else if (receivedDiff < 0) {
        debitAmount = Math.abs(receivedDiff)
        creditAmount = 0
        costAmount = -Math.abs(cogsDiff) // Reverse COGS for refunds
        status = "Payment Reduction"
        description = `Sale #${adjustmentData.saleId} - Payment Reduction - Refund ${Math.abs(receivedDiff)}`
      } else {
        return { success: true, transactionId: null, message: "No payment changes to record" }
      }
    } else if (adjustmentData.changeType === "cancel") {
      // Cancelled sales: debit = previous received amount (refund money going out)
      const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
      debitAmount = previousReceived
      creditAmount = 0
      costAmount = -previousCogs // Negative COGS for cancellation
      status = "Cancelled"
      description = `Sale #${adjustmentData.saleId} - Cancelled - Refund ${previousReceived} - COGS Reversed ${previousCogs}`
    } else {
      // Edit adjustments: handle based on received amount change
      if (receivedDiff > 0) {
        creditAmount = receivedDiff
        debitAmount = 0
        status = "Edit"
        description = `Sale #${adjustmentData.saleId} - Edited - Payment increased by ${receivedDiff}`
      } else if (receivedDiff < 0) {
        debitAmount = Math.abs(receivedDiff)
        creditAmount = 0
        status = "Edit"
        description = `Sale #${adjustmentData.saleId} - Edited - Payment decreased by ${Math.abs(receivedDiff)}`
      } else {
        return { success: true, transactionId: null, message: "No changes to record" }
      }
    }

    // Ensure adjustmentDate is not null
    const transactionDate = adjustmentData.adjustmentDate || new Date()

    // Only create adjustment if there are actual financial changes
    if (debitAmount !== 0 || creditAmount !== 0 || costAmount !== 0) {
      // Insert adjustment transaction
      const result = await sql`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'adjustment', 'sale', ${adjustmentData.saleId},
          ${amountDiff}, ${receivedDiff}, ${costAmount}, ${debitAmount}, ${creditAmount},
          ${status}, ${description}, 
          ${adjustmentData.deviceId}, ${await getDeviceCompanyId(adjustmentData.deviceId)}, ${adjustmentData.userId}, ${transactionDate}
        ) RETURNING id
      `

      console.log(`Sale adjustment recorded: ${adjustmentData.changeType} for sale ${adjustmentData.saleId}`)
      return { success: true, transactionId: result[0]?.id }
    } else {
      return { success: true, transactionId: null, message: "No financial changes to record" }
    }
  } catch (error) {
    console.error("Error recording sale adjustment:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// FIXED: Record purchase transactions with proper credit purchase handling
export async function recordPurchaseTransaction(purchaseData: {
  purchaseId: number
  totalAmount: number
  receivedAmount: number
  outstandingAmount: number
  status: string
  paymentMethod: string
  supplierName: string
  deviceId: number
  userId: number
  purchaseDate: Date
  courierCharge?: number
  purchaseType?: string
  payments?: Array<{ paymentMethod: string; amount: number; referenceNumber?: string; notes?: string }>
}, query: any = sql) {
  try {
    // Clear existing financial_transactions for this purchase (both product and shipping lines) to avoid duplicate ledger entries
    await query`
      DELETE FROM financial_transactions
      WHERE reference_type = 'purchase' 
        AND reference_id = ${purchaseData.purchaseId}
        AND transaction_type IN ('purchase', 'purchase_shipping')
    `

    const isDropship = (purchaseData.purchaseType || "").toLowerCase() === "dropship"
    const rawTotalAmount = Number(purchaseData.totalAmount) || 0
    const rawReceivedAmount = Number(purchaseData.receivedAmount) || 0
    const rawCourierCharge = Number(purchaseData.courierCharge) || 0

    // Courier charge is recorded separately (as sale_shipping for dropship, or purchase_shipping for stock).
    // The purchase product bill amount must exclude courier charge so courier is never double-counted in total.
    const courierCharge = isDropship ? 0 : rawCourierCharge
    const totalAmount = rawCourierCharge > 0 ? Math.max(0, rawTotalAmount - rawCourierCharge) : rawTotalAmount
    const receivedAmount = isDropship && rawCourierCharge > 0 ? Math.max(0, rawReceivedAmount - rawCourierCharge) : rawReceivedAmount
    const statusLower = (purchaseData.status || "").toLowerCase()
    const isPaid = statusLower === "paid" || statusLower === "completed" || (rawTotalAmount > 0 && rawReceivedAmount >= rawTotalAmount)

    const activePayments = Array.isArray(purchaseData.payments)
      ? purchaseData.payments.filter((p) => Number(p.amount) > 0)
      : []

    // 1 & 2: If 0 paid amount (credit purchase, no money out), do NOT insert into financial_transactions
    if (rawReceivedAmount <= 0 && activePayments.length === 0) {
      console.log(`Purchase #${purchaseData.purchaseId} recorded with 0 paid amount: skipped financial_transactions entry (tracked under Payables)`)
      return { success: true, transactionId: null, message: "No cash paid, skipped transaction entry" }
    }

    const companyId = await getDeviceCompanyId(purchaseData.deviceId)
    const effectivePurchaseDate = ensureDateTime(purchaseData.purchaseDate)
    const costAmount = 0
    let lastInsertedId: number | undefined

    // Courier charge is recorded separately as shipping.
    // The purchase product bill amount should exclude courier charge so courier is never double-counted in total.
    const productBillAmount = totalAmount

    // 4: If payment is fully completed and courier charge > 0, separate courier charge into its own row
    if (isPaid && courierCharge > 0) {
      const productPaid = Math.max(0, receivedAmount - courierCharge)
      const pm = activePayments[0]?.paymentMethod || purchaseData.paymentMethod || "Cash"

      // A. Product purchase row (without courier charge)
      if (activePayments.length > 1) {
        let remainingCourierToDeduct = courierCharge
        for (const p of activePayments) {
          const pAmt = Number(p.amount) || 0
          if (pAmt <= 0) continue
          const courierDeductedFromThis = Math.min(remainingCourierToDeduct, pAmt)
          remainingCourierToDeduct -= courierDeductedFromThis
          const netProductPaid = pAmt - courierDeductedFromThis
          if (netProductPaid > 0) {
            const refStr = p.referenceNumber ? ` (Ref: ${p.referenceNumber})` : ""
            const pDesc = `Purchase #${purchaseData.purchaseId} - ${purchaseData.status} - ${p.paymentMethod}${refStr} - Supplier: ${purchaseData.supplierName}`
            const res = await query`
              INSERT INTO financial_transactions (
                transaction_type, reference_type, reference_id,
                amount, received_amount, cost_amount, debit_amount, credit_amount,
                status, payment_method, description, device_id, company_id, created_by, transaction_date
              ) VALUES (
                'purchase', 'purchase', ${purchaseData.purchaseId},
                ${productBillAmount}, ${netProductPaid}, ${costAmount}, ${netProductPaid}, 0,
                ${purchaseData.status}, ${p.paymentMethod}, ${pDesc}, 
                ${purchaseData.deviceId}, ${companyId}, ${purchaseData.userId}, ${effectivePurchaseDate.toISOString()}
              ) RETURNING id
            `
            lastInsertedId = res[0]?.id
          }
        }
      } else if (productPaid > 0) {
        const pDesc = `Purchase #${purchaseData.purchaseId} - ${purchaseData.status} - ${pm} - Supplier: ${purchaseData.supplierName}`
        const res = await query`
          INSERT INTO financial_transactions (
            transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'purchase', 'purchase', ${purchaseData.purchaseId},
            ${productBillAmount}, ${productPaid}, ${costAmount}, ${productPaid}, 0,
            ${purchaseData.status}, ${pm}, ${pDesc}, 
            ${purchaseData.deviceId}, ${companyId}, ${purchaseData.userId}, ${effectivePurchaseDate.toISOString()}
          ) RETURNING id
        `
        lastInsertedId = res[0]?.id
      }

      // B. Courier charge separate row
      const courierDesc = `Purchase #${purchaseData.purchaseId} - Courier charge`
      const shipRes = await query`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'purchase_shipping', 'purchase', ${purchaseData.purchaseId},
          ${courierCharge}, ${courierCharge}, 0, ${courierCharge}, 0,
          'Completed', ${pm}, ${courierDesc}, 
          ${purchaseData.deviceId}, ${companyId}, ${purchaseData.userId}, ${effectivePurchaseDate.toISOString()}
        ) RETURNING id
      `
      if (!lastInsertedId) {
        lastInsertedId = shipRes[0]?.id
      }

      return { success: true, transactionId: lastInsertedId }
    }

    // Otherwise: partial payment or no courier charge
    if (activePayments.length > 1) {
      for (const p of activePayments) {
        const pAmt = Number(p.amount) || 0
        if (pAmt <= 0) continue
        const refStr = p.referenceNumber ? ` (Ref: ${p.referenceNumber})` : ""
        const pDesc = `Purchase #${purchaseData.purchaseId} - ${purchaseData.status} - ${p.paymentMethod}${refStr} - Supplier: ${purchaseData.supplierName}`

        const res = await query`
          INSERT INTO financial_transactions (
            transaction_type, reference_type, reference_id,
            amount, received_amount, cost_amount, debit_amount, credit_amount,
            status, payment_method, description, device_id, company_id, created_by, transaction_date
          ) VALUES (
            'purchase', 'purchase', ${purchaseData.purchaseId},
            ${productBillAmount}, ${pAmt}, ${costAmount}, ${pAmt}, 0,
            ${purchaseData.status}, ${p.paymentMethod}, ${pDesc}, 
            ${purchaseData.deviceId}, ${companyId}, ${purchaseData.userId}, ${effectivePurchaseDate.toISOString()}
          ) RETURNING id
        `
        lastInsertedId = res[0]?.id
      }
    } else {
      const pm = activePayments[0]?.paymentMethod || purchaseData.paymentMethod || "Cash"
      const debitAmount = receivedAmount
      const description = `Purchase #${purchaseData.purchaseId} - ${purchaseData.status} - ${pm} - Supplier: ${purchaseData.supplierName}`

      const result = await query`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'purchase', 'purchase', ${purchaseData.purchaseId},
          ${productBillAmount}, ${receivedAmount}, ${costAmount}, ${debitAmount}, 0,
          ${purchaseData.status}, ${pm}, ${description}, 
          ${purchaseData.deviceId}, ${companyId}, ${purchaseData.userId}, ${effectivePurchaseDate.toISOString()}
        ) RETURNING id
      `
      lastInsertedId = result[0]?.id
    }

    return { success: true, transactionId: lastInsertedId }
  } catch (error) {
    console.error("Error recording purchase transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// FIXED: Record purchase adjustments with proper NET change calculation for credit purchases
export async function recordPurchaseAdjustment(adjustmentData: {
  purchaseId: number
  changeType: "edit" | "cancel" | "payment" | "status_change" | "consolidated_edit"
  previousValues: any
  newValues: any
  deviceId: number
  userId: number
  description: string
  adjustmentDate?: Date
}) {
  try {
    // Calculate the NET differences
    const previousAmount = Number(adjustmentData.previousValues.totalAmount) || 0
    const newAmount = Number(adjustmentData.newValues.totalAmount) || 0
    const amountDiff = newAmount - previousAmount

    const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
    const newReceived = Number(adjustmentData.newValues.receivedAmount) || 0
    const receivedDiff = newReceived - previousReceived

    const previousOutstanding = Number(adjustmentData.previousValues.outstandingAmount) || 0
    const newOutstanding = Number(adjustmentData.newValues.outstandingAmount) || 0
    const outstandingDiff = newOutstanding - previousOutstanding

    const previousStatus = adjustmentData.previousValues.status?.toLowerCase() || ""
    const newStatus = adjustmentData.newValues.status?.toLowerCase() || ""

    let debitAmount = 0
    let creditAmount = 0
    let description = adjustmentData.description
    let status = "Adjustment"

    console.log("Purchase adjustment calculation:", {
      purchaseId: adjustmentData.purchaseId,
      previousAmount,
      newAmount,
      amountDiff,
      previousReceived,
      newReceived,
      receivedDiff,
      previousOutstanding,
      newOutstanding,
      outstandingDiff,
      previousStatus,
      newStatus,
      changeType: adjustmentData.changeType
    })

    if (adjustmentData.changeType === "consolidated_edit") {
      // FIXED: Handle credit purchase adjustments differently
      if (previousStatus === "credit" && newStatus === "credit") {
        // Credit purchase amount changed - record the outstanding amount change
        if (outstandingDiff > 0) {
          // Outstanding amount increased (more credit)
          description = `Purchase #${adjustmentData.purchaseId} - Credit Increased - Additional: ${outstandingDiff}`
          console.log(`Credit purchase: Outstanding increased by ${outstandingDiff}`)
        } else if (outstandingDiff < 0) {
          // Outstanding amount decreased (less credit)
          description = `Purchase #${adjustmentData.purchaseId} - Credit Reduced - Decrease: ${Math.abs(outstandingDiff)}`
          console.log(`Credit purchase: Outstanding decreased by ${Math.abs(outstandingDiff)}`)
        }
      } else {
        // Regular purchase edits
        if (amountDiff > 0) {
          // Purchase amount increased = additional money out
          debitAmount = amountDiff
          description = `Purchase #${adjustmentData.purchaseId} - Edited - Additional amount: ${amountDiff}`
          console.log(`Purchase edit: Amount increased by ${amountDiff}, recording debit`)
        } else if (amountDiff < 0) {
          // Purchase amount decreased = money returned (refund)
          creditAmount = Math.abs(amountDiff)
          description = `Purchase #${adjustmentData.purchaseId} - Edited - Amount reduced by ${Math.abs(amountDiff)}`
          console.log(`Purchase edit: Amount decreased by ${Math.abs(amountDiff)}, recording credit`)
        }
      }
      
      // Handle payment changes separately from amount changes
      if (receivedDiff > 0) {
        // Additional payment made
        debitAmount += receivedDiff
        description += ` - Additional payment: ${receivedDiff}`
        console.log(`Purchase edit: Additional payment ${receivedDiff}`)
      } else if (receivedDiff < 0) {
        // Payment reduced (refund received)
        creditAmount += Math.abs(receivedDiff)
        description += ` - Payment reduced: ${Math.abs(receivedDiff)}`
        console.log(`Purchase edit: Payment reduced by ${Math.abs(receivedDiff)}`)
      }

      // If no amount or payment changes, check if we need to create any transaction
      if (amountDiff === 0 && receivedDiff === 0 && outstandingDiff === 0) {
        console.log("No financial changes in purchase edit")
        return { success: true, transactionId: null, message: "No financial changes to record" }
      }
    } 
    else if (adjustmentData.changeType === "payment") {
      // Payment adjustments
      if (receivedDiff > 0) {
        debitAmount = receivedDiff
        status = "Payment"
        description = `Purchase #${adjustmentData.purchaseId} - Payment - Paid ${receivedDiff}`
      } else if (receivedDiff < 0) {
        creditAmount = Math.abs(receivedDiff)
        status = "Payment Reduction"
        description = `Purchase #${adjustmentData.purchaseId} - Payment Reduction - Credit ${Math.abs(receivedDiff)}`
      } else {
        return { success: true, transactionId: null, message: "No payment changes to record" }
      }
    } 
    else if (adjustmentData.changeType === "cancel") {
      // Cancelled purchases - refund any money paid
      const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
      creditAmount = previousReceived
      status = "Cancelled"
      description = `Purchase #${adjustmentData.purchaseId} - Cancelled - Refund ${previousReceived}`
    } 
    else {
      // Simple edit adjustments (fallback)
      if (receivedDiff > 0) {
        debitAmount = receivedDiff
        status = "Edit"
        description = `Purchase #${adjustmentData.purchaseId} - Edited - Payment increased by ${receivedDiff}`
      } else if (receivedDiff < 0) {
        creditAmount = Math.abs(receivedDiff)
        status = "Edit"
        description = `Purchase #${adjustmentData.purchaseId} - Edited - Payment decreased by ${Math.abs(receivedDiff)}`
      } else {
        return { success: true, transactionId: null, message: "No changes to record" }
      }
    }

    const transactionDate = adjustmentData.adjustmentDate || new Date()

    // Only create transaction if there are actual financial changes
    if (debitAmount !== 0 || creditAmount !== 0) {
      const result = await sql`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'adjustment', 'purchase', ${adjustmentData.purchaseId},
          ${amountDiff}, ${receivedDiff}, 0, ${debitAmount}, ${creditAmount},
          ${status}, ${description}, 
          ${adjustmentData.deviceId}, ${await getDeviceCompanyId(adjustmentData.deviceId)}, ${adjustmentData.userId}, ${transactionDate}
        ) RETURNING id
      `

      console.log(`Purchase adjustment recorded: ${description}`, {
        debitAmount,
        creditAmount,
        amountDiff,
        receivedDiff,
        outstandingDiff
      })
      return { success: true, transactionId: result[0]?.id }
    } else {
      return { success: true, transactionId: null, message: "No financial changes to record" }
    }
  } catch (error) {
    console.error("Error recording purchase adjustment:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Record manual/petty transactions
export async function recordManualTransaction(transactionData: {
  amount: number
  type: "debit" | "credit"
  description: string
  category: string
  categoryId?: number
  paymentMethod: string
  deviceId: number
  userId: number
  transactionDate: Date
}) {
  try {
    const amount = Number(transactionData.amount) || 0
    const debitAmount = transactionData.type === "debit" ? amount : 0
    const creditAmount = transactionData.type === "credit" ? amount : 0
    const category = transactionData.category.trim() || "Other"
    const description = `Manual Entry - ${category} - ${transactionData.description}`

    const txDate = transactionData.transactionDate ? new Date(transactionData.transactionDate) : new Date()
    const formattedTxDate = format(txDate, "yyyy-MM-dd HH:mm:ss")

    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, category_name, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'manual', 'manual', ${transactionData.categoryId || 0},
        ${amount}, ${amount}, 0, ${debitAmount}, ${creditAmount},
        'Manual Entry', ${transactionData.paymentMethod}, ${description}, ${category},
        ${transactionData.deviceId}, ${await getDeviceCompanyId(transactionData.deviceId)}, ${transactionData.userId}, ${formattedTxDate}
      ) RETURNING id
    `

    console.log(`Manual transaction recorded: ID ${result[0]?.id}`)
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording manual transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function syncSaleShippingTransactions(shippingData: {
  saleId: number
  deviceId: number
  userId: number
  saleDate: Date
  paymentMethod: string
  status: string
  paymentStatus?: string
  fulfillmentType: string
  courierPaidExtra: number
  expenseCourier: number
  expensePacking: number
  receivedAmount?: number
  totalAmount?: number
  /** Product revenue only; when set, main sale row is aligned to exclude courier charge. */
  productCreditAmount?: number
  transactionDate?: Date
}) {
  try {
    // company_id comes from the device, never a fixed value
    const companyId = await getDeviceCompanyId(shippingData.deviceId)

    await sql`
      DELETE FROM financial_transactions
      WHERE (reference_type = 'sale' OR reference_type = 'sale_shipping')
        AND reference_id = ${shippingData.saleId}
        AND device_id = ${shippingData.deviceId}
        AND transaction_type = 'sale_shipping'
    `

    if (shippingData.status === "Cancelled") {
      return { success: true as const, transactionIds: [] as number[] }
    }

    const statusStr = (shippingData.status || "").toLowerCase().trim()
    const paymentStatusStr = (shippingData.paymentStatus || "").toLowerCase().trim()
    const isPaidOrCompleted =
      statusStr === "completed" ||
      statusStr === "paid" ||
      paymentStatusStr === "paid" ||
      paymentStatusStr === "completed"

    const courierPaidExtra = Number(shippingData.courierPaidExtra) || 0
    const expenseCourier = Number(shippingData.expenseCourier) || 0
    const expensePacking = Number(shippingData.expensePacking) || 0
    const totalAmount = Number(shippingData.totalAmount) || 0
    const receivedAmount = Number(shippingData.receivedAmount) || 0
    const productCredit =
      shippingData.productCreditAmount != null
        ? Number(shippingData.productCreditAmount) || 0
        : null
    const hasShippingSplit =
      productCredit != null && totalAmount > 0 && productCredit < totalAmount

    if (hasShippingSplit) {
      const existingRows = await sql`
        SELECT id, amount FROM financial_transactions
        WHERE reference_type = 'sale'
          AND reference_id = ${shippingData.saleId}
          AND device_id = ${shippingData.deviceId}
          AND transaction_type = 'sale'
      `
      // Only adjust single-payment row if it hasn't already been split by recordSaleTransaction
      if (existingRows.length === 1 && Math.abs(Number(existingRows[0].amount) - productCredit) > 0.01) {
        const productReceived = isPaidOrCompleted ? productCredit : Math.min(receivedAmount, productCredit)
        const mainCredit = productReceived

        await sql`
          UPDATE financial_transactions
          SET
            amount = ${productCredit},
            received_amount = ${productReceived},
            credit_amount = ${mainCredit}
          WHERE id = ${existingRows[0].id}
        `
      }
    }

    let courierCredit = 0
    if (isPaidOrCompleted) {
      courierCredit = courierPaidExtra
    } else if (shippingData.status === "Credit" && courierPaidExtra > 0 && totalAmount > 0 && receivedAmount > 0) {
      courierCredit = (receivedAmount / totalAmount) * courierPaidExtra
    }

    const transactionIds: number[] = []
    const collectionDate = ensureDateTime(shippingData.saleDate || shippingData.transactionDate)
    const expenseDate = ensureDateTime(shippingData.transactionDate || shippingData.saleDate)

    // 1. Courier charge collected from customer (Money In)
    if (courierCredit > 0) {
      const result = await sql`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'sale_shipping', 'sale', ${shippingData.saleId},
          ${courierCredit}, ${isPaidOrCompleted ? courierCredit : 0}, 0, 0, ${courierCredit},
          ${isPaidOrCompleted ? 'Completed' : shippingData.status}, ${shippingData.paymentMethod || "Cash"},
          ${`Sale #${shippingData.saleId} - Courier charge collected`},
          ${shippingData.deviceId}, ${companyId}, ${shippingData.userId}, ${collectionDate.toISOString()}
        ) RETURNING id
      `
      transactionIds.push(Number(result[0]?.id))
    }

    // 2. Courier charge paid by company (Money Out - company expense for shipping / direct dropship)
    if (expenseCourier > 0) {
      const result = await sql`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'sale_shipping', 'sale', ${shippingData.saleId},
          ${expenseCourier}, ${expenseCourier}, 0, ${expenseCourier}, 0,
          'Completed', ${shippingData.paymentMethod || "Cash"},
          ${`Sale #${shippingData.saleId} - Courier charge`},
          ${shippingData.deviceId}, ${companyId}, ${shippingData.userId}, ${expenseDate.toISOString()}
        ) RETURNING id
      `
      transactionIds.push(Number(result[0]?.id))
    }

    // 3. Packing expense paid by company (Money Out)
    if (expensePacking > 0) {
      const result = await sql`
        INSERT INTO financial_transactions (
          transaction_type, reference_type, reference_id,
          amount, received_amount, cost_amount, debit_amount, credit_amount,
          status, payment_method, description, device_id, company_id, created_by, transaction_date
        ) VALUES (
          'sale_shipping', 'sale', ${shippingData.saleId},
          ${expensePacking}, ${expensePacking}, 0, ${expensePacking}, 0,
          'Completed', ${shippingData.paymentMethod || "Cash"},
          ${`Sale #${shippingData.saleId} - Packing expense`},
          ${shippingData.deviceId}, ${companyId}, ${shippingData.userId}, ${expenseDate.toISOString()}
        ) RETURNING id
      `
      transactionIds.push(Number(result[0]?.id))
    }

    return { success: true as const, transactionIds }
  } catch (error) {
    console.error("Error syncing sale shipping transactions:", error)
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

export async function cleanupCustomerPaymentsForSale(saleId: number) {
  try {
    const saleIdNum = Number(saleId)
    if (!saleIdNum) return { success: true }

    // Find any customer payment transactions in financial_transactions referencing this saleId
    const payments = await sql`
      SELECT id, amount, cost_amount, notes, description, payment_method, reference_id, device_id
      FROM financial_transactions
      WHERE transaction_type = 'customer_payment'
        AND (
          notes LIKE ${'%"saleId":' + saleIdNum + ',%'}
          OR notes LIKE ${'%"saleId":' + saleIdNum + '}%'}
          OR notes LIKE ${'%"saleId": ' + saleIdNum + ',%'}
          OR notes LIKE ${'%"saleId": ' + saleIdNum + '}%'}
          OR description LIKE ${'%#' + saleIdNum + '%'}
        )
    `

    for (const p of payments) {
      let stored: { v?: number; userNotes?: string; allocations?: Array<{ saleId: number; allocatedAmount: number }> } | null = null
      try {
        stored = typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes
      } catch {
        stored = null
      }

      const allocations = Array.isArray(stored?.allocations) ? stored.allocations : []
      const targetAlloc = allocations.find((a: any) => Number(a.saleId) === saleIdNum)
      const remainingAllocations = allocations.filter((a: any) => Number(a.saleId) !== saleIdNum)

      if (remainingAllocations.length === 0) {
        // If all allocations were for this sale or no other allocations exist, delete the transaction
        await sql`DELETE FROM financial_transactions WHERE id = ${p.id}`
      } else {
        // If other sales were also settled in this payment, reduce the payment amount and update notes
        const removedAmount = Number(targetAlloc?.allocatedAmount) || 0
        const newAmount = Math.max(0, Number(p.amount || 0) - removedAmount)
        const updatedNotes = JSON.stringify({
          ...stored,
          allocations: remainingAllocations,
        })
        const newAllocCount = remainingAllocations.length
        let cleanDesc = String(p.description || "").replace(/\d+\s+sale\(s\)\s+affected/, `${newAllocCount} sale(s) affected`)
        cleanDesc = cleanDesc.replace(new RegExp(`\\[?Order#?\\s*${saleIdNum}\\]?`, "gi"), "").replace(/\s{2,}/g, " ").trim()

        await sql`
          UPDATE financial_transactions
          SET amount = ${newAmount},
              received_amount = ${newAmount},
              credit_amount = ${newAmount},
              notes = ${updatedNotes},
              description = ${cleanDesc}
          WHERE id = ${p.id}
        `
      }
    }

    return { success: true }
  } catch (error) {
    console.error(`Error cleaning up customer payments for sale ${saleId}:`, error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Delete transaction when sale/purchase is deleted
export async function deleteSaleTransaction(saleId: number, deviceId: number) {
  try {
    const result = await sql`
      DELETE FROM financial_transactions 
      WHERE (reference_type = 'sale' OR reference_type = 'sale_shipping')
        AND reference_id = ${saleId} 
        AND device_id = ${deviceId}
      RETURNING id
    `

    await cleanupCustomerPaymentsForSale(saleId)

    console.log(`Deleted ${result.length} financial transactions for sale ${saleId}`)
    return { success: true, deletedCount: result.length }
  } catch (error) {
    console.error("Error deleting sale transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Clean up supplier payments when a purchase is deleted
export async function cleanupSupplierPaymentsForPurchase(purchaseId: number) {
  try {
    const purchaseIdNum = Number(purchaseId)
    if (!purchaseIdNum) return { success: true }

    // Find any supplier_payment transactions that reference this purchase in their notes or description
    const payments = await sql`
      SELECT id, amount, debit_amount, notes, description
      FROM financial_transactions
      WHERE transaction_type = 'supplier_payment'
        AND (
          notes LIKE ${`%"purchaseId":${purchaseIdNum}%`}
          OR notes LIKE ${`%"purchaseId": "${purchaseIdNum}"%`}
          OR notes LIKE ${`%"purchaseId":${purchaseIdNum},%`}
          OR notes LIKE ${`%Purchase #${purchaseIdNum}%`}
          OR description LIKE ${`%Purchase #${purchaseIdNum}%`}
        )
    `

    for (const p of payments) {
      let stored: { v?: number; userNotes?: string; amountApplied?: number; extraCredit?: number; allocations?: Array<{ purchaseId: number; allocatedAmount?: number; amount?: number }> } | null = null
      try {
        stored = typeof p.notes === "string" ? JSON.parse(p.notes) : p.notes
      } catch {
        stored = null
      }

      const allocations = Array.isArray(stored?.allocations) ? stored.allocations : []
      const targetAlloc = allocations.find((a: any) => Number(a.purchaseId) === purchaseIdNum)
      const remainingAllocations = allocations.filter((a: any) => Number(a.purchaseId) !== purchaseIdNum)

      if (remainingAllocations.length === 0) {
        // If all allocations were for this purchase or no other allocations exist, delete the transaction
        await sql`DELETE FROM financial_transactions WHERE id = ${p.id}`
      } else {
        // If other purchases were also settled in this payment, reduce the payment amount and update notes
        const removedAmount = Number(targetAlloc?.allocatedAmount || targetAlloc?.amount) || 0
        const newAmount = Math.max(0, Number(p.amount || 0) - removedAmount)
        const updatedNotes = JSON.stringify({
          ...stored,
          amountApplied: Math.max(0, Number(stored?.amountApplied || p.amount || 0) - removedAmount),
          allocations: remainingAllocations,
        })
        const newAllocCount = remainingAllocations.length
        let cleanDesc = String(p.description || "").replace(/\d+\s+purchase\(s\)\s+affected/, `${newAllocCount} purchase(s) affected`)
        cleanDesc = cleanDesc.replace(new RegExp(`\\[?Purchase#?\\s*${purchaseIdNum}\\]?`, "gi"), "").replace(/\s{2,}/g, " ").trim()

        await sql`
          UPDATE financial_transactions
          SET amount = ${newAmount},
              received_amount = ${newAmount},
              debit_amount = ${newAmount},
              notes = ${updatedNotes},
              description = ${cleanDesc}
          WHERE id = ${p.id}
        `
      }
    }

    return { success: true }
  } catch (error) {
    console.error(`Error cleaning up supplier payments for purchase ${purchaseId}:`, error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Delete transaction when purchase is deleted
export async function deletePurchaseTransaction(purchaseId: number, deviceId: number) {
  try {
    const result = await sql`
      DELETE FROM financial_transactions 
      WHERE (reference_type = 'purchase' OR reference_type = 'purchase_shipping')
        AND reference_id = ${purchaseId} 
        AND device_id = ${deviceId}
      RETURNING id
    `

    await cleanupSupplierPaymentsForPurchase(purchaseId)

    console.log(`Deleted ${result.length} financial transactions for purchase ${purchaseId}`)
    return { success: true, deletedCount: result.length }
  } catch (error) {
    console.error("Error deleting purchase transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

function isMidnightTime(d: Date | null): boolean {
  if (!d) return true
  const isUtcZero = d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0
  const isIstZero = d.getUTCHours() === 18 && d.getUTCMinutes() === 30 && d.getUTCSeconds() === 0
  return isUtcZero || isIstZero
}

function resolveTransactionDateTime(tx: { transaction_date?: any; created_at?: any }): Date {
  const tVal = tx.transaction_date
  const cVal = tx.created_at
  const tDate = tVal instanceof Date ? tVal : (tVal ? new Date(tVal) : null)
  const cDate = cVal instanceof Date ? cVal : (cVal ? new Date(cVal) : null)

  const isTValid = tDate && !isNaN(tDate.getTime())
  const isCValid = cDate && !isNaN(cDate.getTime())

  // If tDate has a real non-midnight time, use it
  if (isTValid && !isMidnightTime(tDate)) {
    return tDate
  }

  // If tDate was midnight or date-only, but created_at has a real time, combine tDate's date with created_at's time
  if (isCValid && !isMidnightTime(cDate)) {
    if (isTValid) {
      const res = new Date(tDate)
      res.setUTCHours(cDate.getUTCHours(), cDate.getUTCMinutes(), cDate.getUTCSeconds(), cDate.getUTCMilliseconds())
      return res
    }
    return cDate
  }

  return isTValid ? tDate : (isCValid ? cDate : new Date())
}

// FIXED: Get financial summary from the simplified structure - PROPER cash balance calculation
export async function getFinancialSummary(
  deviceId: number,
  fromDateStr?: string,
  toDateStr?: string,
  cacheBuster?: number,
) {
  try {
    console.log("Getting financial summary for device:", deviceId, "date range:", fromDateStr, "to", toDateStr)

    // Auto-repair any previous manual entries whose transaction_type, reference_type, or date was improperly overwritten
    try {
      await sql`
        UPDATE financial_transactions 
        SET 
          transaction_type = 'manual', 
          reference_type = 'manual',
          received_amount = amount,
          transaction_date = created_at
        WHERE device_id = ${deviceId} 
          AND (reference_type = 'manual' OR transaction_type = 'manual' OR description LIKE 'Manual Entry%')
          AND (transaction_type != 'manual' OR reference_type != 'manual' OR received_amount = 0 OR transaction_date::date > created_at::date)
      `
      // Auto-align courier collected timestamps with their parent sale transaction date so collection times match
      await sql`
        UPDATE financial_transactions ft
        SET transaction_date = st.transaction_date
        FROM financial_transactions st
        WHERE ft.device_id = ${deviceId}
          AND ft.transaction_type = 'sale_shipping'
          AND ft.reference_type = 'sale'
          AND ft.description LIKE '%Courier charge collected%'
          AND st.device_id = ${deviceId}
          AND st.transaction_type = 'sale'
          AND st.reference_type = 'sale'
          AND st.reference_id = ft.reference_id
          AND ft.transaction_date != st.transaction_date
      `
    } catch (repairErr) {
      console.log("Non-fatal: transaction auto-repair skipped", repairErr)
    }

    // Query transactions (fromDateStr/toDateStr are YYYY-MM-DD from the client calendar)
    let transactions
    if (fromDateStr && toDateStr) {
      console.log("Querying with date range:", fromDateStr, "to", toDateStr)
      transactions = await sql`
        SELECT * FROM financial_transactions 
        WHERE device_id = ${deviceId} 
          AND NOT (transaction_type = 'purchase' AND debit_amount = 0 AND received_amount = 0)
          AND (
            (transaction_date AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${fromDateStr}::date AND ${toDateStr}::date
            OR (created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN ${fromDateStr}::date AND ${toDateStr}::date
            OR transaction_date::date BETWEEN ${fromDateStr}::date AND ${toDateStr}::date
          )
        ORDER BY transaction_date DESC, id DESC
      `
    } else {
      console.log("Querying all transactions for device:", deviceId)
      transactions = await sql`
        SELECT * FROM financial_transactions 
        WHERE device_id = ${deviceId}
          AND NOT (transaction_type = 'purchase' AND debit_amount = 0 AND received_amount = 0)
        ORDER BY transaction_date DESC, id DESC
      `
    }

    console.log(`Found ${transactions.length} transactions for device ${deviceId}`)

    // Fetch Authoritative Sales, COGS & Profit from single backend source of truth
    const authoritativeProfit = await getAuthoritativeProfitSummary(deviceId, {
      dateFrom: fromDateStr,
      dateTo: toDateStr,
    })

    let cashBalance = 0
    transactions.forEach((tx: any) => {
      const creditAmount = Number(tx.credit_amount) || 0
      const debitAmount = Number(tx.debit_amount) || 0
      cashBalance += (creditAmount - debitAmount)
    })

    const totalIncome = authoritativeProfit.salesRevenue + authoritativeProfit.otherIncome
    const totalCogs = authoritativeProfit.salesCogs
    const totalProfit = authoritativeProfit.grossProfit
    const grossProfit = authoritativeProfit.grossProfit
    const totalExpenses = authoritativeProfit.operatingExpenses
    const netProfit = authoritativeProfit.netProfit

    // Get receivables (sales with outstanding amounts)
    const receivablesQuery = await sql`
      SELECT 
        s.id,
        s.total_amount,
        s.received_amount,
        s.sale_date,
        s.status,
        c.name as customer_name,
        (s.total_amount - COALESCE(s.received_amount, 0)) as outstanding_amount
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.device_id = ${deviceId}
        AND s.status != 'Cancelled'
        AND (s.total_amount - COALESCE(s.received_amount, 0)) > 0
      ORDER BY s.sale_date DESC
    `

    // Get payables (purchases with outstanding amounts)
    const payablesQuery = await sql`
      SELECT 
        p.id,
        p.total_amount,
        p.received_amount,
        p.purchase_date,
        p.status,
        p.supplier as supplier_name,
        (p.total_amount - COALESCE(p.received_amount, 0)) as outstanding_amount
      FROM purchases p
      WHERE p.device_id = ${deviceId}
        AND p.status != 'Cancelled'
        AND (p.total_amount - COALESCE(p.received_amount, 0)) > 0
      ORDER BY p.purchase_date DESC
    `

    // Transfer receivables: this device SENT goods and is owed money by the receiving warehouse
    let transferReceivablesQuery: any[] = []
    let transferPayablesQuery: any[] = []
    try {
      transferReceivablesQuery = await sql`
        SELECT
          t.id,
          COALESCE(t.total_amount, 0) AS total_amount,
          COALESCE(t.paid_amount, 0) AS received_amount,
          COALESCE(t.transfer_date, t.created_at) AS due_date,
          t.payment_status AS status,
          dt.name AS counterpart_name,
          (COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0)) AS outstanding_amount
        FROM stock_transfers t
        JOIN devices dt ON dt.id = t.to_device_id
        WHERE t.from_device_id = ${deviceId}
          AND LOWER(COALESCE(t.status, '')) = 'completed'
          AND (COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0)) > 0
        ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      `

      // Transfer payables: this device RECEIVED goods and owes money to the sending warehouse
      transferPayablesQuery = await sql`
        SELECT
          t.id,
          COALESCE(t.total_amount, 0) AS total_amount,
          COALESCE(t.paid_amount, 0) AS received_amount,
          COALESCE(t.transfer_date, t.created_at) AS due_date,
          t.payment_status AS status,
          df.name AS counterpart_name,
          (COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0)) AS outstanding_amount
        FROM stock_transfers t
        JOIN devices df ON df.id = t.from_device_id
        WHERE t.to_device_id = ${deviceId}
          AND LOWER(COALESCE(t.status, '')) = 'completed'
          AND (COALESCE(t.total_amount, 0) - COALESCE(t.paid_amount, 0)) > 0
        ORDER BY COALESCE(t.transfer_date, t.created_at) DESC
      `
    } catch (transferErr) {
      console.error("Error loading transfer dues (non-fatal):", transferErr)
    }

    const accountsReceivable =
      receivablesQuery.reduce((sum: number, r: any) => sum + Number(r.outstanding_amount), 0) +
      transferReceivablesQuery.reduce((sum: number, r: any) => sum + Number(r.outstanding_amount), 0)
    const accountsPayable =
      payablesQuery.reduce((sum: number, p: any) => sum + Number(p.outstanding_amount), 0) +
      transferPayablesQuery.reduce((sum: number, p: any) => sum + Number(p.outstanding_amount), 0)

    console.log("Financial summary calculated:", {
      totalIncome,
      totalCogs,
      totalProfit,
      totalExpenses,
      netProfit,
      accountsReceivable,
      accountsPayable,
      cashBalance,
      transactionCount: transactions.length,
    })

    // FIXED: Proper partial credit sale and purchase handling in transaction mapping
    return {
      salesRevenue: authoritativeProfit.salesRevenue,
      totalIncome,
      totalCogs,
      grossProfit,
      totalProfit,
      totalExpenses,
      operatingExpenses: authoritativeProfit.operatingExpenses,
      otherIncome: authoritativeProfit.otherIncome,
      netProfit,
      expenseBreakdown: authoritativeProfit.expenseBreakdown,
      shippingSummary: authoritativeProfit.shippingSummary,
      excludedMoneyOut: authoritativeProfit.excludedMoneyOut,
      accountsReceivable,
      accountsPayable,
      outstandingReceivables: accountsReceivable,
      cashBalance,
      transactions: transactions.map((tx: any) => {
        const amount = Number(tx.amount) || 0
        const received = Number(tx.received_amount) || 0
        const status = tx.status || "Unknown"
        const type = tx.transaction_type || "Unknown"
        const creditAmount = Number(tx.credit_amount) || 0
        const debitAmount = Number(tx.debit_amount) || 0
        
        // FIXED: For credit/partial purchases and sales, calculate remaining amount properly
        let remaining = 0
        const statusClean = status.toLowerCase()
        if ((statusClean === 'credit' || statusClean === 'partial') && type === 'purchase') {
          remaining = amount - received
        } else if ((statusClean === 'credit' || statusClean === 'partial') && type === 'sale') {
          remaining = amount - received
        } else if ((statusClean === 'completed' || statusClean === 'paid') && received < amount) {
          remaining = amount - received
        } else if (type === 'transfer' && received < amount) {
          remaining = amount - received
        }
        if (type === 'purchase_shipping' || type === 'sale_shipping') {
          remaining = 0
        }

        const effectiveDate = resolveTransactionDateTime(tx)
        return {
          id: tx.id,
          date: effectiveDate.toISOString(),
          created_at: tx.created_at instanceof Date ? tx.created_at.toISOString() : (tx.created_at || ""),
          transaction_date: tx.transaction_date instanceof Date ? tx.transaction_date.toISOString() : (tx.transaction_date || ""),
          description: tx.description || `${tx.transaction_type} #${tx.reference_id}`,
          type: tx.transaction_type,
          reference_type: tx.reference_type,
          status: status,
          amount: amount,
          received: received,
          cost: Number(tx.cost_amount) || 0,
          debit: debitAmount,
          credit: creditAmount,
          paymentMethod: tx.payment_method || "",
          notes: tx.notes || "",
          category_name: tx.category_name || "",
          account: getAccountType(tx.transaction_type),
          reference: `${tx.reference_type} #${tx.reference_id}`,
          remaining: Math.max(0, remaining),
          sale_id: tx.reference_type === 'sale' ? tx.reference_id : undefined,
          purchase_id: (tx.reference_type === 'purchase' || tx.transaction_type === 'purchase_shipping') ? tx.reference_id : undefined,
          supplier_payment_id: tx.transaction_type === 'supplier_payment' || tx.reference_type === 'supplier' ? tx.id : undefined,
          transfer_id: tx.reference_type === 'transfer' ? tx.reference_id : undefined,
          reference_id: tx.reference_id,
        }
      }),
      receivables: [
        ...receivablesQuery.map((r: any) => ({
          id: r.id,
          customer_name: r.customer_name || "Walk-in Customer",
          amount: Number(r.outstanding_amount),
          total_amount: Number(r.total_amount),
          received_amount: Number(r.received_amount) || 0,
          due_date: r.sale_date,
          days_overdue: Math.max(
            0,
            Math.floor((new Date().getTime() - new Date(r.sale_date).getTime()) / (1000 * 60 * 60 * 24)),
          ),
          status: r.status,
        })),
        ...transferReceivablesQuery.map((r: any) => ({
          id: `T-${r.id}`,
          customer_name: `Transfer → ${r.counterpart_name || "Warehouse"}`,
          amount: Number(r.outstanding_amount),
          total_amount: Number(r.total_amount),
          received_amount: Number(r.received_amount) || 0,
          due_date: r.due_date,
          days_overdue: Math.max(
            0,
            Math.floor((new Date().getTime() - new Date(r.due_date).getTime()) / (1000 * 60 * 60 * 24)),
          ),
          status: r.status,
        })),
      ],
      payables: [
        ...payablesQuery.map((p: any) => ({
          id: p.id,
          supplier_name: p.supplier_name || "Unknown Supplier",
          amount: Number(p.outstanding_amount),
          total_amount: Number(p.total_amount),
          received_amount: Number(p.received_amount) || 0,
          due_date: p.purchase_date,
          days_overdue: Math.max(
            0,
            Math.floor((new Date().getTime() - new Date(p.purchase_date).getTime()) / (1000 * 60 * 60 * 24)),
          ),
          status: p.status,
        })),
        ...transferPayablesQuery.map((p: any) => ({
          id: `T-${p.id}`,
          supplier_name: `Transfer ← ${p.counterpart_name || "Warehouse"}`,
          amount: Number(p.outstanding_amount),
          total_amount: Number(p.total_amount),
          received_amount: Number(p.received_amount) || 0,
          due_date: p.due_date,
          days_overdue: Math.max(
            0,
            Math.floor((new Date().getTime() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24)),
          ),
          status: p.status,
        })),
      ],
    }
  } catch (error) {
    console.error("Error getting financial summary:", error)
    console.error("Error details:", {
      message: error instanceof Error ? error.message : String(error),
      code: (error as { code?: string }).code,
      deviceId,
      dateFrom: fromDateStr,
      dateTo: toDateStr,
    })
    return {
      salesRevenue: 0,
      totalIncome: 0,
      totalCogs: 0,
      grossProfit: 0,
      totalProfit: 0,
      totalExpenses: 0,
      operatingExpenses: 0,
      otherIncome: 0,
      netProfit: 0,
      expenseBreakdown: [],
      shippingSummary: { customerShippingCollected: 0, actualCourierCost: 0, netShippingDifference: 0 },
      excludedMoneyOut: { inventoryPurchases: 0, supplierPayments: 0, customerRefunds: 0, otherAdjustments: 0 },
      accountsReceivable: 0,
      accountsPayable: 0,
      outstandingReceivables: 0,
      cashBalance: 0,
      transactions: [],
      receivables: [],
      payables: [],
    }
  }
}

// Helper function to get account type for display
function getAccountType(transactionType: string): string {
  switch (transactionType) {
    case "sale":
      return "Sales"
    case "sale_shipping":
      return "Shipping"
    case "purchase":
      return "Purchases"
    case "manual":
      return "Manual"
    case "supplier_payment":
      return "Supplier Payment"
    case "customer_payment":
      return "Customer Payment"
    case "warehouse_payment":
      return "Warehouse Payment"
    case "transfer":
      return "Transfer"
    case "adjustment":
      return "Adjustments"
    default:
      return "Other"
  }
}

// FIXED: Get opening and closing balances based on actual transaction data with date range
export async function getAccountingBalances(deviceId: number, fromDateStr: string, toDateStr?: string) {
  try {
    const cleanFromStr = fromDateStr ? fromDateStr.split("T")[0].trim() : format(new Date(), "yyyy-MM-dd")
    const cleanToStr = toDateStr ? toDateStr.split("T")[0].trim() : cleanFromStr

    console.log("Getting accounting balances for device:", deviceId, "from:", cleanFromStr, "to:", cleanToStr)

    // Precise exclusive date boundaries:
    // Opening cutoff: Start of fromDate (00:00:00)
    // Closing exclusive cutoff: Start of day after closing date (00:00:00)
    // Ensures: Today's Opening Balance === Yesterday's Closing Balance unconditionally
    const openingCutoff = `${cleanFromStr} 00:00:00`
    const nextDay = addDays(parseISO(cleanToStr), 1)
    const closingExclusiveCutoff = `${format(nextDay, "yyyy-MM-dd")} 00:00:00`

    console.log("Date boundaries for balance calculation:", { openingCutoff, closingExclusiveCutoff })

    // Single atomic scan to compute opening, period (Money In / Out), and closing balances
    const balanceResult = await sql`
      SELECT 
        COALESCE(SUM(
          CASE WHEN transaction_date < ${openingCutoff}::timestamp THEN 
            CASE 
              WHEN COALESCE(credit_amount, 0) > 0 THEN credit_amount 
              WHEN transaction_type = 'sale' THEN COALESCE(received_amount, 0)
              WHEN transaction_type = 'customer_payment' THEN COALESCE(received_amount, amount, 0)
              ELSE COALESCE(credit_amount, 0)
            END 
          ELSE 0 END
        ), 0) as opening_credits,

        COALESCE(SUM(
          CASE WHEN transaction_date < ${openingCutoff}::timestamp THEN 
            CASE 
              WHEN COALESCE(debit_amount, 0) > 0 THEN debit_amount 
              WHEN transaction_type = 'purchase' THEN COALESCE(received_amount, 0)
              WHEN transaction_type IN ('expense', 'supplier_payment', 'warehouse_payment') THEN COALESCE(amount, received_amount, 0)
              ELSE COALESCE(debit_amount, 0)
            END 
          ELSE 0 END
        ), 0) as opening_debits,

        COALESCE(SUM(
          CASE WHEN transaction_date >= ${openingCutoff}::timestamp AND transaction_date < ${closingExclusiveCutoff}::timestamp THEN 
            CASE 
              WHEN COALESCE(credit_amount, 0) > 0 THEN credit_amount 
              WHEN transaction_type = 'sale' THEN COALESCE(received_amount, 0)
              WHEN transaction_type = 'customer_payment' THEN COALESCE(received_amount, amount, 0)
              ELSE COALESCE(credit_amount, 0)
            END 
          ELSE 0 END
        ), 0) as period_credits,

        COALESCE(SUM(
          CASE WHEN transaction_date >= ${openingCutoff}::timestamp AND transaction_date < ${closingExclusiveCutoff}::timestamp THEN 
            CASE 
              WHEN COALESCE(debit_amount, 0) > 0 THEN debit_amount 
              WHEN transaction_type = 'purchase' THEN COALESCE(received_amount, 0)
              WHEN transaction_type IN ('expense', 'supplier_payment', 'warehouse_payment') THEN COALESCE(amount, received_amount, 0)
              ELSE COALESCE(debit_amount, 0)
            END 
          ELSE 0 END
        ), 0) as period_debits,

        COALESCE(SUM(
          CASE WHEN transaction_date < ${closingExclusiveCutoff}::timestamp THEN 
            CASE 
              WHEN COALESCE(credit_amount, 0) > 0 THEN credit_amount 
              WHEN transaction_type = 'sale' THEN COALESCE(received_amount, 0)
              WHEN transaction_type = 'customer_payment' THEN COALESCE(received_amount, amount, 0)
              ELSE COALESCE(credit_amount, 0)
            END 
          ELSE 0 END
        ), 0) as closing_credits,

        COALESCE(SUM(
          CASE WHEN transaction_date < ${closingExclusiveCutoff}::timestamp THEN 
            CASE 
              WHEN COALESCE(debit_amount, 0) > 0 THEN debit_amount 
              WHEN transaction_type = 'purchase' THEN COALESCE(received_amount, 0)
              WHEN transaction_type IN ('expense', 'supplier_payment', 'warehouse_payment') THEN COALESCE(amount, received_amount, 0)
              ELSE COALESCE(debit_amount, 0)
            END 
          ELSE 0 END
        ), 0) as closing_debits
      FROM financial_transactions
      WHERE device_id = ${deviceId}
        AND transaction_date < ${closingExclusiveCutoff}::timestamp
    `

    const row = balanceResult[0]
    const openingCredits = Number(row?.opening_credits) || 0
    const openingDebits = Number(row?.opening_debits) || 0
    
    // Accurate Opening Balance calculation: Credits - Debits prior to start date
    const rawOpening = openingCredits - openingDebits
    const openingBalance = Number(rawOpening.toFixed(2))

    const moneyIn = Number((Number(row?.period_credits) || 0).toFixed(2))
    const moneyOut = Number((Number(row?.period_debits) || 0).toFixed(2))

    const closingCredits = Number(row?.closing_credits) || 0
    const closingDebits = Number(row?.closing_debits) || 0

    // Reconciled Closing Balance: Opening Balance + Money In - Money Out
    const closingBalance = Number((openingBalance + moneyIn - moneyOut).toFixed(2))

    console.log("Balance calculation results:", {
      openingCredits,
      openingDebits,
      openingBalance,
      moneyIn,
      moneyOut,
      closingCredits,
      closingDebits,
      closingBalance,
    })

    return {
      openingBalance,
      closingBalance,
      moneyIn,
      moneyOut,
      openingCredits,
      openingDebits,
      closingCredits,
      closingDebits,
      openingReceived: 0,
      closingReceived: 0,
    }
  } catch (error) {
    console.error("Error getting accounting balances:", error)
    return {
      openingBalance: 0,
      closingBalance: 0,
      moneyIn: 0,
      moneyOut: 0,
      openingCredits: 0,
      openingDebits: 0,
      closingCredits: 0,
      closingDebits: 0,
      openingReceived: 0,
      closingReceived: 0,
    }
  }
}