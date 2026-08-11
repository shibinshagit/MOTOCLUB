"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"

export interface EcommerceOrderItemInput {
  productId: number
  variantId?: number | null
  productName?: string
  quantity: number
  price: number
}

export interface EcommerceOrderPayload {
  orderId?: string | number
  orderNumber: string
  userId?: string | null
  customerName: string
  customerEmail?: string | null
  customerPhone?: string | null
  deliveryAddress?: string | null
  subtotal: number
  deliveryFee?: number
  totalAmount: number
  paymentMethod: string
  paymentStatus: string // 'pending', 'paid', etc.
  deliveryStatus?: string // 'order_received', 'pending', 'shipping', 'delivered', etc.
  items?: EcommerceOrderItemInput[]
}

/**
 * Maps Ecommerce payment method to Accounting display format
 */
function normalizePaymentMethod(method: string): string {
  const m = (method || "").toLowerCase().trim()
  if (m === "cod" || m === "cash_on_delivery" || m === "cash on delivery") {
    return "Cash on Delivery"
  }
  if (m === "razorpay") return "Razorpay"
  if (m === "upi") return "UPI"
  if (m === "card" || m === "credit_card" || m === "debit_card") return "Card"
  if (m === "net_banking" || m === "netbanking") return "Net Banking"
  return method || "Online Payment"
}

/**
 * Maps Ecommerce order delivery status to Accounting delivery status
 */
function mapDeliveryStatus(ecomStatus: string): string {
  const s = (ecomStatus || "").toLowerCase().trim()
  if (s === "pending" || s === "order_received" || s === "order received" || !s) return "Paid"
  if (s === "confirmed" || s === "paid") return "Paid"
  if (s === "packed") return "Packed"
  if (s === "shipping" || s === "shipped" || s === "sent" || s === "in_transit" || s === "in transit") return "Shipping"
  if (s === "delivered") return "Delivered"
  if (s === "returned" || s === "return") return "Returned"
  if (s === "cancelled" || s === "canceled") return "Cancelled"
  return "Paid"
}

/**
 * Server action to synchronize an Ecommerce order into an Accounting Sale idempotently.
 */
