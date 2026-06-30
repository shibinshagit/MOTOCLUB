"use server"

import { sql } from "@/lib/db"
import {
  buildManualEntryDescription,
  parseManualEntryDetailFromDescription,
  resolveManualEntryCategory,
} from "@/lib/manual-entry-categories"
import { getManualEntryCategoryByName } from "./master-data-actions"

/**
 * Get manual transaction by ID
 * @param transactionId - The ID of the manual transaction
 * @returns Object with success status and transaction data
 */
export async function getManualTransactionById(transactionId: number) {
  try {
    console.log("Fetching manual transaction with ID:", transactionId)

    if (!transactionId) {
      return {
        success: false,
        message: "Transaction ID is required",
        data: null,
      }
    }

    let transaction = null

    try {
      const result = await sql`
        SELECT 
          id,
          amount,
          transaction_type as type,
          description,
          category_name,
          payment_method,
          transaction_date,
          created_at,
          updated_at,
          device_id,
          created_by as user_id,
          status,
          reference_id,
          reference_type,
          received_amount,
          cost_amount,
          debit_amount,
          credit_amount,
          notes
        FROM financial_transactions
        WHERE id = ${transactionId}
        LIMIT 1
      `
      
      if (result && result.length > 0) {
        transaction = result[0]
        console.log('Found in financial_transactions table:', transaction)
      }
    } catch (error) {
      console.log(
        "Error fetching from financial_transactions:",
        error instanceof Error ? error.message : error,
      )
    }

    if (!transaction) {
      console.log("Transaction not found for ID:", transactionId)
      return {
        success: false,
        message: `Transaction #${transactionId} not found.`,
        data: null,
      }
    }

    // Normalize the transaction data
    const mappedTransaction = {
      id: transaction.id,
      amount: Number(transaction.amount) || 0,
      type: getTransactionType(transaction),
      description: parseManualEntryDetailFromDescription(transaction.description),
      category: resolveManualEntryCategory(transaction.category_name, transaction.description),
      category_id: Number(transaction.reference_id) || null,
      payment_method: transaction.payment_method || 'Cash',
      transaction_date: transaction.transaction_date || transaction.created_at,
      created_at: transaction.created_at,
      updated_at: transaction.updated_at || transaction.created_at,
      device_id: transaction.device_id,
      user_id: transaction.user_id || transaction.created_by,
      status: transaction.status || 'Completed',
      reference_number: transaction.reference_id ? `TRX-${transaction.reference_id}` : `TRX-${transaction.id}`,
    }

    console.log(`Transaction mapped successfully:`, mappedTransaction)

    return {
      success: true,
      message: "Transaction fetched successfully",
      data: mappedTransaction,
    }
  } catch (error) {
    console.error("Error fetching transaction:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch transaction",
      data: null,
    }
  }
}

// Helper function to determine transaction type
function getTransactionType(transaction: any): "debit" | "credit" {
  if (transaction.type === 'credit' || transaction.credit_amount > 0) {
    return 'credit'
  }
  if (transaction.type === 'debit' || transaction.debit_amount > 0) {
    return 'debit'
  }
  // Default based on amount
  return Number(transaction.amount) >= 0 ? 'credit' : 'debit'
}

// Helper function to determine category
function getCategoryFromTransaction(transaction: any): string {
  return resolveManualEntryCategory(transaction.category_name, transaction.description)
}

/**
 * Update manual transaction
 * @param transactionId - The ID of the transaction to update
 * @param data - The updated transaction data
 * @returns Object with success status and message
 */
export async function updateManualTransaction(
  transactionId: number,
  data: {
    amount: number
    type: "debit" | "credit"
    description: string
    category: string
    categoryId?: number
    payment_method: string
    transaction_date: Date
    deviceId?: number
    userId?: number
  }
) {
  try {
    console.log("Updating manual transaction:", transactionId)

    if (!transactionId) {
      return {
        success: false,
        message: "Transaction ID is required",
      }
    }

    if (!data.amount || !data.type || !data.category) {
      return {
        success: false,
        message: "Missing required fields",
      }
    }

    const debitAmount = data.type === "debit" ? data.amount : 0
    const creditAmount = data.type === "credit" ? data.amount : 0
    const category = resolveManualEntryCategory(data.category, null)
    const description = buildManualEntryDescription(category, data.description)

    let categoryId = data.categoryId || 0
    if (!categoryId && data.deviceId) {
      const masterCategory = await getManualEntryCategoryByName(data.deviceId, category)
      categoryId = masterCategory?.id || 0
    }

    const result = await sql`
      UPDATE financial_transactions
      SET 
        amount = ${data.amount},
        description = ${description},
        category_name = ${category},
        reference_id = ${categoryId},
        transaction_type = ${data.type},
        payment_method = ${data.payment_method},
        transaction_date = ${data.transaction_date},
        debit_amount = ${debitAmount},
        credit_amount = ${creditAmount},
        updated_at = NOW()
      WHERE id = ${transactionId} AND reference_type = 'manual'
      RETURNING id
    `

    if (!result || result.length === 0) {
      return {
        success: false,
        message: "Manual transaction not found or could not be updated",
      }
    }

    console.log("Manual transaction updated successfully:", transactionId)

    return {
      success: true,
      message: "Manual transaction updated successfully",
    }
  } catch (error) {
    console.error("Error updating manual transaction:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to update manual transaction",
    }
  }
}

