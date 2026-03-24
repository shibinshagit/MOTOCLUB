"use client"

import { format } from "date-fns"
import { formatCurrency as formatCurrencyOriginal } from "./utils"
import { jsPDF } from "jspdf"
import "jspdf-autotable"

// Helper function to format currency
const formatCurrency = (amount: number, currency = "AED") => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

// Helper function to format date
const formatDate = (date: string | Date) => {
  try {
    return format(new Date(date), "MMM d, yyyy")
  } catch (error) {
    return "Invalid Date"
  }
}

// Helper function to set up a new PDF document with common headers
function createPDFDocument(title: string) {
  const doc = new jsPDF()

  // Add common header
  doc.setFontSize(18)
  doc.text(title, 14, 22)

  // Add date
  doc.setFontSize(10)
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30)
  doc.setLineWidth(0.5)
  doc.line(14, 32, 196, 32)

  return doc
}

// This function will be used on the client side to generate PDFs
export async function generateDetailedSalePDF(saleData: any) {
  if (!saleData) return null

  // We'll use dynamic imports to load jsPDF only on the client side
  // const { default: jsPDF } = await import("jspdf")
  // await import("jspdf-autotable")

  // Create a new PDF document
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  })

  // Add company header
  doc.setFontSize(18)
  doc.setFont("helvetica", "bold")
  doc.text("Moto Club", 105, 15, { align: "center" })

  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.text("kottakkal, malappuram, kerala, india", 105, 22, { align: "center" })
  doc.text("Phone: +91 9995442239", 105, 27, { align: "center" })

  // Add title
  doc.setFillColor(245, 245, 245)
  doc.rect(10, 32, 190, 10, "F")
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text(`DETAILED SALE REPORT #${saleData.id}`, 105, 39, { align: "center" })

  // Add sale information
  doc.setFontSize(11)
  doc.setFont("helvetica", "bold")
  doc.text("Sale Information", 10, 50)
  doc.setDrawColor(200, 200, 200)
  doc.line(10, 52, 200, 52)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)

  // Left column
  let y = 58
  doc.text("Sale ID:", 10, y)
  doc.text(`${saleData.id}`, 50, y)

  y += 6
  doc.text("Date:", 10, y)
  doc.text(`${format(new Date(saleData.sale_date), "PPP")}`, 50, y)

  y += 6
  doc.text("Status:", 10, y)
  doc.text(`${saleData.status}`, 50, y)

  y += 6
  doc.text("Payment Method:", 10, y)
  doc.text(`${saleData.payment_method || "Cash"}`, 50, y)

  // Right column
  y = 58
  doc.text("Customer:", 110, y)
  doc.text(`${saleData.customer_name || "Walk-in Customer"}`, 150, y)

  y += 6
  doc.text("Phone:", 110, y)
  doc.text(`${saleData.customer_phone || "N/A"}`, 150, y)

  y += 6
  doc.text("Email:", 110, y)
  doc.text(`${saleData.customer_email || "N/A"}`, 150, y)

  y += 6
  doc.text("Address:", 110, y)
  doc.text(`${saleData.customer_address || "N/A"}`, 150, y)

  // Calculate totals
  const subtotal = saleData.items.reduce(
    (sum: number, item: any) => sum + Number(item.quantity) * Number(item.price),
    0,
  )
  const discount = Number(saleData.discount) || 0
  const total = Number(saleData.total_amount) || subtotal - discount

  // Add financial summary
  y += 12
  doc.setFont("helvetica", "bold")
  doc.text("Financial Summary", 10, y)
  doc.setDrawColor(200, 200, 200)
  doc.line(10, y + 2, 200, y + 2)

  doc.setFont("helvetica", "normal")
  y += 8
  doc.text("Subtotal:", 10, y)
  doc.text(`AED ${subtotal.toFixed(2)}`, 50, y)

  y += 6
  doc.text("Discount:", 10, y)
  doc.text(`AED ${discount.toFixed(2)}`, 50, y)

  y += 6
  doc.text("Total Amount:", 10, y)
  doc.setFont("helvetica", "bold")
  doc.text(`AED ${total.toFixed(2)}`, 50, y)
  doc.setFont("helvetica", "normal")

  // Add items table
  y += 12
  doc.setFont("helvetica", "bold")
  doc.text("Sale Items (Detailed)", 10, y)
  doc.setDrawColor(200, 200, 200)
  doc.line(10, y + 2, 200, y + 2)

  // Define the table columns
  const tableColumns = [
    { header: "Product", dataKey: "product" },
    { header: "Barcode", dataKey: "barcode" },
    { header: "Category", dataKey: "category" },
    { header: "Qty", dataKey: "quantity" },
    { header: "Price", dataKey: "price" },
    { header: "Total", dataKey: "total" },
  ]

  // Prepare the table data
  const tableData = saleData.items.map((item: any) => {
    const itemTotal = Number(item.quantity) * Number(item.price)
    return {
      product: item.product_name,
      barcode: item.barcode || "N/A",
      category: item.category || "N/A",
      quantity: Number(item.quantity).toFixed(2),
      price: `AED ${Number(item.price).toFixed(2)}`,
      total: `AED ${itemTotal.toFixed(2)}`,
    }
  })

  // Add the table
  // @ts-ignore - jspdf-autotable types are not included
  doc.autoTable({
    startY: y + 5,
    head: [tableColumns.map((col) => col.header)],
    body: tableData.map((row) => tableColumns.map((col) => row[col.dataKey])),
    theme: "grid",
    headStyles: { fillColor: [245, 245, 245], textColor: [0, 0, 0], fontStyle: "bold" },
    styles: { fontSize: 9 },
    margin: { top: 10, right: 10, bottom: 10, left: 10 },
  })

  // @ts-ignore - jspdf-autotable types are not included
  const finalY = doc.lastAutoTable.finalY || 150

  // Add product details section
  doc.setFont("helvetica", "bold")
  doc.text("Detailed Product Information", 10, finalY + 10)
  doc.setDrawColor(200, 200, 200)
  doc.line(10, finalY + 12, 200, finalY + 12)

  let detailY = finalY + 20

  // For each item, add detailed information
  for (const item of saleData.items) {
    // Check if we need a new page
    if (detailY > 270) {
      doc.addPage()
      detailY = 20
    }

    doc.setFont("helvetica", "bold")
    doc.text(`${item.product_name}`, 10, detailY)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)

    detailY += 6
    doc.text("Barcode:", 15, detailY)
    doc.text(`${item.barcode || "N/A"}`, 60, detailY)

    detailY += 5
    doc.text("Category:", 15, detailY)
    doc.text(`${item.category || "N/A"}`, 60, detailY)

    detailY += 5
    doc.text("Quantity Sold:", 15, detailY)
    doc.text(`${Number(item.quantity).toFixed(2)}`, 60, detailY)

    detailY += 5
    doc.text("Sale Price:", 15, detailY)
    doc.text(`AED ${Number(item.price).toFixed(2)}`, 60, detailY)

    detailY += 5
    doc.text("Current Price:", 15, detailY)
    doc.text(`AED ${Number(item.current_price).toFixed(2)}`, 60, detailY)

    detailY += 5
    doc.text("Wholesale Price:", 15, detailY)
    doc.text(`AED ${Number(item.wholesale_price).toFixed(2)}`, 60, detailY)

    detailY += 5
    doc.text("Current Stock:", 15, detailY)
    doc.text(`${Number(item.current_stock).toFixed(2)}`, 60, detailY)

    // Add description if available
    if (item.product_description) {
      detailY += 5
      doc.text("Description:", 15, detailY)

      // Handle long descriptions with wrapping
      const description = item.product_description.toString()
      const splitDescription = doc.splitTextToSize(description, 130)

      doc.text(splitDescription, 60, detailY)
      detailY += splitDescription.length * 5
    }

    // Add a separator line
    detailY += 5
    doc.setDrawColor(220, 220, 220)
    doc.line(10, detailY, 200, detailY)
    detailY += 8
  }

  // Add footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setFont("helvetica", "italic")
    doc.text(`Generated on ${format(new Date(), "PPP p")} - Page ${i} of ${pageCount}`, 105, 290, { align: "center" })
  }

  return doc
}

