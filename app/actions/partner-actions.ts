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
        c.name as customer_name,
        c.phone as customer_phone
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      WHERE s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId})
      ORDER BY s.created_at DESC
    `

    return {
      success: true,
      data: sales
    }
  } catch (error) {
    console.error("Error fetching partner sales:", error)
    return {
      success: false,
      message: "Failed to fetch sales for partner"
    }
  }
}

export async function updatePartnerDeliveryStatus(saleId: number, deliveryStatus: string, trackingId?: string) {
  try {
    if (trackingId !== undefined) {
      await sql`
        UPDATE sales
        SET delivery_status = ${deliveryStatus}, tracking_id = ${trackingId}, updated_at = NOW()
        WHERE id = ${saleId}
      `
    } else {
      await sql`
        UPDATE sales
        SET delivery_status = ${deliveryStatus}, updated_at = NOW()
        WHERE id = ${saleId}
      `
    }
    return {
      success: true,
      message: "Delivery status updated successfully"
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
        COUNT(*) FILTER (WHERE delivery_status IN ('Pending', 'Paid', 'Packed', 'Shipped', 'In transit')) as active_orders
      FROM sales
      WHERE courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId})
    `
    
    // Total Earnings (sum of expense_courier)
    const earningsResult = await sql`
      SELECT SUM(COALESCE(expense_courier, 0)) as total_earnings
      FROM sales
      WHERE courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId})
    `
    
    // Today's Activity (orders updated today or assigned today)
    const activityResult = await sql`
      SELECT COUNT(*) as today_activity
      FROM sales
      WHERE courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId})
      AND (DATE(created_at) = ${today} OR DATE(updated_at) = ${today})
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
    const [year, month] = monthStr.split('-')
    const startDate = `${year}-${month}-01`
    const endDate = `${year}-${month}-31` // SQLite handles this correctly
    
    const result = await sql`
      SELECT 
        DATE(sale_date) as date,
        SUM(COALESCE(expense_courier, 0)) as earnings_amount,
        COUNT(*) as order_count
      FROM sales
      WHERE courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId})
        AND DATE(sale_date) >= ${startDate}
        AND DATE(sale_date) <= ${endDate}
      GROUP BY DATE(sale_date)
      ORDER BY date ASC
    `
    
    return { success: true, data: result }
  } catch (error) {
    console.error("Error fetching partner analytics:", error)
    return { success: false, message: "Failed to load analytics" }
  }
}
