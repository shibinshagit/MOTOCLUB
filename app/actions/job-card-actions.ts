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
  deviceId?: number | null

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
    let deviceId: number
    let staffId: number | null = null
    let createdBy: number

    const session = await getStaffSession()
    if (session) {
      deviceId = session.deviceId
      staffId = session.staffId
      createdBy = deviceId
    } else {
      const { getAdminSession } = await import("./admin-auth-actions")
      const adminSession = await getAdminSession()
      if (adminSession.authenticated) {
        if (!input.deviceId) {
          return { success: false, message: "Device ID required for Admin creation" }
        }
        deviceId = input.deviceId
        createdBy = adminSession.admin.id
      } else {
        return { success: false, message: "Unauthorized. Staff or Admin session not found." }
      }
    }

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
      formData.append("user_id", String(session?.companyId || deviceId))
      
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

    // Totals calculated below
    let itemsSubtotal = 0
    let totalCost = 0
    for (const p of input.products) {
      itemsSubtotal += p.price * p.quantity
      totalCost += p.costPrice * p.quantity
    }
    const totalAmount = itemsSubtotal + (Number(input.courierPaidExtra) || 0)

    let trackingId = ""
    let saleId = 0
    let updateSuccess = false
    let retries = 5

    while (!updateSuccess && retries > 0) {
      try {
        // Find next available DOD ID
        const activeIdsResult = await sql`
          SELECT tracking_id 
          FROM sales 
          WHERE device_id = ${deviceId} 
            AND tracking_id LIKE 'DOD%'
            AND (delivery_status IS NULL OR delivery_status NOT IN ('Delivered', 'Returned', 'Failed'))
            AND status != 'Cancelled'
        `
        const activeIds = new Set(
          activeIdsResult.map((r: any) => parseInt(String(r.tracking_id).replace('DOD', ''), 10) || 0)
        )
        let nextNum = 1
        while (activeIds.has(nextNum)) {
          nextNum++
        }
        trackingId = 'DOD' + String(nextNum).padStart(3, '0')

    // 3. Calculate Totals
        // Insert Sale (Status: Pending)
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
            ${trackingId},
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
            ${createdBy},
            0,
            ${totalAmount}
          )
          RETURNING id
        `
        saleId = saleRows[0].id
        updateSuccess = true
      } catch (err: any) {
        if (err.message && (err.message.includes('idx_sales_active_dod_tracking') || err.message.includes('unique constraint'))) {
          retries--
          if (retries === 0) throw new Error("Could not allocate a unique DOD tracking ID after 5 attempts. Please try again.")
          continue
        }
        throw err
      }
    }

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
  try {
    let deviceId: number
    let staffId: number | null = null

    const session = await getStaffSession()
    if (session) {
      deviceId = session.deviceId
      staffId = session.staffId
    } else {
      const { getAdminSession } = await import("./admin-auth-actions")
      const adminSession = await getAdminSession()
      if (adminSession.authenticated) {
        if (!input.deviceId) {
          return { success: false, message: "Device ID required for Admin update" }
        }
        deviceId = input.deviceId
      } else {
        return { success: false, message: "Unauthorized" }
      }
    }

    // 1. Calculate new totals
    let itemsSubtotal = 0
    let totalCost = 0
    for (const p of input.products) {
      itemsSubtotal += p.price * p.quantity
      totalCost += p.costPrice * p.quantity
    }
    const totalAmount = itemsSubtotal + (Number(input.courierPaidExtra) || 0)

    // 2. Resolve Customer
    let resolvedCustomerId = input.customerId
    let customerNameOverride = input.customerName || null
    let customerPhoneOverride = input.customerPhone || null

    if (resolvedCustomerId && (!customerNameOverride || !customerPhoneOverride)) {
      const custRows = await sql`SELECT name, phone FROM customers WHERE id = ${resolvedCustomerId}`
      if (custRows.length > 0) {
        if (!customerNameOverride) customerNameOverride = custRows[0].name
        if (!customerPhoneOverride) customerPhoneOverride = custRows[0].phone
      }
    }

    // 3. Fetch current received_amount to compute balance
    const currentRows = await sql`SELECT received_amount FROM sales WHERE id = ${id}`
    const currentReceived = Number(currentRows[0]?.received_amount) || 0
    const balanceAmount = totalAmount - currentReceived

    // 4. Update the sales record (split by staffId to avoid nested sql template issues)
    let updatedSaleRows
    if (staffId) {
      updatedSaleRows = await sql`
        UPDATE sales SET
          customer_id = ${resolvedCustomerId || null},
          total_amount = ${totalAmount},
          total_cost = ${totalCost},
          customer_name_override = ${customerNameOverride},
          customer_phone_override = ${customerPhoneOverride},
          shipping_city = ${input.shippingCity || null},
          shipping_district = ${input.shippingDistrict || null},
          shipping_state = ${input.shippingState || null},
          shipping_street = ${input.shippingStreet || null},
          shipping_landmark = ${input.shippingLandmark || null},
          shipping_address_type = ${input.shippingAddressType || 'Home'},
          shipping_pincode = ${input.shippingPincode || null},
          courier_paid_extra = ${input.courierPaidExtra || 0},
          balance_amount = ${balanceAmount}
        WHERE id = ${id} AND device_id = ${deviceId} AND staff_id = ${staffId}
        RETURNING tracking_id
      `
    } else {
      updatedSaleRows = await sql`
        UPDATE sales SET
          customer_id = ${resolvedCustomerId || null},
          total_amount = ${totalAmount},
          total_cost = ${totalCost},
          customer_name_override = ${customerNameOverride},
          customer_phone_override = ${customerPhoneOverride},
          shipping_city = ${input.shippingCity || null},
          shipping_district = ${input.shippingDistrict || null},
          shipping_state = ${input.shippingState || null},
          shipping_street = ${input.shippingStreet || null},
          shipping_landmark = ${input.shippingLandmark || null},
          shipping_address_type = ${input.shippingAddressType || 'Home'},
          shipping_pincode = ${input.shippingPincode || null},
          courier_paid_extra = ${input.courierPaidExtra || 0},
          balance_amount = ${balanceAmount}
        WHERE id = ${id} AND device_id = ${deviceId}
        RETURNING tracking_id
      `
    }
    
    if (updatedSaleRows.length === 0) {
      return { success: false, message: "Job Card not found or unauthorized" }
    }

    const trackingId = updatedSaleRows[0]?.tracking_id || ""

    // 4. Delete existing sale items
    await sql`DELETE FROM sale_items WHERE sale_id = ${id}`

    // 5. Insert new sale items
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
          ${id},
          ${p.productId},
          ${p.variantId || null},
          ${p.quantity},
          ${p.price},
          ${p.costPrice}
        )
      `
    }

    revalidatePath("/staff/dashboard")
    return { success: true, data: { saleId: id, trackingId } }
  } catch (error: any) {
    console.error("updateJobCard Error:", error)
    return { success: false, message: error.message || "Failed to update Job Card" }
  }
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
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date < (${startDate}::date + interval '1 month')
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status != 'Delivered')
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
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date < (${startDate}::date + interval '1 month')
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status != 'Delivered')
        ORDER BY s.created_at DESC
      `
    } else if (!startDate && searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)
          AND s.sale_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status != 'Delivered')
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
        SELECT s.*, COALESCE(c.name, s.customer_name_override) as customer_name, COALESCE(c.phone, s.customer_phone_override) as customer_phone, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)
          AND s.sale_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (s.delivery_status IS NULL OR s.delivery_status != 'Delivered')
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

function isEcomAllowedDevice(deviceId?: number): boolean {
  if (!deviceId) return true
  const allowed = process.env.ECOMMERCE_DEVICE_IDS
    ? process.env.ECOMMERCE_DEVICE_IDS.split(",").map((id) => Number(id.trim()))
    : [1, 4] // 1: Development Mode, 4: Online Moto Cart / motocart warehouse
  return allowed.includes(Number(deviceId))
}

export async function getAllJobCards(deviceId?: number) {
  noStore()
  try {
    let sales: any[] = []
    const allowEcom = isEcomAllowedDevice(deviceId)

    if (deviceId && deviceId > 0) {
      sales = await sql`
        SELECT 
          s.*,
          COALESCE(c.name, s.customer_name_override) as customer_name,
          COALESCE(c.phone, s.customer_phone_override) as customer_phone,
          d.name as branch_name,
          d.name as device_name,
          d.logo_url as device_logo
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND (${allowEcom} OR s.source IS NULL OR s.source != 'ECOMMERCE')
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
        ORDER BY s.created_at DESC
      `
    } else {
      sales = await sql`
        SELECT 
          s.*,
          COALESCE(c.name, s.customer_name_override) as customer_name,
          COALESCE(c.phone, s.customer_phone_override) as customer_phone,
          d.name as branch_name,
          d.name as device_name,
          d.logo_url as device_logo
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
        ORDER BY s.created_at DESC
        LIMIT 200
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
    console.error("getAllJobCards Error:", error)
    return { success: false, message: error.message || "Failed to fetch all Job Cards", data: [] }
  }
}