// Generate a PDF with all sales data
export async function generateAllSalesPDF(salesData: any[]) {
  try {
    const doc = new jsPDF()

    // Add title
    doc.setFontSize(18)
    doc.text("Sales Report", 14, 22)

    // Add generation date
    doc.setFontSize(10)
    doc.text(`Generated on: ${formatDate(new Date())}`, 14, 30)

    // Add total sales count and value
    const totalValue = salesData.reduce((sum, sale) => sum + Number(sale.total_amount), 0)
    doc.text(`Total Sales: ${salesData.length}`, 14, 38)
    doc.text(`Total Value: ${formatCurrency(totalValue)}`, 14, 46)

    // Create table data
    const tableData = salesData.map((sale, index) => [
      index + 1, // Sequential number instead of ID
      sale.customer_name || "Walk-in Customer",
      formatDate(sale.sale_date),
      formatCurrency(Number(sale.total_amount)),
      formatCurrency(Number(sale.discount || 0)),
      sale.payment_method || "Cash",
      sale.status,
    ])

    // Add table
    doc.autoTable({
      startY: 55,
      head: [["#", "Customer", "Date", "Amount", "Discount", "Payment", "Status"]],
      body: tableData,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202], textColor: 255 },
      styles: { fontSize: 9 },
    })

    // For each sale, add a detailed page
    const currentPage = doc.internal.getNumberOfPages()

    salesData.forEach((sale, saleIndex) => {
      // Add a new page for each sale
      doc.addPage()

      // Add sale header
      doc.setFontSize(14)
      doc.text(`Sale #${saleIndex + 1} Details`, 14, 20)

      // Add sale info
      doc.setFontSize(10)
      doc.text(`Customer: ${sale.customer_name || "Walk-in Customer"}`, 14, 30)
      doc.text(`Date: ${formatDate(sale.sale_date)}`, 14, 38)
      doc.text(`Status: ${sale.status}`, 14, 46)
      doc.text(`Payment Method: ${sale.payment_method || "Cash"}`, 14, 54)
      doc.text(`Total Amount: ${formatCurrency(Number(sale.total_amount))}`, 14, 62)
      doc.text(`Discount: ${formatCurrency(Number(sale.discount || 0))}`, 14, 70)

      // Create items table data
      const itemsTableData = sale.items.map((item: any, index: number) => [
        index + 1,
        item.product_name,
        item.quantity,
        formatCurrency(Number(item.price)),
        formatCurrency(Number(item.price) * Number(item.quantity)),
      ])

      // Add items table
      doc.autoTable({
        startY: 80,
        head: [["#", "Product", "Quantity", "Unit Price", "Total"]],
        body: itemsTableData,
        theme: "grid",
        headStyles: { fillColor: [66, 139, 202], textColor: 255 },
        styles: { fontSize: 9 },
      })
    })

    return doc
  } catch (error) {
    console.error("Error generating sales PDF:", error)
    return null
  }
}

