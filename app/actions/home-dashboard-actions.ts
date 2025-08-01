"use server"

import { sql, resetConnectionState, isConnected } from "@/lib/db"
import type { HomeDashboardData } from "@/store/slices/homeDashboardSlice"

const DEFAULT_CURRENCY = "INR"

export async function getComprehensiveDashboardData(
  userId: number,
  deviceId: number,
  period: "today" | "week" | "month" | "quarter" | "year" = "month",
): Promise<{ success: boolean; data?: HomeDashboardData; message?: string }> {
  // Enhanced validation
  if (!userId || !deviceId || userId <= 0 || deviceId <= 0) {
    console.error("Invalid parameters:", { userId, deviceId })
    return {
      success: false,
      message: `Invalid parameters: userId=${userId}, deviceId=${deviceId}`,
    }
  }

  resetConnectionState()

  try {
    if (!isConnected()) {
      console.error("Database connection failed")
      return {
        success: false,
        message: "Database connection failed",
      }
    }

    // Calculate date ranges based on period
    const now = new Date()
    let startDate: Date
    let previousStartDate: Date
    let previousEndDate: Date

    switch (period) {
      case "today":
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        previousStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
        previousEndDate = new Date(startDate.getTime() - 1)
        break
      case "week":
        // Last 7 days instead of current week
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        startDate.setHours(0, 0, 0, 0)
        previousStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000)
        previousEndDate = new Date(startDate.getTime() - 1)
        break
      case "quarter":
        const quarter = Math.floor(now.getMonth() / 3)
        startDate = new Date(now.getFullYear(), quarter * 3, 1)
        previousStartDate = new Date(now.getFullYear(), (quarter - 1) * 3, 1)
        previousEndDate = new Date(startDate.getTime() - 1)
        break
      case "year":
        startDate = new Date(now.getFullYear(), 0, 1)
        previousStartDate = new Date(now.getFullYear() - 1, 0, 1)
        previousEndDate = new Date(startDate.getTime() - 1)
        break
      default: // month (last 30 days)
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        startDate.setHours(0, 0, 0, 0)
        previousStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000)
        previousEndDate = new Date(startDate.getTime() - 1)
    }

    // Enhanced logging
    console.log("=== DASHBOARD DEBUG INFO ===")
    console.log("Parameters:", { userId, deviceId, period })
    console.log("Date ranges:", {
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      previousStartDate: previousStartDate.toISOString(),
      previousEndDate: previousEndDate.toISOString()
    })

    // First, let's check if we have any data at all for this user
    const dataCheckQueries = await Promise.all([
      // Check if user has any sales
      sql`SELECT COUNT(*) as count FROM sales WHERE created_by = ${userId}`,
      // Check if user has any products  
      sql`SELECT COUNT(*) as count FROM products WHERE created_by = ${userId}`,
      // Check if user has any customers
      sql`SELECT COUNT(*) as count FROM customers WHERE created_by = ${userId}`,
      // Check if user has any purchases
      sql`SELECT COUNT(*) as count FROM purchases WHERE created_by = ${userId}`,
    ])

    console.log("Data existence check:", {
      totalSales: dataCheckQueries[0][0]?.count || 0,
      totalProducts: dataCheckQueries[1][0]?.count || 0,
      totalCustomers: dataCheckQueries[2][0]?.count || 0,
      totalPurchases: dataCheckQueries[3][0]?.count || 0,
    })

    // Build chart data query for the selected period
    let chartDataQuery
    if (period === "today") {
      chartDataQuery = sql`
        SELECT 
          TO_CHAR(DATE_TRUNC('hour', sale_date), 'HH24:MI') AS period,
          DATE_TRUNC('hour', sale_date) AS period_date,
          COALESCE(SUM(total_amount), 0) AS income,
          0 AS expenses
        FROM sales
        WHERE status != 'Cancelled'
          AND created_by = ${userId}
          AND sale_date >= ${startDate.toISOString()}
          AND sale_date <= ${now.toISOString()}
        GROUP BY DATE_TRUNC('hour', sale_date)
        ORDER BY DATE_TRUNC('hour', sale_date);
      `
    } else if (period === "week" || period === "month") {
      chartDataQuery = sql`
        SELECT 
          TO_CHAR(DATE_TRUNC('day', sale_date), 'Mon DD') AS period,
          DATE_TRUNC('day', sale_date) AS period_date,
          COALESCE(SUM(total_amount), 0) AS income,
          0 AS expenses
        FROM sales
        WHERE status != 'Cancelled'
          AND created_by = ${userId}
          AND sale_date >= ${startDate.toISOString()}
          AND sale_date <= ${now.toISOString()}
        GROUP BY DATE_TRUNC('day', sale_date)
        ORDER BY DATE_TRUNC('day', sale_date);
      `
    } else if (period === "quarter") {
      chartDataQuery = sql`
        SELECT 
          'Week ' || EXTRACT(WEEK FROM DATE_TRUNC('week', sale_date)) AS period,
          DATE_TRUNC('week', sale_date) AS period_date,
          COALESCE(SUM(total_amount), 0) AS income,
          0 AS expenses
        FROM sales
        WHERE status != 'Cancelled'
          AND created_by = ${userId}
          AND sale_date >= ${startDate.toISOString()}
          AND sale_date <= ${now.toISOString()}
        GROUP BY DATE_TRUNC('week', sale_date)
        ORDER BY DATE_TRUNC('week', sale_date);
      `
    } else {
      chartDataQuery = sql`
        SELECT 
          TO_CHAR(DATE_TRUNC('month', sale_date), 'Mon') AS period,
          DATE_TRUNC('month', sale_date) AS period_date,
          COALESCE(SUM(total_amount), 0) AS income,
          0 AS expenses
        FROM sales
        WHERE status != 'Cancelled'
          AND created_by = ${userId}
          AND sale_date >= ${startDate.toISOString()}
          AND sale_date <= ${now.toISOString()}
        GROUP BY DATE_TRUNC('month', sale_date)
        ORDER BY DATE_TRUNC('month', sale_date);
      `
    }

    // Execute all queries in parallel for better performance
    console.log("Executing main queries...")
    const [
      // Financial Overview
      currentPeriodSales,
      previousPeriodSales,
      currentPeriodPurchases,
      previousPeriodPurchases,
      currentPeriodIncome,
      currentPeriodExpenses,
      totalCOGS,

      // Cash Flow & Balances
      accountsReceivable,
      accountsPayable,

      // Recent Transactions
      recentSales,
      recentPurchases,
      recentFinancialTransactions,

      // Operational Metrics
      customerCount,
      supplierCount,
      productCount,
      lowStockProducts,
      overdueInvoicesCount,
      pendingPaymentsCount,

      // Chart Data
      chartData,
    ] = await Promise.all([
      // Current period sales - Fixed date comparison
      sql`
        SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
        FROM sales
        WHERE status != 'Cancelled' 
        AND created_by = ${userId}
        AND sale_date >= ${startDate.toISOString()}
        AND sale_date <= ${now.toISOString()}
      `,

      // Previous period sales
      sql`
        SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
        FROM sales
        WHERE status != 'Cancelled' 
        AND created_by = ${userId}
        AND sale_date >= ${previousStartDate.toISOString()}
        AND sale_date <= ${previousEndDate.toISOString()}
      `,

      // Current period purchases - Fixed date comparison
      sql`
        SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
        FROM purchases
        WHERE status != 'Cancelled' 
        AND created_by = ${userId}
        AND purchase_date >= ${startDate.toISOString()}
        AND purchase_date <= ${now.toISOString()}
      `,

      // Previous period purchases
      sql`
        SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
        FROM purchases
        WHERE status != 'Cancelled' 
        AND created_by = ${userId}
        AND purchase_date >= ${previousStartDate.toISOString()}
        AND purchase_date <= ${previousEndDate.toISOString()}
      `,

      // Current period manual income
      sql`
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM financial_transactions
        WHERE transaction_type = 'income' 
        AND device_id = ${deviceId}
        AND created_at >= ${startDate.toISOString()}
        AND created_at <= ${now.toISOString()}
      `,

      // Current period manual expenses
      sql`
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM financial_transactions
        WHERE transaction_type = 'expense' 
        AND device_id = ${deviceId}
        AND created_at >= ${startDate.toISOString()}
        AND created_at <= ${now.toISOString()}
      `,

      // Total COGS - Fixed join conditions
      sql`
        SELECT COALESCE(SUM(si.quantity * COALESCE(p.wholesale_price, 0)), 0) as total_cogs, COUNT(*) as count
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        LEFT JOIN products p ON si.product_id = p.id
        WHERE s.status != 'Cancelled' 
        AND s.created_by = ${userId}
        AND s.sale_date >= ${startDate.toISOString()}
        AND s.sale_date <= ${now.toISOString()}
      `,

      // Accounts Receivable - Fixed calculation
      sql`
        SELECT COALESCE(SUM(GREATEST(total_amount - COALESCE(received_amount, 0), 0)), 0) as total, COUNT(*) as count
        FROM sales
        WHERE status = 'Completed' 
        AND created_by = ${userId}
        AND total_amount > COALESCE(received_amount, 0)
      `,

      // Accounts Payable - Fixed calculation
      sql`
        SELECT COALESCE(SUM(GREATEST(total_amount - COALESCE(received_amount, 0), 0)), 0) as total, COUNT(*) as count
        FROM purchases
        WHERE status = 'Received' 
        AND created_by = ${userId}
        AND total_amount > COALESCE(received_amount, 0)
      `,

      // Recent Sales
      sql`
        SELECT s.*, c.name as customer_name
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.created_by = ${userId}
        ORDER BY s.created_at DESC
        LIMIT 5
      `,

      // Recent Purchases
      sql`
        SELECT p.*
        FROM purchases p
        WHERE p.created_by = ${userId}
        ORDER BY p.created_at DESC
        LIMIT 5
      `,

      // Recent Financial Transactions
      sql`
        SELECT *
        FROM financial_transactions
        WHERE device_id = ${deviceId}
        ORDER BY created_at DESC
        LIMIT 5
      `,

      // Customer Count
      sql`
        SELECT COUNT(*) as count
        FROM customers
        WHERE created_by = ${userId}
      `,

      // Supplier Count
      sql`
        SELECT COUNT(*) as count
        FROM suppliers
        WHERE created_by = ${userId}
      `,

      // Product Count
      sql`
        SELECT COUNT(*) as count
        FROM products
        WHERE created_by = ${userId}
      `,

      // Low Stock Products - Fixed condition
      sql`
        SELECT COUNT(*) as count
        FROM products
        WHERE COALESCE(stock, 0) <= 5 AND created_by = ${userId}
      `,

      // Overdue Invoices - Fixed date calculation
      sql`
        SELECT COUNT(*) as count
        FROM sales
        WHERE status = 'Completed' 
        AND created_by = ${userId}
        AND total_amount > COALESCE(received_amount, 0)
        AND sale_date < ${new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()}
      `,

      // Pending Payments - Fixed condition
      sql`
        SELECT COUNT(*) as count
        FROM purchases
        WHERE status = 'Received' 
        AND created_by = ${userId}
        AND total_amount > COALESCE(received_amount, 0)
      `,

      // Chart Data
      chartDataQuery,
    ])

    // Enhanced logging for query results
    console.log("=== RAW QUERY RESULTS ===")
    console.log("Current period sales:", currentPeriodSales[0])
    console.log("Previous period sales:", previousPeriodSales[0])
    console.log("Current period purchases:", currentPeriodPurchases[0])
    console.log("Current period income:", currentPeriodIncome[0])
    console.log("Current period expenses:", currentPeriodExpenses[0])
    console.log("Customer count:", customerCount[0])
    console.log("Supplier count:", supplierCount[0])
    console.log("Product count:", productCount[0])
    console.log("Chart data length:", chartData?.length || 0)

    // Process the data with better error handling
    const currentSalesTotal = Number(currentPeriodSales[0]?.total || 0)
    const currentIncomeTotal = Number(currentPeriodIncome[0]?.total || 0)
    const currentPurchasesTotal = Number(currentPeriodPurchases[0]?.total || 0)
    const currentExpensesTotal = Number(currentPeriodExpenses[0]?.total || 0)
    
    const totalRevenue = currentSalesTotal + currentIncomeTotal
    const totalExpenses = currentPurchasesTotal + currentExpensesTotal
    const totalCOGSValue = Number(totalCOGS[0]?.total_cogs || 0)
    const grossProfit = currentSalesTotal - totalCOGSValue
    const netProfit = totalRevenue - totalExpenses
    const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

    // Calculate changes from previous period
    const previousRevenue = Number(previousPeriodSales[0]?.total || 0)
    const previousExpenses = Number(previousPeriodPurchases[0]?.total || 0)
    const previousProfit = previousRevenue - previousExpenses

    const revenueChange = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue) * 100 : 0
    const expenseChange = previousExpenses > 0 ? ((totalExpenses - previousExpenses) / previousExpenses) * 100 : 0
    const profitChange = previousProfit > 0 ? ((netProfit - previousProfit) / previousProfit) * 100 : 0

    console.log("=== CALCULATED VALUES ===")
    console.log("Total Revenue:", totalRevenue)
    console.log("Total Expenses:", totalExpenses)
    console.log("Net Profit:", netProfit)
    console.log("Profit Margin:", profitMargin)

    // Build quick stats
    const quickStats = [
      {
        label: "Revenue",
        value: totalRevenue,
        change: revenueChange,
        changeType: revenueChange >= 0 ? "increase" : ("decrease" as const),
      },
      {
        label: "Expenses",
        value: totalExpenses,
        change: Math.abs(expenseChange),
        changeType: expenseChange <= 0 ? "increase" : ("decrease" as const),
      },
      {
        label: "Net Profit",
        value: netProfit,
        change: profitChange,
        changeType: profitChange >= 0 ? "increase" : ("decrease" as const),
      },
      {
        label: "Profit Margin",
        value: profitMargin,
        change: 0,
        changeType: "neutral" as const,
      },
    ]

    // Build recent transactions with better error handling
    const recentTransactions = [
      ...(recentSales || []).map((sale: any) => ({
        id: sale.id,
        type: "sale" as const,
        description: `Sale to ${sale.customer_name || "Walk-in Customer"}`,
        amount: Number(sale.total_amount || 0),
        date: sale.sale_date || sale.created_at,
        status: sale.status,
        customer: sale.customer_name,
      })),
      ...(recentPurchases || []).map((purchase: any) => ({
        id: purchase.id,
        type: "purchase" as const,
        description: `Purchase from ${purchase.supplier || "Unknown Supplier"}`,
        amount: Number(purchase.total_amount || 0),
        date: purchase.purchase_date || purchase.created_at,
        status: purchase.status,
        supplier: purchase.supplier,
      })),
      ...(recentFinancialTransactions || []).map((transaction: any) => ({
        id: transaction.id,
        type: transaction.transaction_type as "income" | "expense",
        description: transaction.description || `${transaction.transaction_type} transaction`,
        amount: Number(transaction.amount || 0),
        date: transaction.created_at,
        status: "Completed",
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10)

    // Build alerts
    const alerts = []

    const lowStockCount = Number(lowStockProducts[0]?.count || 0)
    if (lowStockCount > 0) {
      alerts.push({
        id: "low-stock",
        type: "warning" as const,
        title: "Low Stock Alert",
        message: `${lowStockCount} products are running low on stock`,
        count: lowStockCount,
      })
    }

    const overdueCount = Number(overdueInvoicesCount[0]?.count || 0)
    if (overdueCount > 0) {
      alerts.push({
        id: "overdue-invoices",
        type: "error" as const,
        title: "Overdue Invoices",
        message: `${overdueCount} invoices are overdue for payment`,
        count: overdueCount,
      })
    }

    const pendingCount = Number(pendingPaymentsCount[0]?.count || 0)
    if (pendingCount > 0) {
      alerts.push({
        id: "pending-payments",
        type: "info" as const,
        title: "Pending Payments",
        message: `${pendingCount} payments are pending to suppliers`,
        count: pendingCount,
      })
    }

    // Process chart data with better error handling
    let processedCashFlowData = []

    if (chartData && chartData.length > 0) {
      processedCashFlowData = chartData.map((item: any) => ({
        period: item.period || "N/A",
        income: Number(item.income || 0),
        expenses: Number(item.expenses || 0),
        netFlow: Number(item.income || 0) - Number(item.expenses || 0),
      }))
    } else {
      // Create default empty data based on period
      if (period === "today") {
        for (let hour = 0; hour < 24; hour += 4) {
          processedCashFlowData.push({
            period: `${hour.toString().padStart(2, "0")}:00`,
            income: 0,
            expenses: 0,
            netFlow: 0,
          })
        }
      } else if (period === "week") {
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        days.forEach((day) => {
          processedCashFlowData.push({
            period: day,
            income: 0,
            expenses: 0,
            netFlow: 0,
          })
        })
      } else if (period === "month") {
        for (let day = 1; day <= 30; day += 5) {
          processedCashFlowData.push({
            period: day.toString(),
            income: 0,
            expenses: 0,
            netFlow: 0,
          })
        }
      } else {
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        months.forEach((month) => {
          processedCashFlowData.push({
            period: month,
            income: 0,
            expenses: 0,
            netFlow: 0,
          })
        })
      }
    }

    // Extract counts properly with better error handling
    const totalCustomersCount = Number(customerCount[0]?.count || 0)
    const totalSuppliersCount = Number(supplierCount[0]?.count || 0)
    const totalProductsCount = Number(productCount[0]?.count || 0)

    console.log("=== PROCESSED COUNTS ===")
    console.log("Customers:", totalCustomersCount)
    console.log("Suppliers:", totalSuppliersCount)
    console.log("Products:", totalProductsCount)
    console.log("Low Stock:", lowStockCount)

    const dashboardData: HomeDashboardData = {
      totalRevenue,
      totalExpenses,
      netProfit,
      grossProfit,
      profitMargin,
      cashOnHand: totalRevenue - totalExpenses,
      accountsReceivable: Number(accountsReceivable[0]?.total || 0),
      accountsPayable: Number(accountsPayable[0]?.total || 0),
      netCashFlow: totalRevenue - totalExpenses,
      quickStats,
      recentTransactions,
      alerts,
      cashFlowData: processedCashFlowData,
      accountBalances: [
        { account: "Cash", balance: totalRevenue - totalExpenses, type: "asset" },
        { account: "Accounts Receivable", balance: Number(accountsReceivable[0]?.total || 0), type: "asset" },
        { account: "Accounts Payable", balance: Number(accountsPayable[0]?.total || 0), type: "liability" },
      ],
      currentPeriod: {
        revenue: totalRevenue,
        expenses: totalExpenses,
        profit: netProfit,
      },
      previousPeriod: {
        revenue: previousRevenue,
        expenses: previousExpenses,
        profit: previousProfit,
      },
      totalCustomers: totalCustomersCount,
      totalSuppliers: totalSuppliersCount,
      totalProducts: totalProductsCount,
      lowStockCount,
      overdueInvoices: overdueCount,
      pendingPayments: pendingCount,
    }

    console.log("=== FINAL DASHBOARD DATA ===")
    console.log("Total Revenue:", dashboardData.totalRevenue)
    console.log("Total Customers:", dashboardData.totalCustomers)
    console.log("Total Suppliers:", dashboardData.totalSuppliers)
    console.log("Total Products:", dashboardData.totalProducts)
    console.log("============================")

    return {
      success: true,
      data: dashboardData,
    }
  } catch (error) {
    console.error("=== DASHBOARD ERROR ===")
    console.error("Error details:", error)
    console.error("Stack trace:", error instanceof Error ? error.stack : "No stack trace")
    console.error("=======================")
    
    return {
      success: false,
      message: `Failed to load dashboard data: ${error instanceof Error ? error.message : "Unknown error"}`,
    }
  }
}


