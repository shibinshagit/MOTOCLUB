"use server"

import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

interface SaleItem {
  product_id: number
  quantity: number
  type: "product" | "service"
}

interface SaleData {
  customer_id: number | null
  staff_id: number
  device_id: number
  total_amount: number
  payment_method: string
  status: string
  items: SaleItem[]
}

export async function createSale(saleData: SaleData) {
  try {
    // Start transaction
    await sql`BEGIN`

    // Create the sale record
    const [sale] = await sql`
      INSERT INTO sales (
        customer_id, 
        staff_id, 
        device_id, 
        total_amount, 
        payment_method, 
        status, 
        is_pos_updated,
        sale_date
      )
      VALUES (
        ${saleData.customer_id}, 
        ${saleData.staff_id}, 
        ${saleData.device_id}, 
        ${saleData.total_amount}, 
        ${saleData.payment_method}, 
        ${saleData.status}, 
        false,
        NOW()
      )
      RETURNING id
    `

    const saleId = sale.id

    // Insert sale items - THIS IS THE KEY FIX
    // Both products and services use the same product_id field
    for (const item of saleData.items) {
      await sql`
        INSERT INTO sale_items (
          sale_id, 
          product_id, 
          quantity
        )
        VALUES (
          ${saleId}, 
          ${item.product_id}, 
          ${item.quantity}
        )
      `
    }

    // Commit transaction
    await sql`COMMIT`

    return { success: true, saleId }
  } catch (error) {
    // Rollback on error
    await sql`ROLLBACK`
    console.error("Error creating sale:", error)
    throw new Error("Failed to create sale")
  }
}

export async function getProducts(deviceId: number) {
  const products = await sql`
    SELECT id, name, price, stock_quantity as stock
    FROM products 
    WHERE device_id = ${deviceId} 
    AND is_active = true
    ORDER BY name
  `
  return products.map((p) => ({ ...p, type: "product" as const }))
}

export async function getServices(deviceId: number) {
  const services = await sql`
    SELECT id, name, price, cost
    FROM services 
    WHERE device_id = ${deviceId} 
    AND is_active = true
    ORDER BY name
  `
  return services.map((s) => ({ ...s, type: "service" as const }))
}

export async function getCustomers(deviceId: number) {
  const customers = await sql`
    SELECT id, name, phone
    FROM customers 
    WHERE device_id = ${deviceId}
    ORDER BY name
  `
  return customers
}

export async function getStaff(deviceId: number) {
  const staff = await sql`
    SELECT id, name
    FROM staff 
    WHERE device_id = ${deviceId}
    AND is_active = true
    ORDER BY name
  `
  return staff
}