// Generate PDF for a single sale
export async function generateSalePDF(saleData: any) {
  try {
    const doc = new jsPDF()

    // Add title
    doc.setFontSize(18)
    doc.text("Sale Invoice", 14, 22)

    // Add sale info
    doc.setFontSize(10)
    doc.text(`Invoice Date: ${formatDate(new Date())}`, 14, 32)
    doc.text(`Sale Date: ${formatDate(saleData.sale_date)}`, 14, 40)
    doc.text(`Customer: ${saleData.customer_name || "Walk-in Customer"}`, 14, 48)
    doc.text(`Status: ${saleData.status}`, 14, 56)
    doc.text(`Payment Method: ${saleData.payment_method || "Cash"}`, 14, 64)

    // Create items table data
    const itemsTableData = saleData.items.map((item: any, index: number) => [
      index + 1,
      item.product_name,
      item.quantity,
      formatCurrency(Number(item.price)),
      formatCurrency(Number(item.price) * Number(item.quantity)),
    ])

    // Add items table
    doc.autoTable({
      startY: 75,
      head: [["#", "Product", "Quantity", "Unit Price", "Total"]],
      body: itemsTableData,
      theme: "grid",
      headStyles: { fillColor: [66, 139, 202], textColor: 255 },
      styles: { fontSize: 9 },
    })

    // Calculate totals
    const subtotal = saleData.items.reduce(
      (sum: number, item: any) => sum + Number(item.price) * Number(item.quantity),
      0,
    )
    const discount = Number(saleData.discount || 0)
    const total = Number(saleData.total_amount)

    // Add totals
    const finalY = (doc as any).lastAutoTable.finalY + 10
    doc.text(`Subtotal: ${formatCurrency(subtotal)}`, 130, finalY)
    doc.text(`Discount: ${formatCurrency(discount)}`, 130, finalY + 8)
    doc.text(`Total: ${formatCurrency(total)}`, 130, finalY + 16)

    return doc
  } catch (error) {
    console.error("Error generating sale PDF:", error)
    return null
  }
}

