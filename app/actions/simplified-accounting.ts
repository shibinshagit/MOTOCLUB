"use server"

import { sql } from "@/lib/db"

// Create a simplified financial transactions table from scratch
async function createFinancialTransactionsTable() {
  try {
    // First check if the table exists
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'financial_transactions'
      ) as exists
    `

    if (!tableExists[0]?.exists) {
      console.log("Creating financial_transactions table from scratch")

      // Create the table with all required columns for detailed accounting
      await sql`
        CREATE TABLE financial_transactions (
          id SERIAL PRIMARY KEY,
          transaction_date TIMESTAMP NOT NULL DEFAULT NOW(),
          transaction_type VARCHAR(50) NOT NULL,
          reference_type VARCHAR(50) NOT NULL,
          reference_id INTEGER NOT NULL,
          amount DECIMAL(12,2) NOT NULL DEFAULT 0,
          received_amount DECIMAL(12,2) DEFAULT 0,
          cost_amount DECIMAL(12,2) DEFAULT 0,
          debit_amount DECIMAL(12,2) DEFAULT 0,
          credit_amount DECIMAL(12,2) DEFAULT 0,
          status VARCHAR(50),
          payment_method VARCHAR(50),
          description TEXT,
          notes TEXT,
          device_id INTEGER NOT NULL,
          company_id INTEGER DEFAULT 1,
          created_by INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `

      // Create indexes
      await sql`CREATE INDEX idx_financial_transactions_device ON financial_transactions(device_id, transaction_date)`
      await sql`CREATE INDEX idx_financial_transactions_ref ON financial_transactions(reference_type, reference_id)`

      console.log("Financial transactions table created successfully")
    } else {
      // Check if new columns exist and add them if needed
      try {
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS received_amount DECIMAL(12,2) DEFAULT 0`
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS cost_amount DECIMAL(12,2) DEFAULT 0`
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS debit_amount DECIMAL(12,2) DEFAULT 0`
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS credit_amount DECIMAL(12,2) DEFAULT 0`
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(50)`
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)`
        await sql`ALTER TABLE financial_transactions ADD COLUMN IF NOT EXISTS notes TEXT`
        console.log("Added missing columns to financial_transactions table")
      } catch (err) {
        console.log("Columns might already exist:", err.message)
      }
    }

    return true
  } catch (error) {
    console.error("Error creating financial_transactions table:", error)
    return false
  }
}

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

    // Ensure table exists
    const tableCreated = await createFinancialTransactionsTable()
    if (!tableCreated) {
      console.error("Failed to ensure financial_transactions table exists")
      return { success: false, error: "Failed to create financial_transactions table" }
    }

    // For supplier payments: debit = payment amount (money going out), credit = 0
    const paymentAmount = Number(paymentData.paymentAmount) || 0
    const debitAmount = paymentAmount // Cash going out to pay supplier
    const creditAmount = 0 // No income from this transaction

    // Create detailed description including notes
    let description = `Supplier Payment - ${paymentData.supplierName} - ${paymentData.paymentMethod} - ${paymentData.allocations.length} purchase(s) affected`
    if (paymentData.notes && paymentData.notes.trim()) {
      description += ` - Notes: ${paymentData.notes.trim()}`
    }

    // Insert the supplier payment transaction
    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, notes, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'supplier_payment', 'supplier', ${paymentData.supplierId},
        ${paymentAmount}, ${paymentAmount}, 0, ${debitAmount}, ${creditAmount},
        'Completed', ${paymentData.paymentMethod}, ${description}, ${paymentData.notes || null}, 
        ${paymentData.deviceId}, 1, ${paymentData.userId}, ${paymentData.paymentDate.toISOString()}
      ) RETURNING id
    `

    console.log(`Supplier payment transaction recorded successfully: ID ${result[0]?.id}`)
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording supplier payment transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// FIXED: Create a comprehensive transaction entry for sales - PROPER credit sale handling
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
  customerId?: number
  saleDate: Date
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
    })

    // Ensure table exists
    const tableCreated = await createFinancialTransactionsTable()
    if (!tableCreated) {
      console.error("Failed to ensure financial_transactions table exists")
      return { success: false, error: "Failed to create financial_transactions table" }
    }

    // Validate required fields
    if (!saleData.saleId || !saleData.deviceId || !saleData.userId) {
      console.error("Missing required fields:", {
        saleId: saleData.saleId,
        deviceId: saleData.deviceId,
        userId: saleData.userId,
      })
      return { success: false, error: "Missing required fields: saleId, deviceId, or userId" }
    }

    // FIXED: Calculate accounting values based on sale status - PROPER credit sale handling
    let debitAmount = 0
    let creditAmount = 0
    let costAmount = 0
    let description = ""
    let receivedAmountForRecord = Number(saleData.receivedAmount) || 0

    if (saleData.status === "Cancelled") {
      // Cancelled sales: debit = received amount (refund), credit = 0, NO COGS
      debitAmount = Number(saleData.receivedAmount) || 0
      creditAmount = 0
      costAmount = 0
      description = `Sale #${saleData.saleId} - Cancelled - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"}`
    } else if (saleData.status === "Credit") {
      // FIXED: Credit sales - record actual received amount for partial payments
      creditAmount = Number(saleData.receivedAmount) || 0 // Only record actual cash received
      debitAmount = 0
      
      // For credit sales, only recognize COGS for the portion that's actually paid
      if (saleData.receivedAmount > 0 && saleData.totalAmount > 0) {
        const paymentRatio = saleData.receivedAmount / saleData.totalAmount
        costAmount = saleData.cogsAmount * paymentRatio
      } else {
        costAmount = 0 // No COGS impact for completely credit sales
      }
      
      if (saleData.receivedAmount > 0) {
        description = `Sale #${saleData.saleId} - Credit - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"} - Partial Payment`
      } else {
        description = `Sale #${saleData.saleId} - Credit - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"} - Pending Payment`
      }
      
      console.log(`Credit sale recorded: Total: ${saleData.totalAmount}, Received: ${saleData.receivedAmount}, COGS: ${costAmount}`)
    } else {
      // Completed sales: credit = received amount, debit = 0
      creditAmount = Number(saleData.receivedAmount) || 0
      debitAmount = 0
      costAmount = Number(saleData.cogsAmount) || 0
      description = `Sale #${saleData.saleId} - Completed - ${saleData.paymentMethod || "Cash"} - Customer: ${saleData.customerId ? `ID ${saleData.customerId}` : "Walk-in"}`
    }

    // Record the transaction with all details
    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'sale', 'sale', ${saleData.saleId},
        ${saleData.totalAmount}, ${receivedAmountForRecord}, ${costAmount}, ${debitAmount}, ${creditAmount},
        ${saleData.status}, ${saleData.paymentMethod || "Cash"}, ${description}, 
        ${saleData.deviceId}, 1, ${saleData.userId}, ${saleData.saleDate}
      ) RETURNING id
    `

    console.log(`Sale transaction recorded successfully: ID ${result[0]?.id}`, {
      status: saleData.status,
      creditAmount,
      receivedAmount: receivedAmountForRecord,
      totalAmount: saleData.totalAmount,
      costAmount
    })
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording sale transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}


// FIXED: Record sale adjustments (edits, cancellations, payments) - PROPER credit sale payment handling
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
    await createFinancialTransactionsTable()

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
      // FIXED: Handle received amount changes - For credit sales, only record actual money received
      const previousStatus = adjustmentData.previousValues.status?.toLowerCase() || ""
      const newStatus = adjustmentData.newValues.status?.toLowerCase() || ""

      // Special handling for CREDIT SALES - only record cash when money is actually received
      if (previousStatus === "credit" && receivedDiff > 0) {
        // Payment received for credit sale: credit = received amount increase, cost = proportional COGS
        creditAmount = receivedDiff
        const paymentRatio = receivedDiff / newAmount
        costAmount = newCogs * paymentRatio // Only recognize COGS for the portion paid
        
        console.log(`Credit sale payment: Received ${receivedDiff}, COGS recognized: ${costAmount}`)
      } else if (receivedDiff > 0 && newStatus !== "credit") {
        // More money received for non-credit sales: credit = received amount increase
        creditAmount = receivedDiff
        costAmount = cogsDiff
      } else if (receivedDiff < 0) {
        // Money refunded: debit = received amount decrease
        debitAmount += Math.abs(receivedDiff)
        costAmount = -Math.abs(cogsDiff) // Reverse COGS for refunds
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

      // Handle discount changes - simple accounting
      if (discountDiff !== 0) {
        console.log(`Discount change detected: ${previousDiscount} → ${newDiscount} (diff: ${discountDiff})`)

        if (discountDiff > 0) {
          // Discount increased = debit amount
          debitAmount += discountDiff
        } else {
          // Discount decreased = credit amount
          creditAmount += Math.abs(discountDiff)
        }
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
      // FIXED: Payment adjustments for credit sales - only record actual money received with proportional COGS
      if (receivedDiff > 0) {
        const previousStatus = adjustmentData.previousValues.status?.toLowerCase() || ""
        
        if (previousStatus === "credit") {
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
          ${adjustmentData.deviceId}, 1, ${adjustmentData.userId}, ${transactionDate}
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

// Record purchase transactions
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
}) {
  try {
    // Ensure table exists
    await createFinancialTransactionsTable()

    // For purchases: debit = received amount (actual money paid), credit = 0, cost = 0
    const totalAmount = Number(purchaseData.totalAmount) || 0
    const receivedAmount = Number(purchaseData.receivedAmount) || 0
    const debitAmount = receivedAmount // Money actually paid out
    const creditAmount = 0
    const costAmount = 0 // Purchases don't have COGS

    const description = `Purchase #${purchaseData.purchaseId} - ${purchaseData.status} - ${purchaseData.paymentMethod} - Supplier: ${purchaseData.supplierName}`

    // Insert the main purchase transaction
    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'purchase', 'purchase', ${purchaseData.purchaseId},
        ${totalAmount}, ${receivedAmount}, ${costAmount}, ${debitAmount}, ${creditAmount},
        ${purchaseData.status}, ${purchaseData.paymentMethod}, ${description}, 
        ${purchaseData.deviceId}, 1, ${purchaseData.userId}, ${purchaseData.purchaseDate}
      ) RETURNING id
    `

    console.log(`Purchase transaction recorded: ID ${result[0]?.id}`)
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording purchase transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Record manual/petty transactions
export async function recordManualTransaction(transactionData: {
  amount: number
  type: "debit" | "credit"
  description: string
  category: string
  paymentMethod: string
  deviceId: number
  userId: number
  transactionDate: Date
}) {
  try {
    // Ensure table exists
    await createFinancialTransactionsTable()

    const amount = Number(transactionData.amount) || 0
    const debitAmount = transactionData.type === "debit" ? amount : 0
    const creditAmount = transactionData.type === "credit" ? amount : 0

    const description = `Manual Entry - ${transactionData.category} - ${transactionData.description}`

    // Insert the manual transaction
    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, payment_method, description, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'manual', 'manual', 0,
        ${amount}, ${amount}, 0, ${debitAmount}, ${creditAmount},
        'Manual Entry', ${transactionData.paymentMethod}, ${description}, 
        ${transactionData.deviceId}, 1, ${transactionData.userId}, ${transactionData.transactionDate}
      ) RETURNING id
    `

    console.log(`Manual transaction recorded: ID ${result[0]?.id}`)
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording manual transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Delete transaction when sale/purchase is deleted
export async function deleteSaleTransaction(saleId: number, deviceId: number) {
  try {
    await createFinancialTransactionsTable()

    const result = await sql`
      DELETE FROM financial_transactions 
      WHERE reference_type = 'sale' 
        AND reference_id = ${saleId} 
        AND device_id = ${deviceId}
      RETURNING id
    `

    console.log(`Deleted ${result.length} financial transactions for sale ${saleId}`)
    return { success: true, deletedCount: result.length }
  } catch (error) {
    console.error("Error deleting sale transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Record purchase adjustments (edits, cancellations, payments, returns)
export async function recordPurchaseAdjustment(adjustmentData: {
  purchaseId: number
  changeType: "edit" | "cancel" | "payment" | "status_change"
  previousValues: any
  newValues: any
  deviceId: number
  userId: number
  description: string
  adjustmentDate?: Date
}) {
  try {
    // Ensure table exists
    await createFinancialTransactionsTable()

    // Calculate the differences
    const previousAmount = Number(adjustmentData.previousValues.totalAmount) || 0
    const newAmount = Number(adjustmentData.newValues.totalAmount) || 0
    const amountDiff = newAmount - previousAmount

    const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
    const newReceived = Number(adjustmentData.newValues.receivedAmount) || 0
    const receivedDiff = newReceived - previousReceived

    let debitAmount = 0
    let creditAmount = 0
    let description = adjustmentData.description
    let status = "Adjustment"

    if (adjustmentData.changeType === "payment") {
      // Payment adjustments for purchases
      if (receivedDiff > 0) {
        debitAmount = receivedDiff
        creditAmount = 0
        status = "Payment"
        description = `Purchase #${adjustmentData.purchaseId} - Payment - Paid ${receivedDiff}`
      } else if (receivedDiff < 0) {
        creditAmount = Math.abs(receivedDiff)
        debitAmount = 0
        status = "Payment Reduction"
        description = `Purchase #${adjustmentData.purchaseId} - Payment Reduction - Credit ${Math.abs(receivedDiff)}`
      } else {
        debitAmount = 0
        creditAmount = 0
        status = "No Change"
        description = `Purchase #${adjustmentData.purchaseId} - No payment change`
      }
    } else if (adjustmentData.changeType === "cancel") {
      // Cancelled/Returned purchases
      const previousReceived = Number(adjustmentData.previousValues.receivedAmount) || 0
      creditAmount = previousReceived
      debitAmount = 0

      const previousStatus = adjustmentData.previousValues.status?.toLowerCase() || ""
      const newStatus = adjustmentData.newValues.status?.toLowerCase() || ""

      if ((previousStatus === "paid" || previousStatus === "credit") && newStatus === "cancelled") {
        status = "Returned"
        description = `Purchase #${adjustmentData.purchaseId} - RETURNED - Credit ${previousReceived} - Stock removed`
      } else {
        status = "Cancelled"
        description = `Purchase #${adjustmentData.purchaseId} - Cancelled - Credit ${previousReceived}`
      }
    } else {
      // Edit adjustments
      if (receivedDiff > 0) {
        debitAmount = receivedDiff
        creditAmount = 0
        status = "Edit"
        description = `Purchase #${adjustmentData.purchaseId} - Edited - Payment increased by ${receivedDiff}`
      } else if (receivedDiff < 0) {
        creditAmount = Math.abs(receivedDiff)
        debitAmount = 0
        status = "Edit"
        description = `Purchase #${adjustmentData.purchaseId} - Edited - Payment decreased by ${Math.abs(receivedDiff)}`
      } else {
        debitAmount = 0
        creditAmount = 0
        status = "Edit"
        description = `Purchase #${adjustmentData.purchaseId} - Edited - No payment change`
      }
    }

    // Ensure adjustmentDate is not null
    const transactionDate = adjustmentData.adjustmentDate || new Date()

    // Insert adjustment transaction
    const result = await sql`
      INSERT INTO financial_transactions (
        transaction_type, reference_type, reference_id,
        amount, received_amount, cost_amount, debit_amount, credit_amount,
        status, description, device_id, company_id, created_by, transaction_date
      ) VALUES (
        'adjustment', 'purchase', ${adjustmentData.purchaseId},
        ${amountDiff}, ${receivedDiff}, 0, ${debitAmount}, ${creditAmount},
        ${status}, ${description}, 
        ${adjustmentData.deviceId}, 1, ${adjustmentData.userId}, ${transactionDate}
      ) RETURNING id
    `

    console.log(`Purchase adjustment recorded: ${adjustmentData.changeType} for purchase ${adjustmentData.purchaseId}`)
    return { success: true, transactionId: result[0]?.id }
  } catch (error) {
    console.error("Error recording purchase adjustment:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// Delete transaction when purchase is deleted
export async function deletePurchaseTransaction(purchaseId: number, deviceId: number) {
  try {
    await createFinancialTransactionsTable()

    const result = await sql`
      DELETE FROM financial_transactions 
      WHERE reference_type = 'purchase' 
        AND reference_id = ${purchaseId} 
        AND device_id = ${deviceId}
      RETURNING id
    `

    console.log(`Deleted ${result.length} financial transactions for purchase ${purchaseId}`)
    return { success: true, deletedCount: result.length }
  } catch (error) {
    console.error("Error deleting purchase transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

// FIXED: Get financial summary from the simplified structure - PROPER credit sale handling
export async function getFinancialSummary(deviceId: number, dateFrom?: Date, dateTo?: Date, cacheBuster?: number) {
  try {
    console.log("Getting financial summary for device:", deviceId, "date range:", dateFrom, "to", dateTo)

    // Ensure table exists first
    const tableCreated = await createFinancialTransactionsTable()
    if (!tableCreated) {
      console.error("Failed to ensure financial_transactions table exists")
      return {
        totalIncome: 0,
        totalCogs: 0,
        totalProfit: 0,
        totalExpenses: 0,
        netProfit: 0,
        accountsReceivable: 0,
        accountsPayable: 0,
        outstandingReceivables: 0,
        transactions: [],
        receivables: [],
        payables: [],
      }
    }

    // Fix timezone issues by using explicit date strings in SQL query
    let fromDateStr = null
    let toDateStr = null

    if (dateFrom) {
      fromDateStr = `${dateFrom.getFullYear()}-${String(dateFrom.getMonth() + 1).padStart(2, "0")}-${String(dateFrom.getDate()).padStart(2, "0")} 00:00:00`
    }

    if (dateTo) {
      toDateStr = `${dateTo.getFullYear()}-${String(dateTo.getMonth() + 1).padStart(2, "0")}-${String(dateTo.getDate()).padStart(2, "0")} 23:59:59`
    }

    // Query transactions
    let transactions
    if (fromDateStr && toDateStr) {
      console.log("Querying with date range:", fromDateStr, "to", toDateStr)
      transactions = await sql`
        SELECT * FROM financial_transactions 
        WHERE device_id = ${deviceId} 
          AND transaction_date::date BETWEEN ${fromDateStr}::date AND ${toDateStr}::date
        ORDER BY transaction_date DESC, id DESC
      `
    } else {
      console.log("Querying all transactions for device:", deviceId)
      transactions = await sql`
        SELECT * FROM financial_transactions 
        WHERE device_id = ${deviceId}
        ORDER BY transaction_date DESC, id DESC
      `
    }

    console.log(`Found ${transactions.length} transactions for device ${deviceId}`)

    // FIXED: Calculate totals - Only count actual cash movements
    let totalIncome = 0
    let totalExpenses = 0
    let totalCogs = 0
    let totalProfit = 0

    transactions.forEach((tx: any) => {
      const creditAmount = Number(tx.credit_amount) || 0
      const debitAmount = Number(tx.debit_amount) || 0
      const costAmount = Number(tx.cost_amount) || 0
      const status = tx.status?.toLowerCase()

      // FIXED: For credit sales, completely ignore in income/COGS calculations
      if (status !== 'credit') {
        totalIncome += creditAmount
        totalCogs += costAmount
        totalExpenses += debitAmount

        // Calculate profit only for sales that have actual cash impact
        if (creditAmount > 0 && costAmount > 0) {
          totalProfit += creditAmount - costAmount
        }
      }
    })

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

    const accountsReceivable = receivablesQuery.reduce((sum, r) => sum + Number(r.outstanding_amount), 0)
    const accountsPayable = payablesQuery.reduce((sum, p) => sum + Number(p.outstanding_amount), 0)
    const netProfit = totalIncome - totalExpenses

    console.log("Financial summary calculated:", {
      totalIncome,
      totalCogs,
      totalProfit,
      totalExpenses,
      netProfit,
      accountsReceivable,
      accountsPayable,
      transactionCount: transactions.length,
    })

    // FIXED: Proper credit sale handling in transaction mapping
    return {
      totalIncome,
      totalCogs,
      totalProfit,
      totalExpenses,
      netProfit,
      accountsReceivable,
      accountsPayable,
      outstandingReceivables: accountsReceivable,
      transactions: transactions.map((tx: any) => {
        const amount = Number(tx.amount) || 0
        const received = Number(tx.received_amount) || 0
        const status = tx.status || "Unknown"
        const creditAmount = Number(tx.credit_amount) || 0
        
        // FIXED: For credit sales, received should be 0 and remaining should be full amount
        const isCreditSale = status.toLowerCase() === 'credit'
        const displayReceived = isCreditSale ? 0 : received
        const remaining = isCreditSale ? amount : 0

        return {
          id: tx.id,
          date: tx.transaction_date,
          description: tx.description || `${tx.transaction_type} #${tx.reference_id}`,
          type: tx.transaction_type,
          status: status,
          amount: amount,
          received: displayReceived, // FIXED: Show 0 for credit sales
          cost: Number(tx.cost_amount) || 0,
          debit: Number(tx.debit_amount) || 0,
          credit: creditAmount,
          paymentMethod: tx.payment_method || "",
          notes: tx.notes || "",
          account: getAccountType(tx.transaction_type),
          reference: `${tx.reference_type} #${tx.reference_id}`,
          remaining: remaining, // FIXED: Show full amount for credit sales
          sale_id: tx.reference_type === 'sale' ? tx.reference_id : undefined,
          purchase_id: tx.reference_type === 'purchase' ? tx.reference_id : undefined,
          supplier_payment_id: tx.reference_type === 'supplier' ? tx.reference_id : undefined,
          reference_id: tx.reference_id,
        }
      }),
      receivables: receivablesQuery.map((r: any) => ({
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
      payables: payablesQuery.map((p: any) => ({
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
    }
  } catch (error) {
    console.error("Error getting financial summary:", error)
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      deviceId,
      dateFrom,
      dateTo,
    })
    return {
      totalIncome: 0,
      totalCogs: 0,
      totalProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      accountsReceivable: 0,
      accountsPayable: 0,
      outstandingReceivables: 0,
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
    case "purchase":
      return "Purchases"
    case "manual":
      return "Manual"
    case "supplier_payment":
      return "Supplier Payment"
    case "adjustment":
      return "Adjustments"
    default:
      return "Other"
  }
}

// FIXED: Get opening and closing balances based on actual transaction data with date range
export async function getAccountingBalances(deviceId: number, openingDate: Date, closingDate?: Date) {
  try {
    console.log(
      "Getting accounting balances for device:",
      deviceId,
      "opening date:",
      openingDate,
      "closing date:",
      closingDate,
    )

    // Ensure table exists
    await createFinancialTransactionsTable()

    // Format dates properly without timezone conversion
    const openingDateStr = `${openingDate.getFullYear()}-${String(openingDate.getMonth() + 1).padStart(2, "0")}-${String(openingDate.getDate()).padStart(2, "0")} ${String(openingDate.getHours()).padStart(2, "0")}:${String(openingDate.getMinutes()).padStart(2, "0")}:${String(openingDate.getSeconds()).padStart(2, "0")}`

    let closingDateStr = openingDateStr
    if (closingDate) {
      closingDateStr = `${closingDate.getFullYear()}-${String(closingDate.getMonth() + 1).padStart(2, "0")}-${String(closingDate.getDate()).padStart(2, "0")} ${String(closingDate.getHours()).padStart(2, "0")}:${String(closingDate.getMinutes()).padStart(2, "0")}:${String(closingDate.getSeconds()).padStart(2, "0")}`
    }

    console.log("Date strings for balance calculation:", { openingDateStr, closingDateStr })

    // FIXED: Calculate CASH BALANCE = Money Received - Money Spent (only actual cash movements)
    const openingTransactions = await sql`
      SELECT 
        COALESCE(SUM(credit_amount), 0) as total_credits,
        COALESCE(SUM(debit_amount), 0) as total_debits,
        COALESCE(SUM(received_amount), 0) as total_received,
        COALESCE(SUM(cost_amount), 0) as total_cogs
      FROM financial_transactions 
      WHERE device_id = ${deviceId} 
        AND transaction_date <= ${openingDateStr}::timestamp
    `

    let closingTransactions = openingTransactions
    if (closingDate) {
      closingTransactions = await sql`
        SELECT 
          COALESCE(SUM(credit_amount), 0) as total_credits,
          COALESCE(SUM(debit_amount), 0) as total_debits,
          COALESCE(SUM(received_amount), 0) as total_received,
          COALESCE(SUM(cost_amount), 0) as total_cogs
        FROM financial_transactions 
        WHERE device_id = ${deviceId} 
          AND transaction_date <= ${closingDateStr}::timestamp
      `
    }

    const openingCredits = Number(openingTransactions[0]?.total_credits) || 0
    const openingDebits = Number(openingTransactions[0]?.total_debits) || 0
    const openingReceived = Number(openingTransactions[0]?.total_received) || 0
    const openingBalance = openingReceived - openingDebits

    const closingCredits = Number(closingTransactions[0]?.total_credits) || 0
    const closingDebits = Number(closingTransactions[0]?.total_debits) || 0
    const closingReceived = Number(closingTransactions[0]?.total_received) || 0
    const closingBalance = closingReceived - closingDebits

    console.log("Balance calculation results:", {
      openingReceived,
      openingDebits,
      openingBalance,
      closingReceived,
      closingDebits,
      closingBalance,
      openingCredits,
      closingCredits,
    })

    return {
      openingBalance,
      closingBalance,
      openingCredits,
      openingDebits,
      closingCredits,
      closingDebits,
      openingReceived,
      closingReceived,
    }
  } catch (error) {
    console.error("Error getting accounting balances:", error)
    return {
      openingBalance: 0,
      closingBalance: 0,
      openingCredits: 0,
      openingDebits: 0,
      closingCredits: 0,
      closingDebits: 0,
      openingReceived: 0,
      closingReceived: 0,
    }
  }
}
