import { format } from "date-fns"
import { parseSaleDate } from "@/lib/utils"

export interface SaleSummaryRow {
  saleId: string
  saleDate: string
  customerName: string
  customerPhone: string
  combinedCustomer: string
  productList: string
  cost: number
  sellingPrice: number
  totalPrice: number
  partnerCourier: number
  profit: number
}

export interface SalesSummaryTotals {
  totalOrders: number
  totalCost: number
  totalSelling: number
  totalPrice: number
  totalPartnerCourier: number
  totalProfit: number
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

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

export function extractSaleSummaryRow(sale: any): SaleSummaryRow {
  const saleId = `#${sale.id}`
  const dateFormatted = format(parseSaleDate(sale.sale_date), "dd/MM/yyyy")
  const customerName = sale.customer_name || "Walk-in"
  const customerPhone = sale.customer_phone || sale.customer_phone_override || ""

  const combinedCustomer = [saleId, dateFormatted, customerName, customerPhone]
    .filter(Boolean)
    .join("\n")

  let rawProductList = sale.products_text?.trim() || sale.items_summary?.trim()

  if (!rawProductList && Array.isArray(sale.items) && sale.items.length > 0) {
    rawProductList = sale.items
      .map((item: any) => {
        const name = item.product_name || item.name || item.title || item.notes || "Item"
        const variant = item.variant_name || item.variant || ""
        const qty = item.quantity || 1
        return `${name}${variant && variant !== "Default Variant" && variant !== "Default" ? ` - ${variant}` : ""} × ${qty}`
      })
      .join("\n")
  }

  if (!rawProductList) {
    rawProductList = "Item × 1"
  }

  const productList = rawProductList
    .replace(/ - Default Variant/g, "")
    .replace(/ - Default/g, "")

  const itemsCost =
    sale.items?.reduce(
      (sum: number, i: any) => sum + Number(i.cost || i.cost_price || 0) * Number(i.quantity || 1),
      0,
    ) || 0
  const cost = Number(sale.total_cost || 0) > 0 ? Number(sale.total_cost) : itemsCost
  const customerCourier = Number(sale.courier_paid_extra || 0)
  const totalPrice = Number(sale.total_amount || 0)
  const sellingPrice = Math.max(0, totalPrice - customerCourier)
  const partnerCourier = Number(sale.expense_courier || 0)

  const isCancelledOrReturned =
    sale.status === "Cancelled" ||
    sale.status === "Returned" ||
    sale.delivery_status === "Returned" ||
    sale.delivery_status?.toLowerCase() === "returned" ||
    sale.payment_status?.toLowerCase() === "cancelled"

  const profit = isCancelledOrReturned ? 0 : totalPrice - cost - partnerCourier

  return {
    saleId,
    saleDate: dateFormatted,
    customerName,
    customerPhone,
    combinedCustomer,
    productList,
    cost,
    sellingPrice,
    totalPrice,
    partnerCourier,
    profit,
  }
}

export function computeSalesSummaryTotals(rows: SaleSummaryRow[]): SalesSummaryTotals {
  return rows.reduce(
    (acc, row) => ({
      totalOrders: acc.totalOrders + 1,
      totalCost: acc.totalCost + row.cost,
      totalSelling: acc.totalSelling + row.sellingPrice,
      totalPrice: acc.totalPrice + row.totalPrice,
      totalPartnerCourier: acc.totalPartnerCourier + row.partnerCourier,
      totalProfit: acc.totalProfit + row.profit,
    }),
    {
      totalOrders: 0,
      totalCost: 0,
      totalSelling: 0,
      totalPrice: 0,
      totalPartnerCourier: 0,
      totalProfit: 0,
    },
  )
}

export function getSalesSummaryFilename(dateFrom?: string, dateTo?: string, periodLabel?: string): string {
  const sanitize = (str: string) => str.toLowerCase().replace(/[^a-z0-9_-]/g, "-").replace(/-+/g, "-")

  if (dateFrom && dateTo) {
    const fromStr = dateFrom.split("T")[0]
    const toStr = dateTo.split("T")[0]
    return `sales-summary-${fromStr}-to-${toStr}`
  }

  if (periodLabel) {
    return `sales-summary-${sanitize(periodLabel)}`
  }

  const today = format(new Date(), "yyyy-MM-dd")
  return `sales-summary-${today}`
}

export async function downloadSalesSummaryPDF(
  sales: any[],
  periodLabel: string,
  formatCurrency: (amount: number) => string,
  dateRange?: { from?: string; to?: string },
) {
  const { jsPDF } = await import("jspdf")
  const autoTableModule = await import("jspdf-autotable")
  const autoTable = autoTableModule.default || autoTableModule

  const rows = sales.map(extractSaleSummaryRow)
  const totals = computeSalesSummaryTotals(rows)
  const cleanPeriod = (periodLabel || "")
    .replace(/→/g, "-")
    .replace(/!’/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  // Title & Header
  doc.setFontSize(16)
  doc.setFont("helvetica", "bold")
  doc.text("SALES SUMMARY REPORT", 105, 14, { align: "center" })

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text(`Date Range: ${cleanPeriod}`, 105, 21, { align: "center" })
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 26, { align: "center" })

  const tableBody = rows.map((row) => [
    row.combinedCustomer,
    row.productList,
    formatPdfCurrency(row.cost, formatCurrency),
    formatPdfCurrency(row.sellingPrice, formatCurrency),
    formatPdfCurrency(row.totalPrice, formatCurrency),
    formatPdfCurrency(row.partnerCourier, formatCurrency),
    formatPdfCurrency(row.profit, formatCurrency),
  ])

  // Summary Totals row
  tableBody.push([
    `Total Orders: ${totals.totalOrders}`,
    "SUMMARY TOTALS",
    formatPdfCurrency(totals.totalCost, formatCurrency),
    formatPdfCurrency(totals.totalSelling, formatCurrency),
    formatPdfCurrency(totals.totalPrice, formatCurrency),
    formatPdfCurrency(totals.totalPartnerCourier, formatCurrency),
    formatPdfCurrency(totals.totalProfit, formatCurrency),
  ])

  autoTable(doc, {
    startY: 30,
    head: [["Sale / Customer", "Product List", "Cost", "Selling", "Total Price", "Partner Courier", "Profit"]],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5,
      halign: "left",
    },
    bodyStyles: {
      fontSize: 7.5,
      cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
      valign: "top",
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 42 },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 22, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 24, halign: "right", fontStyle: "bold" },
    },
    didParseCell: function (data: any) {
      if (data.row.index === tableBody.length - 1) {
        data.cell.styles.fontStyle = "bold"
        data.cell.styles.fillColor = [241, 245, 249]
        data.cell.styles.fontSize = 8
      }
    },
  })

  const baseFilename = getSalesSummaryFilename(dateRange?.from, dateRange?.to, periodLabel)
  doc.save(`${baseFilename}.pdf`)
}