// Export products to PDF
export async function exportProductsToPDF(products: any[], filename = "products_report.pdf", currency = "USD") {
  try {
    // Create HTML content
    let htmlContent = `
      <html>
        <head>
          <title>Products Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f2f2f2; text-align: left; padding: 8px; border: 1px solid #ddd; }
            td { padding: 8px; border: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .summary { margin-top: 20px; }
            .summary p { margin: 5px 0; }
            @media print {
              button { display: none; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Products Report</h1>
          <p>Generated on: ${format(new Date(), "PPP")}</p>
          <table>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Category</th>
              <th>Barcode</th>
              <th>Price</th>
              <th>Wholesale</th>
              <th>Stock</th>
              <th>Status</th>
            </tr>
    `

    // Add table rows
    products.forEach((product, index) => {
      const stock = Number(product.stock) || 0
      let status = "In Stock"
      if (stock <= 0) status = "Out of Stock"
      else if (stock <= 5) status = "Low Stock"

      htmlContent += `
        <tr>
          <td>${index + 1}</td>
          <td>${product.name || ""}</td>
          <td>${product.category || ""}</td>
          <td>${product.barcode || ""}</td>
          <td>${formatCurrency(Number(product.price) || 0, currency)}</td>
          <td>${formatCurrency(Number(product.wholesale_price) || 0, currency)}</td>
          <td>${stock}</td>
          <td>${status}</td>
        </tr>
      `
    })

    // Add summary
    const totalProducts = products.length
    const outOfStock = products.filter((p) => (Number(p.stock) || 0) <= 0).length
    const lowStock = products.filter((p) => {
      const stock = Number(p.stock) || 0
      return stock > 0 && stock <= 5
    }).length

    htmlContent += `
          </table>
          <div class="summary">
            <p>Total Products: ${totalProducts}</p>
            <p>In Stock: ${totalProducts - outOfStock - lowStock}</p>
            <p>Low Stock: ${lowStock}</p>
            <p>Out of Stock: ${outOfStock}</p>
          </div>
          <div class="footer">
            <p>This report was generated on ${format(new Date(), "PPP p")}.</p>
          </div>
          <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Print Report
          </button>
        </body>
      </html>
    `

    // Open a new window and write the HTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      throw new Error("Could not open print window. Please check your popup blocker settings.")
    }

    printWindow.document.write(htmlContent)
    printWindow.document.close()

    return true
  } catch (error) {
    console.error("Error generating PDF:", error)
    return false
  }
}

// Export purchases to PDF
export async function exportPurchasesToPDF(purchases: any[], filename = "purchases_report.pdf", currency = "USD") {
  try {
    // Create HTML content
    let htmlContent = `
      <html>
        <head>
          <title>Purchases Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f2f2f2; text-align: left; padding: 8px; border: 1px solid #ddd; }
            td { padding: 8px; border: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .summary { margin-top: 20px; }
            .summary p { margin: 5px 0; }
            @media print {
              button { display: none; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Purchases Report</h1>
          <p>Generated on: ${format(new Date(), "PPP")}</p>
          <table>
            <tr>
              <th>#</th>
              <th>Supplier</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Payment Status</th>
              <th>Payment Method</th>
              <th>Delivery Status</th>
            </tr>
    `

    // Add table rows
    purchases.forEach((purchase, index) => {
      htmlContent += `
        <tr>
          <td>${index + 1}</td>
          <td>${purchase.supplier || ""}</td>
          <td>${purchase.purchase_date ? format(new Date(purchase.purchase_date), "yyyy-MM-dd") : ""}</td>
          <td>${formatCurrency(Number(purchase.total_amount) || 0, currency)}</td>
          <td>${purchase.status || ""}</td>
          <td>${purchase.payment_method || "Cash"}</td>
          <td>${purchase.purchase_status || "Delivered"}</td>
        </tr>
      `
    })

    // Add summary
    const totalPurchases = purchases.length
    const totalAmount = purchases.reduce((total, purchase) => total + (Number(purchase.total_amount) || 0), 0)
    const paid = purchases.filter((p) => p.status?.toLowerCase() === "paid").length
    const credit = purchases.filter((p) => p.status?.toLowerCase() === "credit").length

    htmlContent += `
          </table>
          <div class="summary">
            <p>Total Purchases: ${totalPurchases}</p>
            <p>Total Amount: ${formatCurrency(totalAmount, currency)}</p>
            <p>Paid: ${paid}</p>
            <p>Credit: ${credit}</p>
          </div>
          <div class="footer">
            <p>This report was generated on ${format(new Date(), "PPP p")}.</p>
          </div>
          <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Print Report
          </button>
        </body>
      </html>
    `

    // Open a new window and write the HTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      throw new Error("Could not open print window. Please check your popup blocker settings.")
    }

    printWindow.document.write(htmlContent)
    printWindow.document.close()

    return true
  } catch (error) {
    console.error("Error generating PDF:", error)
    return false
  }
}

