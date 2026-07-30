"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { getStaffSession } from "@/lib/staff-session"
import { addCustomer } from "./customer-actions"

export interface JobCardProductInput {
  productId: number
  productName?: string
  variantId?: number
  quantity: number
  price: number // Editable selling price
  costPrice: number // Read-only cost price from inventory
}

export interface JobCardInput {
  customerName: string
  customerPhone?: string
  customerId?: number | null

  // Structured shipping address
  shippingCity?: string
  shippingDistrict?: string
  shippingState?: string
  shippingStreet?: string
  shippingLandmark?: string
  shippingAddressType?: string
  shippingPincode?: string
  shippingPhone?: string

  courierPaidExtra?: number

  products: JobCardProductInput[]
}

export async function createJobCard(input: JobCardInput) {
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized. Staff session not found." }
    }

    const deviceId = session.deviceId
    const staffId = session.staffId

    // 1. Resolve Customer
    let resolvedCustomerId = input.customerId
    let customerNameOverride = input.customerName
    let customerPhoneOverride = input.shippingPhone || input.customerPhone || null

    if (!resolvedCustomerId && input.customerName) {
      // Create new customer with structured address fields
      const formData = new FormData()
      formData.append("name", input.customerName)
      formData.append("phone", input.customerPhone || "")
      formData.append("city", input.shippingCity || "")
      formData.append("district", input.shippingDistrict || "")
      formData.append("state", input.shippingState || "")
      formData.append("street", input.shippingStreet || "")
      formData.append("landmark", input.shippingLandmark || "")
      formData.append("address_type", input.shippingAddressType || "Home")
      formData.append("pincode", input.shippingPincode || "")
      formData.append("user_id", String(session.companyId || deviceId))
      
      const res = await addCustomer(formData)
      if (res.success && res.data) {
        resolvedCustomerId = res.data.id
      }
    }

    // Save/Update Customer Address in customer_addresses if we have address data
    if (resolvedCustomerId && (input.shippingCity || input.shippingStreet || input.shippingPincode || input.shippingDistrict || input.shippingState)) {
      // Check if exact address exists for this customer
      const existingAddress = await sql`
        SELECT id FROM customer_addresses 
        WHERE customer_id = ${resolvedCustomerId} 
          AND (street = ${input.shippingStreet || null} OR (street IS NULL AND CAST(${input.shippingStreet || null} AS text) IS NULL))
          AND (city = ${input.shippingCity || null} OR (city IS NULL AND CAST(${input.shippingCity || null} AS text) IS NULL))
        LIMIT 1
      `
      
      if (existingAddress.length === 0) {
        // We'll mark the new address as default and reset others if needed
        await sql`UPDATE customer_addresses SET is_default = false WHERE customer_id = ${resolvedCustomerId}`
        await sql`
          INSERT INTO customer_addresses (
            customer_id, phone, city, district, state, pincode, street, landmark, address_type, is_default
          ) VALUES (
            ${resolvedCustomerId},
            ${input.shippingPhone || input.customerPhone || null},
            ${input.shippingCity || null},
            ${input.shippingDistrict || null},
            ${input.shippingState || null},
            ${input.shippingPincode || null},
            ${input.shippingStreet || null},
            ${input.shippingLandmark || null},
            ${input.shippingAddressType || 'Home'},
            true
          )
        `
      }
    }

    // 2. Generate Tracking Number: JC-YYYYMMDD-XXXX
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, "0")
    const day = String(now.getDate()).padStart(2, "0")
    const dateStr = `${year}${month}${day}`

    // Count today's sales to get sequence suffix
    const countTodayRows = await sql`
      SELECT COUNT(id) as count 
      FROM sales 
      WHERE DATE(sale_date) = CURRENT_DATE
    `
    const sequence = String(Number(countTodayRows[0].count) + 1).padStart(4, "0")
    const trackingId = `JC-${dateStr}-${sequence}`

    // 3. Calculate Totals
    let itemsSubtotal = 0
    let totalCost = 0
    for (const p of input.products) {
      itemsSubtotal += p.price * p.quantity
      totalCost += p.costPrice * p.quantity
    }
    const totalAmount = itemsSubtotal + (Number(input.courierPaidExtra) || 0)

    // 4. Insert Sale (Status: Pending)
    const saleRows = await sql`
      INSERT INTO sales (
        customer_id,
        total_amount,
        total_cost,
        status,
        payment_status,
        device_id,
        received_amount,
        staff_id,
        sale_type,
        job_card_number,
        tracking_id,
        customer_name_override,
        customer_phone_override,
        shipping_city,
        shipping_district,
        shipping_state,
        shipping_street,
        shipping_landmark,
        shipping_address_type,
        shipping_pincode,
        courier_paid_extra,
        created_by,
        advance_amount,
        balance_amount
      ) VALUES (
        ${resolvedCustomerId || null},
        ${totalAmount},
        ${totalCost},
        'Pending',
        'Pending',
        ${deviceId},
        0,
        ${staffId},
        'job_card',
        ${trackingId},
        null,
        ${customerNameOverride},
        ${customerPhoneOverride},
        ${input.shippingCity || null},
        ${input.shippingDistrict || null},
        ${input.shippingState || null},
        ${input.shippingStreet || null},
        ${input.shippingLandmark || null},
        ${input.shippingAddressType || 'Home'},
        ${input.shippingPincode || null},
        ${input.courierPaidExtra || 0},
        ${deviceId},
        0,
        ${totalAmount}
      )
      RETURNING id
    `
    const saleId = saleRows[0].id

    // 5. Insert Sale Items
    for (const p of input.products) {
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
          ${p.productId},
          ${p.variantId || null},
          ${p.quantity},
          ${p.price},
          ${p.costPrice}
        )
      `
    }

    revalidatePath("/staff/dashboard")

    return { success: true, data: { saleId, trackingId } }
  } catch (error: any) {
    console.error("createJobCard Error:", error)
    return { success: false, message: error.message || "Failed to create Job Card" }
  }
}

export async function updateJobCard(id: number, input: any) {
  return { success: false, message: "Updating job cards is currently not supported.", data: null }
}

export async function getTodayJobCards(monthStr?: string, searchTerm?: string) {
  noStore()
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized. Staff session not found.", data: [] }
    }

    const deviceId = session.deviceId

    // Retrieve today's sales with status='Pending' (Job Cards)
    // We want the sale items as well.
    // Handle search pattern
    const searchPattern = searchTerm ? `%${searchTerm.toLowerCase()}%` : null;
    const startDate = (monthStr && monthStr.match(/^\d{4}-\d{2}$/)) ? monthStr + '-01' : null;

    let sales;

    if (startDate && searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.device_id = ${deviceId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date < (${startDate}::date + interval '1 month')
          AND s.status != 'Cancelled'
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status NOT IN ('Delivered', 'Returned'))
          AND (
            LOWER(COALESCE(c.name, s.customer_name_override)) LIKE ${searchPattern}
            OR LOWER(COALESCE(c.phone, s.customer_phone_override)) LIKE ${searchPattern}
            OR LOWER(s.tracking_id) LIKE ${searchPattern}
            OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          )
        ORDER BY s.created_at DESC
      `
    } else if (startDate && !searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.device_id = ${deviceId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date < (${startDate}::date + interval '1 month')
          AND s.status != 'Cancelled'
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status NOT IN ('Delivered', 'Returned'))
        ORDER BY s.created_at DESC
      `
    } else if (!startDate && searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.device_id = ${deviceId}
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)
          AND s.sale_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND s.status != 'Cancelled'
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status NOT IN ('Delivered', 'Returned'))
          AND (
            LOWER(COALESCE(c.name, s.customer_name_override)) LIKE ${searchPattern}
            OR LOWER(COALESCE(c.phone, s.customer_phone_override)) LIKE ${searchPattern}
            OR LOWER(s.tracking_id) LIKE ${searchPattern}
            OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          )
        ORDER BY s.created_at DESC
      `
    } else {
      sales = await sql`
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone
        FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
        WHERE s.device_id = ${deviceId}
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)
          AND s.sale_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND s.status != 'Cancelled'
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status NOT IN ('Delivered', 'Returned'))
        ORDER BY s.created_at DESC
      `
    }

    // Fetch items for these sales
    const saleIds = sales.map((s: any) => s.id)
    let items: any[] = []
    if (saleIds.length > 0) {
      items = await sql`
        SELECT 
          si.*,
          p.name as product_name,
          pv.name as variant_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
        WHERE si.sale_id = ANY(${saleIds})
      `
    }

    // Attach items to sales
    const formattedSales = sales.map((sale: any) => {
      const saleItems = items.filter((item: any) => item.sale_id === sale.id)
      return {
        ...sale,
        items: saleItems
      }
    })

    return { success: true, data: formattedSales }
  } catch (error: any) {
    console.error("getTodayJobCards Error:", error)
    return { success: false, message: error.message || "Failed to fetch Job Cards", data: [] }
  }
}

