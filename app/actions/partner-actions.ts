"use server"

import { sql } from "@/lib/db"

export async function getPartnerSales(partnerId: number) {
  try {
    const sales = await sql`
      SELECT 
        s.id,
        s.total_amount,
        s.status,
        s.payment_status,
        s.sale_date,
        s.payment_method,
        s.fulfillment_type,
        s.delivery_status,
        s.tracking_id,
        s.shipping_address,
        s.expense_courier,
        s.weight_kg,
        s.courier_service_name,
        s.shipping_date,
        s.created_at,
        COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name,
        COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
    `

    let replacementShipments: any[] = []
    try {
      replacementShipments = await sql`
        SELECT 
          rs.id,
          rs.replacement_number,
          rs.sale_id,
          rs.reason,
          rs.status as delivery_status,
          rs.status,
          rs.tracking_id,
          rs.shipping_address,
          rs.courier_service_name,
          rs.shipping_date,
          rs.created_at,
          COALESCE(c.name, '') as customer_name,
          COALESCE(c.phone, '') as customer_phone,
          true as is_replacement
        FROM replacement_shipments rs
        LEFT JOIN customers c ON rs.customer_id = c.id
        WHERE (
          rs.courier_partner_id = ${partnerId}
          OR rs.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
          OR (rs.courier_service_id IS NOT NULL AND rs.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
        )
        ORDER BY rs.created_at DESC, rs.id DESC
      `

      if (replacementShipments.length > 0) {
        const rsIds = replacementShipments.map((r: any) => r.id)
        const rsItems = await sql`
          SELECT 
            rsi.*,
            p.name as product_name,
            pv.name as variant_name
          FROM replacement_shipment_items rsi
          LEFT JOIN products p ON rsi.product_id = p.id
          LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id
          WHERE rsi.replacement_shipment_id = ANY(${rsIds})
        `
        const itemsMap: Record<number, any[]> = {}
        for (const item of rsItems) {
          if (!itemsMap[item.replacement_shipment_id]) itemsMap[item.replacement_shipment_id] = []
          itemsMap[item.replacement_shipment_id].push(item)
        }
        for (const rs of replacementShipments) {
          rs.items = itemsMap[rs.id] || []
        }
      }
    } catch (err) {
      console.warn("Could not fetch replacement shipments for partner:", err)
    }

    return {
      success: true,
      data: sales,
      replacementShipments: replacementShipments,
    }
  } catch (error) {
    console.error("Error fetching partner sales:", error)
    return {
      success: false,
      message: "Failed to fetch sales for partner"
    }
  }
}

export async function updatePartnerDeliveryStatus(
  saleId: number,
  deliveryStatus: string,
  trackingId?: string,
  courierServiceName?: string
) {
  try {
    const existing = await sql`
      SELECT delivery_status, shipping_date, tracking_id, courier_service_name
      FROM sales
      WHERE id = ${saleId}
      LIMIT 1
    `
    if (existing.length === 0) {
      return {
        success: false,
        message: "Sale not found"
      }
    }

    const newDeliveryStatus = (deliveryStatus || "").trim().toLowerCase()
    const isNewShipping = newDeliveryStatus === "shipping" || newDeliveryStatus === "shipped"

    let targetTrackingId: string | null = existing[0].tracking_id || null
    if (trackingId !== undefined) {
      const clean = trackingId?.trim()
      targetTrackingId = clean ? clean : null
    }

    let targetCourierServiceName: string | null = existing[0].courier_service_name || null
    if (courierServiceName !== undefined) {
      const cleanService = courierServiceName?.trim()
      targetCourierServiceName = cleanService ? cleanService : targetCourierServiceName
    }

    const updated = await sql`
      UPDATE sales
      SET delivery_status = ${deliveryStatus},
          tracking_id = ${targetTrackingId},
          courier_service_name = ${targetCourierServiceName},
          shipping_date = CASE WHEN ${isNewShipping} THEN COALESCE(shipping_date, NOW()) ELSE shipping_date END,
          updated_at = NOW()
      WHERE id = ${saleId}
      RETURNING shipping_date
    `

    const finalShippingDate = updated[0]?.shipping_date || null

    return {
      success: true,
      message: "Delivery status updated successfully",
      shippingDate: finalShippingDate ? (finalShippingDate instanceof Date ? finalShippingDate.toISOString() : finalShippingDate) : null,
      trackingId: targetTrackingId,
      courierServiceName: targetCourierServiceName
    }
  } catch (error) {
    console.error("Error updating delivery status:", error)
    return {
      success: false,
      message: "Failed to update delivery status"
    }
  }
}

export async function updatePartnerSaleDetails(saleId: number, weightKg: string, expenseCourier: string) {
  try {
    await sql`
      UPDATE sales
      SET weight_kg = ${weightKg || null}, expense_courier = ${expenseCourier || 0}, updated_at = NOW()
      WHERE id = ${saleId}
    `
    return {
      success: true,
      message: "Details updated successfully"
    }
  } catch (error) {
    console.error("Error updating sale details:", error)
    return {
      success: false,
      message: "Failed to update details"
    }
  }
}