// Export customers to PDF
export async function exportCustomersToPDF(customers: any[], filename = "customers_report.pdf") {
  try {
    // Create HTML content
    let htmlContent = `
      <html>
        <head>
          <title>Customers Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f2f2f2; text-align: left; padding: 8px; border: 1px solid #ddd; }
            td { padding: 8px; border: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .summary { margin-top: 20px; }
            .summary p { margin: 5px 0; }
            @media print {
              button { display: none; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Customers Report</h1>
          <p>Generated on: ${format(new Date(), "PPP")}</p>
          <table>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Address</th>
              <th>Order Count</th>
            </tr>
    `

    // Add table rows
    customers.forEach((customer, index) => {
      htmlContent += `
        <tr>
          <td>${index + 1}</td>
          <td>${customer.name || ""}</td>
          <td>${customer.phone || ""}</td>
          <td>${customer.email || ""}</td>
          <td>${customer.address || ""}</td>
          <td>${(customer.order_count || 0).toString()}</td>
        </tr>
      `
    })

    // Add summary
    const totalCustomers = customers.length
    const withOrders = customers.filter((c) => (Number(c.order_count) || 0) > 0).length

    htmlContent += `
          </table>
          <div class="summary">
            <p>Total Customers: ${totalCustomers}</p>
            <p>Customers with Orders: ${withOrders}</p>
            <p>Customers without Orders: ${totalCustomers - withOrders}</p>
          </div>
          <div class="footer">
            <p>This report was generated on ${format(new Date(), "PPP p")}.</p>
          </div>
          <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Print Report
          </button>
        </body>
      </html>
    `

    // Open a new window and write the HTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      throw new Error("Could not open print window. Please check your popup blocker settings.")
    }

    printWindow.document.write(htmlContent)
    printWindow.document.close()

    return true
  } catch (error) {
    console.error("Error generating PDF:", error)
    return false
  }
}

// Export stock to PDF
export async function exportStockToPDF(products: any[], filename = "stock_report.pdf", currency = "USD") {
  try {
    // Create HTML content
    let htmlContent = `
      <html>
        <head>
          <title>Stock Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f2f2f2; text-align: left; padding: 8px; border: 1px solid #ddd; }
            td { padding: 8px; border: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .summary { margin-top: 20px; }
            .summary p { margin: 5px 0; }
            @media print {
              button { display: none; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Stock Report</h1>
          <p>Generated on: ${format(new Date(), "PPP")}</p>
          <table>
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th>Category</th>
              <th>Barcode</th>
              <th>Stock</th>
              <th>Status</th>
              <th>Retail Price</th>
              <th>Wholesale Price</th>
            </tr>
    `

    // Add table rows
    products.forEach((product, index) => {
      const stock = Number(product.stock) || 0
      let status = "In Stock"
      if (stock <= 0) status = "Out of Stock"
      else if (stock <= 5) status = "Low Stock"

      htmlContent += `
        <tr>
          <td>${index + 1}</td>
          <td>${product.name || ""}</td>
          <td>${product.category || ""}</td>
          <td>${product.barcode || ""}</td>
          <td>${stock.toString()}</td>
          <td>${status}</td>
          <td>${formatCurrencyOriginal(Number(product.price) || 0, currency)}</td>
          <td>${formatCurrencyOriginal(Number(product.wholesale_price) || 0, currency)}</td>
        </tr>
      `
    })

    // Add summary
    const totalProducts = products.length
    const outOfStock = products.filter((p) => (Number(p.stock) || 0) <= 0).length
    const lowStock = products.filter((p) => {
      const stock = Number(p.stock) || 0
      return stock > 0 && stock <= 5
    }).length
    const totalStock = products.reduce((total, p) => total + (Number(p.stock) || 0), 0)

    htmlContent += `
          </table>
          <div class="summary">
            <p>Total Products: ${totalProducts}</p>
            <p>Total Stock: ${totalStock} units</p>
            <p>In Stock: ${totalProducts - outOfStock - lowStock}</p>
            <p>Low Stock: ${lowStock}</p>
            <p>Out of Stock: ${outOfStock}</p>
          </div>
          <div class="footer">
            <p>This report was generated on ${format(new Date(), "PPP p")}.</p>
          </div>
          <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Print Report
          </button>
        </body>
      </html>
    `

    // Open a new window and write the HTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      throw new Error("Could not open print window. Please check your popup blocker settings.")
    }

    printWindow.document.write(htmlContent)
    printWindow.document.close()

    return true
  } catch (error) {
    console.error("Error generating PDF:", error)
    return false
  }
}

