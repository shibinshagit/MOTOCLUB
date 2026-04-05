"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Schema is now managed by `npm run migrate`
export async function initializeAccountingSchema() {
  return { success: true, message: "Schema managed by migration script — run `npm run migrate`" }
}

// Record a financial transaction in the ledger
export async function recordFinancialTransaction(data: {
  transactionDate: Date
  transactionType: string
  referenceType?: string
  referenceId?: number
  amount: number
  description: string
  category: string
  accountType: string
  deviceId: number
  companyId: number
  createdBy: number
}) {
  try {
    const {
      transactionDate,
      transactionType,
      referenceType,
      referenceId,
      amount,
      description,
      category,
      accountType,
      deviceId,
      companyId,
      createdBy,
    } = data

    // Determine debit/credit amounts based on account type
    let debitAmount = 0
    let creditAmount = 0

    switch (accountType) {
      case "revenue":
        creditAmount = amount // Revenue increases with credits
        break
      case "expense":
        debitAmount = amount // Expenses increase with debits
        break
      case "asset":
        debitAmount = amount // Assets increase with debits
        break
      case "liability":
        creditAmount = amount // Liabilities increase with credits
        break
      default:
        debitAmount = amount
    }

    const result = await sql`
      INSERT INTO financial_ledger (
        transaction_date, transaction_type, reference_type, reference_id,
        amount, description, category, account_type, debit_amount, credit_amount,
        device_id, company_id, created_by
      ) VALUES (
        ${transactionDate}, ${transactionType}, ${referenceType}, ${referenceId},
        ${amount}, ${description}, ${category}, ${accountType}, ${debitAmount}, ${creditAmount},
        ${deviceId}, ${companyId}, ${createdBy}
      ) RETURNING *
    `

    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Error recording financial transaction:", error)
    return { success: false, message: "Failed to record financial transaction" }
  }
}

// Record COGS for a sale
export async function recordCOGS(saleId: number, items: any[], deviceId: number) {
  try {
    let totalCOGS = 0

    for (const item of items) {
      // Get product cost price (wholesale price)
      const product = await sql`
        SELECT wholesale_price, price FROM products WHERE id = ${item.productId}
      `

      if (product.length > 0) {
        const costPrice = product[0].wholesale_price || product[0].price || 0
        const totalCost = costPrice * item.quantity
        totalCOGS += totalCost

        // Record COGS entry
        await sql`
          INSERT INTO cogs_entries (sale_id, product_id, quantity, cost_price, total_cost, device_id)
          VALUES (${saleId}, ${item.productId}, ${item.quantity}, ${costPrice}, ${totalCost}, ${deviceId})
        `
      }
    }

    // Record COGS in financial ledger
    if (totalCOGS > 0) {
      await recordFinancialTransaction({
        transactionDate: new Date(),
        transactionType: "cogs",
        referenceType: "sale",
        referenceId: saleId,
        amount: totalCOGS,
        description: `Cost of Goods Sold for Sale #${saleId}`,
        category: "Cost of Goods Sold",
        accountType: "expense",
        deviceId,
        companyId: 1,
        createdBy: 1,
      })
    }

    return { success: true, totalCOGS }
  } catch (error) {
    console.error("Error recording COGS:", error)
    return { success: false, message: "Failed to record COGS" }
  }
}

// Update accounts receivable
export async function updateAccountsReceivable(
  customerId: number | null,
  saleId: number,
  originalAmount: number,
  paidAmount: number,
  deviceId: number,
  companyId: number,
) {
  try {
    const outstandingAmount = originalAmount - paidAmount

    // Check if record exists
    const existing = await sql`
      SELECT id FROM accounts_receivable WHERE sale_id = ${saleId} AND device_id = ${deviceId}
    `

    if (existing.length > 0) {
      // Update existing record
      await sql`
        UPDATE accounts_receivable 
        SET paid_amount = ${paidAmount}, outstanding_amount = ${outstandingAmount}, updated_at = NOW()
        WHERE sale_id = ${saleId} AND device_id = ${deviceId}
      `
    } else {
      // Create new record
      await sql`
        INSERT INTO accounts_receivable (
          customer_id, sale_id, original_amount, paid_amount, outstanding_amount,
          device_id, company_id
        ) VALUES (
          ${customerId}, ${saleId}, ${originalAmount}, ${paidAmount}, ${outstandingAmount},
          ${deviceId}, ${companyId}
        )
      `
    }

    return { success: true }
  } catch (error) {
    console.error("Error updating accounts receivable:", error)
    return { success: false, message: "Failed to update accounts receivable" }
  }
}

