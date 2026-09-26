"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { format, addDays, parseISO } from "date-fns"
import { getStaffSession } from "@/lib/staff-session"
import { addCustomer, syncCustomerShippingAddress } from "./customer-actions"

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
  staffId?: number | null

  // Structured shipping address
  shippingCity?: string
  shippingDistrict?: string
  shippingState?: string
  shippingStreet?: string
  shippingArea?: string
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
      staffId = input.staffId || session.staffId
      createdBy = deviceId
    } else {
      const { getAdminSession } = await import("./admin-auth-actions")
      const adminSession = await getAdminSession()
      if (adminSession.authenticated) {
        deviceId = input.deviceId || 1
        staffId = input.staffId || null
        createdBy = adminSession.admin.id
      } else if (input.deviceId) {
        deviceId = input.deviceId
        staffId = input.staffId || null
        createdBy = input.deviceId
      } else {
        deviceId = 1
        staffId = input.staffId || null
        createdBy = 1
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
      formData.append("area", input.shippingArea || "")
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
    if (resolvedCustomerId && (input.shippingCity || input.shippingStreet || input.shippingPincode || input.shippingDistrict || input.shippingState || input.shippingLandmark)) {
      await syncCustomerShippingAddress(resolvedCustomerId, {
        shippingCity: input.shippingCity,
        shippingDistrict: input.shippingDistrict,
        shippingState: input.shippingState,
        shippingStreet: input.shippingStreet,
        shippingArea: input.shippingArea,
        shippingPincode: input.shippingPincode,
        shippingLandmark: input.shippingLandmark,
        shippingAddressType: input.shippingAddressType || "Home",
        customerPhoneOverride: input.shippingPhone || input.customerPhone,
      })
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
            shipping_area,
            shipping_landmark,
            shipping_address_type,
            shipping_pincode,
            courier_paid_extra,
            created_by,
            advance_amount,
            balance_amount,
            fulfillment_type,
            delivery_status
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
            ${input.shippingArea || null},
            ${input.shippingLandmark || null},
            ${input.shippingAddressType || 'Home'},
            ${input.shippingPincode || null},
            ${input.courierPaidExtra || 0},
            ${createdBy},
            0,
            ${totalAmount},
            'ship',
            'Pending'
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
    revalidatePath("/dashboard")

    return { success: true, data: { saleId, trackingId } }
  } catch (error: any) {
    console.error("createJobCard Error:", error)
    return { success: false, message: error.message || "Failed to create Job Card" }
  }
}

export async function updateJobCard(id: number, input: any) {
  try {
    const existingSale = await sql`
      SELECT id, device_id, staff_id, received_amount, delivery_status 
      FROM sales 
      WHERE id = ${id}
    `
    if (existingSale.length === 0) {
      return { success: false, message: "Job Card not found" }
    }

    let deviceId: number
    let staffId: number | null = null

    const session = await getStaffSession()
    if (session) {
      deviceId = session.deviceId
      staffId = session.staffId
      if (existingSale[0].staff_id && existingSale[0].staff_id !== staffId) {
        return { success: false, message: "Unauthorized. You can only update your own job cards." }
      }
    } else {
      deviceId = input.deviceId || existingSale[0].device_id || 1
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
    let customerNameOverride = input.customerName?.trim() || null
    let customerPhoneOverride = input.customerPhone?.trim() || input.shippingPhone?.trim() || null

    if (!resolvedCustomerId && input.customerName) {
      // Create new customer with structured address fields
      const formData = new FormData()
      formData.append("name", input.customerName)
      formData.append("phone", customerPhoneOverride || "")
      formData.append("city", input.shippingCity || "")
      formData.append("district", input.shippingDistrict || "")
      formData.append("state", input.shippingState || "")
      formData.append("street", input.shippingStreet || "")
      formData.append("area", input.shippingArea || "")
      formData.append("landmark", input.shippingLandmark || "")
      formData.append("address_type", input.shippingAddressType || "Home")
      formData.append("pincode", input.shippingPincode || "")
      formData.append("user_id", String(session?.companyId || deviceId))
      
      const res = await addCustomer(formData)
      if (res.success && res.data) {
        resolvedCustomerId = res.data.id
      }
    } else if (resolvedCustomerId && (customerNameOverride || customerPhoneOverride)) {
      await sql`
        UPDATE customers
        SET
          name = COALESCE(NULLIF(${customerNameOverride}, ''), name),
          phone = COALESCE(NULLIF(${customerPhoneOverride}, ''), phone)
        WHERE id = ${resolvedCustomerId}
      `
    }

    // 3. Fetch current received_amount to compute balance
    const currentReceived = Number(existingSale[0]?.received_amount) || 0
    const balanceAmount = totalAmount - currentReceived

    // 4. Update the sales record
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
          shipping_area = ${input.shippingArea || null},
          shipping_landmark = ${input.shippingLandmark || null},
          shipping_address_type = ${input.shippingAddressType || 'Home'},
          shipping_pincode = ${input.shippingPincode || null},
          courier_paid_extra = ${input.courierPaidExtra || 0},
          balance_amount = ${balanceAmount},
          fulfillment_type = COALESCE(fulfillment_type, 'ship'),
          delivery_status = COALESCE(delivery_status, 'Pending')
        WHERE id = ${id} AND staff_id = ${staffId}
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
          shipping_area = ${input.shippingArea || null},
          shipping_landmark = ${input.shippingLandmark || null},
          shipping_address_type = ${input.shippingAddressType || 'Home'},
          shipping_pincode = ${input.shippingPincode || null},
          courier_paid_extra = ${input.courierPaidExtra || 0},
          balance_amount = ${balanceAmount},
          fulfillment_type = COALESCE(fulfillment_type, 'ship'),
          delivery_status = COALESCE(delivery_status, 'Pending')
        WHERE id = ${id}
        RETURNING tracking_id
      `
    }
    
    if (updatedSaleRows.length === 0) {
      return { success: false, message: "Job Card not found or unauthorized" }
    }

    const trackingId = updatedSaleRows[0]?.tracking_id || ""

    if (resolvedCustomerId && (input.shippingCity || input.shippingStreet || input.shippingPincode || input.shippingDistrict || input.shippingState || input.shippingLandmark)) {
      await syncCustomerShippingAddress(resolvedCustomerId, {
        shippingCity: input.shippingCity,
        shippingDistrict: input.shippingDistrict,
        shippingState: input.shippingState,
        shippingStreet: input.shippingStreet,
        shippingArea: input.shippingArea,
        shippingPincode: input.shippingPincode,
        shippingLandmark: input.shippingLandmark,
        shippingAddressType: input.shippingAddressType || "Home",
        customerPhoneOverride: input.shippingPhone || input.customerPhone,
      })
    }

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

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")
    return { success: true, data: { saleId: id, trackingId } }
  } catch (error: any) {
    console.error("updateJobCard Error:", error)
    return { success: false, message: error.message || "Failed to update Job Card" }
  }
}

export async function updateSaleCustomerPhone(saleId: number, phone: string, deviceId?: number) {
  try {
    const session = await getStaffSession()
    let staffId: number | null = null
    if (session) {
      staffId = session.staffId
    }

    const cleanPhone = phone?.trim() || null

    let saleRows
    if (staffId) {
      saleRows = await sql`
        UPDATE sales 
        SET customer_phone_override = ${cleanPhone}
        WHERE id = ${saleId} AND staff_id = ${staffId}
        RETURNING id, customer_id
      `
    } else {
      saleRows = await sql`
        UPDATE sales 
        SET customer_phone_override = ${cleanPhone}
        WHERE id = ${saleId}
        RETURNING id, customer_id
      `
    }

    if (saleRows.length === 0) {
      return { success: false, message: "Sale not found or unauthorized" }
    }

    // Also update customer table if attached
    if (saleRows[0].customer_id && cleanPhone) {
      await sql`
        UPDATE customers
        SET phone = ${cleanPhone}
        WHERE id = ${saleRows[0].customer_id}
      `
    }

    revalidatePath("/dashboard")
    revalidatePath("/staff/dashboard")

    return { success: true, message: "Phone number updated successfully" }
  } catch (error: any) {
    console.error("updateSaleCustomerPhone error:", error)
    return { success: false, message: error.message || "Failed to update phone number" }
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
        SELECT s.*, COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name, COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone, c.street as customer_street, c.city as customer_city, c.district as customer_district, c.state as customer_state, c.pincode as customer_pincode, c.landmark as customer_landmark, c.address as customer_address, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date < (${startDate}::date + interval '1 month')
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (
            LOWER(COALESCE(NULLIF(s.customer_name_override, ''), c.name)) LIKE ${searchPattern}
            OR LOWER(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone)) LIKE ${searchPattern}
            OR LOWER(s.tracking_id) LIKE ${searchPattern}
            OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          )
        ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
      `
    } else if (startDate && !searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name, COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone, c.street as customer_street, c.city as customer_city, c.district as customer_district, c.state as customer_state, c.pincode as customer_pincode, c.landmark as customer_landmark, c.address as customer_address, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= ${startDate}::date
          AND s.sale_date < (${startDate}::date + interval '1 month')
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
        ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
      `
    } else if (!startDate && searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name, COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone, c.street as customer_street, c.city as customer_city, c.district as customer_district, c.state as customer_state, c.pincode as customer_pincode, c.landmark as customer_landmark, c.address as customer_address, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)
          AND s.sale_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
          AND (
            LOWER(COALESCE(NULLIF(s.customer_name_override, ''), c.name)) LIKE ${searchPattern}
            OR LOWER(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone)) LIKE ${searchPattern}
            OR LOWER(s.tracking_id) LIKE ${searchPattern}
            OR CAST(s.id AS TEXT) LIKE ${searchPattern}
          )
        ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
      `
    } else {
      sales = await sql`
        SELECT s.*, COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name, COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone, c.street as customer_street, c.city as customer_city, c.district as customer_district, c.state as customer_state, c.pincode as customer_pincode, c.landmark as customer_landmark, c.address as customer_address, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= date_trunc('month', CURRENT_DATE)
          AND s.sale_date < date_trunc('month', CURRENT_DATE) + interval '1 month'
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
        ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
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

export async function getAllJobCards(
  deviceId?: number,
  options?: { 
    dateFrom?: string; 
    dateTo?: string;
    page?: number;
    limit?: number;
    searchTerm?: string;
    statusFilter?: "all" | "pending" | "critical";
  }
) {
  noStore()
  try {
    let sales: any[] = []
    const allowEcom = isEcomAllowedDevice(deviceId)
    const dateFrom = options?.dateFrom || null
    const endExclusive = options?.dateTo
      ? format(addDays(parseISO(options.dateTo), 1), "yyyy-MM-dd")
      : null
    
    const page = options?.page || 1
    const limit = options?.limit || 25
    const offset = (page - 1) * limit
    const searchTerm = options?.searchTerm ? `%${options?.searchTerm.toLowerCase()}%` : null
    const statusFilter = options?.statusFilter || "all"

    const baseWhere = sql`
      (${deviceId && deviceId > 0 ? sql`s.device_id = ${deviceId}` : sql`1=1`})
      AND (${allowEcom ? sql`1=1` : sql`(s.source IS NULL OR s.source != 'ECOMMERCE')`})
      AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
      AND (
        s.sale_type = 'job_card' 
        OR s.fulfillment_type = 'ship' 
        OR s.tracking_id LIKE 'JC-%' 
        OR s.tracking_id LIKE 'DOD-%'
        OR (s.tracking_id IS NOT NULL AND s.tracking_id != '')
      )
      AND (${dateFrom}::timestamp IS NULL OR COALESCE(s.sale_date, s.created_at) >= ${dateFrom}::timestamp)
      AND (${endExclusive}::timestamp IS NULL OR COALESCE(s.sale_date, s.created_at) < ${endExclusive}::timestamp)
      AND (${searchTerm}::text IS NULL OR (
        LOWER(s.tracking_id) LIKE ${searchTerm} OR
        LOWER(COALESCE(NULLIF(s.customer_name_override, ''), c.name)) LIKE ${searchTerm} OR
        LOWER(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone)) LIKE ${searchTerm} OR
        CAST(s.id AS TEXT) LIKE ${searchTerm} OR
        LOWER(COALESCE(cp.name, md_partner.name, '')) LIKE ${searchTerm}
      ))
    `

    let statusWhere = sql`1=1`
    if (statusFilter === "pending") {
      statusWhere = sql`
        s.status NOT IN ('Cancelled', 'Returned')
        AND (s.payment_status IS NULL OR LOWER(s.payment_status) != 'cancelled')
        AND (s.delivery_status IS NULL OR LOWER(s.delivery_status) NOT IN ('returned', 'failed', 'delivered'))
      `
    } else if (statusFilter === "critical") {
      statusWhere = sql`
        (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%' OR s.tracking_id LIKE 'DOD-%')
        AND LOWER(COALESCE(s.fulfillment_type, 'pickup')) = 'ship'
        AND s.status NOT IN ('Cancelled', 'Returned')
        AND (s.payment_status IS NULL OR LOWER(s.payment_status) != 'cancelled')
        AND (
          LOWER(s.payment_status) IN ('paid', 'completed') OR (COALESCE(s.total_amount, 0) > 0 AND COALESCE(s.received_amount, 0) >= COALESCE(s.total_amount, 0))
        )
        AND (s.delivery_status IS NULL OR LOWER(s.delivery_status) NOT IN ('pickup', 'direct', 'shipping', 'delivered', 'returned', 'failed'))
      `
    }

    sales = await sql`
      SELECT 
        s.*,
        COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name,
        COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone,
        c.street as customer_street,
        c.city as customer_city,
        c.district as customer_district,
        c.state as customer_state,
        c.pincode as customer_pincode,
        c.landmark as customer_landmark,
        c.address as customer_address,
        COALESCE(cp.name, md_partner.name, '') as courier_partner_name,
        st.name as staff_name,
        st.role as staff_role,
        d.name as branch_name,
        d.name as device_name,
        d.logo_url as device_logo,
        err.id as return_id,
        err.ecommerce_return_request_id as return_request_ext_id,
        err.status as return_status,
        err.rejection_reason as return_rejection_reason,
        COALESCE((SELECT SUM(quantity) FROM sale_items WHERE sale_id = s.id), 0) as total_quantity
      FROM sales s
      LEFT JOIN customers c ON s.customer_id = c.id
      LEFT JOIN devices d ON s.device_id = d.id
      LEFT JOIN staff cp ON cp.id = s.courier_partner_id
      LEFT JOIN master_data md_partner ON md_partner.id = s.courier_partner_id
      LEFT JOIN staff st ON s.staff_id = st.id
      LEFT JOIN return_requests err ON (err.sale_id = s.id OR (s.external_order_id IS NOT NULL AND (err.order_number = s.external_order_id OR err.order_id = s.id)))
      WHERE ${baseWhere} AND ${statusWhere}
      ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `

    return { success: true, data: sales }
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
    if (session) {
      await sql`
        UPDATE sales 
        SET 
          payment_status = 'Paid',
          delivery_status = CASE WHEN delivery_status IS NULL OR delivery_status = 'Pending' THEN 'Paid' ELSE delivery_status END,
          received_amount = total_amount,
          balance_amount = 0
        WHERE id = ${saleId} AND staff_id = ${session.staffId}
      `
    } else {
      await sql`
        UPDATE sales 
        SET 
          payment_status = 'Paid',
          delivery_status = CASE WHEN delivery_status IS NULL OR delivery_status = 'Pending' THEN 'Paid' ELSE delivery_status END,
          received_amount = total_amount,
          balance_amount = 0
        WHERE id = ${saleId}
      `
    }
    revalidatePath("/staff/dashboard")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error: any) {
    console.error("markJobCardPaid Error:", error)
    return { success: false, message: error.message || "Failed to update Job Card status" }
  }
}
