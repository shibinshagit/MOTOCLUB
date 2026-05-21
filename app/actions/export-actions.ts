"use server"

import { sql, executeWithRetry, resetConnectionState } from "@/lib/db"

// Fetch complete detailed data for all sales
export async function getDetailedSalesData(userId: number) {
  if (!userId) {
    return { success: false, message: "User ID is required", data: [] }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await executeWithRetry(async () => {
      // Get all sales with customer details - removed join with users table
      const sales = await sql`
        SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, 
               c.address as customer_address
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.created_by = ${userId}
        ORDER BY s.sale_date DESC
      `

      // For each sale, get the detailed items
      const salesWithItems = await Promise.all(
        sales.map(async (sale) => {
          const stockDeviceId = Number(sale.device_id || sale.created_by || userId)
          const items = await sql`
            SELECT si.*, p.name as product_name, p.barcode, p.category, p.description as product_description,
                   p.price as current_price, p.wholesale_price, COALESCE(pds.stock, 0) as current_stock
            FROM sale_items si
            JOIN products p ON si.product_id = p.id
            LEFT JOIN product_device_stock pds ON pds.product_id = p.id AND pds.device_id = ${stockDeviceId}
            WHERE si.sale_id = ${sale.id}
          `

          return {
            ...sale,
            created_by_name: "User", // Hardcoded since users table doesn't exist
            items,
          }
        }),
      )

      return salesWithItems
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Get detailed sales data error:", error)
    return {
      success: false,
      message: `Database error: ${error.message || "Unknown error"}. Please try again later.`,
      data: [],
    }
  }
}

// Fetch complete detailed data for a single sale
export async function getDetailedSaleData(saleId: number) {
  if (!saleId) {
    return { success: false, message: "Sale ID is required", data: null }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    const result = await executeWithRetry(async () => {
      // Get the sale with customer details - removed join with users table
      const sales = await sql`
        SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, 
               c.address as customer_address
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.id = ${saleId}
      `

      if (sales.length === 0) {
        return null
      }

      const sale = sales[0]
      const stockDeviceId = Number(sale.device_id || sale.created_by || 0)

      // Get the detailed items
      const items = await sql`
        SELECT si.*, p.name as product_name, p.barcode, p.category, p.description as product_description,
               p.price as current_price, p.wholesale_price, COALESCE(pds.stock, 0) as current_stock
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        LEFT JOIN product_device_stock pds ON pds.product_id = p.id AND pds.device_id = ${stockDeviceId}
        WHERE si.sale_id = ${saleId}
      `

      return {
        ...sale,
        created_by_name: "User", // Hardcoded since users table doesn't exist
        items,
      }
    })

    return { success: true, data: result }
  } catch (error) {
    console.error("Get detailed sale data error:", error)
    return {
      success: false,
      message: `Database error: ${error.message || "Unknown error"}. Please try again later.`,
      data: null,
    }
  }
}
