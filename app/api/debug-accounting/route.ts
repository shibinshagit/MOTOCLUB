import { sql } from "@/lib/db"
import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { deviceId } = await request.json()

    // Check if tables exist
    const tablesExist = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('financial_ledger', 'cogs_entries', 'accounts_receivable')
    `

    // Check table structure
    const ledgerColumns = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'financial_ledger' 
      AND table_schema = 'public'
      ORDER BY ordinal_position
    `

    // Count transactions
    let transactionCount = 0
    let transactions = []

    try {
      const result = await sql`
        SELECT COUNT(*) as count FROM financial_ledger WHERE device_id = ${deviceId}
      `
      transactionCount = Number(result[0]?.count || 0)

      if (transactionCount > 0) {
        transactions = await sql`
          SELECT * FROM financial_ledger WHERE device_id = ${deviceId} ORDER BY transaction_date DESC LIMIT 5
        `
      }
    } catch (error) {
      console.error("Error querying financial_ledger:", error)
    }

    // Check recent sales
    const recentSales = await sql`
      SELECT id, total_amount, status, created_at 
      FROM sales 
      WHERE device_id = ${deviceId} 
      ORDER BY created_at DESC 
      LIMIT 5
    `

    return NextResponse.json({
      success: true,
      data: {
        tablesExist: tablesExist.map((t) => t.table_name),
        ledgerColumns: ledgerColumns.map((c) => `${c.column_name} (${c.data_type})`),
        transactionCount,
        transactions,
        recentSales,
        deviceId,
      },
    })
  } catch (error) {
    console.error("Debug API error:", error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