export function printSalesSummaryReport(
  sales: any[],
  periodLabel: string,
  formatCurrency: (amount: number) => string,
) {
  const rows = sales.map(extractSaleSummaryRow)
  const totals = computeSalesSummaryTotals(rows)

  const printWindow = window.open("", "_blank")
  if (!printWindow) {
    throw new Error("Unable to open print window. Please allow popups for this site.")
  }

  const cleanPeriod = (periodLabel || "")
    .replace(/→/g, "-")
    .replace(/!’/g, "-")
    .replace(/\s+/g, " ")
    .trim()

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sales Summary Report - ${escapeHtml(cleanPeriod)}</title>
  <style>
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      body {
        margin: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .no-print {
        display: none !important;
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 16px;
      font-size: 11px;
      line-height: 1.4;
    }
    .print-header {
      text-align: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 2px solid #0f172a;
    }
    .print-title {
      font-size: 18px;
      font-weight: 800;
      letter-spacing: 1px;
      margin: 0 0 4px 0;
      text-transform: uppercase;
    }
    .print-subtitle {
      font-size: 12px;
      color: #475569;
      font-weight: 600;
      margin: 0;
    }
    .print-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 16px;
    }
    .print-table th {
      background-color: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 8px 10px;
      border: 1px solid #cbd5e1;
      text-align: left;
    }
    .print-table th.num-col, .print-table td.num-col {
      text-align: right;
    }
    .print-table td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
    }
    .print-table tr:nth-child(even) td {
      background-color: #f8fafc;
    }
    .cell-multiline {
      white-space: pre-line;
      line-height: 1.45;
    }
    .sale-cust-cell {
      white-space: pre-line;
      font-weight: 500;
    }
    .sale-cust-id {
      font-weight: 700;
      color: #0f172a;
    }
    .totals-card {
      border: 2px solid #0f172a;
      background-color: #f8fafc;
      border-radius: 6px;
      padding: 12px 16px;
      margin-top: 16px;
      page-break-inside: avoid;
    }
    .totals-grid {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .totals-item {
      text-align: center;
    }
    .totals-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      color: #64748b;
      margin-bottom: 2px;
    }
    .totals-val {
      font-size: 14px;
      font-weight: 800;
      color: #0f172a;
    }
    .btn-bar {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
    }
    .btn-bar button {
      padding: 8px 16px;
      background-color: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="btn-bar no-print">
    <button onclick="window.print()">Print Report</button>
    <button onclick="window.close()" style="background-color: #64748b;">Close</button>
  </div>

  <div class="print-header">
    <h1 class="print-title">SALES SUMMARY REPORT</h1>
    <p class="print-subtitle">Date Range: ${escapeHtml(cleanPeriod)}</p>
  </div>

  <table class="print-table">
    <thead>
      <tr>
        <th style="width: 20%;">Sale / Customer</th>
        <th style="width: 28%;">Product List</th>
        <th class="num-col" style="width: 10%;">Cost</th>
        <th class="num-col" style="width: 10%;">Selling</th>
        <th class="num-col" style="width: 11%;">Total Price</th>
        <th class="num-col" style="width: 11%;">Partner Courier</th>
        <th class="num-col" style="width: 10%;">Profit</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map(
          (row) => `
        <tr>
          <td class="sale-cust-cell"><span class="sale-cust-id">${escapeHtml(row.saleId)}</span>\n${escapeHtml(
            row.saleDate,
          )}\n${escapeHtml(row.customerName)}${
            row.customerPhone ? `\n${escapeHtml(row.customerPhone)}` : ""
          }</td>
          <td class="cell-multiline">${escapeHtml(row.productList)}</td>
          <td class="num-col">${escapeHtml(formatCurrency(row.cost))}</td>
          <td class="num-col">${escapeHtml(formatCurrency(row.sellingPrice))}</td>
          <td class="num-col">${escapeHtml(formatCurrency(row.totalPrice))}</td>
          <td class="num-col">${escapeHtml(formatCurrency(row.partnerCourier))}</td>
          <td class="num-col" style="font-weight: 700;">${escapeHtml(formatCurrency(row.profit))}</td>
        </tr>
      `,
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals-card">
    <div class="totals-grid">
      <div class="totals-item">
        <div class="totals-label">Total Orders</div>
        <div class="totals-val">${totals.totalOrders}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Cost</div>
        <div class="totals-val">${escapeHtml(formatCurrency(totals.totalCost))}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Selling</div>
        <div class="totals-val">${escapeHtml(formatCurrency(totals.totalSelling))}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Price</div>
        <div class="totals-val">${escapeHtml(formatCurrency(totals.totalPrice))}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Partner Courier</div>
        <div class="totals-val">${escapeHtml(formatCurrency(totals.totalPartnerCourier))}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Profit</div>
        <div class="totals-val" style="color: #16a34a;">${escapeHtml(formatCurrency(totals.totalProfit))}</div>
      </div>
    </div>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>`

  printWindow.document.write(html)
  printWindow.document.close()
}

export function downloadSalesSummaryExcel(
  sales: any[],
  periodLabel?: string,
  dateRange?: { from?: string; to?: string },
) {
  const rows = sales.map(extractSaleSummaryRow)
  const totals = computeSalesSummaryTotals(rows)

  const headers = [
    "Sale / Customer",
    "Product List",
    "Cost",
    "Selling",
    "Total Price",
    "Partner Courier",
    "Profit",
  ]

  const dataRows = rows.map((row) => [
    row.combinedCustomer.replace(/\n/g, ", "),
    row.productList.replace(/\n/g, "; "),
    row.cost,
    row.sellingPrice,
    row.totalPrice,
    row.partnerCourier,
    row.profit,
  ])

  const totalsRow = [
    `Total Orders: ${totals.totalOrders}`,
    "SUMMARY TOTALS",
    totals.totalCost,
    totals.totalSelling,
    totals.totalPrice,
    totals.totalPartnerCourier,
    totals.totalProfit,
  ]

  const csvLines = [
    headers.join(","),
    ...dataRows.map((r) =>
      r
        .map((cell) =>
          typeof cell === "number" ? cell.toFixed(2) : `"${String(cell).replace(/"/g, '""')}"`,
        )
        .join(","),
    ),
    "",
    totalsRow
      .map((cell) =>
        typeof cell === "number" ? cell.toFixed(2) : `"${String(cell).replace(/"/g, '""')}"`,
      )
      .join(","),
  ]

  const csvContent = csvLines.join("\r\n")
  const blob = new Blob(["\ufeff" + csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const baseFilename = getSalesSummaryFilename(dateRange?.from, dateRange?.to, periodLabel)
  link.setAttribute("href", url)
  link.setAttribute("download", `${baseFilename}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

