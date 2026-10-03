"use client"

import { useState } from "react"
import { FileDown, Layers, Loader2, MessageCircle, Printer, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess } from "@/lib/notifications"
import {
  buildSaleShareMessage,
  buildWhatsAppMessageUrl,
  downloadBlob,
  generateSaleDocumentPdf,
  shareOrDownloadPdf,
  type SaleDocumentKind,
} from "@/lib/sale-documents"

interface SaleDocumentActionsProps {
  sale: any
  /** "row" = compact buttons for the expanded sale; "card" = slightly larger touch targets */
  size?: "row" | "card"
}

/**
 * Invoice / Label / Invoice + Label PDF downloads (automatic file names, no prompt) and a Share menu
 * for one sale. Works for normal sales and job cards; it only reads the sale and never changes it.
 */
export default function SaleDocumentActions({ sale, size = "row" }: SaleDocumentActionsProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const btn = size === "card" ? "h-8 text-xs px-2.5 font-medium gap-1 bg-white border-slate-200" : "h-7 text-xs px-2.5"
  const icon = size === "card" ? "h-3.5 w-3.5 text-slate-600" : "h-3 w-3 mr-1 text-slate-600"

  // The list row may not carry the items; the same details call the bulk print uses fills them in
  const resolveSale = async () => {
    if (sale?.items && sale.items.length > 0) return { full: sale, items: sale.items as any[] }
    const { getSaleDetails } = await import("@/app/actions/sale-actions")
    const res = await getSaleDetails(sale.id)
    if (res.success && res.data) {
      return { full: { ...res.data.sale, ...sale, items: res.data.items, payments: res.data.payments }, items: res.data.items as any[] }
    }
    throw new Error("Could not load this sale's items.")
  }

  const run = async (key: string, kind: SaleDocumentKind, mode: "download" | "share") => {
    if (busy) return
    setBusy(key)
    try {
      const { full, items } = await resolveSale()
      const { blob, filename } = await generateSaleDocumentPdf(full, items, kind)
      if (mode === "download") {
        downloadBlob(blob, filename)
        notifySuccess(toast, filename, "PDF downloaded")
      } else {
        const message = buildSaleShareMessage(full, items, kind)
        const result = await shareOrDownloadPdf(blob, filename, message, message)
        if (result === "downloaded") {
          notifySuccess(toast, `${filename} - sharing files is not supported here, so it was downloaded. Attach it in WhatsApp or mail.`, "PDF downloaded")
        }
      }
    } catch (error: any) {
      console.error("Sale document error:", error)
      notifyError(toast, error?.message || "Failed to create the PDF", "Document error")
    } finally {
      setBusy(null)
    }
  }

  const spin = (key: string, Icon: any) =>
    busy === key ? <Loader2 className={`${icon} animate-spin`} /> : <Icon className={icon} />

  return (
    <>
      <Button size="sm" variant="outline" className={btn} disabled={!!busy} onClick={() => run("invoice", "invoice", "download")}>
        {spin("invoice", Printer)} Invoice
      </Button>
      <Button size="sm" variant="outline" className={btn} disabled={!!busy} onClick={() => run("label", "label", "download")}>
        {spin("label", Printer)} Label
      </Button>
      <Button size="sm" variant="outline" className={btn} disabled={!!busy} onClick={() => run("both", "both", "download")}>
        {spin("both", Layers)} Invoice + Label
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className={btn} disabled={!!busy}>
            {busy?.startsWith("share") ? <Loader2 className={`${icon} animate-spin`} /> : <Share2 className={icon} />} Share
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onClick={() => run("share-invoice", "invoice", "share")}>
            <FileDown className="h-4 w-4 mr-2 text-slate-500" /> Share Invoice
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => run("share-both", "both", "share")}>
            <Layers className="h-4 w-4 mr-2 text-slate-500" /> Share Invoice + Label
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() =>
              window.open(
                buildWhatsAppMessageUrl(sale?.customer_phone_override || sale?.customer_phone, buildSaleShareMessage(sale, sale?.items, "invoice")),
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <MessageCircle className="h-4 w-4 mr-2 text-green-600" /> WhatsApp message only
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
