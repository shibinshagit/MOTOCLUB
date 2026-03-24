"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSaleDetails } from "@/app/actions/sale-actions"
import { Loader2, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { printInvoiceById } from "@/lib/receipt-utils"

export default function SaleInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const saleId = Number(params.id)

  const [sale, setSale] = useState<any>(null)
  const [items, setItems] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currency] = useState<string>("AED") // Default to AED
  const [companyInfo] = useState<any>({
    name: "Moto Club",
    address: "kottakkal, malappuram, kerala, india",
    phone: "+91 9995442239",
  })

  const [receivedAmount, setReceivedAmount] = useState(0)
  const [staffName, setStaffName] = useState("")

  useEffect(() => {
    const fetchSaleDetails = async () => {
      if (!saleId) return

      try {
        setIsLoading(true)
        const result = await getSaleDetails(Number(params.id))

        if (result.success) {
          console.log("Sale details:", result.data.sale)
          console.log("Items:", result.data.items)

          setSale(result.data.sale)
          setItems(result.data.items)
          setReceivedAmount(Number(result.data.sale.received_amount) || 0)

          // Set staff name if available
          if (result.data.sale.staff_name) {
            setStaffName(result.data.sale.staff_name)
          }
        } else {
          setError(result.message || "Failed to load sale details")
        }
      } catch (error) {
        console.error("Error fetching sale details:", error)
        setError("An error occurred while loading sale details")
      } finally {
        setIsLoading(false)
      }
    }

    fetchSaleDetails()

    if (saleId) {
      // Use the unified print function and redirect back
      printInvoiceById(saleId, "AED", false)

      // Redirect back to dashboard after a short delay
      setTimeout(() => {
        router.push("/dashboard")
      }, 1000)
    }
  }, [saleId, params.id, router])

  const printReceipt = () => {
    if (!sale || !items.length) return
    printInvoiceById(saleId, "AED", true)
  }

  // Format currency with the device's currency
  const formatCurrency = (amount: number) => {
    return `${currency} ${amount.toFixed(2)}`
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Opening Invoice...</h1>
          <p className="text-gray-600">Please wait while we prepare your invoice for printing.</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Error</h1>
          <p className="mt-2">{error}</p>
        </div>
      </div>
    )
  }

  if (!sale) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Sale Not Found</h1>
        </div>
      </div>
    )
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.price), 0)
  const discount = Number(sale.discount) || 0
  const finalTotal = subtotal - discount

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

  return (
    <div className="bg-gray-100 min-h-screen p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Invoice #{sale.id.toString().padStart(5, "0")}</h1>
          <Button onClick={printReceipt} className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            <span>Print Invoice</span>
          </Button>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md">
          <div className="flex justify-between items-start mb-8">
            <div className="company-info">
              <div className="text-2xl font-bold mb-2">Moto Club</div>
              <div className="text-gray-600">
             office address:
                <br />
                kottakkal, malappuram, kerala, india
                <br />
                Phone: +91 9995442239
              </div>
            </div>
            <div className="logo-container">
              <img
                src="https://res.cloudinary.com/dxishiq9x/image/upload/v1751969415/286709952_155636793670880_4247278441893099316_n_unlqm6.jpg"
                alt="Moto Club"
                className="h-20"
              />
            </div>
          </div>

          <div className="bg-yellow-400 py-2 px-4 text-center text-xl font-bold text-gray-800 uppercase mb-8 border border-gray-800">
            Tax Invoice
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <div>
              <div className="font-semibold text-gray-700 mb-2">Invoice To:</div>
              <div>
                <strong>{sale.customer_name || "Walk-in Customer"}</strong>
                <br />
                {sale.customer_phone && `Phone: ${sale.customer_phone}`}
              </div>
            </div>

            <div>
              <div className="font-semibold text-gray-700 mb-2">Invoice Details:</div>
              <div className="detail-content">
                <table style={{ width: "100%" }}>
                  <tbody>
                    <tr>
                      <td>
                        <strong>Invoice No:</strong>
                      </td>
                      <td>{sale.id}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Date:</strong>
                      </td>
                      <td>{formattedDate}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Time:</strong>
                      </td>
                      <td>{formattedTime}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Status:</strong>
                      </td>
                      <td style={{ color: sale.status === "Credit" ? "#f59e0b" : "#10b981" }}>{sale.status}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Payment:</strong>
                      </td>
                      <td>{sale.payment_method || "Cash"}</td>
                    </tr>
                    <tr>
                      <td>
                        <strong>Staff:</strong>
                      </td>
                      <td>{sale.staff_name || staffName || "N/A"}</td>
                    </tr>
                    {sale.status === "Credit" ? (
                      <>
                        <tr>
                          <td>
                            <strong>Received:</strong>
                          </td>
                          <td>{formatCurrency(receivedAmount)}</td>
                        </tr>
                        <tr>
                          <td>
                            <strong>Remaining:</strong>
                          </td>
                          <td style={{ color: "#ef4444", fontWeight: "bold" }}>
                            {formatCurrency(Math.max(0, finalTotal - receivedAmount))}
                          </td>
                        </tr>
                      </>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="mb-8 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-800 p-2 text-left w-[5%]">#</th>
                  <th className="border border-gray-800 p-2 text-left w-[45%]">Description</th>
                  <th className="border border-gray-800 p-2 text-left w-[15%]">Unit Price</th>
                  <th className="border border-gray-800 p-2 text-left w-[15%]">Quantity</th>
                  <th className="border border-gray-800 p-2 text-right w-[20%]">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td className="border border-gray-800 p-2">{index + 1}</td>
                    <td className="border border-gray-800 p-2">
                      <div className="font-medium">{item.product_name || item.service_name}</div>
                      {item.barcode && <div className="text-xs text-gray-500">SKU: {item.barcode}</div>}
                      {item.notes && <div className="text-xs text-gray-500 italic">Notes: {item.notes}</div>}
                      <div className="text-xs text-blue-600 font-medium">
                        {item.service_name ? "Service" : "Product"}
                      </div>
                    </td>
                    <td className="border border-gray-800 p-2">{formatCurrency(Number(item.price))}</td>
                    <td className="border border-gray-800 p-2">{Number(item.quantity).toFixed(2)}</td>
                    <td className="border border-gray-800 p-2 text-right">
                      {formatCurrency(Number(item.quantity) * Number(item.price))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end mb-8">
            <div className="w-1/2">
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-2">Subtotal:</td>
                    <td className="text-right">{formatCurrency(subtotal)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">Discount:</td>
                    <td className="text-right">{formatCurrency(discount)}</td>
                  </tr>
                  <tr>
                    <td className="py-2">VAT (0%):</td>
                    <td className="text-right">{formatCurrency(0)}</td>
                  </tr>
                  <tr className="border-t-2 border-gray-800">
                    <td className="py-2 font-bold">Total Amount:</td>
                    <td className="text-right font-bold">{formatCurrency(finalTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="text-center text-gray-500 text-sm">Invoice #{sale.id}</div>
        </div>

        <div className="bg-gray-50 p-4 mt-6 rounded-lg text-center border-t border-gray-800">
          <div className="font-semibold mb-1">Thank You For Your Business!</div>
          <div className="text-sm text-gray-500">
            This is a computer-generated invoice and does not require a signature.
          </div>
        </div>
      </div>
    </div>
  )
}
