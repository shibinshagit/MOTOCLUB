"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"

export async function getCustomerById(customerId: number) {
  if (!customerId) {
    return { success: false as const, message: "Customer ID is required" }
  }

  try {
    const rows = await sql`
      SELECT *
      FROM customers
      WHERE id = ${customerId}
      LIMIT 1
    `

    if (rows.length === 0) {
      return { success: false as const, message: "Customer not found" }
    }

    return { success: true as const, data: rows[0] }
  } catch (error) {
    console.error("getCustomerById error:", error)
    return { success: false as const, message: "Failed to load customer" }
  }
}

export async function getCustomers(userId?: number, limit?: number, searchTerm?: string) {
  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    let customers

    if (searchTerm && searchTerm.trim() !== "") {
      // Search query - search across name, email, phone, and address
      const searchPattern = `%${searchTerm.toLowerCase()}%`

      if (userId) {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE c.created_by = ${userId}
            AND (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE c.created_by = ${userId}
            AND (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      } else {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE (
              LOWER(c.name) LIKE ${searchPattern}
              OR LOWER(c.email) LIKE ${searchPattern}
              OR c.phone LIKE ${searchPattern}
              OR LOWER(c.address) LIKE ${searchPattern}
            )
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      }
    } else {
      // Regular query without search
      if (userId) {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE c.created_by = ${userId}
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            WHERE c.created_by = ${userId}
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      } else {
        if (limit) {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT ${limit}
          `
        } else {
          customers = await sql`
            SELECT c.*, COUNT(s.id) as order_count
            FROM customers c
            LEFT JOIN sales s ON c.id = s.customer_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
          `
        }
      }
    }

    return { success: true, data: customers }
  } catch (error) {
    console.error("Get customers error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function addCustomer(formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const address = formData.get("address") as string
  const userId = Number.parseInt(formData.get("user_id") as string)

  if (!name) {
    return { success: false, message: "Name is required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await sql`
    INSERT INTO customers (name, email, phone, address, created_by)
    VALUES (${name}, ${email}, ${phone}, ${address}, ${userId})
    RETURNING *
  `

    if (result.length > 0) {
      revalidatePath("/dashboard")
      return { success: true, message: "Customer added successfully", data: result[0] }
    }

    return { success: false, message: "Failed to add customer" }
  } catch (error) {
    console.error("Add customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

// Fixed updateCustomer function to correct SQL syntax
export async function updateCustomer(formData: FormData) {
  const id = Number.parseInt(formData.get("id") as string)
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const phone = formData.get("phone") as string
  const address = formData.get("address") as string
  const userId = formData.get("user_id") ? Number.parseInt(formData.get("user_id") as string) : undefined

  if (!id || !name) {
    return { success: false, message: "ID and name are required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    let result

    // Fix the SQL syntax by using separate queries based on whether userId is provided
    if (userId) {
      result = await sql`
        UPDATE customers
        SET name = ${name}, email = ${email}, phone = ${phone}, address = ${address}
        WHERE id = ${id} AND created_by = ${userId}
        RETURNING *
      `
    } else {
      result = await sql`
        UPDATE customers
        SET name = ${name}, email = ${email}, phone = ${phone}, address = ${address}
        WHERE id = ${id}
        RETURNING *
      `
    }

    if (result.length > 0) {
      revalidatePath("/dashboard")
      return { success: true, message: "Customer updated successfully", data: result[0] }
    }

    return { success: false, message: "Failed to update customer" }
  } catch (error) {
    console.error("Update customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function getCustomerSales(customerId: number) {
  if (!customerId) {
    return { success: false, message: "Customer ID is required", data: [] }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const sales = await sql`
      SELECT s.id, 
             s.sale_date, 
             s.total_amount,
             s.received_amount, 
             s.payment_method, 
             s.status, 
             s.customer_id,
             COUNT(si.id) as item_count
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      WHERE s.customer_id = ${customerId}
      GROUP BY s.id, s.sale_date, s.total_amount, s.received_amount, s.payment_method, s.status, s.customer_id
      ORDER BY s.sale_date DESC
    `

    return { success: true, data: sales }
  } catch (error) {
    console.error("Get customer sales error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export type CustomerSettlementSummary = {
  customer_id: number
  customer_name: string
  total_billed: number
  already_received: number
  still_to_collect: number
  open_sale_count: number
}

export async function getCustomerSettlementSummaries(deviceId: number, userId: number) {
  if (!deviceId || !userId) {
    return { success: false, message: "Device ID and user ID are required", data: [] as CustomerSettlementSummary[] }
  }

  resetConnectionState()

  try {
    const rows = (await sql`
      SELECT
        c.id AS customer_id,
        c.name AS customer_name,
        SUM(COALESCE(s.total_amount, 0))::numeric AS total_billed,
        SUM(COALESCE(s.received_amount, 0))::numeric AS already_received,
        SUM(GREATEST(COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0), 0))::numeric AS still_to_collect,
        COUNT(*) FILTER (
          WHERE COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0) > 0.01
        )::int AS open_sale_count
      FROM customers c
      JOIN sales s ON s.customer_id = c.id
      WHERE c.created_by = ${userId}
        AND s.device_id = ${deviceId}
        AND LOWER(COALESCE(s.status, '')) != 'cancelled'
      GROUP BY c.id, c.name
      HAVING SUM(GREATEST(COALESCE(s.total_amount, 0) - COALESCE(s.received_amount, 0), 0)) > 0.01
      ORDER BY still_to_collect DESC, c.name ASC
    `) as any[]

    const data: CustomerSettlementSummary[] = rows.map((row) => ({
      customer_id: Number(row.customer_id),
      customer_name: String(row.customer_name || `Customer #${row.customer_id}`),
      total_billed: Number(row.total_billed || 0),
      already_received: Number(row.already_received || 0),
      still_to_collect: Number(row.still_to_collect || 0),
      open_sale_count: Number(row.open_sale_count || 0),
    }))

    return { success: true, data }
  } catch (error) {
    console.error("getCustomerSettlementSummaries error:", error)
    return {
      success: false,
      message: getLastError()?.message || "Failed to load customer balances",
      data: [] as CustomerSettlementSummary[],
    }
  }
}

export async function deleteCustomer(id: number) {
  if (!id) {
    return { success: false, message: "Customer ID is required" }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Check if customer has any sales
    const sales = await sql`SELECT id FROM sales WHERE customer_id = ${id}`

    if (sales.length > 0) {
      return { success: false, message: "Cannot delete customer with existing sales" }
    }

    const result = await sql`DELETE FROM customers WHERE id = ${id} RETURNING id`

    if (result.length > 0) {
      revalidatePath("/dashboard")
      return { success: true, message: "Customer deleted successfully" }
    }

    return { success: false, message: "Failed to delete customer" }
  } catch (error) {
    console.error("Delete customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}
