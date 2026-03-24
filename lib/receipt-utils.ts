"use client"

// Function to get company info from the DOM
const getCompanyInfoFromDOM = (): { name: string; address: string; phone: string } => {
  if (typeof document === "undefined") {
    return {
      name: "Moto Club",
      address: "kottakkal, malappuram, kerala, india",
      phone: "+91 9995442239",
    }
  }
  // Always return the fixed company info 
  return {
    name: "Moto Club",
    address: "kottakkal, malappuram, kerala, india",
    phone: "+91 9995442239",
  }
}

// Enhanced function to print a sales receipt - works for both new sales and reprints
export function printSalesReceipt(sale: any, items: any[], currency = "AED", businessInfo: any = {}, autoprint = true) {
  if (!sale || !items.length) return

  // Check if we're in a browser environment
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.warn("Cannot print receipt: Not in browser environment")
    return
  }

  console.log("Printing receipt with sale data:", sale)
  console.log("Items:", items)

  // Try to get company info from the DOM
  const companyInfoFromDOM = getCompanyInfoFromDOM()

  // Use the company info from the DOM or fallback to provided info
  const business = {
    name: "Moto Club",
    address: "kottakkal, malappuram, kerala, india",
    phone: "+91 9995442239",
    ...businessInfo,
  }

  // Create a new window for printing
  const printWindow = window.open("", "_blank", "width=800,height=900,scrollbars=yes")

  if (!printWindow) {
    alert("Please allow pop-ups to print receipts")
    return
  }

  // Format date and time
  const saleDate = new Date(sale.sale_date)
  const formattedDate = saleDate
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-")

  const formattedTime = saleDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)

  // Get discount from sale object or calculate it
  let discount = 0
  if (sale.discount !== undefined && sale.discount !== null) {
    discount = Number(sale.discount)
  } else {
    // If not in sale object, check if it's in the data property (from server response)
    if (sale.data && sale.data.discount !== undefined) {
      discount = Number(sale.data.discount)
    } else {
      // If still not found, calculate it as the difference between subtotal and total
      const saleTotal = Number(sale.total_amount)
      discount = subtotal - saleTotal > 0 ? subtotal - saleTotal : 0
    }
  }

  // Calculate final total
  const finalTotal = subtotal - discount

  // Get received amount from sale object
  let receivedAmount = 0
  if (sale.received_amount !== undefined && sale.received_amount !== null) {
    receivedAmount = Number(sale.received_amount)
  } else if (sale.status === "Credit") {
    receivedAmount = 0 // Default for credit
  } else {
    receivedAmount = finalTotal // Full amount for completed/cancelled
  }

  const remainingAmount = Math.max(0, finalTotal - receivedAmount)
  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity), 0)

  // Safe format currency function - fixes the toFixed error
  const formatCurrency = (amount: number | string | null | undefined) => {
    const parsed = typeof amount === "string" ? Number.parseFloat(amount) : typeof amount === "number" ? amount : 0
    const validAmount = Number.isFinite(parsed) ? parsed : 0
    return `${currency} ${validAmount.toFixed(2)}`
  }

  // Create receipt content with ultra-compact professional design
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Invoice - Moto Club</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        @media print {
          body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
          }
          @page {
            size: A4;
            margin: 0.4cm;
          }
          .no-print {
            display: none !important;
          }
          
          table, th, td {
            border-color: #000 !important;
            border-width: 0.5px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .invoice-title, th {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          background: #ffffff;
          color: #1f2937;
          line-height: 1.2;
          font-size: 12px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .invoice-container {
          max-width: 210mm;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #000;
        }
        
        /* Ultra Compact Header */
        .invoice-header {
          background: #f8fafc;
          padding: 0.75rem 1rem;
          border-bottom: 2px solid #000;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .company-info {
          flex: 1;
        }
        
        .company-name {
          font-size: 1.4rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 0.2rem;
        }
        
        .company-details {
          font-size: 0.7rem;
          color: #4b5563;
          line-height: 1.2;
        }
        
        .logo-container {
          flex-shrink: 0;
          margin-left: 1rem;
        }
        
        .logo {
          max-width: 100px;
          height: auto;
        }
        
        .invoice-title {
          background: #ffcc00;
          color: #111827;
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: center;
          padding: 0.4rem;
          border-bottom: 1px solid #000;
          margin: 0;
        }
        
        /* Compact Invoice Body */
        .invoice-body {
          padding: 0.75rem 1rem;
        }
        
        /* Organized Invoice Details - Single Row */
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.75rem;
          padding: 0.5rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          font-size: 0.75rem;
        }
        
        .invoice-to {
          flex: 1;
          margin-right: 1rem;
        }
        
        .invoice-info {
          flex: 1;
        }
        
        .detail-title {
          font-size: 0.8rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.3rem;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        
        .detail-content {
          font-size: 0.75rem;
          color: #4b5563;
          line-height: 1.3;
        }
        
        /* Compact Info Table */
        .info-table {
          width: 100%;
          font-size: 0.75rem;
          border-collapse: collapse;
        }
        
        .info-table td {
          padding: 0.1rem 0;
          vertical-align: top;
        }
        
        .info-label {
          font-weight: 500;
          color: #6b7280;
          width: 70px;
        }
        
        .info-value {
          font-weight: 600;
          color: #111827;
        }
        
        .status-completed { color: #10b981; }
        .status-credit { color: #f59e0b; }
        .status-cancelled { color: #ef4444; }
        .status-pending { color: #6b7280; }
        
        /* Ultra Compact Items Table */
        .invoice-table-container {
          margin-bottom: 0.75rem;
          overflow-x: auto;
        }
        
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.7rem;
          border: 1px solid #000;
        }
        
        .invoice-table th {
          background: #f3f4f6;
          padding: 0.3rem 0.4rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border: 0.5px solid #000;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          line-height: 1.1;
        }
        
        .invoice-table td {
          padding: 0.25rem 0.4rem;
          border: 0.5px solid #000;
          color: #4b5563;
          vertical-align: top;
          line-height: 1.2;
        }
        
        .text-right {
          text-align: right;
        }
        
        .text-center {
          text-align: center;
        }
        
        /* Compact Item Details */
        .item-description {
          font-weight: 500;
          color: #111827;
          font-size: 0.7rem;
        }
        
        .item-meta {
          font-size: 0.6rem;
          color: #6b7280;
          margin-top: 1px;
        }
        
        .item-type {
          display: inline-block;
          padding: 1px 4px;
          border-radius: 2px;
          font-size: 0.55rem;
          font-weight: 500;
          margin-top: 1px;
        }
        
        .service-type {
          background: #dcfce7;
          color: #166534;
        }
        
        .product-type {
          background: #dbeafe;
          color: #1e40af;
        }
        
        /* Compact Totals */
        .totals-container {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 0.75rem;
        }
        
        .totals {
          width: 250px;
          background: #f9fafb;
          border: 1px solid #000;
          padding: 0.5rem;
        }
        
        .totals-table {
          width: 100%;
          font-size: 0.75rem;
          border-collapse: collapse;
        }
        
        .totals-table td {
          padding: 0.15rem 0;
          color: #4b5563;
        }
        
        .totals-table .total-row td {
          padding-top: 0.3rem;
          font-weight: 700;
          font-size: 0.85rem;
          color: #111827;
          border-top: 1px solid #000;
        }
        
        .credit-info {
          margin-top: 0.3rem;
          padding-top: 0.3rem;
          border-top: 1px solid #e5e7eb;
        }
        
        /* Compact Footer */
        .invoice-footer {
          background: #f8fafc;
          padding: 0.5rem 1rem;
          text-align: center;
          border-top: 1px solid #000;
          font-size: 0.7rem;
        }
        
        .thank-you {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.2rem;
        }
        
        .footer-note {
          font-size: 0.6rem;
          color: #6b7280;
        }
        
        .barcode {
          text-align: center;
          margin: 0.3rem 0;
          font-size: 0.6rem;
          color: #6b7280;
        }
        
        .print-buttons {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin: 1rem auto;
          padding: 1rem;
        }
        
        .print-button {
          padding: 0.75rem 1.5rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 0.375rem;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .print-button:hover {
          background: #1d4ed8;
        }
        
        .print-button.secondary {
          background: #6b7280;
        }
        
        .print-button.secondary:hover {
          background: #4b5563;
        }
        
        /* Ensure 10+ items fit */
        .invoice-table tbody tr {
          height: auto;
          min-height: 1.5rem;
        }
        
        /* Responsive adjustments */
        @media (max-width: 600px) {
          .invoice-details {
            flex-direction: column;
          }
          
          .invoice-to {
            margin-right: 0;
            margin-bottom: 0.5rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <div class="company-info">
            <div class="company-name">Moto Club</div>
            <div class="company-details">
              kottakkal, malappuram, kerala, india<br>
              Phone: +91 9995442239
            </div>
          </div>
          <div class="logo-container">
            <img src="https://res.cloudinary.com/dxishiq9x/image/upload/v1751969415/286709952_155636793670880_4247278441893099316_n_unlqm6.jpg" alt="Moto Club" class="logo">
          </div>
        </div>
        
        <div class="invoice-title">Tax Invoice</div>
        
        <div class="invoice-body">
          <div class="invoice-details">
            <div class="invoice-to">
              <div class="detail-title">Bill To:</div>
              <div class="detail-content">
                <strong>${sale.customer_name || "Walk-in Customer"}</strong><br>
                ${sale.customer_phone ? `${sale.customer_phone}<br>` : ""}
                ${sale.customer_email ? `${sale.customer_email}<br>` : ""}
                ${sale.customer_address ? `${sale.customer_address}` : ""}
              </div>
            </div>
            
            <div class="invoice-info">
              <div class="detail-title">Invoice Info:</div>
              <div class="detail-content">
                <table class="info-table">
                  <tr>
                    <td class="info-label">Invoice #:</td>
                    <td class="info-value">${sale.id}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Date:</td>
                    <td class="info-value">${formattedDate}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Time:</td>
                    <td class="info-value">${formattedTime}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Status:</td>
                    <td class="info-value status-${sale.status?.toLowerCase() || "pending"}">${sale.status || "Pending"}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Payment:</td>
                    <td class="info-value">${sale.payment_method || "Cash"}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Staff:</td>
                    <td class="info-value">${sale.staff_name || "N/A"}</td>
                  </tr>
                  ${
                    sale.status === "Credit"
                      ? `
                  <tr>
                    <td class="info-label">Received:</td>
                    <td class="info-value">${formatCurrency(receivedAmount)}</td>
                  </tr>
                  <tr>
                    <td class="info-label">Balance:</td>
                    <td class="info-value status-credit">${formatCurrency(remainingAmount)}</td>
                  </tr>
                  `
                      : ""
                  }
                </table>
              </div>
            </div>
          </div>
          
          <div class="invoice-table-container">
            <table class="invoice-table">
              <thead>
                <tr>
                  <th style="width: 4%;">#</th>
                  <th style="width: 50%;">Item Description</th>
                  <th style="width: 10%;" class="text-center">Qty</th>
                  <th style="width: 18%;" class="text-right">Price</th>
                  <th style="width: 18%;" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (item, index) => `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>
                      <div class="item-description">${item.product_name || item.service_name}</div>
                      ${item.barcode ? `<div class="item-meta">SKU: ${item.barcode}</div>` : ""}
                      ${item.notes ? `<div class="item-meta">${item.notes}</div>` : ""}
                      <span class="item-type ${item.service_name ? "service-type" : "product-type"}">
                        ${item.service_name ? "SVC" : "PRD"}
                      </span>
                    </td>
                    <td class="text-center">${Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 1)}</td>
                    <td class="text-right">${formatCurrency(Number(item.price))}</td>
                    <td class="text-right"><strong>${formatCurrency(Number(item.quantity) * Number(item.price))}</strong></td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          
          <div class="totals-container">
            <div class="totals">
              <table class="totals-table">
                <tr>
                  <td>Subtotal:</td>
                  <td class="text-right">${formatCurrency(subtotal)}</td>
                </tr>
                ${
                  discount > 0
                    ? `
                <tr>
                  <td>Discount:</td>
                  <td class="text-right">-${formatCurrency(discount)}</td>
                </tr>
                `
                    : ""
                }
                <tr>
                  <td>VAT (0%):</td>
                  <td class="text-right">${formatCurrency(0)}</td>
                </tr>
                <tr class="total-row">
                  <td><strong>Total:</strong></td>
                  <td class="text-right"><strong>${formatCurrency(finalTotal)}</strong></td>
                </tr>
                ${
                  sale.status === "Credit"
                    ? `
                <tr class="credit-info">
                  <td>Paid:</td>
                  <td class="text-right status-completed">${formatCurrency(receivedAmount)}</td>
                </tr>
                <tr>
                  <td><strong>Balance Due:</strong></td>
                  <td class="text-right status-credit"><strong>${formatCurrency(remainingAmount)}</strong></td>
                </tr>
                `
                    : ""
                }
              </table>
            </div>
          </div>
          
          <div class="barcode">
            Invoice #${sale.id} | ${formattedDate} ${formattedTime} | Items: ${items.length}
          </div>
        </div>
        
        <div class="invoice-footer">
          <div class="thank-you">Thank You For Your Business!</div>
          <div class="footer-note">
            This is a computer-generated invoice. For queries, contact +91 9995442239
          </div>
        </div>
      </div>
      
      <div class="print-buttons no-print">
        <button class="print-button" onclick="window.print()">Print Invoice</button>
        <button class="print-button secondary" onclick="window.close()">Close</button>
      </div>
      <script>
        window.onload = function() {
          // Auto print only if autoprint is enabled
          ${
            autoprint
              ? `
          setTimeout(function() {
            window.print();
          }, 500);
          `
              : ""
          }
        };
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}

// Helper function to print invoice from sale ID - fetches data and prints
export async function printInvoiceById(saleId: number, currency = "AED", autoprint = false) {
  try {
    // Fetch sale details
    const response = await fetch(`/api/sales/${saleId}`)
    const result = await response.json()

    if (result.success && result.data) {
      printSalesReceipt(result.data.sale, result.data.items, currency, {}, autoprint)
    } else {
      console.error("Failed to fetch sale data for printing:", result.message)
      alert("Failed to load sale data for printing")
    }
  } catch (error) {
    console.error("Error fetching sale data for printing:", error)
    alert("Error loading sale data for printing")
  }
}

export function printPurchaseReceipt(purchase: any, items: any[], currency = "AED") {
  if (!purchase || !items.length) return

  // Check if we're in a browser environment
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.warn("Cannot print receipt: Not in browser environment")
    return
  }

  // Create a new window for printing
  const printWindow = window.open("", "_blank", "width=800,height=900,scrollbars=yes")

  if (!printWindow) {
    alert("Please allow pop-ups to print receipts")
    return
  }

  // Safe format currency function - fixes the toFixed error
  const formatCurrency = (amount: number | string | null | undefined) => {
    const parsed = typeof amount === "string" ? Number.parseFloat(amount) : typeof amount === "number" ? amount : 0
    const validAmount = Number.isFinite(parsed) ? parsed : 0
    return `${currency} ${validAmount.toFixed(2)}`
  }

  // Format date and time
  const purchaseDate = new Date(purchase.purchase_date)
  const formattedDate = purchaseDate
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
    .replace(/\//g, "-")

  const formattedTime = purchaseDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)
  const totalAmount = Number(purchase.total_amount) || subtotal

  // Calculate payment amounts
  const paidAmount = purchase.received_amount || 0
  const remainingAmount = Math.max(0, totalAmount - paidAmount)

  // Get supplier name - try different possible field names
  const supplierName = purchase.supplier || purchase.supplier_name || purchase.supplier_company || "Walk-in Supplier"

  // Create purchase receipt content
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Purchase Invoice - Moto Club</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        @media print {
          body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
          }
          @page {
            size: A4;
            margin: 0.4cm;
          }
          .no-print {
            display: none !important;
          }
          
          table, th, td {
            border-color: #000 !important;
            border-width: 0.5px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .receipt-title, th {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Inter', sans-serif;
          background: #ffffff;
          color: #1f2937;
          line-height: 1.2;
          font-size: 12px;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .receipt-container {
          max-width: 210mm;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #000;
        }
        
        .receipt-header {
          background: #f8fafc;
          padding: 0.75rem 1rem;
          border-bottom: 2px solid #000;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .company-info {
          flex: 1;
        }
        
        .company-name {
          font-size: 1.4rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 0.2rem;
        }
        
        .company-details {
          font-size: 0.7rem;
          color: #4b5563;
          line-height: 1.2;
        }
        
        .logo-container {
          flex-shrink: 0;
          margin-left: 1rem;
        }
        
        .logo {
          max-width: 100px;
          height: auto;
        }
        
        .receipt-title {
          background: #dc2626;
          color: white;
          font-size: 0.9rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          text-align: center;
          padding: 0.4rem;
          border-bottom: 1px solid #000;
          margin: 0;
        }
        
        .receipt-body {
          padding: 0.75rem 1rem;
        }
        
        .receipt-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.75rem;
          padding: 0.5rem;
          background: #f9fafb;
          border: 1px solid #e5e7eb;
          font-size: 0.75rem;
        }
        
        .supplier-info {
          flex: 1;
          margin-right: 1rem;
        }
        
        .purchase-info {
          flex: 1;
        }
        
        .detail-title {
          font-size: 0.8rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.3rem;
          text-transform: uppercase;
          letter-spacing: 0.3px;
        }
        
        .detail-content {
          font-size: 0.75rem;
          color: #4b5563;
          line-height: 1.3;
        }
        
        .info-label {
          font-weight: 500;
          color: #6b7280;
          margin-right: 0.5rem;
        }

        .info-value {
          font-weight: 600;
          color: #111827;
        }
        
        .status-paid { color: #10b981; }
        .status-credit { color: #f59e0b; }
        .status-cancelled { color: #ef4444; }
        .status-pending { color: #6b7280; }
        .status-delivered { color: #10b981; }
        
        .items-table-container {
          margin-bottom: 0.75rem;
          overflow-x: auto;
        }
        
        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.7rem;
          border: 1px solid #000;
        }
        
        .items-table th {
          background: #f3f4f6;
          padding: 0.3rem 0.4rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border: 0.5px solid #000;
          font-size: 0.65rem;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          line-height: 1.1;
        }
        
        .items-table td {
          padding: 0.25rem 0.4rem;
          border: 0.5px solid #000;
          color: #4b5563;
          vertical-align: top;
          line-height: 1.2;
        }
        
        .text-right {
          text-align: right;
        }
        
        .text-center {
          text-align: center;
        }
        
        .item-description {
          font-weight: 500;
          color: #111827;
          font-size: 0.7rem;
        }
        
        .item-meta {
          font-size: 0.6rem;
          color: #6b7280;
          margin-top: 1px;
        }
        
        .totals-container {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 0.75rem;
        }
        
        .totals {
          width: 280px;
          background: #f9fafb;
          border: 1px solid #000;
          padding: 0.5rem;
        }
        
        .totals-table {
          width: 100%;
          font-size: 0.75rem;
          border-collapse: collapse;
        }
        
        .totals-table td {
          padding: 0.15rem 0;
          color: #4b5563;
        }
        
        .totals-table .total-row td {
          padding-top: 0.3rem;
          font-weight: 700;
          font-size: 0.85rem;
          color: #111827;
          border-top: 1px solid #000;
        }
        
        .payment-info {
          margin-top: 0.3rem;
          padding-top: 0.3rem;
          border-top: 1px solid #e5e7eb;
        }
        
        .receipt-footer {
          background: #f8fafc;
          padding: 0.5rem 1rem;
          text-align: center;
          border-top: 1px solid #000;
          font-size: 0.7rem;
        }
        
        .thank-you {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.2rem;
        }
        
        .footer-note {
          font-size: 0.6rem;
          color: #6b7280;
        }
        
        .print-buttons {
          display: flex;
          justify-content: center;
          gap: 1rem;
          margin: 1rem auto;
          padding: 1rem;
        }
        
        .print-button {
          padding: 0.75rem 1.5rem;
          background: #2563eb;
          color: white;
          border: none;
          border-radius: 0.375rem;
          font-family: 'Inter', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .print-button:hover {
          background: #1d4ed8;
        }
        
        .print-button.secondary {
          background: #6b7280;
        }
        
        .print-button.secondary:hover {
          background: #4b5563;
        }
      </style>
    </head>
    <body>
      <div class="receipt-container">
        <div class="receipt-header">
          <div class="company-info">
            <div class="company-name">Moto Club</div>
            <div class="company-details">
              kottakkal, malappuram, kerala, india<br>
              Phone: +91 9995442239
            </div>
          </div>
          <div class="logo-container">
            <img src="https://res.cloudinary.com/dxishiq9x/image/upload/v1751969415/286709952_155636793670880_4247278441893099316_n_unlqm6.jpg" alt="Moto Club" class="logo">
          </div>
        </div>
        
        <div class="receipt-title">Purchase Invoice</div>
        
        <div class="receipt-body">
          <div class="receipt-details">
            <div class="supplier-info">
              <div class="detail-title">Supplier:</div>
              <div class="detail-content">
                <strong>${supplierName}</strong><br>
                ${purchase.supplier_phone ? `${purchase.supplier_phone}<br>` : ""}
                ${purchase.supplier_email ? `${purchase.supplier_email}<br>` : ""}
                ${purchase.supplier_address ? `${purchase.supplier_address}` : ""}
              </div>
            </div>
            
            <div class="purchase-info">
              <div class="detail-title">Purchase Info:</div>
              <div class="detail-content">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.7rem;">
                  <div>
                    <span class="info-label">Invoice #:</span>
                    <span class="info-value">${purchase.id}</span>
                  </div>
                  <div>
                    <span class="info-label">Date:</span>
                    <span class="info-value">${formattedDate}</span>
                  </div>
                  <div>
                    <span class="info-label">Time:</span>
                    <span class="info-value">${formattedTime}</span>
                  </div>
                  <div>
                    <span class="info-label">Items:</span>
                    <span class="info-value">${items.length}</span>
                  </div>
                  <div>
                    <span class="info-label">Payment:</span>
                    <span class="info-value status-${purchase.status?.toLowerCase() || "pending"}">${purchase.status || "Pending"}</span>
                  </div>
                  <div>
                    <span class="info-label">Delivery:</span>
                    <span class="info-value status-${purchase.purchase_status?.toLowerCase() || "pending"}">${purchase.purchase_status || "Pending"}</span>
                  </div>
                  <div>
                    <span class="info-label">Method:</span>
                    <span class="info-value">${purchase.payment_method || "Cash"}</span>
                  </div>
                  <div>
                    <span class="info-label">Staff:</span>
                    <span class="info-value">${purchase.staff_name || "N/A"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="items-table-container">
            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 4%;">#</th>
                  <th style="width: 50%;">Product Description</th>
                  <th style="width: 10%;" class="text-center">Qty</th>
                  <th style="width: 18%;" class="text-right">Price</th>
                  <th style="width: 18%;" class="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (item, index) => `
                  <tr>
                    <td class="text-center">${index + 1}</td>
                    <td>
                      <div class="item-description">${item.product_name || "Unknown Product"}</div>
                      ${item.barcode ? `<div class="item-meta">SKU: ${item.barcode}</div>` : ""}
                      ${item.notes ? `<div class="item-meta">${item.notes}</div>` : ""}
                    </td>
                    <td class="text-center">${Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 1)}</td>
                    <td class="text-right">${formatCurrency(Number(item.price))}</td>
                    <td class="text-right"><strong>${formatCurrency(Number(item.quantity) * Number(item.price))}</strong></td>
                  </tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
          
          <div class="totals-container">
            <div class="totals">
              <table class="totals-table">
                <tr>
                  <td>Subtotal:</td>
                  <td class="text-right">${formatCurrency(subtotal)}</td>
                </tr>
                <tr>
                  <td>VAT (0%):</td>
                  <td class="text-right">${formatCurrency(0)}</td>
                </tr>
                <tr class="total-row">
                  <td><strong>Total:</strong></td>
                  <td class="text-right"><strong>${formatCurrency(totalAmount)}</strong></td>
                </tr>
                ${
                  purchase.status?.toLowerCase() === "credit"
                    ? `
                <tr class="payment-info">
                  <td>Paid Amount:</td>
                  <td class="text-right status-paid">${formatCurrency(paidAmount)}</td>
                </tr>
                <tr>
                  <td><strong>Remaining:</strong></td>
                  <td class="text-right status-credit"><strong>${formatCurrency(remainingAmount)}</strong></td>
                </tr>
                `
                    : purchase.status?.toLowerCase() === "paid"
                      ? `
                <tr class="payment-info">
                  <td>Paid Amount:</td>
                  <td class="text-right status-paid">${formatCurrency(totalAmount)}</td>
                </tr>
                `
                      : ""
                }
              </table>
            </div>
          </div>
          
          ${
            purchase.notes
              ? `
          <div style="margin-bottom: 0.75rem; padding: 0.5rem; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 0.375rem;">
            <div style="font-weight: 600; margin-bottom: 0.25rem; color: #111827;">Notes:</div>
            <div style="font-size: 0.75rem; color: #4b5563;">${purchase.notes}</div>
          </div>
          `
              : ""
          }
        </div>
        
        <div class="receipt-footer">
          <div class="thank-you">Purchase Invoice</div>
          <div class="footer-note">
            Generated on ${formattedDate} ${formattedTime} | For queries, contact +91 9995442239
          </div>
        </div>
      </div>
      
      <div class="print-buttons no-print">
        <button class="print-button" onclick="window.print()">Print Invoice</button>
        <button class="print-button secondary" onclick="window.close()">Close</button>
      </div>
      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 500);
        };
      </script>
    </body>
    </html>
  `)

  printWindow.document.close()
}