export async function getPartnerDashboardStats(partnerId: number) {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // Total Orders and Active Orders
    const ordersResult = await sql`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE delivery_status IN ('Pending', 'Paid', 'Packed', 'Sent', 'Direct', 'Shipping', 'Shipped', 'In transit')) as active_orders
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
    `
    
    // Total Earnings (sum of expense_courier)
    const earningsResult = await sql`
      SELECT SUM(COALESCE(expense_courier, 0)) as total_earnings
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
    `
    
    // Today's Activity (orders updated today or assigned today)
    const activityResult = await sql`
      SELECT COUNT(*) as today_activity
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      AND (DATE(s.created_at) = ${today} OR DATE(s.updated_at) = ${today})
    `

    return {
      success: true,
      data: {
        totalOrders: Number(ordersResult[0]?.total_orders || 0),
        activeOrders: Number(ordersResult[0]?.active_orders || 0),
        totalEarnings: Number(earningsResult[0]?.total_earnings || 0),
        todayActivity: Number(activityResult[0]?.today_activity || 0)
      }
    }
  } catch (error) {
    console.error("Error fetching partner stats:", error)
    return {
      success: false,
      data: { totalOrders: 0, activeOrders: 0, totalEarnings: 0, todayActivity: 0 }
    }
  }
}

export async function getPartnerSalesAnalytics(partnerId: number, monthStr: string) {
  try {
    const [yearStr, monthStrPart] = monthStr.split('-')
    const year = parseInt(yearStr, 10)
    const month = parseInt(monthStrPart, 10)
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    
    const result = await sql`
      SELECT 
        TO_CHAR(sale_date, 'YYYY-MM-DD') as date,
        SUM(COALESCE(expense_courier, 0)) as earnings_amount,
        COUNT(*) as order_count
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
        AND sale_date >= ${startDate}::date
        AND sale_date < ${endDate}::date
      GROUP BY TO_CHAR(sale_date, 'YYYY-MM-DD')
      ORDER BY date ASC
    `
    
    return { success: true, data: result }
  } catch (error) {
    console.error("Error fetching partner analytics:", error)
    return { success: false, message: "Failed to load analytics" }
  }
}

export async function updatePartnerReplacementDeliveryStatus(
  replacementId: number,
  deliveryStatus: string,
  trackingId?: string,
  courierServiceName?: string
) {
  try {
    const existing = await sql`
      SELECT status, shipping_date, tracking_id, courier_service_name
      FROM replacement_shipments
      WHERE id = ${replacementId}
      LIMIT 1
    `
    if (existing.length === 0) {
      return {
        success: false,
        message: "Replacement shipment not found"
      }
    }

    const newDeliveryStatus = (deliveryStatus || "").trim()
    const isNewShipping = newDeliveryStatus === "Shipping" || newDeliveryStatus === "Shipped" || newDeliveryStatus === "In transit"
    const isDelivered = newDeliveryStatus === "Delivered"

    let targetTrackingId: string | null = existing[0].tracking_id || null
    if (trackingId !== undefined) {
      const clean = trackingId?.trim()
      targetTrackingId = clean ? clean : null
    }

    let targetCourierServiceName: string | null = existing[0].courier_service_name || null
    if (courierServiceName !== undefined) {
      const cleanService = courierServiceName?.trim()
      targetCourierServiceName = cleanService ? cleanService : targetCourierServiceName
    }

    const updated = await sql`
      UPDATE replacement_shipments
      SET status = ${newDeliveryStatus},
          tracking_id = ${targetTrackingId},
          courier_service_name = ${targetCourierServiceName},
          shipping_date = CASE WHEN ${isNewShipping} THEN COALESCE(shipping_date, NOW()) ELSE shipping_date END,
          shipped_at = CASE WHEN ${isNewShipping} THEN COALESCE(shipped_at, NOW()) ELSE shipped_at END,
          delivered_at = CASE WHEN ${isDelivered} THEN COALESCE(delivered_at, NOW()) ELSE delivered_at END,
          updated_at = NOW()
      WHERE id = ${replacementId}
      RETURNING shipping_date
    `

    const finalShippingDate = updated[0]?.shipping_date || null

    return {
      success: true,
      message: "Replacement delivery status updated successfully",
      shippingDate: finalShippingDate ? (finalShippingDate instanceof Date ? finalShippingDate.toISOString() : finalShippingDate) : null,
      trackingId: targetTrackingId,
      courierServiceName: targetCourierServiceName
    }
  } catch (error) {
    console.error("Error updating replacement delivery status:", error)
    return {
      success: false,
      message: "Failed to update replacement delivery status"
    }
  }
}