export async function syncEcommerceOrder(
  orderIdentifier: string | number,
  payload?: EcommerceOrderPayload,
  targetDeviceId?: number
) {
  noStore()
  try {
    let orderNumber = typeof orderIdentifier === "string" ? orderIdentifier : String(orderIdentifier)
    if (!orderNumber.startsWith("MC-") && !isNaN(Number(orderIdentifier))) {
      orderNumber = `MC-${orderIdentifier}`
    }

    // 1. IDEMPOTENCY CHECK
    // Check if an Accounting Sale already exists for this Ecommerce external order ID
    const existingSales = await sql`
      SELECT id, status, payment_status, delivery_status, total_amount, received_amount, balance_amount
      FROM sales
      WHERE external_order_id = ${orderNumber} AND source = 'ECOMMERCE'
      LIMIT 1
    `

    if (existingSales.length > 0) {
      const existingSale = existingSales[0]
      // Ensure sync status in orders table is updated
      await sql`
        UPDATE orders
        SET sync_status = 'SYNCED', synced_at = NOW(), synced_sale_id = ${existingSale.id}
        WHERE order_number = ${orderNumber} OR id::text = ${String(orderIdentifier)}
      `
      return {
        success: true,
        saleId: existingSale.id,
        externalOrderId: orderNumber,
        isDuplicate: true,
        message: `Order ${orderNumber} is already synchronized (Sale #${existingSale.id})`,
        data: existingSale,
      }
    }

    // 2. FETCH ECOMMERCE ORDER DETAILS IF PAYLOAD NOT FULLY PROVIDED
    let order: any = null
    let orderItems: any[] = []

    if (payload && payload.items && payload.items.length > 0) {
      order = {
        id: payload.orderId,
        order_number: payload.orderNumber || orderNumber,
        user_id: payload.userId,
        customer_name: payload.customerName,
        customer_email: payload.customerEmail,
        customer_phone: payload.customerPhone,
        delivery_address: payload.deliveryAddress,
        subtotal: payload.subtotal,
        delivery_fee: payload.deliveryFee || 0,
        total_amount: payload.totalAmount,
        payment_method: payload.paymentMethod,
        payment_status: payload.paymentStatus,
        status: payload.deliveryStatus || "pending",
        created_at: new Date(),
      }
      orderItems = payload.items.map((i) => ({
        menu_item_id: i.productId,
        variant_id: i.variantId,
        quantity: i.quantity,
        unit_price: i.price,
      }))
    } else {
      // Query from orders and order_items table in database
      const orderRows = await sql`
        SELECT * FROM orders 
        WHERE order_number = ${orderNumber} 
           OR order_number = ${String(orderIdentifier)}
           OR id::text = ${String(orderIdentifier)}
        LIMIT 1
      `
      if (orderRows.length === 0) {
        return {
          success: false,
          message: `Ecommerce order '${orderIdentifier}' not found in database.`,
        }
      }
      order = orderRows[0]
      orderNumber = order.order_number || orderNumber

      const itemRows = await sql`
        SELECT * FROM order_items WHERE order_id = ${order.id}
      `
      orderItems = itemRows
    }

    if (orderItems.length === 0) {
      return {
        success: false,
        message: `Cannot sync order ${orderNumber}: No items found in order.`,
      }
    }

    // 3. RESOLVE OR CREATE CUSTOMER
    let resolvedCustomerId: number | null = null
    const orderCustName = (order.customer_name || "").trim()
    const cleanPhone = (order.customer_phone || "").replace(/\D/g, "")
    const normalizedPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone

    if (normalizedPhone) {
      const custCheck = await sql`
        SELECT id, name FROM customers 
        WHERE RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 10) = ${normalizedPhone}
        ORDER BY id ASC
      `
      if (custCheck.length > 0) {
        const exactMatch = custCheck.find(
          (c: any) => c.name.toLowerCase().trim() === orderCustName.toLowerCase()
        )
        if (exactMatch) {
          resolvedCustomerId = exactMatch.id
        } else if (!orderCustName) {
          resolvedCustomerId = custCheck[0].id
        }
      }
    }

    if (!resolvedCustomerId && order.customer_email) {
      const emailCheck = await sql`
        SELECT id, name FROM customers 
        WHERE LOWER(email) = LOWER(${order.customer_email})
        LIMIT 1
      `
      if (emailCheck.length > 0) {
        const exactMatch = emailCheck.find(
          (c: any) => c.name.toLowerCase().trim() === orderCustName.toLowerCase()
        )
        if (exactMatch) {
          resolvedCustomerId = exactMatch.id
        } else if (!orderCustName) {
          resolvedCustomerId = emailCheck[0].id
        }
      }
    }

    // If no existing customer matched, create a dedicated customer record
    if (!resolvedCustomerId && orderCustName) {
      try {
        const newCust = await sql`
          INSERT INTO customers (
            name, phone, email, address, created_at
          ) VALUES (
            ${orderCustName},
            ${order.customer_phone || null},
            ${order.customer_email || null},
            ${order.delivery_address || null},
            NOW()
          )
          RETURNING id
        `
        if (newCust.length > 0) {
          resolvedCustomerId = newCust[0].id
        }
      } catch (custErr) {
        console.error("Error creating ecommerce customer record:", custErr)
      }
    }

    if (!resolvedCustomerId && order.customer_name) {
      // Create Customer in Accounting system
      const newCust = await sql`
        INSERT INTO customers (
          name,
          email,
          phone,
          address,
          created_at
        ) VALUES (
          ${order.customer_name},
          ${order.customer_email || null},
          ${order.customer_phone || null},
          ${order.delivery_address || null},
          NOW()
        )
        RETURNING id
      `
      resolvedCustomerId = newCust[0].id
    }

    // 4. RESOLVE PRODUCTS & VARIANTS & VERIFY AVAILABILITY
    let totalCost = 0
    const processedItems: Array<{
      productId: number
      variantId: number | null
      quantity: number
      price: number
      cost: number
    }> = []

    for (const item of orderItems) {
      const productId = Number(item.menu_item_id || item.product_id)
      const variantId = item.variant_id && Number(item.variant_id) !== productId ? Number(item.variant_id) : null

      const prodRows = await sql`
        SELECT id, price, wholesale_price, name FROM products WHERE id = ${productId}
      `
      if (prodRows.length === 0) {
        await sql`
          UPDATE orders
          SET sync_status = 'FAILED'
          WHERE order_number = ${orderNumber} OR id = ${order.id}
        `
        return {
          success: false,
          message: `Sync failed: Product ID ${productId} (${item.menu_item_name || "Unknown"}) not found in Accounting catalog.`,
        }
      }

      const prod = prodRows[0]
      const price = Number(item.unit_price || item.price || prod.price) || 0
      const quantity = Number(item.quantity) || 1
      const costPrice = Number(prod.wholesale_price) || 0

      totalCost += costPrice * quantity
      processedItems.push({
        productId,
        variantId,
        quantity,
        price,
        cost: costPrice,
      })
    }

    // 5. PAYMENT & FINANCIAL CALCULATIONS
    const totalAmount = Number(order.total_amount || order.final_total) || 0
    const courierFee = Number(order.delivery_fee) || 0
    const rawPaymentMethod = order.payment_method || "cod"
    const paymentMethodDisplay = normalizePaymentMethod(rawPaymentMethod)
    const isCOD = rawPaymentMethod.toLowerCase().includes("cod") || rawPaymentMethod.toLowerCase().includes("cash")
    const isPaidVerified = order.payment_status?.toLowerCase() === "paid" || order.payment_status?.toLowerCase() === "completed"

    let paymentStatus = "Pending"
    let receivedAmount = 0
    let balanceAmount = totalAmount

    if (!isCOD && isPaidVerified) {
      paymentStatus = "Paid"
      receivedAmount = totalAmount
      balanceAmount = 0
    }

    // 6. DELIVERY STATUS
    const mappedDelivery = mapDeliveryStatus(order.status || order.delivery_status)

    // 7. DEVICE SELECTION (Default: targetDeviceId or DEFAULT_ECOMMERCE_DEVICE_ID or 1)
    const deviceId = targetDeviceId || Number(process.env.DEFAULT_ECOMMERCE_DEVICE_ID) || 1

    // 8. CREATE ACCOUNTING SALE RECORD
    const saleRows = await sql`
      INSERT INTO sales (
        customer_id,
        total_amount,
        total_cost,
        status,
        payment_status,
        device_id,
        received_amount,
        balance_amount,
        advance_amount,
        sale_type,
        payment_method,
        source,
        external_order_id,
        ecommerce_customer_id,
        delivery_status,
        fulfillment_type,
        courier_paid_extra,
        customer_name_override,
        customer_phone_override,
        customer_address,
        shipping_address,
        created_at,
        updated_at
      ) VALUES (
        ${resolvedCustomerId},
        ${totalAmount},
        ${totalCost},
        ${paymentStatus === "Paid" ? "Completed" : "Pending"},
        ${paymentStatus},
        ${deviceId},
        ${receivedAmount},
        ${balanceAmount},
        0,
        'product',
        ${paymentMethodDisplay},
        'ECOMMERCE',
        ${orderNumber},
        ${order.user_id ? String(order.user_id) : null},
        ${mappedDelivery},
        'ship',
        ${courierFee},
        ${order.customer_name},
        ${order.customer_phone || null},
        ${order.delivery_address || null},
        ${order.delivery_address || null},
        ${order.created_at || new Date()},
        NOW()
      )
      RETURNING id
    `

    const saleId = saleRows[0].id

    // 9. INSERT SALE ITEMS & DEDUCT INVENTORY (EXACTLY ONCE)
    const { updateProductStock } = await import("./sale-actions")

    for (const item of processedItems) {
      await sql`
        INSERT INTO sale_items (
          sale_id,
          product_id,
          product_variant_id,
          quantity,
          price,
          cost
        ) VALUES (
          ${saleId},
          ${item.productId},
          ${item.variantId},
          ${item.quantity},
          ${item.price},
          ${item.cost}
        )
      `

      // Safely update product & batch stock for the target device
      try {
        await updateProductStock(
          item.productId,
          item.variantId || null,
          null,
          item.quantity,
          "subtract",
          deviceId
        )
      } catch (stockErr) {
        console.error(`Warning: updateProductStock failed for product ${item.productId}:`, stockErr)
      }

      // Record stock history log entry
      await sql`
        INSERT INTO product_stock_history (
          product_id,
          device_id,
          product_variant_id,
          quantity,
          quantity_change,
          type,
          change_type,
          reference_id,
          reference_type,
          notes,
          created_by,
          created_at
        ) VALUES (
          ${item.productId},
          ${deviceId},
          ${item.variantId || null},
          ${-item.quantity},
          ${-item.quantity},
          'sale',
          'sale',
          ${saleId},
          'sale',
          ${`Ecommerce Order ${orderNumber} (Sale #${saleId})`},
          ${deviceId},
          NOW()
        )
      `
    }

    // 10. UPDATE ECOMMERCE ORDER SYNC STATUS
    if (order.id) {
      await sql`
        UPDATE orders
        SET sync_status = 'SYNCED',
            synced_at = NOW(),
            synced_sale_id = ${saleId}
        WHERE id = ${order.id} OR order_number = ${orderNumber}
      `
    }

    try {
      revalidatePath("/staff/dashboard")
      revalidatePath("/admin/dashboard")
    } catch {}

    return {
      success: true,
      saleId,
      externalOrderId: orderNumber,
      isDuplicate: false,
      message: `Successfully synchronized Ecommerce Order ${orderNumber} to Accounting Sale #${saleId}`,
    }
  } catch (error: any) {
    console.error("syncEcommerceOrder Error:", error)

    try {
      if (orderIdentifier) {
        await sql`
          UPDATE orders
          SET sync_status = 'FAILED'
          WHERE order_number = ${String(orderIdentifier)} OR id::text = ${String(orderIdentifier)}
        `
      }
    } catch {}

    return {
      success: false,
      message: error.message || "Failed to synchronize Ecommerce order",
    }
  }
}

/**
 * Automatically syncs all pending/unsynced Ecommerce orders into Accounting sales.
 */
export async function autoSyncPendingEcommerceOrders(targetDeviceId?: number) {
  try {
    const unsyncedOrders = await sql`
      SELECT order_number, id FROM orders 
      WHERE sync_status IS NULL OR sync_status = 'PENDING' OR sync_status = 'FAILED'
      ORDER BY id ASC
      LIMIT 50
    `

    if (unsyncedOrders.length === 0) return { syncedCount: 0 }

    let count = 0
    for (const ord of unsyncedOrders) {
      const res = await syncEcommerceOrder(ord.order_number || ord.id, undefined, targetDeviceId)
      if (res.success) count++
    }

    return { syncedCount: count }
  } catch (err) {
    console.error("autoSyncPendingEcommerceOrders Error:", err)
    return { syncedCount: 0 }
  }
}
