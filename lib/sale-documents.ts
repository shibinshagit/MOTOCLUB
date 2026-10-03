"use client"

/**
 * Invoice / Label PDF generation and sharing for a single sale.
 *
 * The documents are NOT redrawn here: the existing invoice (printSalesReceipt) and label
 * (printBatchJobCards) HTML is requested with returnHtml = true, rendered off-screen at A4 width and
 * placed into a PDF. A combined PDF is the invoice page(s) followed by the label page, never merged
 * onto one page. Everything is generated in the browser from the already-authenticated sale data; no
 * file is uploaded anywhere.
 */

import { printSalesReceipt, printBatchJobCards } from "@/lib/receipt-utils"

export type SaleDocumentKind = "invoice" | "label" | "both"

const A4_PX_WIDTH = 794 // 210mm at 96dpi

function cleanPart(value: unknown, max = 28): string {
  const text = String(value ?? "")
    .normalize("NFC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    // keep letters/numbers of any script (e.g. Malayalam) and hyphens, everything else becomes a separator
    .replace(/[^\p{L}\p{N}\p{M}-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
  return text.length > max ? text.slice(0, max).replace(/[_-]+$/g, "") : text
}

/** customer_product_order_Suffix.pdf  (several products: customer_N-items_order_Suffix.pdf) */
export function buildSaleDocumentFilename(sale: any, items: any[] | undefined, kind: SaleDocumentKind): string {
  const customer = cleanPart(sale?.customer_name || sale?.customer_name_override) || "Customer"
  const list = (items && items.length ? items : sale?.items) || []
  const names = list.map((i: any) => i?.product_name || i?.service_name || i?.name).filter(Boolean)
  const product = list.length > 1 ? `${list.length}-items` : cleanPart(names[0]) || "Item"
  const order = cleanPart(sale?.id ?? sale?.sale_id ?? sale?.order_id) || "Order"
  const suffix = kind === "invoice" ? "Invoice" : kind === "label" ? "Label" : "Invoice_Label"
  return `${[customer, product, order, suffix].filter(Boolean).join("_")}.pdf`
}

export function buildSaleShareMessage(sale: any, items: any[] | undefined, kind: SaleDocumentKind): string {
  const list = (items && items.length ? items : sale?.items) || []
  const first = list[0]?.product_name || list[0]?.service_name || ""
  const label = list.length > 1 ? `${list.length} items` : first
  const what = kind === "both" ? "Invoice and Label" : kind === "label" ? "Label" : "Invoice"
  return `${what} for Order #${sale?.id}${label ? ` - ${label}` : ""}`
}

async function htmlToCanvas(html: string): Promise<HTMLCanvasElement> {
  const html2canvas = (await import("html2canvas")).default
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${A4_PX_WIDTH}px;height:1123px;border:0;opacity:0;pointer-events:none`
  document.body.appendChild(iframe)
  try {
    const doc = iframe.contentDocument!
    doc.open()
    doc.write(html)
    doc.close()
    // Never run print scripts or show the print/close buttons
    doc.querySelectorAll("script, .no-print").forEach((el) => el.remove())

    await Promise.all(
      Array.from(doc.images).map((img) =>
        img.complete ? Promise.resolve() : new Promise<void>((res) => { img.onload = img.onerror = () => res() }),
      ),
    )
    const fonts = (doc as any).fonts?.ready
    if (fonts) await Promise.race([fonts, new Promise((res) => setTimeout(res, 2500))])

    const body = doc.body
    return await html2canvas(body, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      width: A4_PX_WIDTH,
      windowWidth: A4_PX_WIDTH,
      windowHeight: Math.max(body.scrollHeight, 1123),
    })
  } finally {
    iframe.remove()
  }
}

/** Adds a canvas to the PDF as one A4 page, or several when it is clearly longer than a page. */
function addCanvasPages(pdf: any, canvas: HTMLCanvasElement, isFirstDocument: boolean) {
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const pxPerPage = Math.floor((canvas.width * pageH) / pageW)
  const pages = canvas.height <= pxPerPage * 1.08 ? 1 : Math.ceil(canvas.height / pxPerPage)
  let first = isFirstDocument

  for (let i = 0; i < pages; i++) {
    if (!first) pdf.addPage("a4", "portrait")
    first = false
    if (pages === 1) {
      // one page: scale down only if slightly taller than A4
      const h = Math.min(pageH, (canvas.height * pageW) / canvas.width)
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, h)
    } else {
      const slice = document.createElement("canvas")
      slice.width = canvas.width
      slice.height = Math.min(pxPerPage, canvas.height - i * pxPerPage)
      slice.getContext("2d")!.drawImage(canvas, 0, i * pxPerPage, canvas.width, slice.height, 0, 0, canvas.width, slice.height)
      pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pageW, (slice.height * pageW) / slice.width)
    }
  }
}

export async function generateSaleDocumentPdf(
  sale: any,
  items: any[],
  kind: SaleDocumentKind,
  currency = "INR",
): Promise<{ blob: Blob; filename: string; pageCount: number }> {
  const { jsPDF } = await import("jspdf")
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true })
  let started = false

  if (kind === "invoice" || kind === "both") {
    const html = printSalesReceipt(sale, items, currency, {}, false, true)
    if (!html) throw new Error("This sale has no items to put on an invoice.")
    addCanvasPages(pdf, await htmlToCanvas(html), !started)
    started = true
  }
  if (kind === "label" || kind === "both") {
    const html = await printBatchJobCards([{ ...sale, items }], currency, {}, true)
    if (!html) throw new Error("Could not build the label for this sale.")
    addCanvasPages(pdf, await htmlToCanvas(html), !started)
    started = true
  }

  return {
    blob: pdf.output("blob"),
    filename: buildSaleDocumentFilename(sale, items, kind),
    pageCount: pdf.getNumberOfPages(),
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

/** Native share sheet with the PDF attached when the browser supports file sharing; otherwise a download. */
export async function shareOrDownloadPdf(
  blob: Blob,
  filename: string,
  title: string,
  text: string,
): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], filename, { type: "application/pdf" })
  const nav: any = typeof navigator !== "undefined" ? navigator : null
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title, text })
      return "shared"
    } catch (error: any) {
      if (error?.name === "AbortError") return "cancelled"
      // e.g. the browser dropped the user gesture while the PDF was being built: fall back to a download
    }
  }
  downloadBlob(blob, filename)
  return "downloaded"
}

/** wa.me link carrying only an order reference (WhatsApp cannot attach a locally generated file from a link). */
export function buildWhatsAppMessageUrl(phone: string | null | undefined, message: string): string {
  const digits = String(phone || "").replace(/\D/g, "")
  const to = digits.length === 10 ? `91${digits}` : digits
  return `https://wa.me/${to}?text=${encodeURIComponent(message)}`
}
