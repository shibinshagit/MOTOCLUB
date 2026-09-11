"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"

import { getSupplierCreditSummary } from "./supplier-payment-actions"

export async function getSuppliers(userId: number, limit?: number, searchTerm?: string) {
  console.log("getSuppliers: Called with userId:", userId, "limit:", limit, "searchTerm:", searchTerm)

  if (!userId) {
    console.error("getSuppliers: No userId provided")
    return { success: false, message: "User ID is required", data: [] }
  }

  resetConnectionState()

  try {
    console.log("getSuppliers: Executing SQL query")

    let suppliers: any[]

    if (searchTerm && searchTerm.trim()) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`
      suppliers = await sql`
        SELECT 
          s.*,
          COALESCE(p.total_purchases, 0) as total_purchases,
          COALESCE(p.total_amount, 0) as total_amount,
          GREATEST(COALESCE(ft.total_paid, 0), COALESCE(p.paid_amount, 0)) as paid_amount,
          COALESCE(p.balance_amount, 0) as balance_amount
        FROM suppliers s
        LEFT JOIN LATERAL (
          SELECT 
            COUNT(*) as total_purchases,
            SUM(total_amount) as total_amount,
            SUM(COALESCE(received_amount, 0)) as paid_amount,
            SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END) as balance_amount
          FROM purchases
          WHERE created_by = ${userId} AND TRIM(supplier) = TRIM(s.name)
        ) p ON true
        LEFT JOIN LATERAL (
          SELECT 
            SUM(amount) as total_paid
          FROM financial_transactions
          WHERE reference_id = s.id 
            AND transaction_type = 'supplier_payment'
            AND created_by = ${userId}
            AND (status IS NULL OR status != 'Cancelled')
        ) ft ON true
        WHERE s.created_by = ${userId}
        AND (
          LOWER(s.name) LIKE ${searchPattern} OR 
          LOWER(s.phone) LIKE ${searchPattern} OR 
          LOWER(s.email) LIKE ${searchPattern}
        )
        ORDER BY s.name ASC
      `
    } else {
      suppliers = await sql`
        SELECT 
          s.*,
          COALESCE(p.total_purchases, 0) as total_purchases,
          COALESCE(p.total_amount, 0) as total_amount,
          GREATEST(COALESCE(ft.total_paid, 0), COALESCE(p.paid_amount, 0)) as paid_amount,
          COALESCE(p.balance_amount, 0) as balance_amount
        FROM suppliers s
        LEFT JOIN LATERAL (
          SELECT 
            COUNT(*) as total_purchases,
            SUM(total_amount) as total_amount,
            SUM(COALESCE(received_amount, 0)) as paid_amount,
            SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END) as balance_amount
          FROM purchases
          WHERE created_by = ${userId} AND TRIM(supplier) = TRIM(s.name)
        ) p ON true
        LEFT JOIN LATERAL (
          SELECT 
            SUM(amount) as total_paid
          FROM financial_transactions
          WHERE reference_id = s.id 
            AND transaction_type = 'supplier_payment'
            AND created_by = ${userId}
            AND (status IS NULL OR status != 'Cancelled')
        ) ft ON true
        WHERE s.created_by = ${userId}
        ORDER BY s.name ASC
      `
    }

    // Batch fetch financial transactions for all suppliers to prevent N+1 query timeouts
    const supplierIds = suppliers.map((s: any) => s.id)
    const allTransactions = supplierIds.length > 0
      ? await sql`
          SELECT reference_id, amount, transaction_type, description, notes
          FROM financial_transactions
          WHERE reference_id = ANY(${supplierIds})
            AND reference_type = 'supplier'
            AND created_by = ${userId}
            AND (status IS NULL OR status != 'Cancelled')
        `
      : []

    const txMap: Record<number, any[]> = {}
    for (const tx of allTransactions) {
      const refId = Number(tx.reference_id)
      if (!txMap[refId]) txMap[refId] = []
      txMap[refId].push(tx)
    }

    const enrichedSuppliers = suppliers.map((s: any) => {
      const sTxs = txMap[s.id] || []
      let originalCredit = 0
      let refundedCredit = 0
      let creditUsed = 0
      let totalPaymentsFromTx = 0

      for (const tx of sTxs) {
        const type = tx.transaction_type
        const amt = Number(tx.amount) || 0

        if (type === "supplier_payment") {
          totalPaymentsFromTx += amt
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

      const totalPurchasesAmount = Number(s.total_amount || 0)
      const outstandingBalance = Math.max(Number(s.balance_amount || 0), 0)
      const totalReceivedOnPurchases = Number(s.paid_amount || 0)

      const effectiveTotalPaid = Math.max(totalPaymentsFromTx, totalReceivedOnPurchases)
      const settledPurchases = Math.max(totalPurchasesAmount - outstandingBalance, 0)
      const calculatedOverpayment = Math.max(effectiveTotalPaid - settledPurchases, 0)

      const legacyCredit = Math.max(totalPaymentsFromTx - Math.max(totalReceivedOnPurchases - creditUsed, 0), calculatedOverpayment, 0)

      if (originalCredit < legacyCredit) {
        originalCredit = legacyCredit
      }

      const availableCredit = Math.max(originalCredit - refundedCredit - creditUsed, 0)

      return {
        ...s,
        balance_amount: outstandingBalance,
        outstanding_balance: outstandingBalance,
        original_credit: originalCredit,
        refunded_credit: refundedCredit,
        credit_used: creditUsed,
        available_credit: availableCredit,
        supplier_credit: availableCredit,
      }
    })

    console.log("getSuppliers: Query successful, found", enrichedSuppliers.length, "suppliers")
    return { success: true, data: enrichedSuppliers }
  } catch (error) {
    console.error("getSuppliers: SQL error:", error)
    console.error("getSuppliers: Error details:", getLastError())
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function getSupplierById(id: number) {
  resetConnectionState()

  try {
    const result = await sql`SELECT * FROM suppliers WHERE id = ${id}`
    if (result.length === 0) {
      return { success: false, message: "Supplier not found" }
    }
    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Get supplier by ID error:", error)
    return { success: false, message: "Failed to fetch supplier" }
  }
}

export async function getSupplierWithPurchases(id: number, userId: number) {
  resetConnectionState()

  try {
    const supplierResult = await sql`
      SELECT * FROM suppliers WHERE id = ${id} AND created_by = ${userId}
    `

    if (supplierResult.length === 0) {
      return { success: false, message: "Supplier not found" }
    }

    const supplier = supplierResult[0]

    const statsResult = await sql`
      SELECT 
        COUNT(*) as total_purchases,
        COALESCE(SUM(total_amount), 0) as total_amount,
        COALESCE(SUM(received_amount), 0) as paid_amount,
        COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END), 0) as balance_amount,
        COALESCE(SUM(CASE WHEN status = 'Credit' THEN total_amount ELSE 0 END), 0) as total_credit,
        COALESCE(SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END), 0) as outstanding_balance
      FROM purchases
      WHERE TRIM(supplier) = TRIM(${supplier.name}) AND created_by = ${userId}
    `

    const purchasesResult = await sql`
      SELECT 
        p.*,
        COALESCE(pi.items_count, 0) as items_count
      FROM purchases p
      LEFT JOIN (
        SELECT 
          purchase_id,
          COUNT(*) as items_count
        FROM purchase_items
        GROUP BY purchase_id
      ) pi ON p.id = pi.purchase_id
      WHERE TRIM(p.supplier) = TRIM(${supplier.name}) AND p.created_by = ${userId}
      ORDER BY p.purchase_date DESC, p.id DESC
    `

    const stats = statsResult[0] || {
      total_purchases: 0,
      total_amount: 0,
      paid_amount: 0,
      balance_amount: 0,
      total_credit: 0,
      outstanding_balance: 0,
    }

    const summaryRes = await getSupplierCreditSummary(id, userId)
    const summary = summaryRes.data || {
      outstandingBalance: Number(stats.balance_amount || 0),
      originalCredit: 0,
      refundedCredit: 0,
      creditUsed: 0,
      availableCredit: 0,
    }

    return {
      success: true,
      data: {
        supplier: {
          ...supplier,
          ...stats,
          balance_amount: summary.outstandingBalance,
          outstanding_balance: summary.outstandingBalance,
          original_credit: summary.originalCredit,
          refunded_credit: summary.refundedCredit,
          credit_used: summary.creditUsed,
          available_credit: summary.availableCredit,
          supplier_credit: summary.availableCredit,
        },
        purchases: purchasesResult,
      },
    }
  } catch (error) {
    console.error("Get supplier with purchases error:", error)
    return { success: false, message: "Failed to fetch supplier details" }
  }
}

export async function createSupplier(formData: FormData) {
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string
  const address = formData.get("address") as string
  const userId = Number.parseInt(formData.get("user_id") as string)

  console.log("createSupplier: Called with data:", { name, phone, email, address, userId })

  if (!name || !phone || !userId) {
    console.error("createSupplier: Missing required fields")
    return { success: false, message: "Name, phone, and user ID are required" }
  }

  resetConnectionState()

  try {
    console.log("createSupplier: Checking for existing supplier")
    const existingSupplier = await sql`
      SELECT id FROM suppliers 
      WHERE TRIM(name) = TRIM(${name}) AND created_by = ${userId}
    `

    if (existingSupplier.length > 0) {
      console.log("createSupplier: Supplier already exists")
      return { success: false, message: "A supplier with this name already exists" }
    }

    console.log("createSupplier: Inserting new supplier")
    const result = await sql`
      INSERT INTO suppliers (name, phone, email, address, created_by)
      VALUES (${name.trim()}, ${phone}, ${email || null}, ${address || null}, ${userId})
      RETURNING *
    `

    console.log("createSupplier: Supplier created successfully:", result[0])
    revalidatePath("/dashboard")
    return { success: true, message: "Supplier added successfully", data: result[0] }
  } catch (error) {
    console.error("createSupplier: Exception:", error)
    console.error("createSupplier: Error details:", getLastError())
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function updateSupplier(formData: FormData) {
  const id = Number.parseInt(formData.get("id") as string)
  const name = formData.get("name") as string
  const phone = formData.get("phone") as string
  const email = formData.get("email") as string
  const address = formData.get("address") as string
  const userId = Number.parseInt(formData.get("user_id") as string)

  if (!id || !name || !phone || !userId) {
    return { success: false, message: "ID, name, phone, and user ID are required" }
  }

  resetConnectionState()

  try {
    // Get the old supplier name before update
    const oldSupplierResult = await sql`
      SELECT name FROM suppliers WHERE id = ${id} AND created_by = ${userId}
    `

    if (oldSupplierResult.length === 0) {
      return { success: false, message: "Supplier not found" }
    }

    const oldSupplierName = oldSupplierResult[0].name

    // Check if supplier with same name already exists for this user (excluding current supplier)
    const existingSupplier = await sql`
      SELECT id FROM suppliers 
      WHERE TRIM(name) = TRIM(${name}) AND created_by = ${userId} AND id != ${id}
    `

    if (existingSupplier.length > 0) {
      return { success: false, message: "A supplier with this name already exists" }
    }

    // Update the supplier
    let result
    try {
      result = await sql`
        UPDATE suppliers 
        SET name = ${name.trim()}, phone = ${phone}, email = ${email || null}, 
            address = ${address || null}, updated_at = CURRENT_TIMESTAMP
        WHERE id = ${id} AND created_by = ${userId}
        RETURNING *
      `
    } catch (error) {
      // If updated_at column doesn't exist, update without it
      console.log("Updating without updated_at column:", error)
      result = await sql`
        UPDATE suppliers 
        SET name = ${name.trim()}, phone = ${phone}, email = ${email || null}, 
            address = ${address || null}
        WHERE id = ${id} AND created_by = ${userId}
        RETURNING *
      `
    }

    if (result.length === 0) {
      return { success: false, message: "Supplier not found or you don't have permission to update it" }
    }

    // Update all related purchase records if the name changed
    if (oldSupplierName.trim() !== name.trim()) {
      console.log(`Updating purchase records from "${oldSupplierName}" to "${name.trim()}"`)
      await sql`
        UPDATE purchases 
        SET supplier = ${name.trim()}
        WHERE TRIM(supplier) = TRIM(${oldSupplierName}) AND created_by = ${userId}
      `
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Supplier updated successfully", data: result[0] }
  } catch (error) {
    console.error("Update supplier error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function deleteSupplier(id: number, userId: number) {
  if (!id || !userId) {
    return { success: false, message: "Supplier ID and user ID are required" }
  }

  resetConnectionState()

  try {
    // Check if supplier is used in any purchases
    const purchaseCount = await sql`
      SELECT COUNT(*) as count FROM purchases 
      WHERE TRIM(supplier) = TRIM((SELECT name FROM suppliers WHERE id = ${id} AND created_by = ${userId}))
    `

    if (purchaseCount[0]?.count > 0) {
      return {
        success: false,
        message: "Cannot delete supplier as it is referenced in existing purchases",
      }
    }

    const result = await sql`
      DELETE FROM suppliers 
      WHERE id = ${id} AND created_by = ${userId}
      RETURNING id
    `

    if (result.length === 0) {
      return { success: false, message: "Supplier not found or you don't have permission to delete it" }
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Supplier deleted successfully" }
  } catch (error) {
    console.error("Delete supplier error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function getSupplierNames(userId: number) {
  if (!userId) {
    return { success: false, message: "User ID is required", data: [] }
  }

  resetConnectionState()

  try {
    const suppliers = await sql`
      SELECT name FROM suppliers
      WHERE created_by = ${userId}
      ORDER BY name ASC
    `

    const supplierNames = suppliers.map((supplier: any) => supplier.name)
    return { success: true, data: supplierNames }
  } catch (error) {
    console.error("Get supplier names error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}