// Update accounts payable
export async function updateAccountsPayable(
  supplierName: string,
  purchaseId: number,
  originalAmount: number,
  paidAmount: number,
  deviceId: number,
  companyId: number,
) {
  try {
    const outstandingAmount = originalAmount - paidAmount

    // Check if record exists
    const existing = await sql`
      SELECT id FROM accounts_payable WHERE purchase_id = ${purchaseId} AND device_id = ${deviceId}
    `

    if (existing.length > 0) {
      // Update existing record
      await sql`
        UPDATE accounts_payable 
        SET paid_amount = ${paidAmount}, outstanding_amount = ${outstandingAmount}, updated_at = NOW()
        WHERE purchase_id = ${purchaseId} AND device_id = ${deviceId}
      `
    } else {
      // Create new record
      await sql`
        INSERT INTO accounts_payable (
          supplier_name, purchase_id, original_amount, paid_amount, outstanding_amount,
          device_id, company_id
        ) VALUES (
          ${supplierName}, ${purchaseId}, ${originalAmount}, ${paidAmount}, ${outstandingAmount},
          ${deviceId}, ${companyId}
        )
      `
    }

    return { success: true }
  } catch (error) {
    console.error("Error updating accounts payable:", error)
    return { success: false, message: "Failed to update accounts payable" }
  }
}

// Get comprehensive financial data
export async function getFinancialData(deviceId: number, dateFrom?: Date, dateTo?: Date) {
  try {
    // Initialize schema if needed
    await initializeAccountingSchema()

    let dateFilter = ""
    if (dateFrom && dateTo) {
      dateFilter = `AND transaction_date BETWEEN '${dateFrom.toISOString()}' AND '${dateTo.toISOString()}'`
    }

    // Get all ledger entries
    const ledgerEntries = await sql`
      SELECT * FROM financial_ledger 
      WHERE device_id = ${deviceId} ${sql.unsafe(dateFilter)}
      ORDER BY transaction_date DESC, id DESC
    `

    // Get accounts receivable summary
    const accountsReceivable = await sql`
      SELECT 
        ar.*,
        c.name as customer_name,
        s.sale_date
      FROM accounts_receivable ar
      LEFT JOIN customers c ON ar.customer_id = c.id
      LEFT JOIN sales s ON ar.sale_id = s.id
      WHERE ar.device_id = ${deviceId} AND ar.outstanding_amount > 0
      ORDER BY s.sale_date DESC
    `

    // Get accounts payable summary
    const accountsPayable = await sql`
      SELECT 
        ap.*,
        p.purchase_date
      FROM accounts_payable ap
      LEFT JOIN purchases p ON ap.purchase_id = p.id
      WHERE ap.device_id = ${deviceId} AND ap.outstanding_amount > 0
      ORDER BY p.purchase_date DESC
    `

    // Calculate financial summary
    const summary = {
      totalRevenue: 0,
      totalExpenses: 0,
      totalCOGS: 0,
      grossProfit: 0,
      netProfit: 0,
      totalReceivable: 0,
      totalPayable: 0,
      cashFlow: 0,
    }

    ledgerEntries.forEach((entry: any) => {
      switch (entry.transaction_type) {
        case "sale":
          summary.totalRevenue += Number(entry.amount)
          break
        case "purchase":
        case "expense":
          summary.totalExpenses += Number(entry.amount)
          break
        case "cogs":
          summary.totalCOGS += Number(entry.amount)
          break
        case "payment_received":
          summary.cashFlow += Number(entry.amount)
          break
        case "payment_made":
          summary.cashFlow -= Number(entry.amount)
          break
      }
    })

    summary.grossProfit = summary.totalRevenue - summary.totalCOGS
    summary.netProfit = summary.grossProfit - summary.totalExpenses

    summary.totalReceivable = accountsReceivable.reduce(
      (sum: number, ar: any) => sum + Number(ar.outstanding_amount),
      0,
    )

    summary.totalPayable = accountsPayable.reduce((sum: number, ap: any) => sum + Number(ap.outstanding_amount), 0)

    return {
      success: true,
      data: {
        ledgerEntries,
        accountsReceivable,
        accountsPayable,
        summary,
      },
    }
  } catch (error) {
    console.error("Error getting financial data:", error)
    return { success: false, message: "Failed to get financial data" }
  }
}

