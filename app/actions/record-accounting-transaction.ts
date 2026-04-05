"use server"

import { sql } from "@/lib/db"

interface AccountingTransaction {
  transactionType: string
  referenceType?: string
  referenceId?: number
  amount: number
  description: string
  category?: string
  accountType: string
  deviceId: number
  companyId: number
  createdBy: number
}

export async function recordAccountingTransaction(transaction: AccountingTransaction) {
  try {
    console.log("Recording accounting transaction:", transaction)

    // Insert the transaction
    const result = await sql`
      INSERT INTO financial_ledger (
        transaction_type,
        reference_type,
        reference_id,
        amount,
        description,
        category,
        account_type,
        device_id,
        company_id,
        created_by
      ) VALUES (
        ${transaction.transactionType},
        ${transaction.referenceType || null},
        ${transaction.referenceId || null},
        ${transaction.amount},
        ${transaction.description},
        ${transaction.category || null},
        ${transaction.accountType},
        ${transaction.deviceId},
        ${transaction.companyId},
        ${transaction.createdBy}
      )
      RETURNING id
    `

    console.log("Accounting transaction recorded with ID:", result[0]?.id)
    return { success: true, id: result[0]?.id }
  } catch (error) {
    console.error("Error recording accounting transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}

export async function recordSaleTransaction(
  saleId: number,
  totalAmount: number,
  deviceId: number,
  companyId: number,
  userId: number,
  customerId?: number,
) {
  try {
    console.log("Recording sale transaction:", { saleId, totalAmount, deviceId })

    // Record the sale revenue
    await recordAccountingTransaction({
      transactionType: "sale",
      referenceType: "sale",
      referenceId: saleId,
      amount: totalAmount,
      description: `Sale #${saleId}`,
      category: "Sales Revenue",
      accountType: "revenue",
      deviceId,
      companyId,
      createdBy: userId,
    })

    // If it's a credit sale, create accounts receivable
    if (customerId) {
      await sql`
        INSERT INTO accounts_receivable (
          customer_id,
          sale_id,
          original_amount,
          outstanding_amount,
          due_date,
          device_id,
          company_id
        ) VALUES (
          ${customerId},
          ${saleId},
          ${totalAmount},
          ${totalAmount},
          ${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()},
          ${deviceId},
          ${companyId}
        )
      `
    }

    return { success: true }
  } catch (error) {
    console.error("Error recording sale transaction:", error)
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" }
  }
}
