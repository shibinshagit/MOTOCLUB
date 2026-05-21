"use server"

import { sql, resetConnectionState, isConnected } from "@/lib/db"

// Default currency is now INR
const DEFAULT_CURRENCY = "INR"

// Helper function to get device currency
export async function getDeviceCurrency(deviceId: number) {
  try {
    // Ensure deviceId is a number
    if (typeof deviceId !== "number" || isNaN(deviceId)) {
      return DEFAULT_CURRENCY
    }

    // Check if the devices table has a currency column
    let hasCurrencyColumn = true
    try {
      await sql`SELECT currency FROM devices LIMIT 1`
    } catch (error) {
      hasCurrencyColumn = false
      return DEFAULT_CURRENCY // Default currency if column doesn't exist
    }

    if (hasCurrencyColumn) {
      const result = await sql`
        SELECT currency FROM devices WHERE id = ${deviceId}
      `

      if (result && result.length > 0 && result[0]?.currency) {
        return result[0].currency
      } else {
        return DEFAULT_CURRENCY // Default currency if no result
      }
    }

    return DEFAULT_CURRENCY // Default currency
  } catch (error) {
    return DEFAULT_CURRENCY // Default to INR on error
  }
}

export async function getUserDashboardSummary(userId: number, deviceId: number) {
  if (!userId || !deviceId) {
    return {
      success: false,
      message: "User ID and Device ID are required",
      data: {
        totalSales: 0,
        totalPurchases: 0,
        totalProfit: 0,
        manualIncome: 0,
        manualExpenses: 0,
        totalCOGS: 0,
        recentSales: [],
        recentPurchases: [],
        lowStockProducts: [],
        topCustomers: [],
      },
    }
  }

  // Reset connection state to allow a fresh attempt
  resetConnectionState()

  try {
    // Check if database is connected
    if (!isConnected()) {
      return {
        success: false,
        message: "Database connection failed",
        data: {
          totalSales: 0,
          totalPurchases: 0,
          totalProfit: 0,
          manualIncome: 0,
          manualExpenses: 0,
          totalCOGS: 0,
          recentSales: [],
          recentPurchases: [],
          lowStockProducts: [],
          topCustomers: [],
        },
      }
    }

    // First, let's try to get the out of stock products (stock = 0)
    const outOfStockProducts = await sql`
      SELECT
        p.*,
        COALESCE(pc.name, p.category) as category_name,
        COALESCE(pds.stock, 0) as stock
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN product_device_stock pds
        ON pds.product_id = p.id AND pds.device_id = ${userId}
      WHERE COALESCE(pds.stock, 0) = 0
        AND p.created_by IN (
          SELECT d2.id
          FROM devices d1
          JOIN devices d2 ON d2.company_id = d1.company_id
          WHERE d1.id = ${userId}
        )
      ORDER BY p.name ASC
      LIMIT 5
    `

    // If we have out of stock products, use those
    let lowStockProducts = outOfStockProducts

    // If we don't have any out of stock products, try to get low stock products (stock < 5)
    if (outOfStockProducts.length === 0) {
      lowStockProducts = await sql`
        SELECT
          p.*,
          COALESCE(pc.name, p.category) as category_name,
          COALESCE(pds.stock, 0) as stock
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_device_stock pds
          ON pds.product_id = p.id AND pds.device_id = ${userId}
        WHERE COALESCE(pds.stock, 0) < 5
          AND COALESCE(pds.stock, 0) > 0
          AND p.created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
        ORDER BY COALESCE(pds.stock, 0) ASC
        LIMIT 5
      `
    }

    // If we still don't have any products, try with a higher threshold (stock < 10)
    if (lowStockProducts.length === 0) {
      lowStockProducts = await sql`
        SELECT
          p.*,
          COALESCE(pc.name, p.category) as category_name,
          COALESCE(pds.stock, 0) as stock
        FROM products p
        LEFT JOIN product_categories pc ON p.category_id = pc.id
        LEFT JOIN product_device_stock pds
          ON pds.product_id = p.id AND pds.device_id = ${userId}
        WHERE COALESCE(pds.stock, 0) < 10
          AND p.created_by IN (
            SELECT d2.id
            FROM devices d1
            JOIN devices d2 ON d2.company_id = d1.company_id
            WHERE d1.id = ${userId}
          )
        ORDER BY COALESCE(pds.stock, 0) ASC
        LIMIT 5
      `
    }

    // Run all other queries in parallel for better performance
    const [
      totalSalesResult,
      totalPurchasesResult,
      manualIncomeResult,
      manualExpensesResult,
      totalCOGSResult,
      recentSales,
      recentPurchases,
      topCustomers,
    ] = await Promise.all([
      // Get total sales for this user
      sql`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM sales
        WHERE status != 'Cancelled' AND created_by = ${userId}
      `,

      // Get total purchases for this user
      sql`
        SELECT COALESCE(SUM(total_amount), 0) as total
        FROM purchases
        WHERE status != 'Cancelled' AND created_by = ${userId}
      `,

      // Get manual income from financial transactions using device_id
      sql`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM financial_transactions
        WHERE transaction_type = 'income' AND device_id = ${deviceId}
      `,

      // Get manual expenses from financial transactions using device_id
      sql`
        SELECT COALESCE(SUM(amount), 0) as total
        FROM financial_transactions
        WHERE transaction_type = 'expense' AND device_id = ${deviceId}
      `,

      // Calculate COGS using quantity * wholesale_price
      sql`
        SELECT COALESCE(SUM(si.quantity * p.wholesale_price), 0) as total_cogs
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.status != 'Cancelled' AND s.created_by = ${userId}
      `,

      // Get recent sales for this user (limited to 5)
      sql`
        SELECT s.*, c.name as customer_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.created_by = ${userId}
        ORDER BY s.sale_date DESC
        LIMIT 5
      `,

      // Get recent purchases for this user (limited to 5)
      sql`
        SELECT p.*
        FROM purchases p
        WHERE p.created_by = ${userId}
        ORDER BY p.purchase_date DESC
        LIMIT 5
      `,

      // Get top customers for this user (limited to 5)
      sql`
        SELECT c.*, COUNT(s.id) as order_count, SUM(s.total_amount) as total_spent
        FROM customers c
        JOIN sales s ON c.id = s.customer_id
        WHERE s.status != 'Cancelled' AND s.created_by = ${userId}
        GROUP BY c.id
        ORDER BY total_spent DESC
        LIMIT 5
      `,
    ])

    // Extract values
    const totalSales = totalSalesResult[0].total
    const totalPurchases = totalPurchasesResult[0].total
    const manualIncome = manualIncomeResult[0].total
    const manualExpenses = manualExpensesResult[0].total
    const totalCOGS = totalCOGSResult[0].total_cogs

    // Calculate accurate profit: (Sales - COGS) + (Manual Income - Manual Expenses)
    const grossProfit = totalSales - totalCOGS
    const netManualProfit = manualIncome - manualExpenses
    const totalProfit = grossProfit + netManualProfit

    // Process low stock products to ensure category is properly set
    const processedLowStockProducts = lowStockProducts.map((product: any) => ({
      ...product,
      category: product.category_name || product.category || "Uncategorized",
    }))

    // Log the data we're returning for debugging
    console.log("Financial Summary:", {
      totalSales,
      totalPurchases,
      manualIncome,
      manualExpenses,
      totalCOGS,
      grossProfit,
      netManualProfit,
      totalProfit,
    })

    return {
      success: true,
      data: {
        totalSales,
        totalPurchases,
        totalProfit,
        manualIncome,
        manualExpenses,
        totalCOGS,
        grossProfit,
        recentSales,
        recentPurchases,
        lowStockProducts: processedLowStockProducts,
        topCustomers,
      },
    }
  } catch (error) {
    console.error("Get user dashboard summary error:", error)
    return {
      success: false,
      message: "Failed to load dashboard data",
      data: {
        totalSales: 0,
        totalPurchases: 0,
        totalProfit: 0,
        manualIncome: 0,
        manualExpenses: 0,
        totalCOGS: 0,
        grossProfit: 0,
        recentSales: [],
        recentPurchases: [],
        lowStockProducts: [],
        topCustomers: [],
      },
    }
  }
}
