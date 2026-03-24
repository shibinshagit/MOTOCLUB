"use client"

// Function to print a service receipt
export function printServiceReceipt(sale: any, items: any[], currency = "AED", businessInfo: any = {}) {
  if (!sale || !items.length) return

  // Check if we're in a browser environment
  if (typeof window === "undefined" || typeof document === "undefined") {
    console.warn("Cannot print receipt: Not in browser environment")
    return
  }

  console.log("Printing service receipt with sale data:", sale)
  console.log("Service items:", items)

  // Use the company info
  const business = {
    name: "Moto Club",
    address: "kottakkal, malappuram, kerala, india",
    phone: "+91 9995442239",
    ...businessInfo,
  }

  // Create a new window for printing
  const printWindow = window.open("", "_blank")
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

  // Get discount from sale object
  let discount = 0
  if (sale.discount !== undefined && sale.discount !== null) {
    discount = Number(sale.discount)
  }

  // Calculate final total
  const finalTotal = subtotal - discount

  // Get received amount from sale object
  let receivedAmount = 0
  if (sale.received_amount !== undefined && sale.received_amount !== null) {
    receivedAmount = Number(sale.received_amount)
  } else if (sale.status === "Credit") {
    receivedAmount = 0
  } else {
    receivedAmount = finalTotal
  }

  const remainingAmount = Math.max(0, finalTotal - receivedAmount)

  // Format currency
  const formatCurrency = (amount: number) => {
    return `${currency} ${amount.toFixed(2)}`
  }

  // Create receipt content
  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
      <title>Service Invoice - Moto Club</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap');
        
        @media print {
          body {
            width: 210mm;
            height: 297mm;
            margin: 0;
            padding: 0;
          }
          @page {
            size: A4;
            margin: 0.5cm;
          }
          .no-print {
            display: none !important;
          }
          
          table, th, td {
            border-color: #000 !important;
            border-width: 1px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .invoice-title, th {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          .totals-container {
            page-break-inside: avoid !important;
          }
          
          .invoice-footer {
            page-break-inside: avoid !important;
          }
          
          tr {
            page-break-inside: avoid !important;
          }
        }
        
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: 'Poppins', sans-serif;
          background: #f9fafb;
          color: #1f2937;
          line-height: 1.6;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        
        .invoice-container {
          max-width: 210mm;
          margin: 0 auto;
          background: #ffffff;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          border-radius: 8px;
          overflow: hidden;
        }
        
        .invoice-header {
          background: #f9fafb;
          padding: 2rem;
          border-bottom: 1px solid #000;
        }
        
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .company-info {
          display: flex;
          flex-direction: column;
        }
        
        .company-name {
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
          margin-bottom: 0.5rem;
        }
        
        .company-details {
          font-size: 0.875rem;
          color: #4b5563;
        }
        
        .logo-container {
          text-align: right;
        }
        
        .logo {
          max-width: 150px;
          height: auto;
        }
        
        .invoice-title {
          margin-top: 1.5rem;
          padding: 0.75rem 2rem;
          background: #10b981;
          color: #ffffff;
          font-size: 1.25rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 1px;
          text-align: center;
          border: 1px solid #000;
        }
        
        .invoice-body {
          padding: 2rem;
        }
        
        .invoice-details {
          display: flex;
          justify-content: space-between;
          margin-bottom: 2rem;
        }
        
        .invoice-to, .invoice-info {
          width: 48%;
        }
        
        .detail-title {
          font-size: 1rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.5rem;
          text-transform: uppercase;
        }
        
        .detail-content {
          font-size: 0.875rem;
          color: #4b5563;
        }
        
        .invoice-table-container {
          margin-bottom: 2rem;
          overflow-x: auto;
        }
        
        .invoice-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.875rem;
          border: 1px solid #000;
        }
        
        .invoice-table th {
          background: #f3f4f6;
          padding: 0.75rem 1rem;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border: 1px solid #000;
        }
        
        .invoice-table td {
          padding: 0.75rem 1rem;
          border: 1px solid #000;
          color: #4b5563;
        }
        
        .text-right {
          text-align: right;
        }
        
        .totals-container {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 2rem;
          page-break-inside: avoid;
        }
        
        .totals {
          width: 40%;
        }
        
        .totals-table {
          width: 100%;
          font-size: 0.875rem;
          border-collapse: collapse;
        }
        
        .totals-table td {
          padding: 0.5rem 0;
          color: #4b5563;
        }
        
        .totals-table .total-row td {
          padding-top: 1rem;
          font-weight: 700;
          font-size: 1rem;
          color: #111827;
          border-top: 2px solid #000;
        }
        
        .invoice-footer {
          background: #f9fafb;
          padding: 1.5rem 2rem;
          text-align: center;
          border-top: 1px solid #000;
          page-break-inside: avoid;
        }
        
        .thank-you {
          font-weight: 600;
          color: #111827;
          margin-bottom: 0.5rem;
        }
        
        .footer-note {
          font-size: 0.75rem;
          color: #6b7280;
        }
        
        .print-button {
          display: block;
          margin: 1rem auto;
          padding: 0.5rem 1rem;
          background: #10b981;
          color: #ffffff;
          border: none;
          border-radius: 0.25rem;
          font-family: 'Poppins', sans-serif;
          font-size: 0.875rem;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .print-button:hover {
          background: #059669;
        }
        
        .barcode {
          text-align: center;
          margin-top: 1rem;
          font-size: 0.75rem;
          color: #6b7280;
        }
        
        .service-description {
          font-weight: 500;
        }
        
        .service-notes {
          font-size: 0.75rem;
          color: #6b7280;
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="invoice-container">
        <div class="invoice-header">
          <div class="header-content">
            <div class="company-info">
              <div class="company-name">Moto Club</div>
              <div class="company-details">
                kottakkal, malappuram, kerala, india<br>
                Phone: +91 9995442239
              </div>
            </div>
            <div class="logo-container">
              <img src="https://www.opencoders.icu/oc.png" alt="Moto Club" class="logo">
            </div>
          </div>
          <div class="invoice-title">
            Service Invoice
          </div>
        </div>
        
        <div class="invoice-body">
          <div class="invoice-details">
            <div class="invoice-to">
              <div class="detail-title">Service For:</div>
              <div class="detail-content">
                <strong>${sale.customer_name || "Walk-in Customer"}</strong><br>
                ${sale.customer_phone ? `Phone: ${sale.customer_phone}<br>` : ""}
              </div>
            </div>
            
            <div class="invoice-info">
              <div class="detail-title">Service Details:</div>
              <div class="detail-content">
                <table style="width: 100%;">
                  <tr>
                    <td><strong>Invoice No:</strong></td>
                    <td>${sale.id}</td>
                  </tr>
                  <tr>
                    <td><strong>Date:</strong></td>
                    <td>${formattedDate}</td>
                  </tr>
                  <tr>
                    <td><strong>Time:</strong></td>
                    <td>${formattedTime}</td>
                  </tr>
                  <tr>
                    <td><strong>Status:</strong></td>
                    <td style="color: ${sale.status === "Credit" ? "#f59e0b" : sale.status === "Completed" ? "#10b981" : "#ef4444"};">${sale.status}</td>
                  </tr>
                  <tr>
                    <td><strong>Payment:</strong></td>
                    <td>${sale.payment_method || "Cash"}</td>
                  </tr>
                  ${
                    sale.status === "Credit"
                      ? `
                  <tr>
                    <td><strong>Received:</strong></td>
                    <td>${formatCurrency(receivedAmount)}</td>
                  </tr>
                  <tr>
                    <td><strong>Remaining:</strong></td>
                    <td style="color: #ef4444; font-weight: bold;">${formatCurrency(remainingAmount)}</td>
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
                  <th style="width: 5%;">#</th>
                  <th style="width: 40%;">Service Description</th>
                  <th style="width: 15%;">Unit Price</th>
                  <th style="width: 15%;">Quantity</th>
                  <th style="width: 25%;" class="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${items
                  .map(
                    (item, index) => `
                  <tr>
                    <td>${index + 1}</td>
                    <td>
                      <div class="service-description">${item.service_name}</div>
                      ${item.notes ? `<div class="service-notes">Notes: ${item.notes}</div>` : ""}
                    </td>
                    <td>${formatCurrency(Number(item.price))}</td>
                    <td>${Number(item.quantity).toFixed(0)}</td>
                    <td class="text-right">${formatCurrency(Number(item.quantity) * Number(item.price))}</td>
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
                  <td>Discount:</td>
                  <td class="text-right">${formatCurrency(discount)}</td>
                </tr>
                <tr>
                  <td>VAT (0%):</td>
                  <td class="text-right">${formatCurrency(0)}</td>
                </tr>
                <tr class="total-row">
                  <td>Total Amount:</td>
                  <td class="text-right">${formatCurrency(finalTotal)}</td>
                </tr>
                ${
                  sale.status === "Credit"
                    ? `
                <tr style="color: #10b981;">
                  <td>Received:</td>
                  <td class="text-right">${formatCurrency(receivedAmount)}</td>
                </tr>
                <tr style="color: #ef4444; font-weight: bold;">
                  <td>Remaining:</td>
                  <td class="text-right">${formatCurrency(remainingAmount)}</td>
                </tr>
                `
                    : ""
                }
              </table>
            </div>
          </div>
          
          <div class="barcode">
            Service Invoice #${sale.id}
          </div>
        </div>
        
        <div class="invoice-footer">
          <div class="thank-you">Thank You For Your Business!</div>
          <div class="footer-note">
            This is a computer-generated service invoice and does not require a signature.
          </div>
        </div>
      </div>
      
      <button class="print-button no-print" onclick="window.print()">Print Service Invoice</button>

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
