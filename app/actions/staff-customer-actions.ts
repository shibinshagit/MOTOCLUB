"use server"

import { sql, getLastError, resetConnectionState } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { getStaffSession } from "@/lib/staff-session"

export interface StaffCustomer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  order_count: number
  outstanding_amount: number
  last_visit?: string
  created_at: string
}

export async function getStaffCustomers(searchTerm?: string) {
  resetConnectionState()

  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized. Staff session not found." }
    }
    
    // In the staff app, we scope strictly by the device
    const deviceId = session.deviceId

    let customers = []
    
    // We group by customer and calculate a read-only outstanding amount.
    // outstanding_amount = SUM(total_amount - received_amount) for all sales of this customer.
    
    if (searchTerm && searchTerm.trim() !== "") {
      const searchPattern = `%${searchTerm.toLowerCase()}%`
      customers = await sql`
        SELECT 
          c.id, c.name, c.phone, c.email, c.address, c.created_at,
          COUNT(s.id) as order_count,
          MAX(s.sale_date) as last_visit,
          COALESCE(SUM(s.total_amount - s.received_amount), 0) as outstanding_amount
        FROM customers c
        LEFT JOIN sales s ON c.id = s.customer_id
        WHERE c.created_by = ${deviceId}
        AND (
          LOWER(c.name) LIKE ${searchPattern}
          OR LOWER(c.email) LIKE ${searchPattern}
          OR c.phone LIKE ${searchPattern}
          OR LOWER(c.address) LIKE ${searchPattern}
        )
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `
    } else {
      customers = await sql`
        SELECT 
          c.id, c.name, c.phone, c.email, c.address, c.created_at,
          COUNT(s.id) as order_count,
          MAX(s.sale_date) as last_visit,
          COALESCE(SUM(s.total_amount - s.received_amount), 0) as outstanding_amount
        FROM customers c
        LEFT JOIN sales s ON c.id = s.customer_id
        WHERE c.created_by = ${deviceId}
        GROUP BY c.id
        ORDER BY c.created_at DESC
      `
    }

    return { success: true, data: customers }
  } catch (error: any) {
    console.error("Get staff customers error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

export async function addStaffCustomer(formData: FormData) {
  resetConnectionState()

  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized. Staff session not found." }
    }
    const deviceId = session.deviceId

    const name = formData.get("name") as string
    const email = (formData.get("email") as string) || ""
    const phone = (formData.get("phone") as string) || ""
    const address = (formData.get("address") as string) || ""

    if (!name) {
      return { success: false, message: "Name is required" }
    }

    const result = await sql`
      INSERT INTO customers (name, email, phone, address, created_by)
      VALUES (${name}, ${email}, ${phone}, ${address}, ${deviceId})
      RETURNING *
    `
    
    revalidatePath("/staff/dashboard")
    return { success: true, message: "Customer added successfully", data: result[0] }
  } catch (error) {
    console.error("Add staff customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}

export async function updateStaffCustomer(formData: FormData) {
  resetConnectionState()

  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized. Staff session not found." }
    }
    const deviceId = session.deviceId

    const id = formData.get("id")
    const name = formData.get("name") as string
    const email = (formData.get("email") as string) || ""
    const phone = (formData.get("phone") as string) || ""
    const address = (formData.get("address") as string) || ""

    if (!id || !name) {
      return { success: false, message: "ID and Name are required" }
    }

    // Verify ownership
    const existing = await sql`
      SELECT id FROM customers WHERE id = ${id} AND created_by = ${deviceId}
    `
    if (existing.length === 0) {
      return { success: false, message: "Customer not found or unauthorized" }
    }

    const result = await sql`
      UPDATE customers
      SET name = ${name}, email = ${email}, phone = ${phone}, address = ${address}
      WHERE id = ${id} AND created_by = ${deviceId}
      RETURNING *
    `
    
    revalidatePath("/staff/dashboard")
    return { success: true, message: "Customer updated successfully", data: result[0] }
  } catch (error) {
    console.error("Update staff customer error:", error)
    return {
      success: false,
      message: `Database error: ${getLastError()?.message || "Unknown error"}. Please try again later.`,
    }
  }
}
