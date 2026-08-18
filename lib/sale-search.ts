/**
 * Hybrid & Semantic Sales Search Engine
 * Matches sales based on:
 * - Sale ID (#102, 102, sale 102, order 102)
 * - Customer Details (Name, Phone, Email, Address, City, State, Pincode, Walk-in)
 * - Staff / Salesperson Name
 * - Payment Method (Cash, Card, UPI, Bank Transfer, Split, Credit, Online, GooglePay, PhonePe, Paytm, etc.)
 * - Payment Status & Financial State (Paid, Credit, Pending, Partial, Completed, Cancelled, Unpaid, Outstanding, Due, Cleared)
 * - Delivery & Shipping Status (Pickup, Pending, Packed, Shipped, In transit, Delivered, Returned, Failed, Courier Name, Tracking ID)
 * - E-Commerce External Order ID & Source (Ecom, Ecommerce, POS, Order ID)
 * - Amounts (Total Amount, Received Amount, Balance Amount, Cost, Discount)
 * - Sale Dates & Time Expressions (YYYY-MM-DD, Month Names, Today, Yesterday)
 * - Items & Products/Services Summary (Product Name, Service Name, Category, Barcode, SKU, Notes)
 * - Multi-token semantic matching (every query token or synonym must match at least one sale attribute)
 */

export function matchSaleSemantic(sale: any, query: string): boolean {
  if (!query || !query.trim()) return true

  const normalizedQuery = query.toLowerCase().trim()
  const tokens = normalizedQuery.split(/\s+/).filter(Boolean)

  if (tokens.length === 0) return true

  // 1. Build comprehensive text & numeric corpus for this sale
  const corpusParts: string[] = []

  // Sale ID & External IDs
  if (sale.id != null) {
    const idStr = String(sale.id)
    corpusParts.push(idStr, `#${idStr}`, `sale #${idStr}`, `sale ${idStr}`, `order #${idStr}`, `order ${idStr}`)
  }
  if (sale.external_order_id) {
    corpusParts.push(String(sale.external_order_id).toLowerCase())
  }
  if (sale.tracking_id) {
    corpusParts.push(String(sale.tracking_id).toLowerCase())
  }
  if (sale.source) {
    const src = String(sale.source).toLowerCase()
    corpusParts.push(src)
    if (src === "ecommerce") corpusParts.push("ecom", "online", "web")
  }

  // Customer Information
  const custName = sale.customer_name || sale.customer_name_override
  if (custName) {
    corpusParts.push(String(custName).toLowerCase())
  } else {
    corpusParts.push("walk-in", "walkin", "direct", "cash customer")
  }

  const custPhone = sale.customer_phone || sale.customer_phone_override
  if (custPhone) corpusParts.push(String(custPhone).toLowerCase())
  if (sale.customer_email) corpusParts.push(String(sale.customer_email).toLowerCase())
  if (sale.shipping_address || sale.customer_address) {
    corpusParts.push(String(sale.shipping_address || sale.customer_address).toLowerCase())
  }
  if (sale.city) corpusParts.push(String(sale.city).toLowerCase())
  if (sale.state) corpusParts.push(String(sale.state).toLowerCase())
  if (sale.pincode) corpusParts.push(String(sale.pincode).toLowerCase())

  // Staff & User Info
  if (sale.staff_name) corpusParts.push(String(sale.staff_name).toLowerCase())
  if (sale.created_by_name) corpusParts.push(String(sale.created_by_name).toLowerCase())

  // Status & Payment Status Logic
  const rawStatus = (sale.status || "").toLowerCase()
  const rawPaymentStatus = (sale.payment_status || "").toLowerCase()
  if (rawStatus) corpusParts.push(rawStatus)
  if (rawPaymentStatus) corpusParts.push(rawPaymentStatus)

  // Derived Financial / Payment Status aliases
  const totalAmt = Number(sale.total_amount || 0)
  const receivedAmt =
    sale.payment_status === "Paid" || sale.payment_status === "Completed"
      ? totalAmt
      : Number(sale.received_amount || 0)
  const balanceAmt = totalAmt - receivedAmt

  if (rawStatus === "cancelled" || rawStatus === "canceled") {
    corpusParts.push("cancelled", "canceled", "void", "refunded")
  } else if (rawPaymentStatus === "paid" || rawPaymentStatus === "completed" || (totalAmt > 0 && balanceAmt <= 0)) {
    corpusParts.push("paid", "completed", "cleared", "full paid", "settled", "paid in full", "no balance")
  } else if (rawPaymentStatus === "credit" || rawPaymentStatus === "partial" || balanceAmt > 0) {
    corpusParts.push("credit", "pending", "unpaid", "due", "outstanding", "balance", "partial", "partially paid", "owing")
  }

  // Payment Method & Aliases
  if (sale.payment_method) {
    const pm = String(sale.payment_method).toLowerCase()
    corpusParts.push(pm)
    if (pm.includes("upi")) corpusParts.push("gpay", "phonepe", "paytm", "online payment")
    if (pm.includes("card")) corpusParts.push("credit card", "debit card", "pos card")
    if (pm.includes("cash")) corpusParts.push("cash payment", "hand cash")
    if (pm.includes("bank") || pm.includes("transfer")) corpusParts.push("neft", "rtgs", "imps", "online transfer")
  }

  // Delivery & Fulfillment Status
  if (sale.delivery_status) {
    const ds = String(sale.delivery_status).toLowerCase()
    corpusParts.push(ds)
    if (ds === "pickup") corpusParts.push("store pickup", "self pickup", "takeaway")
    if (ds === "shipped" || ds === "in transit" || ds === "packed")
      corpusParts.push("delivery", "shipping", "courier", "dispatch", "dispatched")
    if (ds === "delivered") corpusParts.push("delivered", "completed delivery", "received by customer")
    if (ds === "returned") corpusParts.push("returned", "return", "rto")
  }
  if (sale.courier_partner_name || sale.courier_name) {
    corpusParts.push(String(sale.courier_partner_name || sale.courier_name).toLowerCase())
  }
  if (sale.fulfillment_type) {
    corpusParts.push(String(sale.fulfillment_type).toLowerCase())
  }

  // Amounts
  const amounts = [totalAmt, receivedAmt, balanceAmt]
  if (sale.discount_amount != null) amounts.push(Number(sale.discount_amount))
  if (sale.total_cost != null) amounts.push(Number(sale.total_cost))

  for (const amt of amounts) {
    if (!isNaN(amt)) {
      corpusParts.push(String(amt))
      corpusParts.push(amt.toFixed(2))
      corpusParts.push(String(Math.floor(amt)))
    }
  }

  // Sale Date Expressions
  if (sale.sale_date) {
    try {
      const d = new Date(sale.sale_date)
      if (!isNaN(d.getTime())) {
        const yyyyMmDd = d.toISOString().split("T")[0]
        corpusParts.push(yyyyMmDd)

        const monthName = d.toLocaleString("en-US", { month: "long" }).toLowerCase()
        const monthShort = d.toLocaleString("en-US", { month: "short" }).toLowerCase()
        corpusParts.push(monthName, monthShort, `${monthName} ${d.getFullYear()}`, `${monthShort} ${d.getFullYear()}`)

        // Relative date terms
        const today = new Date()
        if (d.toDateString() === today.toDateString()) {
          corpusParts.push("today")
        }
        const yesterday = new Date(today)
        yesterday.setDate(today.getDate() - 1)
        if (d.toDateString() === yesterday.toDateString()) {
          corpusParts.push("yesterday")
        }
      }
    } catch {
      // fallback for unparseable dates
      corpusParts.push(String(sale.sale_date).toLowerCase())
    }
  }

  // Items Summary / Products & Services
  if (sale.items_summary) {
    corpusParts.push(String(sale.items_summary).toLowerCase())
  }
  if (Array.isArray(sale.items)) {
    for (const item of sale.items) {
      if (item.product_name || item.name || item.title)
        corpusParts.push(String(item.product_name || item.name || item.title).toLowerCase())
      if (item.service_name) corpusParts.push(String(item.service_name).toLowerCase())
      if (item.variant_name) corpusParts.push(String(item.variant_name).toLowerCase())
      if (item.category || item.product_category || item.service_category)
        corpusParts.push(String(item.category || item.product_category || item.service_category).toLowerCase())
      if (item.barcode) corpusParts.push(String(item.barcode).toLowerCase())
      if (item.sku) corpusParts.push(String(item.sku).toLowerCase())
      if (item.notes) corpusParts.push(String(item.notes).toLowerCase())
    }
  }

  // Notes & Remarks
  if (sale.notes) corpusParts.push(String(sale.notes).toLowerCase())
  if (sale.remarks) corpusParts.push(String(sale.remarks).toLowerCase())

  // Combine corpus into single text string
  const fullText = corpusParts.join(" ")

  // Multi-token Semantic Match Rule:
  // Every token in the search query MUST match at least one part of the corpus
  return tokens.every((token) => fullText.includes(token))
}

