"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { ArrowDownCircle, ArrowUpCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  addCapitalTransaction,
  getCapitalSummary,
  type CapitalSummary,
} from "@/app/actions/capital-actions"

interface CapitalTabProps {
  deviceId: number
  currency: string
  dateFrom: Date
  dateTo: Date
}

const PAYMENT_METHODS = ["Cash", "Bank Transfer", "UPI", "Card", "Check", "Other"]

export default function CapitalTab({ deviceId, currency, dateFrom, dateTo }: CapitalTabProps) {
  const { toast } = useToast()
  const [summary, setSummary] = useState<CapitalSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [dialogType, setDialogType] = useState<"IN" | "OUT" | null>(null)
  const [amount, setAmount] = useState("")
  const [description, setDescription] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Cash")
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"))
  const [saving, setSaving] = useState(false)

  const fromKey = format(dateFrom, "yyyy-MM-dd")
  const toKey = format(dateTo, "yyyy-MM-dd")

  const money = (v: number) =>
    `${currency} ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}`

  const load = useCallback(async () => {
    setLoading(true)
    const res = await getCapitalSummary(deviceId, { dateFrom: fromKey, dateTo: toKey })
    if (res.success && res.data) setSummary(res.data)
    else notifyError(toast, res.message || "Failed to load capital ledger")
    setLoading(false)
  }, [deviceId, fromKey, toKey, toast])

  useEffect(() => {
    load()
  }, [load])

  const openDialog = (type: "IN" | "OUT") => {
    setDialogType(type)
    setAmount("")
    setDescription("")
    setPaymentMethod("Cash")
    setDate(format(new Date(), "yyyy-MM-dd"))
  }

  const numericAmount = Number(amount)
  const available = summary?.currentBalance ?? 0
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0
  const insufficient = dialogType === "OUT" && validAmount && numericAmount > available + 0.001

  const submit = async () => {
    if (!dialogType || !validAmount || insufficient) return
    setSaving(true)
    const res = await addCapitalTransaction({
      deviceId,
      type: dialogType,
      amount: numericAmount,
      description,
      paymentMethod,
      transactionDate: date,
    })
    setSaving(false)
    if (res.success) {
      notifySuccess(toast, dialogType === "IN" ? "Capital added" : "Capital withdrawn")
      setDialogType(null)
      load()
    } else {
      notifyError(toast, res.message || "Failed to save capital transaction")
      load()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Capital Balance</div>
          <div className="text-2xl font-bold text-foreground">{summary ? money(summary.currentBalance) : "—"}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Standalone ledger — not included in sales, expenses, profit, balances, receivables or payables.
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => openDialog("IN")} className="bg-emerald-600 text-white hover:bg-emerald-700">
            <ArrowDownCircle className="mr-1.5 h-4 w-4" />
            Capital Money In
          </Button>
          <Button onClick={() => openDialog("OUT")} variant="outline" className="border-rose-300 text-rose-700 hover:bg-rose-50">
            <ArrowUpCircle className="mr-1.5 h-4 w-4" />
            Capital Money Out
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Capital In (selected period)</div>
          <div className="text-lg font-bold text-emerald-700">{summary ? money(summary.periodIn) : "—"}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-[11px] font-semibold uppercase text-muted-foreground">Capital Out (selected period)</div>
          <div className="text-lg font-bold text-rose-700">{summary ? money(summary.periodOut) : "—"}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Payment Method</th>
              <th className="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && !summary ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                </td>
              </tr>
            ) : summary && summary.transactions.length > 0 ? (
              summary.transactions.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{format(new Date(t.transaction_date), "dd MMM yyyy")}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        t.transaction_type === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      }`}
                    >
                      {t.transaction_type === "IN" ? "CAPITAL IN" : "CAPITAL OUT"}
                    </span>
                  </td>
                  <td className="px-3 py-2">{t.description || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{money(t.amount)}</td>
                  <td className="px-3 py-2">{t.payment_method || "—"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{money(t.running_balance)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  No capital transactions for the selected period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogType !== null} onOpenChange={(open) => !open && !saving && setDialogType(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogType === "IN" ? "Capital Money In" : "Capital Money Out"}</DialogTitle>
            <DialogDescription>
              This only changes the standalone Capital balance. It is not an income or an expense.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {dialogType === "OUT" && (
              <div className="rounded-md bg-muted p-2 text-xs">
                Available Capital: <strong>{money(available)}</strong>
                {validAmount && (
                  <>
                    {" · "}After Transaction: <strong>{money(available - numericAmount)}</strong>
                  </>
                )}
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="capital-amount">Amount</Label>
              <Input
                id="capital-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {insufficient && <p className="text-xs text-rose-600">Insufficient capital balance.</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="capital-desc">Description</Label>
              <Textarea id="capital-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="capital-date">Transaction Date</Label>
                <Input id="capital-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogType(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving || !validAmount || insufficient || !date}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {dialogType === "IN" ? "Add Capital" : "Withdraw Capital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
