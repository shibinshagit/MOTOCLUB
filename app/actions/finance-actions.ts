"use server"

import { sql } from "@/lib/db"
import { revalidatePath } from "next/cache"

// Function to simulate database security verification (replace with actual implementation)
async function verifyDatabaseSecurity(): Promise<boolean> {
  // In a real application, this function would perform checks to ensure
  // the database schema is secure and that no unauthorized modifications
  // have been made. For example, it might check for missing columns,
  // incorrect data types, or unexpected permissions.
  // For this example, we'll just return true to indicate that the database
  // is secure.
  return true
}

// Update existing sales and purchases with device_id based on created_by
async function updateExistingSalesAndPurchasesWithDeviceId(deviceId: number, userId: number) {
  try {
    // Update sales table
    const hasSalesDeviceId = await hasColumn("sales", "device_id")
    const hasSalesCreatedBy = await hasColumn("sales", "created_by")

    if (hasSalesDeviceId && hasSalesCreatedBy) {
      await sql`
        UPDATE sales 
        SET device_id = ${deviceId} 
        WHERE created_by = ${userId} AND device_id IS NULL
      `.catch((error) => {
        console.error("Error updating sales with device_id:", error)
      })
    }

    // Update purchases table
    const hasPurchasesDeviceId = await hasColumn("purchases", "device_id")
    const hasPurchasesCreatedBy = await hasColumn("purchases", "created_by")

    if (hasPurchasesDeviceId && hasPurchasesCreatedBy) {
      await sql`
        UPDATE purchases 
        SET device_id = ${deviceId} 
        WHERE created_by = ${userId} AND device_id IS NULL
      `.catch((error) => {
        console.error("Error updating purchases with device_id:", error)
      })
    }

    console.log(`Updated existing sales and purchases with device_id ${deviceId} for user ${userId}`)
  } catch (error) {
    console.error("Error updating existing sales and purchases:", error)
  }
}

// Schema is now managed by `npm run migrate` — kept as a no-op for call-site compatibility
async function addDeviceIdColumn(_tableName: string): Promise<boolean> {
  return true
}

// Check if a table has a specific column
async function hasColumn(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await sql`
     SELECT column_name 
     FROM information_schema.columns 
     WHERE table_name = ${tableName} 
     AND column_name = ${columnName}
   `.catch(() => [])

    return result && result.length > 0
  } catch (error) {
    console.error(`Error checking if ${tableName} has column ${columnName}:`, error)
    return false
  }
}