export async function getStaffSalesAnalytics(deviceId: number, targetMonthStr?: string) {
  noStore()
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized", data: [] }
    }

    // Define the date boundaries
    // Add time component to prevent timezone shift when parsing YYYY-MM-DD
    const date = targetMonthStr ? new Date(targetMonthStr + 'T12:00:00') : new Date()
    const year = date.getFullYear()
    const month = date.getMonth() + 1 // 1-12
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    
    // Calculate next month to get exclusive upper bound
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    // Query for total amounts grouped by day
    const analytics = await sql`
      SELECT 
        TO_CHAR(sale_date, 'YYYY-MM-DD') as date,
        COUNT(id) as order_count,
        SUM(total_amount) as sales_amount
      FROM sales
      WHERE device_id = ${deviceId}
        AND staff_id = ${session.staffId}
        AND status != 'Cancelled'
        AND sale_date >= ${startDate}::date
        AND sale_date < ${endDate}::date
      GROUP BY TO_CHAR(sale_date, 'YYYY-MM-DD')
      ORDER BY date ASC
    `
    
    return { success: true, data: analytics }
  } catch (error: any) {
    console.error("getStaffSalesAnalytics Error:", error)
    return { success: false, message: error.message || "Failed to fetch analytics", data: [] }
  }
}

export async function markJobCardPaid(saleId: number, deviceId: number) {
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized" }
    }

    await sql`
      UPDATE sales 
      SET 
        payment_status = 'Paid',
        delivery_status = 'Paid',
        received_amount = total_amount,
        balance_amount = 0
      WHERE id = ${saleId} AND device_id = ${deviceId}
    `
    revalidatePath("/staff/dashboard")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error: any) {
    console.error("markJobCardPaid Error:", error)
    return { success: false, message: error.message || "Failed to update Job Card status" }
  }
}