// Export detailed sale to PDF
export async function exportDetailedSaleToPDF(
  sale: any,
  items: any[],
  filename = `sale_${sale.id}_detailed.pdf`,
  currency = "USD",
) {
  try {
    // Create HTML content
    let htmlContent = `
      <html>
        <head>
          <title>Sale Invoice #${sale.id}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; }
            h2 { color: #555; margin-top: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background-color: #f2f2f2; text-align: left; padding: 8px; border: 1px solid #ddd; }
            td { padding: 8px; border: 1px solid #ddd; }
            tr:nth-child(even) { background-color: #f9f9f9; }
            .footer { margin-top: 30px; font-size: 12px; color: #666; }
            .info-section { display: flex; justify-content: space-between; margin-top: 20px; }
            .info-column { width: 48%; }
            .totals { text-align: right; margin-top: 20px; }
            .totals p { margin: 5px 0; }
            .totals .total { font-weight: bold; }
            @media print {
              button { display: none; }
              body { margin: 0; }
            }
          </style>
        </head>
        <body>
          <h1>Sale Invoice #${sale.id}</h1>
          <p>Generated on: ${format(new Date(), "PPP")}</p>
          
          <div class="info-section">
            <div class="info-column">
              <h2>Sale Information</h2>
              <p><strong>Sale ID:</strong> ${sale.id}</p>
              <p><strong>Date:</strong> ${new Date(sale.sale_date).toLocaleDateString()}</p>
              <p><strong>Status:</strong> ${sale.status || ""}</p>
              <p><strong>Payment Method:</strong> ${sale.payment_method || "Cash"}</p>
            </div>
            <div class="info-column">
              <h2>Customer Information</h2>
              <p><strong>Customer:</strong> ${sale.customer_name || "Walk-in Customer"}</p>
              <p><strong>Phone:</strong> ${sale.customer_phone || "N/A"}</p>
              <p><strong>Email:</strong> ${sale.customer_email || "N/A"}</p>
              <p><strong>Address:</strong> ${sale.customer_address || "N/A"}</p>
            </div>
          </div>
          
          <h2>Sale Items</h2>
          <table>
            <tr>
              <th>#</th>
              <th>Product Name</th>
              <th>Barcode</th>
              <th>Unit Price</th>
              <th>Quantity</th>
              <th>Total</th>
            </tr>
    `

    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0)
    const discount = Number(sale.discount || 0)
    const total = Number(sale.total_amount || subtotal - discount)

    // Add table rows
    items.forEach((item, index) => {
      const itemTotal = Number(item.price) * Number(item.quantity)
      htmlContent += `
        <tr>
          <td>${index + 1}</td>
          <td>${item.product_name || ""}</td>
          <td>${item.barcode || "N/A"}</td>
          <td>${formatCurrencyOriginal(Number(item.price) || 0, currency)}</td>
          <td>${Number(item.quantity).toFixed(2)}</td>
          <td>${formatCurrencyOriginal(itemTotal, currency)}</td>
        </tr>
      `
    })

    htmlContent += `
          </table>
          
          <div class="totals">
            <p><strong>Subtotal:</strong> ${formatCurrencyOriginal(subtotal, currency)}</p>
            <p><strong>Discount:</strong> ${formatCurrencyOriginal(discount, currency)}</p>
            <p class="total"><strong>Total Amount:</strong> ${formatCurrencyOriginal(total, currency)}</p>
          </div>
          
          <div class="footer">
            <p>This invoice was generated on ${format(new Date(), "PPP p")}.</p>
            <p>Thank you for your business!</p>
          </div>
          
          <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
            Print Invoice
          </button>
        </body>
      </html>
    `

    // Open a new window and write the HTML
    const printWindow = window.open("", "_blank")
    if (!printWindow) {
      throw new Error("Could not open print window. Please check your popup blocker settings.")
    }

    printWindow.document.write(htmlContent)
    printWindow.document.close()

    return true
  } catch (error) {
    console.error("Error generating PDF:", error)
    return false
  }
}

// Helper function to get stock status
function getStockStatus(stock: number): string {
  if (stock <= 0) return "Out of Stock"
  if (stock <= 5) return "Low Stock"
  return "In Stock"
}