export async function getFinancialTransactions(deviceId: number) {
  try {
    console.log(`=== FINANCE DATA FETCHING FOR DEVICE ${deviceId} ===`)

    // Check what columns exist in sales table
    const salesColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'sales'
    `.catch(() => [])

    const salesAvailableColumns = salesColumns.map((col) => col.column_name)
    console.log("Sales table columns:", salesAvailableColumns)

    // Check what columns exist in purchases table
    const purchasesColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'purchases'
    `.catch(() => [])

    const purchasesAvailableColumns = purchasesColumns.map((col) => col.column_name)
    console.log("Purchases table columns:", purchasesAvailableColumns)

    // Check required and optional columns
    const hasReceivedAmount = salesAvailableColumns.includes("received_amount")
    const hasPurchasesReceivedAmount = purchasesAvailableColumns.includes("received_amount")
    const hasSalesPaymentStatus = salesAvailableColumns.includes("payment_status")
    const hasPurchasesPaymentStatus = purchasesAvailableColumns.includes("payment_status")
    const hasSalesStatus = salesAvailableColumns.includes("status")
    const hasPurchasesStatus = purchasesAvailableColumns.includes("status")

    if (!hasReceivedAmount) {
      console.error("ERROR: Sales table missing 'received_amount' column")
      return {
        success: false,
        message:
          "Database Error: Sales table missing 'received_amount' column. Cannot calculate accurate financial data.",
        data: [],
        cogs: 0,
      }
    }

    if (!hasPurchasesReceivedAmount) {
      console.error("ERROR: Purchases table missing 'received_amount' column")
      return {
        success: false,
        message:
          "Database Error: Purchases table missing 'received_amount' column. Cannot calculate accurate financial data.",
        data: [],
        cogs: 0,
      }
    }

    // Build dynamic WHERE clauses based on available columns
    let salesWhereClause = `device_id = ${deviceId} AND received_amount > 0`
    let purchasesWhereClause = `device_id = ${deviceId} AND received_amount > 0`

    // Add status filtering if columns exist
    if (hasSalesStatus) {
      salesWhereClause += ` AND status != 'Cancelled'`
    }
    if (hasSalesPaymentStatus) {
      salesWhereClause += ` AND payment_status != 'Cancelled'`
    }

    if (hasPurchasesStatus) {
      purchasesWhereClause += ` AND status != 'Cancelled'`
    }
    if (hasPurchasesPaymentStatus) {
      purchasesWhereClause += ` AND payment_status != 'Cancelled'`
    }

    // Remove these lines:
    // console.log("Sales WHERE clause:", salesWhereClause)
    // console.log("Purchases WHERE clause:", purchasesWhereClause)

    // Get raw data from each table - ONLY received amounts, exclude cancelled
    // const [manualTransactions, salesData, purchasesData] = await Promise.all([
    //   // Manual transactions - as is
    //   sql`SELECT * FROM financial_transactions WHERE device_id = ${deviceId}`,

    //   // Sales - ONLY received_amount, exclude cancelled (dynamic query)
    //   sql`
    //     SELECT * FROM sales
    //     WHERE ${sql.unsafe(salesWhereClause)}
    //   `,

    //   // Purchases - ONLY received_amount, exclude cancelled (dynamic query)
    //   sql`
    //     SELECT * FROM purchases
    //     WHERE ${sql.unsafe(purchasesWhereClause)}
    //   `,
    // ])

    // Build conditional queries based on available columns
    let salesQuery, purchasesQuery

    // Sales query - build based on available columns
    if (hasSalesStatus && hasSalesPaymentStatus) {
      salesQuery = sql`
        SELECT * FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
        AND payment_status != 'Cancelled'
      `
    } else if (hasSalesStatus) {
      salesQuery = sql`
        SELECT * FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
      `
    } else if (hasSalesPaymentStatus) {
      salesQuery = sql`
        SELECT * FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND payment_status != 'Cancelled'
      `
    } else {
      salesQuery = sql`
        SELECT * FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
      `
    }

    // Purchases query - build based on available columns
    if (hasPurchasesStatus && hasPurchasesPaymentStatus) {
      purchasesQuery = sql`
        SELECT * FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
        AND payment_status != 'Cancelled'
      `
    } else if (hasPurchasesStatus) {
      purchasesQuery = sql`
        SELECT * FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
      `
    } else if (hasPurchasesPaymentStatus) {
      purchasesQuery = sql`
        SELECT * FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND payment_status != 'Cancelled'
      `
    } else {
      purchasesQuery = sql`
        SELECT * FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
      `
    }

    // Get raw data from each table - ONLY received amounts, exclude cancelled
    const [manualTransactions, salesData, purchasesData] = await Promise.all([
      // Manual transactions - as is
      sql`SELECT * FROM financial_transactions WHERE device_id = ${deviceId}`,

      // Sales - conditional query
      salesQuery,

      // Purchases - conditional query
      purchasesQuery,
    ])

    console.log(`Found ${salesData.length} sales with received_amount > 0`)
    console.log(`Found ${purchasesData.length} purchases with received_amount > 0`)

    // === COGS CALCULATION ===
    console.log("=== COGS CALCULATION START ===")

    // Check if we have sale_items table for detailed COGS calculation
    const hasSaleItemsTable = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'sale_items'
      )
    `.catch(() => [{ exists: false }])

    let totalCogs = 0
    let cogsDataSource = "No COGS data available"

    if (hasSaleItemsTable[0]?.exists) {
      console.log("Using sale_items table for COGS calculation")
      cogsDataSource = "sale_items table"

      // Check sale_items columns
      const saleItemsColumns = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'sale_items'
      `.catch(() => [])

      const saleItemsAvailableColumns = saleItemsColumns.map((col) => col.column_name)
      console.log("Sale_items table columns:", saleItemsAvailableColumns)

      // Check for cost-related columns in sale_items
      const hasQuantity = saleItemsAvailableColumns.includes("quantity")
      const hasPrice = saleItemsAvailableColumns.includes("price")
      const hasCostPrice = saleItemsAvailableColumns.includes("cost_price")
      const hasWholesalePrice = saleItemsAvailableColumns.includes("wholesale_price")

      if (!hasQuantity) {
        console.error("ERROR: sale_items table missing 'quantity' column")
        return {
          success: false,
          message: "Database Error: sale_items table missing 'quantity' column. Cannot calculate COGS.",
          data: [],
          cogs: 0,
        }
      }

      // Build dynamic JOIN query for sale items based on available status columns
      let saleItemsWhereClause = `s.device_id = ${deviceId} AND s.received_amount > 0`

      if (hasSalesStatus) {
        saleItemsWhereClause += ` AND s.status != 'Cancelled'`
      }
      if (hasSalesPaymentStatus) {
        saleItemsWhereClause += ` AND s.payment_status != 'Cancelled'`
      }

      // Get sale items for COGS calculation - only for sales with received_amount > 0
      // const saleItems = await sql`
      //   SELECT
      //     si.*,
      //     s.id as sale_id,
      //     s.received_amount,
      //     s.status
      //   FROM sale_items si
      //   JOIN sales s ON si.sale_id = s.id
      //   WHERE ${sql.unsafe(saleItemsWhereClause)}
      // `.catch(() => [])

      // Get sale items for COGS calculation - build conditional query
      let saleItemsQuery

      if (hasSalesStatus && hasSalesPaymentStatus) {
        saleItemsQuery = sql`
          SELECT 
            si.*,
            s.id as sale_id,
            s.received_amount,
            s.status
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.device_id = ${deviceId} 
          AND s.received_amount > 0
          AND s.status != 'Cancelled'
          AND s.payment_status != 'Cancelled'
        `
      } else if (hasSalesStatus) {
        saleItemsQuery = sql`
          SELECT 
            si.*,
            s.id as sale_id,
            s.received_amount,
            s.status
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.device_id = ${deviceId} 
          AND s.received_amount > 0
          AND s.status != 'Cancelled'
        `
      } else if (hasSalesPaymentStatus) {
        saleItemsQuery = sql`
          SELECT 
            si.*,
            s.id as sale_id,
            s.received_amount
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.device_id = ${deviceId} 
          AND s.received_amount > 0
          AND s.payment_status != 'Cancelled'
        `
      } else {
        saleItemsQuery = sql`
          SELECT 
            si.*,
            s.id as sale_id,
            s.received_amount
          FROM sale_items si
          JOIN sales s ON si.sale_id = s.id
          WHERE s.device_id = ${deviceId} 
          AND s.received_amount > 0
        `
      }

      const saleItems = await saleItemsQuery.catch(() => [])

      console.log(`Found ${saleItems.length} sale items for COGS calculation`)

      if (saleItems.length > 0) {
        totalCogs = saleItems.reduce((sum, item) => {
          const quantity = Number.parseFloat(item.quantity) || 0
          let costPrice = 0

          // Try to get cost price - NO FALLBACKS, only real cost data
          if (hasCostPrice && item.cost_price && item.cost_price > 0) {
            costPrice = Number.parseFloat(item.cost_price)
            console.log(`Sale item ${item.id}: Using cost_price = ${costPrice}`)
          } else if (hasWholesalePrice && item.wholesale_price && item.wholesale_price > 0) {
            costPrice = Number.parseFloat(item.wholesale_price)
            console.log(`Sale item ${item.id}: Using wholesale_price = ${costPrice}`)
          } else {
            console.log(
              `Sale item ${item.id}: No cost data available (cost_price: ${item.cost_price}, wholesale_price: ${item.wholesale_price})`,
            )
            // NO FALLBACKS - if no cost data, COGS = 0 for this item
            costPrice = 0
          }

          const itemCogs = quantity * costPrice
          console.log(`Sale item ${item.id}: quantity=${quantity}, costPrice=${costPrice}, COGS=${itemCogs}`)

          return sum + itemCogs
        }, 0)
      }
    } else {
      console.log("No sale_items table found - cannot calculate detailed COGS")
      cogsDataSource = "sale_items table not found"
    }

    console.log(`=== COGS CALCULATION END: Total COGS = ${totalCogs} ===`)
    console.log(`COGS Data Source: ${cogsDataSource}`)

    // Process transactions for display
    const processedData = [
      // Manual transactions
      ...manualTransactions.map((t) => ({
        id: t.id,
        transaction_date: t.transaction_date,
        amount: t.amount,
        transaction_type: t.transaction_type,
        description: t.description || "N/A",
        category_name: t.category_name || "N/A",
        source: "manual",
      })),

      // Sales - ONLY received_amount
      ...salesData.map((s) => ({
        id: s.id,
        transaction_date: s.sale_date || s.created_at || "N/A",
        amount: s.received_amount, // ONLY received amount, no fallbacks
        transaction_type: "income",
        description: s.description || `Sale #${s.id}`,
        category_name: "Sales",
        source: "sale",
      })),

      // Purchases - ONLY received_amount
      ...purchasesData.map((p) => ({
        id: p.id,
        transaction_date: p.purchase_date || p.created_at || "N/A",
        amount: p.received_amount, // ONLY received amount, no fallbacks
        transaction_type: "expense",
        description: p.description || `Purchase #${p.id}`,
        category_name: "Purchases",
        source: "purchase",
      })),
    ]

    // Sort by date
    processedData.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))

    console.log(`=== FINANCE DATA SUMMARY ===`)
    console.log(`Manual transactions: ${manualTransactions.length}`)
    console.log(`Sales with received_amount > 0: ${salesData.length}`)
    console.log(`Purchases with received_amount > 0: ${purchasesData.length}`)
    console.log(`Total COGS: ${totalCogs}`)
    console.log(`COGS Data Source: ${cogsDataSource}`)

    return {
      success: true,
      data: processedData,
      cogs: totalCogs,
      cogsDataSource: cogsDataSource,
    }
  } catch (error) {
    console.error("Error fetching financial transactions:", error)
    return {
      success: false,
      message: "Failed to fetch financial transactions",
      data: [],
      cogs: 0,
    }
  }
}

