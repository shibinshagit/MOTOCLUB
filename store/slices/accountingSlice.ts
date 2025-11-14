// store/slices/accountingSlice.ts
import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import type { RootState } from "../store"

interface Transaction {
  id: number
  date: string
  description: string
  type: string
  status: string
  amount: number
  received: number
  cost: number
  debit: number
  credit: number
  paymentMethod: string
  account: string
  reference?: string
  sale_id?: number
  purchase_id?: number
  supplier_payment_id?: number
  reference_id?: number
}

interface Receivable {
  id: number
  customer_name: string
  amount: number
  total_amount: number
  received_amount: number
  due_date: string
  days_overdue: number
  status: string
}

interface Payable {
  id: number
  supplier_name: string
  amount: number
  total_amount: number
  received_amount: number
  due_date: string
  days_overdue: number
  status: string
}

export interface FinancialData {
  totalIncome: number
  totalCogs: number
  totalProfit: number
  totalExpenses: number
  netProfit: number
  accountsReceivable: number
  accountsPayable: number
  outstandingReceivables: number
  transactions: Transaction[]
  receivables: Receivable[]
  payables: Payable[]
}

interface BalanceData {
  openingBalance: number
  closingBalance: number
  openingCredits: number
  openingDebits: number
  closingCredits: number
  closingDebits: number
  openingReceived: number
  closingReceived: number
}

interface AccountingState {
  financialData: FinancialData | null
  balances: BalanceData | null
  lastUpdated: string | null
  dateFrom: string | null
  dateTo: string | null
  isLoading: boolean
  isBackgroundLoading: boolean
}

const initialState: AccountingState = {
  financialData: null,
  balances: null,
  lastUpdated: null,
  dateFrom: null,
  dateTo: null,
  isLoading: true,
  isBackgroundLoading: false,
}