// Record a payment
export async function recordPayment(data: {
  referenceType: string
  referenceId: number
  amount: number
  paymentMethod: string
  notes?: string
  deviceId: number
  companyId: number
  createdBy: number
}) {
  try {
    const { referenceType, referenceId, amount, paymentMethod, notes, deviceId, companyId, createdBy } = data

    // Record payment
    const payment = await sql`
      INSERT INTO payments (
        reference_type, reference_id, amount, payment_method, notes,
        device_id, company_id, created_by
      ) VALUES (
        ${referenceType}, ${referenceId}, ${amount}, ${paymentMethod}, ${notes || ""},
        ${deviceId}, ${companyId}, ${createdBy}
      ) RETURNING *
    `

    // Record in financial ledger
    const transactionType = referenceType === "sale" ? "payment_received" : "payment_made"
    const accountType = referenceType === "sale" ? "asset" : "liability"
    const description = `Payment ${referenceType === "sale" ? "received for" : "made for"} ${referenceType} #${referenceId}`

    await recordFinancialTransaction({
      transactionDate: new Date(),
      transactionType,
      referenceType,
      referenceId,
      amount,
      description,
      category: "Payment",
      accountType,
      deviceId,
      companyId,
      createdBy,
    })

    // Update accounts receivable/payable
    if (referenceType === "sale") {
      // Get current receivable amount
      const receivable = await sql`
        SELECT * FROM accounts_receivable WHERE sale_id = ${referenceId} AND device_id = ${deviceId}
      `

      if (receivable.length > 0) {
        const newPaidAmount = Number(receivable[0].paid_amount) + amount
        await updateAccountsReceivable(
          receivable[0].customer_id,
          referenceId,
          Number(receivable[0].original_amount),
          newPaidAmount,
          deviceId,
          companyId,
        )
      }
    } else if (referenceType === "purchase") {
      // Get current payable amount
      const payable = await sql`
        SELECT * FROM accounts_payable WHERE purchase_id = ${referenceId} AND device_id = ${deviceId}
      `

      if (payable.length > 0) {
        const newPaidAmount = Number(payable[0].paid_amount) + amount
        await updateAccountsPayable(
          payable[0].supplier_name,
          referenceId,
          Number(payable[0].original_amount),
          newPaidAmount,
          deviceId,
          companyId,
        )
      }
    }

    revalidatePath("/dashboard")
    return { success: true, data: payment[0] }
  } catch (error) {
    console.error("Error recording payment:", error)
    return { success: false, message: "Failed to record payment" }
  }
}

// Add manual transaction (income or expense)
export async function addManualTransaction(data: {
  transactionType: "income" | "expense"
  amount: number
  description: string
  category: string
  transactionDate: Date
  deviceId: number
  companyId: number
  createdBy: number
}) {
  try {
    const { transactionType, amount, description, category, transactionDate, deviceId, companyId, createdBy } = data

    const accountType = transactionType === "income" ? "revenue" : "expense"

    const result = await recordFinancialTransaction({
      transactionDate,
      transactionType,
      referenceType: "manual",
      referenceId: null,
      amount,
      description,
      category,
      accountType,
      deviceId,
      companyId,
      createdBy,
    })

    revalidatePath("/dashboard")
    return result
  } catch (error) {
    console.error("Error adding manual transaction:", error)
    return { success: false, message: "Failed to add manual transaction" }
  }
}

