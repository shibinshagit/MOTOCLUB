"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getSuppliers(userId: number, limit?: number, searchTerm?: string) {
  console.log("getSuppliers: Called with userId:", userId, "limit:", limit, "searchTerm:", searchTerm)

  if (!userId) {
    console.error("getSuppliers: No userId provided")
    return { success: false, message: "User ID is required", data: [] }
  }

  resetConnectionState()

  try {
    console.log("getSuppliers: Executing SQL query")

    let suppliers

    if (searchTerm && searchTerm.trim()) {
      // Search query - FIXED: Exclude cancelled purchases from balance calculation
      const searchPattern = `%${searchTerm.toLowerCase()}%`
      suppliers = await sql`
        SELECT 
          s.*,
          COALESCE(p.total_purchases, 0) as total_purchases,
          COALESCE(p.total_amount, 0) as total_amount,
          COALESCE(p.paid_amount, 0) as paid_amount,
          COALESCE(p.balance_amount, 0) as balance_amount
        FROM suppliers s
        LEFT JOIN (
          SELECT 
            TRIM(supplier) as supplier,
            COUNT(*) as total_purchases,
            SUM(total_amount) as total_amount,
            SUM(COALESCE(received_amount, 0)) as paid_amount,
            SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END) as balance_amount
          FROM purchases
          WHERE created_by = ${userId}
          GROUP BY TRIM(supplier)
        ) p ON TRIM(s.name) = p.supplier
        WHERE s.created_by = ${userId}
        AND (
          LOWER(s.name) LIKE ${searchPattern} OR 
          LOWER(s.phone) LIKE ${searchPattern} OR 
          LOWER(s.email) LIKE ${searchPattern}
        )
        ORDER BY s.name ASC
      `
    } else {
      // Regular query - FIXED: Exclude cancelled purchases from balance calculation
      suppliers = await sql`
        SELECT 
          s.*,
          COALESCE(p.total_purchases, 0) as total_purchases,
          COALESCE(p.total_amount, 0) as total_amount,
          COALESCE(p.paid_amount, 0) as paid_amount,
          COALESCE(p.balance_amount, 0) as balance_amount
        FROM suppliers s
        LEFT JOIN (
          SELECT 
            TRIM(supplier) as supplier,
            COUNT(*) as total_purchases,
            SUM(total_amount) as total_amount,
            SUM(COALESCE(received_amount, 0)) as paid_amount,
            SUM(CASE WHEN status != 'Cancelled' THEN (total_amount - COALESCE(received_amount, 0)) ELSE 0 END) as balance_amount
          FROM purchases
          WHERE created_by = ${userId}
          GROUP BY TRIM(supplier)
        ) p ON TRIM(s.name) = p.supplier
        WHERE s.created_by = ${userId}
        ORDER BY s.name ASC
      `
    }

    console.log("getSuppliers: Query successful, found", suppliers.length, "suppliers")
    return { success: true, data: suppliers }
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
    // Get supplier details
    const supplierResult = await sql`
      SELECT * FROM suppliers WHERE id = ${id} AND created_by = ${userId}
    `

    if (supplierResult.length === 0) {
      return { success: false, message: "Supplier not found" }
    }

    const supplier = supplierResult[0]

    // FIXED: Get supplier purchase statistics excluding cancelled purchases from balance
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

    // Get all purchases from this supplier with received amounts
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

    return {
      success: true,
      data: {
        supplier: {
          ...supplier,
          ...stats,
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

    const supplierNames = suppliers.map((supplier) => supplier.name)
    return { success: true, data: supplierNames }
  } catch (error) {
    console.error("Get supplier names error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}
