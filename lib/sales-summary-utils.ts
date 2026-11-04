import { format } from "date-fns"
import { parseSaleDate } from "@/lib/utils"

export interface SaleSummaryItem {
  name: string
  quantity: number
  cost: number
  sellingPrice: number
}

export interface SaleSummaryRow {
  saleId: string
  saleDate: string
  customerName: string
  customerPhone: string
  combinedCustomer: string
  productList: string
  items: SaleSummaryItem[]
  cost: number
  sellingPrice: number
  totalPrice: number
  courierCharge: number
  partnerCourier: number
  profit: number
}

export interface SalesSummaryTotals {
  totalOrders: number
  totalCost: number
  totalSelling: number
  totalPrice: number
  totalCourierCharge: number
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

  // Parse items
  let rawItems = sale.items
  if (typeof rawItems === "string") {
    try {
      rawItems = JSON.parse(rawItems)
    } catch {
      rawItems = []
    }
  }

  const items: SaleSummaryItem[] = []
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    for (const item of rawItems) {
      const name = item.product_name || item.name || item.title || item.notes || "Item"
      const variant = item.variant_name || item.variant || ""
      const cleanVariant =
        variant &&
        variant !== "Default Variant" &&
        variant !== "Default" &&
        variant !== "default" &&
        variant !== "default variant"
          ? ` - ${variant}`
          : ""
      const qty = Number(item.quantity || 1)
      const unitCost = Number(item.cost ?? item.cost_price ?? item.actual_cost ?? 0)
      const unitPrice = Number(item.price ?? 0)

      items.push({
        name: `${name}${cleanVariant} × ${qty}`,
        quantity: qty,
        cost: Number((qty * unitCost).toFixed(2)),
        sellingPrice: Number((qty * unitPrice).toFixed(2)),
      })
    }
  }

  // Fallback if items array is missing or empty
  if (items.length === 0) {
    let rawProductList = sale.products_text?.trim() || sale.items_summary?.trim() || "Item × 1"
    const lines = rawProductList
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean)
    const fallbackLines = lines.length > 0 ? lines : [rawProductList]
    const defaultCost = Number(sale.total_cost || 0)
    const defaultSelling = Math.max(
      0,
      Number(sale.total_amount || 0) - Number(sale.courier_paid_extra || 0),
    )

    fallbackLines.forEach((line: string, idx: number) => {
      items.push({
        name: line.replace(/ - Default Variant/g, "").replace(/ - Default/g, ""),
        quantity: 1,
        cost: idx === 0 ? defaultCost : 0,
        sellingPrice: idx === 0 ? defaultSelling : 0,
      })
    })
  }

  const productList = items.map((i) => i.name).join("\n")

  const calculatedItemsCost = items.reduce((sum, i) => sum + i.cost, 0)
  const cost = Number(sale.total_cost || 0) > 0 ? Number(sale.total_cost) : calculatedItemsCost
  const courierCharge = Number(sale.courier_paid_extra || 0)
  const totalPrice = Number(sale.total_amount || 0)

  const calculatedItemsSelling = items.reduce((sum, i) => sum + i.sellingPrice, 0)
  const sellingPrice =
    calculatedItemsSelling > 0 ? calculatedItemsSelling : Math.max(0, totalPrice - courierCharge)

  const partnerCourier = Number(sale.expense_courier || 0)

  const isCancelledOrReturned =
    sale.status === "Cancelled" ||
    sale.status === "Returned" ||
    sale.delivery_status === "Returned" ||
    sale.delivery_status?.toLowerCase() === "returned" ||
    sale.payment_status?.toLowerCase() === "cancelled"

  // Option 1: Profit is Total Price - Total Cost - Courier Expense
  // (If courier expense is 0, this equals Total Price - Total Cost)
  const profit = isCancelledOrReturned
    ? 0
    : Number((totalPrice - cost - partnerCourier).toFixed(2))

  return {
    saleId,
    saleDate: dateFormatted,
    customerName,
    customerPhone,
    combinedCustomer,
    productList,
    items,
    cost: Number(cost.toFixed(2)),
    sellingPrice: Number(sellingPrice.toFixed(2)),
    totalPrice: Number(totalPrice.toFixed(2)),
    courierCharge: Number(courierCharge.toFixed(2)),
    partnerCourier: Number(partnerCourier.toFixed(2)),
    profit,
  }
}

