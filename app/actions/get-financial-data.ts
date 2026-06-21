"use server"

import { getFinancialSummary } from "./simplified-accounting"

export async function getFinancialData(deviceId: number, dateFrom?: string, dateTo?: string) {
  try {
    console.log("Getting financial data for device:", deviceId, "from:", dateFrom, "to:", dateTo)

    const fromDateStr = dateFrom?.slice(0, 10)
    const toDateStr = dateTo?.slice(0, 10)

    const result = await getFinancialSummary(deviceId, fromDateStr, toDateStr)

    console.log("Financial summary:", {
      totalIncome: result.totalIncome,
      totalCogs: result.totalCogs,
      transactionCount: result.transactions?.length || 0,
      firstTransactionDate: result.transactions?.[0]?.date,
    })

    return result
  } catch (error) {
    console.error("Error getting financial data:", error)
    return {
      totalIncome: 0,
      totalCogs: 0,
      totalProfit: 0,
      totalExpenses: 0,
      netProfit: 0,
      accountsReceivable: 0,
      accountsPayable: 0,
      outstandingReceivables: 0,
      transactions: [],
      receivables: [],
      payables: [],
    }
  }
}