/**
 * Filter & Sort sales using Hybrid Semantic Search
 */
export function filterSalesSemantic(sales: any[], query: string): any[] {
  if (!query || !query.trim()) return sales

  const matched = sales.filter((s) => matchSaleSemantic(s, query))
  const normalizedQuery = query.toLowerCase().trim()

  // Score relevance so exact ID, customer, order number, or product matches appear first
  return matched.sort((a, b) => {
    const aIdStr = String(a.id)
    const bIdStr = String(b.id)

    const aCust = (a.customer_name || a.customer_name_override || "").toLowerCase()
    const bCust = (b.customer_name || b.customer_name_override || "").toLowerCase()

    const aExt = (a.external_order_id || "").toLowerCase()
    const bExt = (b.external_order_id || "").toLowerCase()

    // 1. Exact ID match
    const aExactId = aIdStr === normalizedQuery || `#${aIdStr}` === normalizedQuery
    const bExactId = bIdStr === normalizedQuery || `#${bIdStr}` === normalizedQuery
    if (aExactId && !bExactId) return -1
    if (!aExactId && bExactId) return 1

    // 2. Exact Customer or Order ID match
    const aExactCust = aCust === normalizedQuery || aExt === normalizedQuery
    const bExactCust = bCust === normalizedQuery || bExt === normalizedQuery
    if (aExactCust && !bExactCust) return -1
    if (!aExactCust && bExactCust) return 1

    // 3. Customer name starts with search term
    const aStartsCust = aCust.startsWith(normalizedQuery)
    const bStartsCust = bCust.startsWith(normalizedQuery)
    if (aStartsCust && !bStartsCust) return -1
    if (!aStartsCust && bStartsCust) return 1

    return 0
  })
}
