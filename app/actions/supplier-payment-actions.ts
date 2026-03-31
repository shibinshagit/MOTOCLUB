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
) {
  console.log("paySupplierCredit: Starting payment process", {
    supplierId,
    paymentAmount,
    userId,
    deviceId,
    paymentMethod,
    paymentDate,
  })

  if (!supplierId || !paymentAmount || !userId || !deviceId) {
    return { success: false, message: "Missing required parameters" }
  }

  if (paymentAmount <= 0) {
    return { success: false, message: "Payment amount must be greater than zero" }
  }

  resetConnectionState()

  try {
    await sql`BEGIN`

    const supplierResult = await sql`
      SELECT * FROM suppliers WHERE id = ${supplierId} AND created_by = ${userId}
    `

    if (supplierResult.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "Supplier not found" }
    }

    const supplier = supplierResult[0]

    const creditPurchases = await sql`
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

    console.log(`Found ${creditPurchases.length} credit purchases for supplier ${supplier.name}`)

    if (creditPurchases.length === 0) {
      await sql`ROLLBACK`
      return { success: false, message: "No outstanding credit purchases found for this supplier" }
    }

    const totalOutstanding = creditPurchases.reduce((sum, purchase) => {
      return sum + (Number(purchase.total_amount) - Number(purchase.received_amount || 0))
    }, 0)

    if (paymentAmount > totalOutstanding) {
      await sql`ROLLBACK`
      return {
        success: false,
        message: `Payment amount (${paymentAmount}) exceeds total outstanding balance (${totalOutstanding})`,
      }
    }

    let remainingPayment = paymentAmount
    const allocations: PaymentAllocation[] = []

    for (const purchase of creditPurchases) {
      if (remainingPayment <= 0) break

      const currentBalance = Number(purchase.total_amount) - Number(purchase.received_amount || 0)
      const allocationAmount = Math.min(remainingPayment, currentBalance)
      const newReceivedAmount = Number(purchase.received_amount || 0) + allocationAmount
      const newRemainingBalance = Number(purchase.total_amount) - newReceivedAmount

      await sql`
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

      remainingPayment -= allocationAmount

      console.log(`Allocated ${allocationAmount} to purchase ${purchase.id}, remaining balance: ${newRemainingBalance}`)
    }

    const remainingCredit = totalOutstanding - paymentAmount

    console.log("Payment allocation completed:", {
      totalPaid: paymentAmount,
      allocationsCount: allocations.length,
      remainingCredit,
    })

    let finalPaymentDate: Date
    if (paymentDate) {
      finalPaymentDate = new Date(paymentDate.getTime() - paymentDate.getTimezoneOffset() * 60000)
      console.log("Using provided payment date:", finalPaymentDate)
    } else {
      const now = new Date()
      finalPaymentDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      console.log("Using current date as payment date:", finalPaymentDate)
    }

    const transactionResult = await recordSupplierPayment({
      supplierId: supplierId,
      supplierName: supplier.name,
      paymentAmount: paymentAmount,
      paymentMethod: paymentMethod,
      allocations: allocations,
      deviceId: deviceId,
      userId: userId,
      paymentDate: finalPaymentDate,
      notes: notes,
    })

    if (!transactionResult.success) {
      console.error("Failed to record supplier payment transaction:", transactionResult.error)
      console.log("Payment completed but transaction recording failed")
    } else {
      console.log("Supplier payment transaction recorded successfully:", transactionResult.transactionId)
    }

    await sql`COMMIT`

    revalidatePath("/dashboard")

    return {
      success: true,
      message: "Payment processed successfully",
      data: {
        totalPaid: paymentAmount,
        allocations,
        remainingCredit,
        transactionId: transactionResult.transactionId,
      },
    }
  } catch (error) {
    await sql`ROLLBACK`
    console.error("paySupplierCredit: Error processing payment:", error)
    console.error("paySupplierCredit: Error details:", getLastError())
    return {
      success: false,
      message: `Payment processing failed: ${getLastError()?.message || "Unknown error"}`,
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
  notes: string | null
}

/**
 * List supplier_payment rows for a supplier (for Suppliers tab: view / edit credit payments).
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
      SELECT id, amount, payment_method, transaction_date, notes
      FROM financial_transactions
      WHERE transaction_type = 'supplier_payment'
        AND reference_id = ${supplierId}
        AND device_id = ${deviceId}
        AND created_by = ${userId}
      ORDER BY transaction_date DESC, id DESC
    `

    const data: SupplierPaymentListRow[] = rows.map((r: any) => ({
      id: r.id,
      amount: Number(r.amount) || 0,
      payment_method: r.payment_method || "Cash",
      transaction_date: r.transaction_date,
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

    await sql`BEGIN`

    try {
      // Get supplier name
      const supplierResult = await sql`
        SELECT name FROM suppliers WHERE id = ${supplierId} LIMIT 1
      `
      
      const supplierName = supplierResult.length > 0 ? supplierResult[0].name : null

      if (!supplierName) {
        await sql`ROLLBACK`
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

      await sql`COMMIT`

      console.log('Supplier payment deleted successfully')

      revalidatePath("/dashboard")
      revalidatePath("/dashboard?tab=accounting")
      
      return {
        success: true,
        message: "Supplier payment deleted successfully",
      }
    } catch (error) {
      await sql`ROLLBACK`
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
 * Diagnostic functions for testing
 */
export async function runFinancialTransactionsDiagnostics(deviceId: number) {
  const results: any = {
    timestamp: new Date().toISOString(),
    deviceId,
    tests: []
  }

  try {
    console.log("=== Financial Transactions Diagnostics ===")
    
    const tableExists = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'financial_transactions'
      ) as exists
    `
    
    if (!tableExists[0]?.exists) {
      results.error = "Table does not exist"
      return results
    }

    const columns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'financial_transactions'
      ORDER BY ordinal_position
    `
    
    console.log("Table columns:", columns.map((c: any) => c.column_name).join(", "))
    results.columns = columns

    const samplePayment = await sql`
      SELECT *
      FROM financial_transactions
      WHERE device_id = ${deviceId}
        AND transaction_type = 'supplier_payment'
      ORDER BY transaction_date DESC
      LIMIT 1
    `

    if (samplePayment.length > 0) {
      console.log("Sample payment structure:", Object.keys(samplePayment[0]))
      results.samplePayment = samplePayment[0]
    }

    return results
  } catch (error: any) {
    console.error("Diagnostics failed:", error)
    results.error = error.message
    return results
  }
}

export async function testSupplierPaymentFetch(paymentId: number) {
  console.log(`Testing supplier payment fetch for ID: ${paymentId}`)
  return await getSupplierPaymentById(paymentId)
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

    await sql`BEGIN`

    try {
      // Get the original payment
      const originalPayment = await sql`
        SELECT * FROM financial_transactions
        WHERE id = ${data.paymentId} 
          AND device_id = ${data.deviceId}
          AND transaction_type = 'supplier_payment'
      `

      if (originalPayment.length === 0) {
        await sql`ROLLBACK`
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
        await sql`ROLLBACK`
        return {
          success: false,
          message: "Invalid supplier ID in payment record",
        }
      }

      const supplierResult = await sql`
        SELECT name FROM suppliers WHERE id = ${supplierId} LIMIT 1
      `
      
      if (supplierResult.length === 0) {
        await sql`ROLLBACK`
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
            await sql`ROLLBACK`
            return {
              success: false,
              message: `Cannot allocate ${remainingToAllocate.toFixed(2)} - no outstanding balance available. Total new amount would exceed supplier's outstanding balance.`,
            }
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

      await sql`COMMIT`

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
      await sql`ROLLBACK`
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
