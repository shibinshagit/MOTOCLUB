// TypeScript types for the Accounting AI Chatbot
// Server-side only — never exposed to the browser directly

export interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export interface AIChatRequest {
  messages: ChatMessage[]
  deviceId: number
  fromDate?: string // YYYY-MM-DD
  toDate?: string   // YYYY-MM-DD
}

export interface AIChatResponse {
  message: string
  error?: string
}

// Tool parameter types — device_id is NEVER in these; it's injected server-side
export interface DateRangeParams {
  fromDate: string  // YYYY-MM-DD
  toDate: string    // YYYY-MM-DD
}

// The structured result types returned by accounting tools

export interface SalesSummaryResult {
  salesRevenue: number
  orderCount: number
  totalQuantity: number
  cogs: number
  grossProfit: number
}

export interface ProfitSummaryResult {
  salesRevenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  otherIncome: number
  expenseBreakdown: Array<{ category: string; amount: number }>
}

export interface ExpenseSummaryResult {
  operatingExpenses: number
  expenseBreakdown: Array<{ category: string; amount: number }>
}

export interface BalanceSummaryResult {
  openingBalance: number
  moneyIn: number
  moneyOut: number
  closingBalance: number
}

export interface ReceivablesSummaryResult {
  accountsReceivable: number
  receivableCount: number
}

export interface PayablesSummaryResult {
  accountsPayable: number
  payableCount: number
}

export interface FullAccountingSummaryResult {
  // Sales & P&L
  salesRevenue: number
  orderCount: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  otherIncome: number
  // Cash flow
  openingBalance: number
  moneyIn: number
  moneyOut: number
  closingBalance: number
  // Outstanding balances
  accountsReceivable: number
  accountsPayable: number
}

export interface ComparisonResult {
  current: number
  previous: number
  difference: number
  percentageChange: number | null
}

export interface PeriodComparisonResult {
  salesRevenue: ComparisonResult
  netProfit: ComparisonResult
  operatingExpenses: ComparisonResult
  cogs: ComparisonResult
  currentLabel: string
  previousLabel: string
}

// Tool error
export interface ToolError {
  error: true
  message: string
}

export type ToolResult<T> = T | ToolError

export function isToolError<T>(result: ToolResult<T>): result is ToolError {
  return (result as ToolError).error === true
}
