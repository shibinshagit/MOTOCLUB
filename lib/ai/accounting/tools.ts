/**
 * Server-side read-only accounting tools for the AI chatbot.
 *
 * SECURITY:
 * - All functions in this file are server-only.
 * - deviceId is ALWAYS passed from the authenticated server context — never from the AI model.
 * - These functions delegate 100% to existing authoritative ERP calculations.
 * - No independent calculations, no arbitrary SQL, no write operations.
 */

import "server-only"
import { getAuthoritativeProfitSummary } from "@/lib/profit-calculation"
import { getFinancialSummary, getAccountingBalances } from "@/app/actions/simplified-accounting"
import type {
  SalesSummaryResult,
  ProfitSummaryResult,
  ExpenseSummaryResult,
  BalanceSummaryResult,
  ReceivablesSummaryResult,
  PayablesSummaryResult,
  FullAccountingSummaryResult,
  PeriodComparisonResult,
  ToolResult,
  ToolError,
} from "./types"

function toolError(message: string): ToolError {
  return { error: true, message }
}

/**
 * Get sales summary for a date range.
 * Wraps: getAuthoritativeProfitSummary → salesRevenue, validOrders, totalQuantity, salesCogs, orderGrossProfit
 */
export async function getSalesSummary(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<SalesSummaryResult>> {
  try {
    const result = await getAuthoritativeProfitSummary(deviceId, {
      dateFrom: fromDate,
      dateTo: toDate,
    })
    return {
      salesRevenue: result.salesRevenue,
      orderCount: result.validOrders,
      totalQuantity: result.totalQuantity,
      cogs: result.salesCogs,
      grossProfit: result.orderGrossProfit,
    }
  } catch (error) {
    console.error("[AI Tool] getSalesSummary error:", error)
    return toolError("Failed to retrieve sales summary.")
  }
}

/**
 * Get profit summary for a date range.
 * Wraps: getAuthoritativeProfitSummary → salesRevenue, salesCogs, grossProfit, operatingExpenses, netProfit
 */
export async function getProfitSummary(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<ProfitSummaryResult>> {
  try {
    const result = await getAuthoritativeProfitSummary(deviceId, {
      dateFrom: fromDate,
      dateTo: toDate,
    })
    return {
      salesRevenue: result.salesRevenue,
      cogs: result.salesCogs,
      grossProfit: result.grossProfit,
      operatingExpenses: result.operatingExpenses,
      netProfit: result.netProfit,
      otherIncome: result.otherIncome,
      expenseBreakdown: result.expenseBreakdown,
    }
  } catch (error) {
    console.error("[AI Tool] getProfitSummary error:", error)
    return toolError("Failed to retrieve profit summary.")
  }
}

/**
 * Get expense summary for a date range.
 * Wraps: getAuthoritativeProfitSummary → operatingExpenses, expenseBreakdown
 */
export async function getExpenseSummary(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<ExpenseSummaryResult>> {
  try {
    const result = await getAuthoritativeProfitSummary(deviceId, {
      dateFrom: fromDate,
      dateTo: toDate,
    })
    return {
      operatingExpenses: result.operatingExpenses,
      expenseBreakdown: result.expenseBreakdown,
    }
  } catch (error) {
    console.error("[AI Tool] getExpenseSummary error:", error)
    return toolError("Failed to retrieve expense summary.")
  }
}

/**
 * Get accounting balance (opening, money in/out, closing) for a date range.
 * Wraps: getAccountingBalances → openingBalance, moneyIn, moneyOut, closingBalance
 */
export async function getAccountingBalance(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<BalanceSummaryResult>> {
  try {
    const result = await getAccountingBalances(deviceId, fromDate, toDate)
    return {
      openingBalance: result.openingBalance,
      moneyIn: result.moneyIn ?? 0,
      moneyOut: result.moneyOut ?? 0,
      closingBalance: result.closingBalance,
    }
  } catch (error) {
    console.error("[AI Tool] getAccountingBalance error:", error)
    return toolError("Failed to retrieve accounting balances.")
  }
}

/**
 * Get accounts receivable (what customers owe us).
 * Wraps: getFinancialSummary → accountsReceivable, receivables list
 */
export async function getReceivablesSummary(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<ReceivablesSummaryResult>> {
  try {
    // getFinancialSummary computes receivables across ALL time (not date-filtered for outstanding amounts)
    // This is correct: receivables are the current outstanding balance, regardless of date filter
    const result = await getFinancialSummary(deviceId, fromDate, toDate)
    return {
      accountsReceivable: result.accountsReceivable,
      receivableCount: result.receivables?.length ?? 0,
    }
  } catch (error) {
    console.error("[AI Tool] getReceivablesSummary error:", error)
    return toolError("Failed to retrieve receivables summary.")
  }
}

/**
 * Get accounts payable (what we owe suppliers).
 * Wraps: getFinancialSummary → accountsPayable, payables list
 */
export async function getPayablesSummary(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<PayablesSummaryResult>> {
  try {
    const result = await getFinancialSummary(deviceId, fromDate, toDate)
    return {
      accountsPayable: result.accountsPayable,
      payableCount: result.payables?.length ?? 0,
    }
  } catch (error) {
    console.error("[AI Tool] getPayablesSummary error:", error)
    return toolError("Failed to retrieve payables summary.")
  }
}

/**
 * Get the full accounting summary combining P&L and cash flow.
 * Wraps: getAuthoritativeProfitSummary + getAccountingBalances + getFinancialSummary
 */
export async function getFullAccountingSummary(
  deviceId: number,
  fromDate: string,
  toDate: string,
): Promise<ToolResult<FullAccountingSummaryResult>> {
  try {
    const [profitResult, balanceResult, summaryResult] = await Promise.all([
      getAuthoritativeProfitSummary(deviceId, { dateFrom: fromDate, dateTo: toDate }),
      getAccountingBalances(deviceId, fromDate, toDate),
      getFinancialSummary(deviceId, fromDate, toDate),
    ])

    return {
      // Sales & P&L
      salesRevenue: profitResult.salesRevenue,
      orderCount: profitResult.validOrders,
      cogs: profitResult.salesCogs,
      grossProfit: profitResult.grossProfit,
      operatingExpenses: profitResult.operatingExpenses,
      netProfit: profitResult.netProfit,
      otherIncome: profitResult.otherIncome,
      // Cash flow
      openingBalance: balanceResult.openingBalance,
      moneyIn: balanceResult.moneyIn ?? 0,
      moneyOut: balanceResult.moneyOut ?? 0,
      closingBalance: balanceResult.closingBalance,
      // Outstanding
      accountsReceivable: summaryResult.accountsReceivable,
      accountsPayable: summaryResult.accountsPayable,
    }
  } catch (error) {
    console.error("[AI Tool] getFullAccountingSummary error:", error)
    return toolError("Failed to retrieve full accounting summary.")
  }
}

/**
 * Compare two periods for key metrics.
 * Each period calls getAuthoritativeProfitSummary separately — all server-side, trusted code.
 */
export async function comparePeriods(
  deviceId: number,
  currentFrom: string,
  currentTo: string,
  previousFrom: string,
  previousTo: string,
  currentLabel: string,
  previousLabel: string,
): Promise<ToolResult<PeriodComparisonResult>> {
  try {
    const [currentResult, previousResult] = await Promise.all([
      getAuthoritativeProfitSummary(deviceId, { dateFrom: currentFrom, dateTo: currentTo }),
      getAuthoritativeProfitSummary(deviceId, { dateFrom: previousFrom, dateTo: previousTo }),
    ])

    function compare(current: number, previous: number) {
      const difference = current - previous
      const percentageChange = previous !== 0 ? (difference / Math.abs(previous)) * 100 : null
      return { current, previous, difference, percentageChange }
    }

    return {
      salesRevenue: compare(currentResult.salesRevenue, previousResult.salesRevenue),
      netProfit: compare(currentResult.netProfit, previousResult.netProfit),
      operatingExpenses: compare(currentResult.operatingExpenses, previousResult.operatingExpenses),
      cogs: compare(currentResult.salesCogs, previousResult.salesCogs),
      currentLabel,
      previousLabel,
    }
  } catch (error) {
    console.error("[AI Tool] comparePeriods error:", error)
    return toolError("Failed to compare periods.")
  }
}
