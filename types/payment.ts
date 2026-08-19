export interface PaymentRecordInput {
  id?: number
  paymentMethod: string
  amount: number
  referenceNumber?: string
  notes?: string
}

export interface TransactionPayment {
  id?: number
  sale_id?: number | null
  purchase_id?: number | null
  payment_method: string
  amount: number
  reference_number?: string | null
  payment_date?: string | Date
  notes?: string | null
  created_at?: string | Date
  updated_at?: string | Date
}
