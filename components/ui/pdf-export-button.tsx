"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Loader2 } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { notifyError, notifySuccess, notifyWarning } from "@/lib/notifications"
import { format } from "date-fns"

interface PdfExportButtonProps {
  data: any[]
  type: "sales" | "purchases" | "products" | "customers"
  currency?: string
  className?: string
  buttonText?: string
}

export function PdfExportButton({
  data,
  type,
  currency = "AED",
  className = "",
  buttonText = "Export PDF",
}: PdfExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false)
  const { toast } = useToast()

  const handleExport = async () => {
    if (isExporting || !data || data.length === 0) {
      notifyError(toast, "There are no records to export to PDF.", "No data to export")
      return
    }

    try {
      setIsExporting(true)

      // Create a simple HTML table for the data
      const tableHTML = generateTableHTML(data, type, currency)

      // Create a new window and write the HTML to it
      const printWindow = window.open("", "_blank")
      if (!printWindow) {
        throw new Error("Could not open print window. Please check your popup blocker settings.")
      }

      printWindow.document.write(`
        <html>
          <head>
            <title>${type.charAt(0).toUpperCase() + type.slice(1)} Report</title>
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
            <h1>${type.charAt(0).toUpperCase() + type.slice(1)} Report</h1>
            <p>Generated on: ${format(new Date(), "PPP")}</p>
            ${tableHTML}
            <div class="summary">
              <p>Total Records: ${data.length}</p>
            </div>
            <div class="footer">
              <p>This report was generated on ${format(new Date(), "PPP p")}.</p>
            </div>
            <button onclick="window.print(); window.close();" style="margin-top: 20px; padding: 10px 15px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">
              Print Report
            </button>
          </body>
        </html>
      `)

      printWindow.document.close()

      notifySuccess(toast, `${type.charAt(0).toUpperCase() + type.slice(1)} report has been generated. Please use the print dialog to save as PDF.`,)
    } catch (error) {
      console.error(`Error exporting ${type} to PDF:`, error)
      notifyError(toast, `Failed to export ${type} to PDF: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      setIsExporting(false)
    }
  }

  // Helper function to generate HTML table based on data type
  const generateTableHTML = (data: any[], type: string, currency: string) => {
    // Format currency helper
    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 2,
      }).format(amount)
    }

    let tableHTML = "<table>"

    // Generate table headers based on type
    if (type === "sales") {
      tableHTML += `
        <tr>
          <th>#</th>
          <th>Customer</th>
          <th>Date</th>
          <th>Amount</th>
          <th>Discount</th>
          <th>Payment Method</th>
          <th>Status</th>
        </tr>
      `

      // Generate table rows
      data.forEach((sale, index) => {
        tableHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${sale.customer_name || "Walk-in Customer"}</td>
            <td>${format(new Date(sale.sale_date), "yyyy-MM-dd")}</td>
            <td>${formatCurrency(Number(sale.total_amount) || 0)}</td>
            <td>${formatCurrency(Number(sale.discount) || 0)}</td>
            <td>${sale.payment_method || "Cash"}</td>
            <td>${sale.status || ""}</td>
          </tr>
        `
      })
    } else if (type === "purchases") {
      tableHTML += `
        <tr>
          <th>#</th>
          <th>Supplier</th>
          <th>Date</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Payment Method</th>
        </tr>
      `

      // Generate table rows
      data.forEach((purchase, index) => {
        tableHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${purchase.supplier || "Unknown Supplier"}</td>
            <td>${purchase.purchase_date ? format(new Date(purchase.purchase_date), "yyyy-MM-dd") : ""}</td>
            <td>${formatCurrency(Number(purchase.total_amount) || 0)}</td>
            <td>${purchase.status || ""}</td>
            <td>${purchase.payment_method || "Cash"}</td>
          </tr>
        `
      })
    } else if (type === "products") {
      tableHTML += `
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Category</th>
          <th>Barcode</th>
          <th>Price</th>
          <th>Wholesale Price</th>
          <th>Stock</th>
        </tr>
      `

      // Generate table rows
      data.forEach((product, index) => {
        const stock = Number(product.stock) || 0
        let stockStatus = "In Stock"
        if (stock <= 0) stockStatus = "Out of Stock"
        else if (stock <= 5) stockStatus = "Low Stock"

        tableHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${product.name || ""}</td>
            <td>${product.category || ""}</td>
            <td>${product.barcode || ""}</td>
            <td>${formatCurrency(Number(product.price) || 0)}</td>
            <td>${formatCurrency(Number(product.wholesale_price) || 0)}</td>
            <td>${stock} (${stockStatus})</td>
          </tr>
        `
      })
    } else if (type === "customers") {
      tableHTML += `
        <tr>
          <th>#</th>
          <th>Name</th>
          <th>Phone</th>
          <th>Email</th>
          <th>Address</th>
        </tr>
      `

      // Generate table rows
      data.forEach((customer, index) => {
        tableHTML += `
          <tr>
            <td>${index + 1}</td>
            <td>${customer.name || ""}</td>
            <td>${customer.phone || ""}</td>
            <td>${customer.email || ""}</td>
            <td>${customer.address || ""}</td>
          </tr>
        `
      })
    }

    tableHTML += "</table>"
    return tableHTML
  }

  return (
    <Button
      onClick={handleExport}
      className={`flex items-center gap-2 ${className}`}
      disabled={isExporting || !data || data.length === 0}
    >
      {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      <span>{buttonText}</span>
    </Button>
  )
}