/**
 * Delete manual transaction
 * @param transactionId - The ID of the transaction to delete
 * @param deviceId - The device ID for verification
 * @returns Object with success status and message
 */
export async function deleteManualTransaction(transactionId: number, deviceId: number) {
  try {
    console.log("Deleting manual transaction:", transactionId)

    if (!transactionId || !deviceId) {
      return {
        success: false,
        message: "Transaction ID and Device ID are required",
      }
    }

    // Check if transaction exists and belongs to the device
    const transaction = await sql`
      SELECT id, device_id, reference_type
      FROM financial_transactions
      WHERE id = ${transactionId}
      LIMIT 1
    `

    if (!transaction || transaction.length === 0) {
      return {
        success: false,
        message: "Manual transaction not found",
      }
    }

    const transactionData = transaction[0]

    // Verify device ownership
    if (transactionData.device_id !== deviceId) {
      return {
        success: false,
        message: "Unauthorized: Transaction does not belong to this device",
      }
    }

    // Delete the transaction
    const deleteResult = await sql`
      DELETE FROM financial_transactions
      WHERE id = ${transactionId} AND device_id = ${deviceId}
      RETURNING id
    `

    if (!deleteResult || deleteResult.length === 0) {
      return {
        success: false,
        message: "Failed to delete manual transaction",
      }
    }

    console.log("Manual transaction deleted successfully:", transactionId)

    return {
      success: true,
      message: "Manual transaction deleted successfully",
    }
  } catch (error) {
    console.error("Error deleting manual transaction:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to delete manual transaction",
    }
  }
}

/**
 * Get all manual transactions for a device
 * @param deviceId - The device ID
 * @param dateFrom - Optional start date filter
 * @param dateTo - Optional end date filter
 * @returns Object with success status and transactions array
 */
export async function getManualTransactions(
  deviceId: number,
  dateFrom?: Date,
  dateTo?: Date
) {
  try {
    console.log("Fetching manual transactions for device:", deviceId)

    if (!deviceId) {
      return {
        success: false,
        message: "Device ID is required",
        data: [],
      }
    }

    let transactions: any[] = []

    try {
      if (dateFrom && dateTo) {
        transactions = await sql`
          SELECT 
            id,
            amount,
            transaction_type as type,
            description,
            payment_method,
            transaction_date,
            created_at,
            updated_at,
            status,
            reference_id as reference_number,
            debit_amount,
            credit_amount,
            reference_type
          FROM financial_transactions
          WHERE device_id = ${deviceId} 
            AND reference_type = 'manual'
            AND transaction_date >= ${dateFrom}
            AND transaction_date <= ${dateTo}
          ORDER BY transaction_date DESC, id DESC
        `
      } else {
        transactions = await sql`
          SELECT 
            id,
            amount,
            transaction_type as type,
            description,
            payment_method,
            transaction_date,
            created_at,
            updated_at,
            status,
            reference_id as reference_number,
            debit_amount,
            credit_amount,
            reference_type
          FROM financial_transactions
          WHERE device_id = ${deviceId} AND reference_type = 'manual'
          ORDER BY transaction_date DESC, id DESC
        `
      }
    } catch (error) {
      console.log(
        "Error fetching manual transactions:",
        error instanceof Error ? error.message : error,
      )
    }

    console.log(`Fetched ${transactions.length} manual transactions`)

    return {
      success: true,
      message: "Manual transactions fetched successfully",
      data: transactions,
    }
  } catch (error) {
    console.error("Error fetching manual transactions:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Failed to fetch manual transactions",
      data: [],
    }
  }
}