export function computeSalesSummaryTotals(rows: SaleSummaryRow[]): SalesSummaryTotals {
  return rows.reduce(
    (acc, row) => ({
      totalOrders: acc.totalOrders + 1,
      totalCost: Number((acc.totalCost + row.cost).toFixed(2)),
      totalSelling: Number((acc.totalSelling + row.sellingPrice).toFixed(2)),
      totalPrice: Number((acc.totalPrice + row.totalPrice).toFixed(2)),
      totalCourierCharge: Number((acc.totalCourierCharge + row.courierCharge).toFixed(2)),
      totalPartnerCourier: Number((acc.totalPartnerCourier + row.partnerCourier).toFixed(2)),
      totalProfit: Number((acc.totalProfit + row.profit).toFixed(2)),
    }),
    {
      totalOrders: 0,
      totalCost: 0,
      totalSelling: 0,
      totalPrice: 0,
      totalCourierCharge: 0,
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

  const tableBody: any[] = []

  for (const row of rows) {
    const numItems = row.items.length
    const totalOrderRows = numItems + 1 // items + 1 Total row

    // Row 0: First item
    const firstItem = row.items[0] || { name: "Item × 1", cost: row.cost, sellingPrice: row.sellingPrice }
    tableBody.push([
      {
        content: row.combinedCustomer,
        rowSpan: totalOrderRows,
        styles: { valign: "middle", fontStyle: "bold" },
      },
      firstItem.name,
      { content: formatPdfCurrency(firstItem.cost, formatCurrency), styles: { halign: "right" } },
      { content: formatPdfCurrency(firstItem.sellingPrice, formatCurrency), styles: { halign: "right" } },
      {
        content: formatPdfCurrency(row.courierCharge, formatCurrency),
        rowSpan: totalOrderRows,
        styles: { valign: "middle", halign: "right" },
      },
      {
        content: formatPdfCurrency(row.totalPrice, formatCurrency),
        rowSpan: totalOrderRows,
        styles: { valign: "middle", halign: "right", fontStyle: "bold" },
      },
      {
        content: formatPdfCurrency(row.profit, formatCurrency),
        rowSpan: totalOrderRows,
        styles: { valign: "middle", halign: "right", fontStyle: "bold", textColor: [22, 101, 52] },
      },
    ])

    // Rows 1 to numItems - 1: Subsequent items
    for (let i = 1; i < numItems; i++) {
      const item = row.items[i]
      tableBody.push([
        item.name,
        { content: formatPdfCurrency(item.cost, formatCurrency), styles: { halign: "right" } },
        { content: formatPdfCurrency(item.sellingPrice, formatCurrency), styles: { halign: "right" } },
      ])
    }

    // Order Total row
    tableBody.push([
      { content: "Total", styles: { fontStyle: "bold", fillColor: [241, 245, 249] } },
      {
        content: formatPdfCurrency(row.cost, formatCurrency),
        styles: { fontStyle: "bold", halign: "right", fillColor: [241, 245, 249] },
      },
      {
        content: formatPdfCurrency(row.sellingPrice, formatCurrency),
        styles: { fontStyle: "bold", halign: "right", fillColor: [241, 245, 249] },
      },
    ])
  }

  // Summary Totals row
  tableBody.push([
    { content: `Total Orders: ${totals.totalOrders}`, styles: { fontStyle: "bold", fillColor: [226, 232, 240] } },
    { content: "SUMMARY TOTALS", styles: { fontStyle: "bold", fillColor: [226, 232, 240] } },
    {
      content: formatPdfCurrency(totals.totalCost, formatCurrency),
      styles: { fontStyle: "bold", halign: "right", fillColor: [226, 232, 240] },
    },
    {
      content: formatPdfCurrency(totals.totalSelling, formatCurrency),
      styles: { fontStyle: "bold", halign: "right", fillColor: [226, 232, 240] },
    },
    {
      content: formatPdfCurrency(totals.totalCourierCharge, formatCurrency),
      styles: { fontStyle: "bold", halign: "right", fillColor: [226, 232, 240] },
    },
    {
      content: formatPdfCurrency(totals.totalPrice, formatCurrency),
      styles: { fontStyle: "bold", halign: "right", fillColor: [226, 232, 240] },
    },
    {
      content: formatPdfCurrency(totals.totalProfit, formatCurrency),
      styles: { fontStyle: "bold", halign: "right", fillColor: [226, 232, 240], textColor: [22, 101, 52] },
    },
  ])

  autoTable(doc, {
    startY: 30,
    margin: { left: 10, right: 10, top: 28, bottom: 10 },
    tableWidth: 190,
    head: [["Sale / Customer", "Product List", "Cost", "Selling", "Courier Charge", "Total Price", "Profit"]],
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
      valign: "middle",
      overflow: "linebreak",
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 46 },
      2: { cellWidth: 20, halign: "right" },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 24, halign: "right" },
      5: { cellWidth: 24, halign: "right" },
      6: { cellWidth: 24, halign: "right" },
    },
  })

  const baseFilename = getSalesSummaryFilename(dateRange?.from, dateRange?.to, periodLabel)
  doc.save(`${baseFilename}.pdf`)
}

