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

// Helper functions that can be used both in slice and component
export const calculateCashImpact = (transaction: Transaction): number => {
  const status = transaction.status?.toLowerCase()
  const type = transaction.type?.toLowerCase()
  const totalAmount = Number(transaction.amount) || 0
  const receivedAmount = Number(transaction.received) || 0
  const costAmount = Number(transaction.cost) || 0
  
  // For supplier payments, cash impact is negative
  if (type === 'supplier_payment' || transaction.description?.toLowerCase().includes('supplier payment')) {
    return -Math.abs(transaction.debit || transaction.amount)
  }
  
  // For credit sales - handle both no payment and partial payment
  if (status === 'credit') {
    if (receivedAmount > 0) {
      // Partial payment received: cash impact = received amount - proportional COGS
      const paymentRatio = totalAmount > 0 ? receivedAmount / totalAmount : 0
      const proportionalCost = costAmount * paymentRatio
      return receivedAmount - proportionalCost
    } else {
      // No payment received: no cash impact
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

export const calculateRemainingAmount = (transaction: Transaction) => {
  const type = transaction.type?.toLowerCase();
  const status = transaction.status?.toLowerCase();
  const amount = Number(transaction.amount) || 0;
  const received = Number(transaction.received) || 0;
  
  // For credit sales, remaining amount is total minus actual received
  if (type === 'sale' && status === 'credit') {
    return Math.max(0, amount - received);
  }
  
  // For other sale types
  if (type === 'sale') {
    return Math.max(0, amount - received);
  }
  
  // For purchases
  if (type === 'purchase') {
    return Math.max(0, amount - received);
  }
  
  return 0;
};

export const getMoneyFlowDisplay = (transaction: Transaction) => {
  const type = transaction.type?.toLowerCase();
  const status = transaction.status?.toLowerCase();
  const amount = Number(transaction.amount) || 0;
  const received = Number(transaction.received) || 0;
  const credit = Number(transaction.credit) || 0;
  
  // For credit sales with partial payments
  if (type === 'sale' && status === 'credit') {
    const actualReceived = received;
    const remaining = amount - actualReceived;
    
    if (actualReceived > 0 && actualReceived < amount) {
      // Partial credit sale - show partial payment
      return {
        text: 'Partial Payment',
        value: actualReceived,
        showAmount: true,
        color: 'text-blue-600 dark:text-blue-400'
      };
    } else if (actualReceived === 0) {
      // Full credit sale - no payment received
      return {
        text: 'Pending',
        value: 0,
        showAmount: false,
        color: 'text-yellow-600 dark:text-yellow-400'
      };
    }
  }
  
  // Existing logic for other transaction types
  if (type === 'sale' && status === 'completed') {
    return {
      text: 'Paid',
      value: amount,
      showAmount: true,
      color: 'text-green-600 dark:text-green-400'
    };
  } else if (type === 'sale' && status === 'credit') {
    return {
      text: 'Pending',
      value: 0,
      showAmount: false,
      color: 'text-yellow-600 dark:text-yellow-400'
    };
  } else if (type === 'purchase') {
    return {
      text: 'Paid',
      value: received,
      showAmount: true,
      color: 'text-orange-600 dark:text-orange-400'
    };
  } else if (type === 'manual') {
    const netAmount = credit - (Number(transaction.debit) || 0);
    return {
      text: netAmount >= 0 ? 'Income' : 'Expense',
      value: Math.abs(netAmount),
      showAmount: true,
      color: netAmount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
    };
  } else {
    return {
      text: 'Processed',
      value: amount,
      showAmount: true,
      color: 'text-gray-600 dark:text-gray-400'
    };
  }
};

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

export default accountingSlice.reducer