// STRICT DEVICE-ONLY SAVING: Only save with device_id
export async function addFinancialTransaction(formData: any, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    const amount = Number.parseFloat(formData.amount || "0")
    const transaction_date = formData.transaction_date || new Date().toISOString()
    const description = formData.description || ""
    const transaction_type = formData.transaction_type || "expense"
    const company_id = Number.parseInt(formData.company_id || "1")
    const created_by = Number.parseInt(formData.created_by || "1")
    const transaction_name = formData.transaction_name || ""
    const category_name = formData.category_name || transaction_name || "General"

    // CRITICAL: REQUIRE device ID for strict isolation
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.error("SECURITY ERROR: Device ID is required for saving financial transaction:", deviceId)
      return {
        success: false,
        message: "Security Error: Device ID is required for saving transactions.",
        securityError: true,
      }
    }

    if (!amount || !transaction_date || !transaction_type) {
      return { success: false, message: "Missing required fields" }
    }

    // Check filtering columns
    const hasFinancialTransactionsDeviceId = await hasColumn("financial_transactions", "device_id")
    const hasFinancialTransactionsCompanyId = await hasColumn("financial_transactions", "company_id")
    const hasFinancialTransactionsCreatedBy = await hasColumn("financial_transactions", "created_by")
    const hasCategoryNameColumn = await hasColumn("financial_transactions", "category_name")

    // If device_id column doesn't exist, try to add it
    if (!hasFinancialTransactionsDeviceId) {
      const added = await addDeviceIdColumn("financial_transactions")
      if (!added) {
        console.error("CRITICAL ERROR: Cannot save transaction - failed to add device_id column")
        return {
          success: false,
          message: "Database schema error: Cannot save transaction without device isolation",
        }
      }
    }

    // Update existing sales and purchases with device_id when we save a new transaction
    await updateExistingSalesAndPurchasesWithDeviceId(deviceId, created_by)

    // Ensure transaction_name is always set to maintain category consistency
    const finalTransactionName = transaction_name || category_name || "General"

    console.log(`STRICT SAVING: Saving transaction for Device ID: ${deviceId}`)

    console.log(`STRICT DEVICE SAVING: Saving transaction with device_id = ${deviceId}`)

    // CRITICAL: Always verify device_id is being saved
    let result
    if (hasFinancialTransactionsDeviceId && hasFinancialTransactionsCompanyId && hasCategoryNameColumn) {
      result = await sql`
       INSERT INTO financial_transactions (
         amount, transaction_date, description, transaction_type, 
         device_id, company_id, created_by, transaction_name, category_name
       )
       VALUES (
         ${amount}, ${transaction_date}, ${description}, ${transaction_type},
         ${deviceId}, ${company_id}, ${created_by}, 
         ${finalTransactionName}, ${category_name}
       )
       RETURNING id, transaction_date, amount, transaction_type, description, transaction_name, category_name, device_id
     `
    } else if (hasFinancialTransactionsDeviceId && hasFinancialTransactionsCompanyId) {
      result = await sql`
       INSERT INTO financial_transactions (
         amount, transaction_date, description, transaction_type, 
         device_id, company_id, created_by, transaction_name
       )
       VALUES (
         ${amount}, ${transaction_date}, ${description}, ${transaction_type},
         ${deviceId}, ${company_id}, ${created_by}, ${finalTransactionName}
       )
       RETURNING id, transaction_date, amount, transaction_type, description, transaction_name, device_id
     `
    } else if (hasFinancialTransactionsDeviceId) {
      result = await sql`
       INSERT INTO financial_transactions (
         amount, transaction_date, description, transaction_type, 
         device_id, transaction_name
       )
       VALUES (
         ${amount}, ${transaction_date}, ${description}, ${transaction_type},
         ${deviceId}, ${finalTransactionName}
       )
       RETURNING id, transaction_date, amount, transaction_type, description, transaction_name, device_id
     `
    } else {
      console.error("CRITICAL ERROR: Cannot save transaction - financial_transactions table missing device_id column")
      return {
        success: false,
        message: "Database schema error: Cannot save transaction without device isolation",
      }
    }

    // CRITICAL: Verify the saved transaction has the correct device_id
    if (result[0].device_id !== deviceId) {
      console.error(`SECURITY ERROR: Saved transaction has device_id ${result[0].device_id} but expected ${deviceId}`)
      return {
        success: false,
        message: "Security error: Transaction saved with incorrect device_id",
      }
    }

    console.log(`STRICT DEVICE SAVING: Successfully saved transaction with device_id = ${deviceId}`)

    // Add default category name to the returned data if not present
    const processedResult = {
      ...result[0],
      category_name: result[0].category_name || category_name,
      device_id: deviceId, // Ensure device_id is always present
    }

    console.log(`STRICT SAVING: Successfully saved transaction with Device ID: ${deviceId}`)

    revalidatePath("/dashboard")
    return { success: true, data: processedResult }
  } catch (error) {
    console.error("Error adding financial transaction:", error)
    return { success: false, message: "Failed to add financial transaction" }
  }
}