export function printSalesSummaryReport(
  sales: any[],
  periodLabel: string,
  formatCurrency: (amount: number) => string,
  targetWindow?: Window | null,
) {
  const rows = sales.map(extractSaleSummaryRow)
  const totals = computeSalesSummaryTotals(rows)

  const printWindow = targetWindow || window.open("", "_blank")
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
      padding: 6px 10px;
      border: 1px solid #e2e8f0;
      vertical-align: top;
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
        <th class="num-col" style="width: 11%;">Courier Charge</th>
        <th class="num-col" style="width: 11%;">Total Price</th>
        <th class="num-col" style="width: 10%;">Profit</th>
      </tr>
    </thead>
    <tbody>
      ${rows
        .map((row) => {
          const numItems = row.items.length
          const rowspan = numItems + 1
          const firstItem = row.items[0] || { name: "Item × 1", cost: row.cost, sellingPrice: row.sellingPrice }
          const restItems = row.items.slice(1)

          let out = `
        <tr>
          <td class="sale-cust-cell" rowspan="${rowspan}">
            <span class="sale-cust-id">${escapeHtml(row.saleId)}</span><br/>
            ${escapeHtml(row.saleDate)}<br/>
            ${escapeHtml(row.customerName)}
            ${row.customerPhone ? `<br/>${escapeHtml(row.customerPhone)}` : ""}
          </td>
          <td>${escapeHtml(firstItem.name)}</td>
          <td class="num-col">${escapeHtml(formatCurrency(firstItem.cost))}</td>
          <td class="num-col">${escapeHtml(formatCurrency(firstItem.sellingPrice))}</td>
          <td class="num-col" rowspan="${rowspan}" style="vertical-align: middle;">${escapeHtml(
            formatCurrency(row.courierCharge),
          )}</td>
          <td class="num-col" rowspan="${rowspan}" style="font-weight: 700; vertical-align: middle;">${escapeHtml(
            formatCurrency(row.totalPrice),
          )}</td>
          <td class="num-col" rowspan="${rowspan}" style="font-weight: 700; color: #16a34a; vertical-align: middle;">${escapeHtml(
            formatCurrency(row.profit),
          )}</td>
        </tr>
          `

          for (const item of restItems) {
            out += `
        <tr>
          <td>${escapeHtml(item.name)}</td>
          <td class="num-col">${escapeHtml(formatCurrency(item.cost))}</td>
          <td class="num-col">${escapeHtml(formatCurrency(item.sellingPrice))}</td>
        </tr>
            `
          }

          out += `
        <tr style="background-color: #f1f5f9; font-weight: 700;">
          <td style="font-weight: 700;">Total</td>
          <td class="num-col" style="font-weight: 700;">${escapeHtml(formatCurrency(row.cost))}</td>
          <td class="num-col" style="font-weight: 700;">${escapeHtml(formatCurrency(row.sellingPrice))}</td>
        </tr>
          `

          return out
        })
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
        <div class="totals-label">Total Courier Charge</div>
        <div class="totals-val">${escapeHtml(formatCurrency(totals.totalCourierCharge))}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Price</div>
        <div class="totals-val">${escapeHtml(formatCurrency(totals.totalPrice))}</div>
      </div>
      <div class="totals-item">
        <div class="totals-label">Total Profit</div>
        <div class="totals-val" style="color: #16a34a;">${escapeHtml(formatCurrency(totals.totalProfit))}</div>
      </div>
    </div>
  </div>

  <script>
    function triggerPrint() {
      try {
        window.focus();
        window.print();
      } catch (e) {
        console.error("Print error:", e);
      }
    }
    if (document.readyState === 'complete') {
      setTimeout(triggerPrint, 250);
    } else {
      window.addEventListener('load', function() {
        setTimeout(triggerPrint, 250);
      });
    }
  </script>
</body>
</html>`

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  try {
    printWindow.document.title = `Sales Summary Report - ${cleanPeriod}`
  } catch {}
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
    "Courier Charge",
    "Total Price",
    "Profit",
  ]

  const dataRows: (string | number)[][] = []

  for (const row of rows) {
    const custClean = row.combinedCustomer.replace(/\n/g, ", ")
    const numItems = row.items.length
    const firstItem = row.items[0] || { name: "Item × 1", cost: row.cost, sellingPrice: row.sellingPrice }

    // First item row
    dataRows.push([
      custClean,
      firstItem.name,
      firstItem.cost,
      firstItem.sellingPrice,
      row.courierCharge,
      row.totalPrice,
      row.profit,
    ])

    // Subsequent item rows
    for (let i = 1; i < numItems; i++) {
      const item = row.items[i]
      dataRows.push([
        "",
        item.name,
        item.cost,
        item.sellingPrice,
        "",
        "",
        "",
      ])
    }

    // Order Total row
    dataRows.push([
      "",
      "Total",
      row.cost,
      row.sellingPrice,
      row.courierCharge,
      row.totalPrice,
      row.profit,
    ])
  }

  const totalsRow = [
    `Total Orders: ${totals.totalOrders}`,
    "SUMMARY TOTALS",
    totals.totalCost,
    totals.totalSelling,
    totals.totalCourierCharge,
    totals.totalPrice,
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