export async function getAllJobCards(deviceId: number) {
  noStore()
  try {
    if (!deviceId) return { success: false, message: "Device ID required", data: [] }

    // Retrieve all pending sales for all devices in the same company
    const sales = await sql`
      SELECT 
        s.*,
        COALESCE(c.name, s.customer_name_override) as customer_name,
        COALESCE(c.phone, s.customer_phone_override) as customer_phone,
        d.name as branch_name
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      JOIN devices d ON s.device_id = d.id
      WHERE s.device_id IN (
        SELECT d2.id
        FROM devices d1
        JOIN devices d2 ON d2.company_id = d1.company_id
        WHERE d1.id = ${deviceId}
      )
        AND s.status != 'Cancelled'
        AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
        AND (s.delivery_status IS NULL OR s.delivery_status NOT IN ('Delivered', 'Returned'))
      ORDER BY s.created_at DESC
    `

    // Fetch items for these sales
    const saleIds = sales.map((s: any) => s.id)
    let items: any[] = []
    if (saleIds.length > 0) {
      items = await sql`
        SELECT 
          si.*,
          p.name as product_name,
          pv.name as variant_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
        WHERE si.sale_id = ANY(${saleIds})
      `
    }

    // Attach items to sales
    const formattedSales = sales.map((sale: any) => {
      const saleItems = items.filter((item: any) => item.sale_id === sale.id)
      return {
        ...sale,
        items: saleItems
      }
    })

    return { success: true, data: formattedSales }
  } catch (error: any) {
    console.error("getAllJobCards Error:", error)
    return { success: false, message: error.message || "Failed to fetch all Job Cards", data: [] }
  }
}

export async function getStaffSalesAnalytics(targetMonthStr?: string) {
  noStore()
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized", data: [] }
    }
    const staffId = session.staffId

    // Define the date boundaries
    const date = targetMonthStr ? new Date(targetMonthStr) : new Date()
    const year = date.getFullYear()
    const month = date.getMonth() + 1 // 1-12
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    
    // Calculate next month to get exclusive upper bound
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    // Query for total amounts grouped by day, only for this staff's job_card sales
    const analytics = await sql`
      SELECT 
        DATE(sale_date) as date,
        COUNT(id) as order_count,
        SUM(total_amount) as sales_amount
      FROM sales
      WHERE staff_id = ${staffId}
        AND (sale_type = 'job_card' OR tracking_id LIKE 'JC-%')
        AND status != 'Cancelled'
        AND sale_date >= ${startDate}
        AND sale_date < ${endDate}
      GROUP BY DATE(sale_date)
      ORDER BY date ASC
    `
    
    return { success: true, data: analytics }
  } catch (error: any) {
    console.error("getStaffSalesAnalytics Error:", error)
    return { success: false, message: error.message || "Failed to fetch analytics", data: [] }
  }
}
