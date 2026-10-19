"use client"

import { format } from "date-fns"

function formatPdfCurrency(amount: number, formatCurrencyFn: (n: number) => string): string {
  const raw = formatCurrencyFn(amount) || `Rs. ${amount.toFixed(2)}`
  // Replace non-ASCII Rupee symbol U+20B9 and superscript ¹ with 'Rs. ' so jsPDF font renderer does not break character kerning/alignment
  const asciiCleaned = raw
    .replace(/[\u20B9₹]/g, "Rs. ")
    .replace(/^¹/, "")
    .replace(/¹/g, "")
    .replace(/\s+/g, " ")
    .trim()

  if (/^\d/.test(asciiCleaned)) {
    return `Rs. ${asciiCleaned}`
  }
  return asciiCleaned
}

export interface PurchasePdfRowInput {
  id: number | string
  purchase_date?: string | Date
  supplier?: string
  items_summary?: string
  status?: string
  payment_method?: string
  total_amount?: number | string
  received_amount?: number | string
  remaining_amount?: number | string
  purchase_status?: string
  [key: string]: any
}

export async function downloadPurchasesPDF(
  purchases: PurchasePdfRowInput[],
  periodLabel: string,
  formatCurrency: (amount: number) => string,
  getPaidAmount: (purchase: any) => number,
  getRemainingAmount: (purchase: any) => number,
  getPaymentMethodDisplay: (purchase: any) => string,
  dateRange?: { from?: string; to?: string },
) {
  const { jsPDF } = await import("jspdf")
  const autoTableModule = await import("jspdf-autotable")
  const autoTable = autoTableModule.default || autoTableModule

  const cleanPeriod = (periodLabel || "")
    .replace(/→/g, "-")
    .replace(/!/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  // Standard Portrait A4 format (210mm width x 297mm height)
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  // Title & Header (210mm width, center is 105)
  doc.setFontSize(15)
  doc.setFont("helvetica", "bold")
  doc.text("PURCHASES REPORT", 105, 14, { align: "center" })

  doc.setFontSize(9)
  doc.setFont("helvetica", "normal")
  if (cleanPeriod) {
    doc.text(`Period: ${cleanPeriod}`, 105, 20, { align: "center" })
  }
  doc.text(`Generated on: ${format(new Date(), "PPP p")}`, 105, 25, { align: "center" })

  let totalAmountSum = 0
  let totalPaidSum = 0
  let totalBalanceSum = 0

  const tableBody = purchases.map((purchase, index) => {
    const total = Number(purchase.total_amount) || 0
    const paid = getPaidAmount(purchase)
    const remaining = getRemainingAmount(purchase)
    const paymentStatus = purchase.status === "Partial" ? "Cancelled" : (purchase.status || "—")
    const dateStr = purchase.purchase_date
      ? format(new Date(purchase.purchase_date), "dd-MM-yyyy")
      : "—"
    const methodStr = getPaymentMethodDisplay(purchase) || "—"
    const deliveryStr = purchase.purchase_status || "Delivered"

    totalAmountSum += total
    totalPaidSum += paid
    totalBalanceSum += remaining

    // Combined column "Purchase":
    // Row 1: Purchase number
    // Row 2: Supplier name
    // Row 3: Date
    const purchaseInfo = `#${purchase.id}\n${purchase.supplier || "—"}\n${dateStr}`

    return [
      String(index + 1),
      purchaseInfo,
      purchase.items_summary || "—",
      paymentStatus,
      methodStr,
      formatPdfCurrency(total, formatCurrency),
      paid > 0 ? formatPdfCurrency(paid, formatCurrency) : "—",
      remaining > 0 ? formatPdfCurrency(remaining, formatCurrency) : "—",
      deliveryStr,
    ]
  })

  // Summary Totals row
  tableBody.push([
    "",
    "TOTAL",
    `Total: ${purchases.length} purchases`,
    "",
    "",
    formatPdfCurrency(totalAmountSum, formatCurrency),
    formatPdfCurrency(totalPaidSum, formatCurrency),
    formatPdfCurrency(totalBalanceSum, formatCurrency),
    "",
  ])

  autoTable(doc, {
    startY: 29,
    margin: { left: 10, right: 10 },
    head: [
      [
        "#",
        "Purchase",
        "Products",
        "Payment",
        "Method",
        "Total",
        "Paid",
        "Balance",
        "Delivery",
      ],
    ],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
      valign: "top",
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 44 },
      3: { cellWidth: 16 },
      4: { cellWidth: 16 },
      5: { cellWidth: 19, halign: "right" },
      6: { cellWidth: 17, halign: "right" },
      7: { cellWidth: 17, halign: "right" },
      8: { cellWidth: 15 },
    },
    didParseCell: function (data: any) {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.fillColor = [241, 245, 249]
        data.cell.styles.textColor = [15, 23, 42]
        data.cell.styles.fontSize = 8
      }
    },
  })

  const cleanNamePart = cleanPeriod
    ? cleanPeriod.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    : format(new Date(), "yyyy-MM-dd")
  const filename = `purchases-report-${cleanNamePart}.pdf`
  doc.save(filename)
}
