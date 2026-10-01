"use client"

import { useCallback, useEffect, useState } from "react"
import { format } from "date-fns"
import { ArrowDownCircle, ArrowUpCircle, Loader2, Pencil } from "lucide-react"
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
  updateCapitalTransaction,
  type CapitalSummary,
  type CapitalTransaction,
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
  const [editing, setEditing] = useState<CapitalTransaction | null>(null)

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

  const openEdit = (t: CapitalTransaction) => {
    setEditing(t)
    setDialogType(t.transaction_type)
    setAmount(String(t.amount))
    setDescription(t.description || "")
    setPaymentMethod(t.payment_method || "Cash")
    setDate(t.date_key)
  }

  const openDialog = (type: "IN" | "OUT") => {
    setEditing(null)
    setDialogType(type)
    setAmount("")
    setDescription("")
    setPaymentMethod("Cash")
    setDate(format(new Date(), "yyyy-MM-dd"))
  }

  const numericAmount = Number(amount)
  const available = summary?.currentBalance ?? 0
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0
  const insufficient = !editing && dialogType === "OUT" && validAmount && numericAmount > available + 0.001

  const submit = async () => {
    if (!dialogType || !validAmount || insufficient || saving) return
    setSaving(true)
    if (editing) {
      const upd = await updateCapitalTransaction({
        id: editing.id,
        deviceId,
        type: dialogType,
        amount: numericAmount,
        description,
        paymentMethod,
        transactionDate: date,
      })
      setSaving(false)
      if (upd.success) {
        notifySuccess(toast, "Capital transaction updated successfully.")
        setDialogType(null)
        setEditing(null)
        load()
      } else {
        // keep the modal open so the reason is visible and nothing is lost
        notifyError(toast, upd.message || "Failed to update capital transaction")
      }
      return
    }
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
              <th className="px-3 py-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && !summary ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
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
                  <td className="px-3 py-2 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="Edit capital transaction"
                      onClick={() => openEdit(t)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                  No capital transactions for the selected period
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog
        open={dialogType !== null}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setDialogType(null)
            setEditing(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit Capital Transaction" : dialogType === "IN" ? "Capital Money In" : "Capital Money Out"}
            </DialogTitle>
            <DialogDescription>
              This only changes the standalone Capital balance. It is not an income or an expense.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {editing && (
              <div className="grid gap-1.5">
                <Label>Transaction Type</Label>
                <Select value={dialogType ?? "IN"} onValueChange={(v) => setDialogType(v as "IN" | "OUT")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Capital Money In</SelectItem>
                    <SelectItem value="OUT">Capital Money Out</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {!editing && dialogType === "OUT" && (
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
                    {(editing?.payment_method && !PAYMENT_METHODS.includes(editing.payment_method)
                      ? [...PAYMENT_METHODS, editing.payment_method]
                      : PAYMENT_METHODS
                    ).map((m) => (
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
              {editing ? "Update" : dialogType === "IN" ? "Add Capital" : "Withdraw Capital"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