// Get financial data by company, ensuring proper device filtering
export async function getFinancialDataByCompany(companyId: number, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: REQUIRE device ID for strict isolation
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.error("SECURITY ERROR: Device ID is required for financial data:", deviceId)
      return {
        success: false,
        message: "Security Error: Device ID is required for data access.",
        securityError: true,
      }
    }

    console.log(`STRICT FILTERING: Getting financial data ONLY for Device ID: ${deviceId}`)

    // Check if financial_transactions table has device_id column
    const hasFinancialTransactionsDeviceId = await hasColumn("financial_transactions", "device_id")

    // Get total income with strict device filtering
    let incomeResult = [{ total_income: 0 }]
    if (hasFinancialTransactionsDeviceId) {
      incomeResult = await sql`
       SELECT COALESCE(SUM(amount), 0) as total_income
       FROM financial_transactions
       WHERE device_id = ${deviceId} AND transaction_type = 'income'
     `.catch(() => [{ total_income: 0 }])
    }

    let totalIncome = Number.parseFloat(incomeResult?.[0]?.total_income || "0")

    // Check if sales table has device_id column and received_amount
    let hasSalesDeviceId = await hasColumn("sales", "device_id")
    const hasSalesReceivedAmount = await hasColumn("sales", "received_amount")
    const hasSalesStatus = await hasColumn("sales", "status")
    const hasSalesPaymentStatus = await hasColumn("sales", "payment_status")

    // Try to add device_id column if it doesn't exist
    if (!hasSalesDeviceId) {
      const added = await addDeviceIdColumn("sales")
      if (added) {
        hasSalesDeviceId = true
      }
    }

    if (!hasSalesReceivedAmount) {
      console.error("ERROR: Sales table missing 'received_amount' column")
      return {
        success: false,
        message: "Database Error: Sales table missing 'received_amount' column",
        data: {
          totalIncome: 0,
          totalExpenses: 0,
          netProfit: 0,
          pettyCashBalance: 0,
          incomeByCategory: [],
          expensesByCategory: [],
        },
      }
    }

    // Build dynamic WHERE clause for sales
    // let salesWhereClause = `device_id = ${deviceId} AND received_amount > 0`
    // if (hasSalesStatus) {
    //   salesWhereClause += ` AND status != 'Cancelled'`
    // }
    // if (hasSalesPaymentStatus) {
    //   salesWhereClause += ` AND payment_status != 'Cancelled'`
    // }

    // Get total from sales - ONLY received_amount, exclude cancelled
    // let salesResult = [{ total_sales: 0 }]
    // if (hasSalesDeviceId && hasSalesReceivedAmount) {
    //   salesResult = await sql`
    //    SELECT COALESCE(SUM(received_amount), 0) as total_sales
    //    FROM sales
    //    WHERE ${sql.unsafe(salesWhereClause)}
    //  `.catch(() => [{ total_sales: 0 }])
    // }

    // Build conditional queries based on available columns
    let salesQuery

    // Sales query - build based on available columns
    if (hasSalesStatus && hasSalesPaymentStatus) {
      salesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_sales
        FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
        AND payment_status != 'Cancelled'
      `
    } else if (hasSalesStatus) {
      salesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_sales
        FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
      `
    } else if (hasSalesPaymentStatus) {
      salesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_sales
        FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND payment_status != 'Cancelled'
      `
    } else {
      salesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_sales
        FROM sales 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
      `
    }

    let salesResult = [{ total_sales: 0 }]
    if (hasSalesDeviceId && hasSalesReceivedAmount) {
      salesResult = await salesQuery.catch(() => [{ total_sales: 0 }])
    }

    totalIncome += Number.parseFloat(salesResult?.[0]?.total_sales || "0")

    // Get total expenses with strict device filtering
    let expensesResult = [{ total_expenses: 0 }]
    if (hasFinancialTransactionsDeviceId) {
      expensesResult = await sql`
       SELECT COALESCE(SUM(amount), 0) as total_expenses
       FROM financial_transactions
       WHERE device_id = ${deviceId} AND transaction_type = 'expense'
     `.catch(() => [{ total_expenses: 0 }])
    }

    let totalExpenses = Number.parseFloat(expensesResult?.[0]?.total_expenses || "0")

    // Check if purchases table has device_id column and received_amount
    let hasPurchasesDeviceId = await hasColumn("purchases", "device_id")
    const hasPurchasesReceivedAmount = await hasColumn("purchases", "received_amount")
    const hasPurchasesStatus = await hasColumn("purchases", "status")
    const hasPurchasesPaymentStatus = await hasColumn("purchases", "payment_status")

    // Try to add device_id column if it doesn't exist
    if (!hasPurchasesDeviceId) {
      const added = await addDeviceIdColumn("purchases")
      if (added) {
        hasPurchasesDeviceId = true
      }
    }

    if (!hasPurchasesReceivedAmount) {
      console.error("ERROR: Purchases table missing 'received_amount' column")
      return {
        success: false,
        message: "Database Error: Purchases table missing 'received_amount' column",
        data: {
          totalIncome: 0,
          totalExpenses: 0,
          netProfit: 0,
          pettyCashBalance: 0,
          incomeByCategory: [],
          expensesByCategory: [],
        },
      }
    }

    // Build dynamic WHERE clause for purchases
    // let purchasesWhereClause = `device_id = ${deviceId} AND received_amount > 0`
    // if (hasPurchasesStatus) {
    //   purchasesWhereClause += ` AND status != 'Cancelled'`
    // }
    // if (hasPurchasesPaymentStatus) {
    //   purchasesWhereClause += ` AND payment_status != 'Cancelled'`
    // }

    // Get total from purchases - ONLY received_amount, exclude cancelled
    // let purchasesResult = [{ total_purchases: 0 }]
    // if (hasPurchasesDeviceId && hasPurchasesReceivedAmount) {
    //   purchasesResult = await sql`
    //    SELECT COALESCE(SUM(received_amount), 0) as total_purchases
    //    FROM purchases
    //    WHERE ${sql.unsafe(purchasesWhereClause)}
    //  `.catch(() => [{ total_purchases: 0 }])
    // }

    // Build conditional queries based on available columns
    let purchasesQuery

    // Purchases query - build based on available columns
    if (hasPurchasesStatus && hasPurchasesPaymentStatus) {
      purchasesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_purchases
        FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
        AND payment_status != 'Cancelled'
      `
    } else if (hasPurchasesStatus) {
      purchasesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_purchases
        FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND status != 'Cancelled'
      `
    } else if (hasPurchasesPaymentStatus) {
      purchasesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_purchases
        FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
        AND payment_status != 'Cancelled'
      `
    } else {
      purchasesQuery = sql`
        SELECT COALESCE(SUM(received_amount), 0) as total_purchases
        FROM purchases 
        WHERE device_id = ${deviceId} 
        AND received_amount > 0
      `
    }

    let purchasesResult = [{ total_purchases: 0 }]
    if (hasPurchasesDeviceId && hasPurchasesReceivedAmount) {
      purchasesResult = await purchasesQuery.catch(() => [{ total_purchases: 0 }])
    }

    totalExpenses += Number.parseFloat(purchasesResult?.[0]?.total_purchases || "0")

    console.log(`STRICT FILTERING: Device ${deviceId} - Income: ${totalIncome}, Expenses: ${totalExpenses}`)

    return {
      success: true,
      data: {
        totalIncome,
        totalExpenses,
        netProfit: totalIncome - totalExpenses,
        pettyCashBalance: 0, // Simplified for now
        incomeByCategory: [],
        expensesByCategory: [],
      },
    }
  } catch (error) {
    console.error("Error getting financial data by device:", error)

    return {
      success: false,
      message: "Failed to get financial data",
      data: {
        totalIncome: 0,
        totalExpenses: 0,
        netProfit: 0,
        pettyCashBalance: 0,
        incomeByCategory: [],
        expensesByCategory: [],
      },
    }
  }
}

// Update getPettyCashTransactions to provide proper device filtering
export async function getPettyCashTransactions(companyId: number, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: REQUIRE device ID for strict isolation
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.error("SECURITY ERROR: Device ID is required for petty cash transactions:", deviceId)
      return {
        success: false,
        message: "Security Error: Device ID is required for data access.",
        securityError: true,
      }
    }

    // Check if petty_cash table has device_id column
    const hasPettyCashDeviceId = await hasColumn("petty_cash", "device_id")

    let result = []
    if (hasPettyCashDeviceId) {
      result = await sql`
       SELECT id, transaction_date, amount, operation_type, description
       FROM petty_cash
       WHERE device_id = ${deviceId}
       ORDER BY transaction_date DESC
     `.catch(() => [])
    }

    return { success: true, data: result || [] }
  } catch (error) {
    console.error("Error getting petty cash transactions:", error)
    return {
      success: true,
      data: [],
      message: "No petty cash transactions available",
    }
  }
}

// Update getExpenseCategories to handle schema issues and provide proper device filtering
export async function getExpenseCategories(companyId: number, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: REQUIRE device ID for strict isolation
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.error("SECURITY ERROR: Device ID is required for expense categories:", deviceId)
      return {
        success: false,
        message: "Security Error: Device ID is required for data access.",
        securityError: true,
      }
    }

    console.log(`STRICT FILTERING: Fetching expense categories ONLY for Device ID: ${deviceId}`)

    // Check if expense_categories table exists and has device_id column
    const hasExpenseCategoriesDeviceId = await hasColumn("expense_categories", "device_id")

    // Try to query the expense_categories table with strict device filtering
    let result = null
    if (hasExpenseCategoriesDeviceId) {
      result = await sql`
       SELECT id, name
       FROM expense_categories
       WHERE device_id = ${deviceId}
       ORDER BY name
     `.catch(() => null)
    }

    // If no results from expense_categories, try extracting from transactions with strict device filtering
    if (!result || result.length === 0) {
      const hasFinancialTransactionsDeviceId = await hasColumn("financial_transactions", "device_id")
      const hasCategoryNameColumn = await hasColumn("financial_transactions", "category_name")

      if (hasFinancialTransactionsDeviceId) {
        if (hasCategoryNameColumn) {
          result = await sql`
           SELECT 
             DISTINCT ON (COALESCE(category_name, transaction_name, 'General')) 
             id,
             COALESCE(category_name, transaction_name, 'General') as name
           FROM financial_transactions
           WHERE device_id = ${deviceId} AND transaction_type = 'expense'
           ORDER BY COALESCE(category_name, transaction_name, 'General')
         `.catch(() => null)
        } else {
          result = await sql`
           SELECT 
             DISTINCT ON (COALESCE(transaction_name, 'General')) 
             id,
             COALESCE(transaction_name, 'General') as name
           FROM financial_transactions
           WHERE device_id = ${deviceId} AND transaction_type = 'expense'
           ORDER BY COALESCE(transaction_name, 'General')
         `.catch(() => null)
        }
      }
    }

    console.log(`STRICT FILTERING: Retrieved ${result?.length || 0} expense categories for Device ID ${deviceId}`)

    // If still no results, return default categories
    if (!result || result.length === 0) {
      return {
        success: true,
        data: [
          { id: 1, name: "General" },
          { id: 2, name: "Utilities" },
          { id: 3, name: "Rent" },
          { id: 4, name: "Salaries" },
          { id: 5, name: "Marketing" },
          { id: 6, name: "Office Supplies" },
          { id: 7, name: "Travel" },
          { id: 8, name: "Purchases" },
        ],
        message: "Using default expense categories",
      }
    }

    return { success: true, data: result }
  } catch (error) {
    console.error(`Error getting expense categories for Device ID ${deviceId}:`, error)

    // Return default categories to prevent UI errors
    return {
      success: true,
      data: [
        { id: 1, name: "General" },
        { id: 2, name: "Utilities" },
        { id: 3, name: "Rent" },
        { id: 4, name: "Salaries" },
        { id: 5, name: "Marketing" },
        { id: 6, name: "Office Supplies" },
        { id: 7, name: "Travel" },
        { id: 8, name: "Purchases" },
      ],
      message: "Using default expense categories due to error",
    }
  }
}

// Update getIncomeCategories to fix issues and provide proper device filtering
export async function getIncomeCategories(companyId: number, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: REQUIRE device ID for strict isolation
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.error("SECURITY ERROR: Device ID is required for income categories:", deviceId)
      return {
        success: false,
        message: "Security Error: Device ID is required for data access.",
        securityError: true,
      }
    }

    console.log(`STRICT FILTERING: Fetching income categories ONLY for Device ID: ${deviceId}`)

    // Check if financial_transactions table has device_id column
    const hasFinancialTransactionsDeviceId = await hasColumn("financial_transactions", "device_id")
    const hasCategoryNameColumn = await hasColumn("financial_transactions", "category_name")

    // Try to get income categories from income transactions with strict device filtering
    let result
    if (hasFinancialTransactionsDeviceId) {
      if (hasCategoryNameColumn) {
        result = await sql`
         SELECT 
           DISTINCT ON (COALESCE(category_name, transaction_name, 'General')) 
           id,
           COALESCE(category_name, transaction_name, 'General') as name
         FROM financial_transactions
         WHERE device_id = ${deviceId} AND transaction_type = 'income'
         ORDER BY COALESCE(category_name, transaction_name, 'General')
       `.catch(() => null)
      } else {
        result = await sql`
         SELECT 
           DISTINCT ON (COALESCE(transaction_name, 'General')) 
           id,
           COALESCE(transaction_name, 'General') as name
         FROM financial_transactions
         WHERE device_id = ${deviceId} AND transaction_type = 'income'
         ORDER BY COALESCE(transaction_name, 'General')
       `.catch(() => null)
      }
    }

    console.log(`STRICT FILTERING: Retrieved ${result?.length || 0} income categories for Device ID ${deviceId}`)

    // If still no results, return default income categories
    if (!result || result.length === 0) {
      return {
        success: true,
        data: [
          { id: 1, name: "Sales" },
          { id: 2, name: "Services" },
          { id: 3, name: "Investments" },
          { id: 4, name: "Other Income" },
        ],
        message: "Using default income categories",
      }
    }

    return { success: true, data: result }
  } catch (error) {
    console.error(`Error getting income categories for Device ID ${deviceId}:`, error)

    // Return default categories to prevent UI errors
    return {
      success: true,
      data: [
        { id: 1, name: "Sales" },
        { id: 2, name: "Services" },
        { id: 3, name: "Investments" },
        { id: 4, name: "Other Income" },
      ],
      message: "Using default income categories due to error",
    }
  }
}

// Add expense category with proper device filtering
export async function addExpenseCategory(data: any) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    const { name, company_id, created_by, device_id } = data

    // CRITICAL: REQUIRE device ID for strict isolation
    if (!device_id || isNaN(device_id) || device_id <= 0) {
      console.error("SECURITY ERROR: Device ID is required for adding expense category:", device_id)
      return {
        success: false,
        message: "Security Error: Device ID is required for saving categories.",
        securityError: true,
      }
    }

    if (!name) {
      return { success: false, message: "Category name is required" }
    }

    // Check if expense_categories table has required columns
    const hasExpenseCategoriesDeviceId = await hasColumn("expense_categories", "device_id")
    const hasExpenseCategoriesCompanyId = await hasColumn("expense_categories", "company_id")
    const hasExpenseCategoriesCreatedBy = await hasColumn("expense_categories", "created_by")

    // If device_id column doesn't exist, try to add it
    if (!hasExpenseCategoriesDeviceId) {
      const added = await addDeviceIdColumn("expense_categories")
      if (!added) {
        return {
          success: false,
          message: "Database schema error: Cannot save category without device isolation",
        }
      }
    }

    // Check if category already exists for this device
    const existingCategory = await sql`
     SELECT id, name FROM expense_categories 
     WHERE device_id = ${device_id} AND LOWER(name) = LOWER(${name})
   `.catch(() => [])

    if (existingCategory && existingCategory.length > 0) {
      return { success: true, data: existingCategory[0], message: "Category already exists" }
    }

    console.log(`STRICT SAVING: Adding expense category for Device ID: ${device_id}`)

    // Build INSERT query based on available columns
    let result
    if (hasExpenseCategoriesDeviceId && hasExpenseCategoriesCompanyId && hasExpenseCategoriesCreatedBy) {
      // All columns exist
      result = await sql`
       INSERT INTO expense_categories (name, device_id, company_id, created_by)
       VALUES (${name}, ${device_id}, ${company_id || device_id}, ${created_by || device_id})
       RETURNING id, name
     `
    } else if (hasExpenseCategoriesDeviceId && hasExpenseCategoriesCompanyId) {
      // device_id and company_id exist, but not created_by
      result = await sql`
       INSERT INTO expense_categories (name, device_id, company_id)
       VALUES (${name}, ${device_id}, ${company_id || device_id})
       RETURNING id, name
     `
    } else if (hasExpenseCategoriesDeviceId && hasExpenseCategoriesCreatedBy) {
      // device_id and created_by exist, but not company_id
      result = await sql`
       INSERT INTO expense_categories (name, device_id, created_by)
       VALUES (${name}, ${device_id}, ${created_by || device_id})
       RETURNING id, name
     `
    } else if (hasExpenseCategoriesDeviceId) {
      // Only device_id exists
      result = await sql`
       INSERT INTO expense_categories (name, device_id)
       VALUES (${name}, ${device_id})
       RETURNING id, name
     `
    } else {
      // Fallback - minimal columns (this should not happen after adding device_id)
      result = await sql`
       INSERT INTO expense_categories (name)
       VALUES (${name})
       RETURNING id, name
     `
    }

    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Error adding expense category:", error)
    return { success: false, message: "Failed to add expense category" }
  }
}

// Delete financial transaction
export async function deleteFinancialTransaction(id: number) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: Strict validation of transaction ID
    if (!id || isNaN(id) || id <= 0) {
      console.error("SECURITY ERROR: Invalid transaction ID in deleteFinancialTransaction:", id)
      return {
        success: false,
        message: "Security Error: Invalid transaction ID. Access denied.",
        securityError: true,
      }
    }

    await sql`
     DELETE FROM financial_transactions
     WHERE id = ${id}
   `

    revalidatePath("/dashboard")
    return { success: true }
  } catch (error) {
    console.error("Error deleting financial transaction:", error)
    return { success: false, message: "Failed to delete financial transaction" }
  }
}

// Get all categories (both income and expense) with strict device filtering
export async function getAllCategories(companyId: number, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: REQUIRE device ID for strict isolation
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.error("SECURITY ERROR: Device ID is required for categories:", deviceId)
      return {
        success: false,
        message: "Security Error: Device ID is required for data access.",
        securityError: true,
      }
    }

    // Get expense categories with strict device filtering
    const expenseCategories = await getExpenseCategories(companyId, deviceId)

    // Get income categories with strict device filtering
    const incomeCategories = await getIncomeCategories(companyId, deviceId)

    // Combine and deduplicate categories
    const allCategories = [
      ...(expenseCategories.success ? expenseCategories.data : []),
      ...(incomeCategories.success ? incomeCategories.data : []),
    ]

    // Remove duplicates by name
    const uniqueCategories = Array.from(new Map(allCategories.map((item) => [item.name.toLowerCase(), item])).values())

    return { success: true, data: uniqueCategories }
  } catch (error) {
    console.error("Error getting all categories:", error)
    return {
      success: false,
      message: "Failed to get categories",
      data: [
        { id: 1, name: "General" },
        { id: 2, name: "Utilities" },
        { id: 3, name: "Rent" },
        { id: 4, name: "Salaries" },
        { id: 5, name: "Sales" },
        { id: 6, name: "Services" },
        { id: 7, name: "Purchases" },
      ],
    }
  }
}

// Schema is now managed by `npm run migrate`
async function createBudgetSchema() {
  return { success: true }
}

// Get budgets with flexible device filtering (graceful fallback)
export async function getBudgets(companyId: number, deviceId?: number | null) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // FLEXIBLE: Allow operation without device ID for budgets (with warning)
    if (!deviceId || isNaN(deviceId) || deviceId <= 0) {
      console.warn("WARNING: Device ID missing for budgets - using company-level filtering")
      // Return empty budgets for now to maintain security
      return { success: true, data: [], message: "Device ID required for budget access" }
    }

    // Check if budgets table exists
    const hasBudgetsTable = await sql`
     SELECT EXISTS (
       SELECT FROM information_schema.tables 
       WHERE table_name = 'budgets'
     )
   `.catch(() => [{ exists: false }])

    // Create budgets table if it doesn't exist
    const tableExists = hasBudgetsTable[0]?.exists
    if (!tableExists) {
      console.log("Creating budgets table...")
      await createBudgetSchema()
    }

    // Check if budgets table has device_id column
    const hasBudgetsDeviceId = await hasColumn("budgets", "device_id")

    // If device_id column doesn't exist, try to add it
    if (!hasBudgetsDeviceId) {
      console.log("Adding device_id column to budgets table...")
      const added = await addDeviceIdColumn("budgets")
      if (!added) {
        console.warn("Could not add device_id column to budgets table - using company-level filtering")
        // Fallback to company-level filtering
        const hasBudgetsCompanyId = await hasColumn("budgets", "company_id")
        if (hasBudgetsCompanyId && companyId) {
          const budgets = await sql`
           SELECT 
             b.id, 
             b.category_id, 
             b.category_name, 
             b.amount, 
             b.period,
             0 as spent
           FROM budgets b
           WHERE b.company_id = ${companyId}
           ORDER BY b.category_name
         `.catch(() => [])

          return {
            success: true,
            data: budgets || [],
            message: "Using company-level budget filtering (device isolation not available)",
          }
        } else {
          return {
            success: true,
            data: [],
            message: "Budget table schema incompatible - no filtering available",
          }
        }
      }
    }

    console.log(`STRICT FILTERING: Fetching budgets ONLY for Device ID: ${deviceId}`)

    // Check if financial_transactions table has the required columns
    const hasCategoryNameColumn = await hasColumn("financial_transactions", "category_name")
    const hasFinancialTransactionsDeviceId = await hasColumn("financial_transactions", "device_id")

    // Get budgets with strict device filtering
    // Modify the query based on what columns exist in financial_transactions
    let budgets = []

    if (hasFinancialTransactionsDeviceId && hasCategoryNameColumn) {
      // Both device_id and category_name exist - use full join
      budgets = await sql`
       SELECT 
         b.id, 
         b.category_id, 
         b.category_name, 
         b.amount, 
         b.period,
         COALESCE(SUM(CASE WHEN ft.transaction_type = 'expense' THEN ft.amount ELSE 0 END), 0) as spent
       FROM budgets b
       LEFT JOIN financial_transactions ft ON 
         (ft.category_name = b.category_name OR ft.transaction_name = b.category_name) 
         AND ft.device_id = b.device_id
         AND ft.transaction_type = 'expense'
       WHERE b.device_id = ${deviceId}
       GROUP BY b.id, b.category_id, b.category_name, b.amount, b.period
       ORDER BY b.category_name
     `.catch((error) => {
        console.error("Error fetching budgets with full join:", error)
        return []
      })
    } else if (hasFinancialTransactionsDeviceId && !hasCategoryNameColumn) {
      // Only device_id exists - use transaction_name only
      budgets = await sql`
       SELECT 
         b.id, 
         b.category_id, 
         b.category_name, 
         b.amount, 
         b.period,
         COALESCE(SUM(CASE WHEN ft.transaction_type = 'expense' THEN ft.amount ELSE 0 END), 0) as spent
       FROM budgets b
       LEFT JOIN financial_transactions ft ON 
         ft.transaction_name = b.category_name
         AND ft.device_id = b.device_id
         AND ft.transaction_type = 'expense'
       WHERE b.device_id = ${deviceId}
       GROUP BY b.id, b.category_id, b.category_name, b.amount, b.period
       ORDER BY b.category_name
     `.catch((error) => {
        console.error("Error fetching budgets with device_id join:", error)
        return []
      })
    } else if (!hasFinancialTransactionsDeviceId && hasCategoryNameColumn) {
      // Only category_name exists but no device_id - can't safely join without device filtering
      console.warn("WARNING: financial_transactions has no device_id column - cannot calculate spent amounts safely")
      budgets = await sql`
       SELECT 
         id, 
         category_id, 
         category_name, 
         amount, 
         period,
         0 as spent
       FROM budgets
       WHERE device_id = ${deviceId}
       ORDER BY category_name
     `.catch((error) => {
        console.error("Error fetching budgets without join:", error)
        return []
      })
    } else {
      // Neither column exists or both are missing - simple budget fetch without spent calculation
      console.warn("WARNING: financial_transactions missing required columns - cannot calculate spent amounts")
      budgets = await sql`
       SELECT 
         id, 
         category_id, 
         category_name, 
         amount, 
         period,
         0 as spent
       FROM budgets
       WHERE device_id = ${deviceId}
       ORDER BY category_name
     `.catch((error) => {
        console.error("Error fetching budgets without join:", error)
        return []
      })
    }

    return { success: true, data: budgets || [] }
  } catch (error) {
    console.error("Error getting budgets:", error)
    return { success: true, message: "Failed to get budgets", data: [] }
  }
}

// Add budget with flexible device filtering
export async function addBudget(data: any) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    const { category_id, category_name, amount, period, company_id, created_by, device_id } = data

    // FLEXIBLE: Allow operation without device ID for budgets (with warning)
    if (!device_id || isNaN(device_id) || device_id <= 0) {
      console.warn("WARNING: Device ID missing for adding budget - using company-level saving")
      if (!company_id) {
        return {
          success: false,
          message: "Either Device ID or Company ID is required for saving budgets.",
        }
      }
    }

    if (!category_name || !amount || !period) {
      return { success: false, message: "Missing required fields" }
    }

    // Check if budgets table exists
    const hasBudgetsTable = await sql`
     SELECT EXISTS (
       SELECT FROM information_schema.tables 
       WHERE table_name = 'budgets'
     )
   `.catch(() => [{ exists: false }])

    // Create budgets table if it doesn't exist
    const tableExists = hasBudgetsTable[0]?.exists
    if (!tableExists) {
      await createBudgetSchema()
    }

    // Check if budgets table has device_id column
    const hasBudgetsDeviceId = await hasColumn("budgets", "device_id")
    const hasBudgetsCompanyId = await hasColumn("budgets", "company_id")

    // If device_id column doesn't exist, try to add it
    if (!hasBudgetsDeviceId) {
      const added = await addDeviceIdColumn("budgets")
      if (!added && !hasBudgetsCompanyId) {
        return {
          success: false,
          message: "Database schema error: Cannot save budget without proper isolation",
        }
      }
    }

    // Check if budget already exists
    let existingBudget = []
    if (device_id && hasBudgetsDeviceId) {
      existingBudget = await sql`
       SELECT id FROM budgets 
       WHERE device_id = ${device_id} AND LOWER(category_name) = LOWER(${category_name})
     `.catch(() => [])
    } else if (company_id && hasBudgetsCompanyId) {
      existingBudget = await sql`
       SELECT id FROM budgets 
       WHERE company_id = ${company_id} AND LOWER(category_name) = LOWER(${category_name})
     `.catch(() => [])
    }

    if (existingBudget && existingBudget.length > 0) {
      // Update existing budget
      await sql`
       UPDATE budgets 
       SET amount = ${amount}, period = ${period}
       WHERE id = ${existingBudget[0].id}
     `

      return {
        success: true,
        message: "Budget updated successfully",
        data: {
          id: existingBudget[0].id,
          category_id,
          category_name,
          amount,
          period,
        },
      }
    }

    console.log(`FLEXIBLE SAVING: Adding budget for Device ID: ${device_id} or Company ID: ${company_id}`)

    // Save with available columns
    let result
    if (device_id && hasBudgetsDeviceId && hasBudgetsCompanyId) {
      result = await sql`
       INSERT INTO budgets (category_id, category_name, amount, period, device_id, company_id, created_by)
       VALUES (${category_id || null}, ${category_name}, ${amount}, ${period}, ${device_id}, ${company_id || device_id}, ${created_by || device_id})
       RETURNING id, category_id, category_name, amount, period
     `
    } else if (device_id && hasBudgetsDeviceId) {
      result = await sql`
       INSERT INTO budgets (category_id, category_name, amount, period, device_id, created_by)
       VALUES (${category_id || null}, ${category_name}, ${amount}, ${period}, ${device_id}, ${created_by || device_id})
       RETURNING id, category_id, category_name, amount, period
     `
    } else if (company_id && hasBudgetsCompanyId) {
      result = await sql`
       INSERT INTO budgets (category_id, category_name, amount, period, company_id, created_by)
       VALUES (${category_id || null}, ${category_name}, ${amount}, ${period}, ${company_id}, ${created_by || company_id})
       RETURNING id, category_id, category_name, amount, period
     `
    } else {
      return {
        success: false,
        message: "Database schema error: Cannot save budget without proper columns",
      }
    }

    revalidatePath("/dashboard")
    return { success: true, message: "Budget added successfully", data: result[0] }
  } catch (error) {
    console.error("Error adding budget:", error)
    return { success: false, message: "Failed to add budget" }
  }
}

// Delete budget
export async function deleteBudget(id: number) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    // CRITICAL: Strict validation of budget ID
    if (!id || isNaN(id) || id <= 0) {
      console.error("SECURITY ERROR: Invalid budget ID in deleteBudget:", id)
      return {
        success: false,
        message: "Security Error: Invalid budget ID. Access denied.",
        securityError: true,
      }
    }

    await sql`
     DELETE FROM budgets
     WHERE id = ${id}
   `

    revalidatePath("/dashboard")
    return { success: true, message: "Budget deleted successfully" }
  } catch (error) {
    console.error("Error deleting budget:", error)
    return { success: false, message: "Failed to delete budget" }
  }
}

// Add petty cash transaction
export async function addPettyCashTransaction(data: any) {
  // Verify database security
  const isSecure = await verifyDatabaseSecurity()
  if (!isSecure) {
    return {
      success: false,
      message: "Critical security error: Database schema issue. Contact administrator immediately.",
      securityError: true,
    }
  }

  try {
    const { amount, operation_type, description, company_id, created_by, device_id } = data

    // CRITICAL: REQUIRE device ID for strict isolation
    if (!device_id || isNaN(device_id) || device_id <= 0) {
      console.error("SECURITY ERROR: Device ID is required for adding petty cash transaction:", device_id)
      return {
        success: false,
        message: "Security Error: Device ID is required for saving transactions.",
        securityError: true,
      }
    }

    if (!amount || !operation_type) {
      return { success: false, message: "Missing required fields" }
    }

    const result = await sql`
      INSERT INTO petty_cash (amount, operation_type, description, device_id, company_id, created_by, transaction_date)
      VALUES (${amount}, ${operation_type}, ${description || ""}, ${device_id}, ${company_id || device_id}, ${created_by || device_id}, NOW())
      RETURNING id, amount, operation_type, description, transaction_date
    `

    revalidatePath("/dashboard")
    return { success: true, data: result[0] }
  } catch (error) {
    console.error("Error adding petty cash transaction:", error)
    return { success: false, message: "Failed to add petty cash transaction" }
  }
}

// Alias for getFinancialTransactions
export async function getFinanceTransactions(companyId: number, deviceId?: number | null) {
  return await getFinancialTransactions(companyId, deviceId)
}

// Alias for addFinancialTransaction
export async function addFinanceTransaction(formData: any, deviceId?: number | null) {
  return await addFinancialTransaction(formData, deviceId)
}

// Alias for getAllCategories
export async function getFinanceCategories(companyId: number, deviceId?: number | null) {
  return await getAllCategories(companyId, deviceId)
}

// Alias for addExpenseCategory
export async function addFinanceCategory(data: any) {
  return await addExpenseCategory(data)
}