export const accountingSlice = createSlice({
  name: "accounting",
  initialState,
  reducers: {
    setFinancialData: (state, action: PayloadAction<FinancialData>) => {
      state.financialData = action.payload
      state.lastUpdated = new Date().toISOString()
      state.isLoading = false
      state.isBackgroundLoading = false
    },
    setBalances: (state, action: PayloadAction<BalanceData>) => {
      state.balances = action.payload
    },
    setDateRange: (state, action: PayloadAction<{ dateFrom: string; dateTo: string }>) => {
      state.dateFrom = action.payload.dateFrom
      state.dateTo = action.payload.dateTo
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setBackgroundLoading: (state, action: PayloadAction<boolean>) => {
      state.isBackgroundLoading = action.payload
    },
    clearFinancialData: (state) => {
      state.financialData = null
      state.balances = null
      state.lastUpdated = null
      state.isLoading = true
    },
    updateTransaction: (state, action: PayloadAction<{ id: number; updates: Partial<Transaction> }>) => {
      if (state.financialData) {
        const transactionIndex = state.financialData.transactions.findIndex(t => t.id === action.payload.id)
        if (transactionIndex !== -1) {
          state.financialData.transactions[transactionIndex] = {
            ...state.financialData.transactions[transactionIndex],
            ...action.payload.updates
          }
        }
      }
    },
  },
})

export const { 
  setFinancialData, 
  setBalances, 
  setDateRange, 
  setLoading, 
  setBackgroundLoading, 
  clearFinancialData,
  updateTransaction 
} = accountingSlice.actions

// Selectors
export const selectFinancialData = (state: RootState) => state.accounting.financialData
export const selectBalances = (state: RootState) => state.accounting.balances
export const selectLastUpdated = (state: RootState) => state.accounting.lastUpdated
export const selectDateRange = (state: RootState) => ({
  dateFrom: state.accounting.dateFrom,
  dateTo: state.accounting.dateTo,
})
export const selectIsLoading = (state: RootState) => state.accounting.isLoading
export const selectIsBackgroundLoading = (state: RootState) => state.accounting.isBackgroundLoading

// FIXED: Helper selectors for calculations - PROPER credit sale handling
export const selectCashImpact = (state: RootState) => (transaction: Transaction) => {
  const status = transaction.status?.toLowerCase()
  const type = transaction.type?.toLowerCase()
  const totalAmount = Number(transaction.amount) || 0
  const receivedAmount = Number(transaction.received) || 0
  const costAmount = Number(transaction.cost) || 0
  
  // For supplier payments, cash impact is negative
  if (type === 'supplier_payment' || transaction.description?.toLowerCase().includes('supplier payment')) {
    return -Math.abs(transaction.debit || transaction.amount)
  }
  
  // FIXED: For credit sales - handle both no payment and partial payment
  if (status === 'credit') {
    if (receivedAmount > 0) {
      // Partial payment: cash impact = received amount - proportional COGS
      const paymentRatio = totalAmount > 0 ? receivedAmount / totalAmount : 0
      const proportionalCost = costAmount * paymentRatio
      return receivedAmount - proportionalCost
    } else {
      // No payment: no cash impact
      return 0
    }
  }
  
  // For completed sales: cash impact = received amount - cost
  if ((status === 'completed' || status === 'paid') && 
      (type === 'sale' || transaction.description?.toLowerCase().startsWith('sale'))) {
    return receivedAmount - costAmount
  }
  
  // For purchases: cash impact = -debit amount (money going out)
  if (type === 'purchase' || transaction.description?.toLowerCase().startsWith('purchase')) {
    return -Math.abs(transaction.debit || transaction.amount)
  }
  
  // For manual debit transactions: cash impact = -amount
  if (type === 'manual' && transaction.debit > 0) {
    return -transaction.debit
  }
  
  // For manual credit transactions: cash impact = +amount
  if (type === 'manual' && transaction.credit > 0) {
    return transaction.credit
  }
  
  // Default calculation (should rarely be used)
  return transaction.credit - transaction.debit
}

// FIXED: Remaining amount selector - for both full and partial credit sales
export const selectRemainingAmount = (state: RootState) => (transaction: Transaction) => {
  const status = transaction.status?.toLowerCase()
  const totalAmount = Number(transaction.amount) || 0
  const receivedAmount = Number(transaction.received) || 0
  
  // FIXED: For ALL credit sales (no payment and partial payment), calculate remaining
  if (status === 'credit') {
    const remaining = totalAmount - receivedAmount
    return Math.max(0, remaining)
  }
  
  // For completed sales with partial payment (edge case)
  if ((status === 'completed' || status === 'paid') && receivedAmount < totalAmount) {
    const remaining = totalAmount - receivedAmount
    return Math.max(0, remaining)
  }
  
  return 0
}

// FIXED: Money flow display selector - proper handling for both full and partial credit sales
export const selectMoneyFlowDisplay = (state: RootState) => (transaction: Transaction) => {
  const status = transaction.status?.toLowerCase()
  const receivedAmount = Number(transaction.received) || 0
  const totalAmount = Number(transaction.amount) || 0
  
  // FIXED: For credit sales - handle both no payment and partial payment
  if (status === 'credit') {
    if (receivedAmount > 0 && receivedAmount < totalAmount) {
      // Partial payment received
      return {
        text: "Partial Payment",
        color: "text-green-600 dark:text-green-400",
        value: receivedAmount,
        showAmount: true
      }
    } else if (receivedAmount === 0) {
      // No payment received - completely credit
      return {
        text: "Pending",
        color: "text-yellow-600 dark:text-yellow-400",
        value: 0,
        showAmount: false
      }
    } else if (receivedAmount >= totalAmount) {
      // Fully paid credit sale (edge case)
      return {
        text: "Money In",
        color: "text-green-600 dark:text-green-400",
        value: receivedAmount,
        showAmount: true
      }
    }
  }
  
  const netImpact = selectCashImpact(state)(transaction)
  
  if (netImpact > 0) {
    return {
      text: "Money In",
      color: "text-green-600 dark:text-green-400",
      value: transaction.received || transaction.credit,
      showAmount: true
    }
  } else if (netImpact < 0) {
    return {
      text: "Money Out",
      color: "text-red-600 dark:text-red-400",
      value: Math.abs(transaction.debit || transaction.amount),
      showAmount: true
    }
  } else {
    return {
      text: "No Cash Impact",
      color: "text-gray-600 dark:text-gray-400",
      value: 0,
      showAmount: false
    }
  }
}

export default accountingSlice.reducer
