"use server"

import { sql } from "@/lib/db"
import { revalidatePath, unstable_noStore as noStore } from "next/cache"
import { format, addDays, parseISO } from "date-fns"
import { getStaffSession } from "@/lib/staff-session"
import { addCustomer, syncCustomerShippingAddress } from "./customer-actions"
import { isSaleStockDeducted } from "./sale-actions"
import { applyStockTransition, getSaleStockLines, applyStockDelta } from "@/lib/sale-stock"

/**
 * Validates one job card line against the database and returns the identifiers that are stored on the
 * sale line and used for stock: the product must belong to the device's company, the variant must belong
 * to the product (the product's first variant when none is sent) and a batch, if given, must belong to
 * that variant. Nothing the browser sends for product/variant/batch is trusted.
 */
async function resolveJobCardLine(tx: any, deviceId: number, p: JobCardProductInput) {
  const qty = Number(p.quantity)
  if (!Number.isInteger(qty) || qty <= 0) throw new Error("Quantity must be a whole number greater than zero")

  const product = await tx`
    SELECT id FROM products
    WHERE id = ${p.productId}
      AND created_by IN (
        SELECT d2.id FROM devices d1 JOIN devices d2 ON d2.company_id = d1.company_id WHERE d1.id = ${deviceId}
      )
  `
  if (product.length === 0) throw new Error(`Product ${p.productId} not found`)

  let variantId: number | null = p.variantId ? Number(p.variantId) : null
  if (variantId) {
    const v = await tx`SELECT id FROM product_variants WHERE id = ${variantId} AND product_id = ${p.productId}`
    if (v.length === 0) throw new Error("Selected variant does not belong to the selected product")
  } else {
    const d = await tx`SELECT id FROM product_variants WHERE product_id = ${p.productId} ORDER BY id ASC LIMIT 1`
    variantId = d.length > 0 ? Number(d[0].id) : null
  }

  let batchId: number | null = p.batchId ? Number(p.batchId) : null
  if (batchId) {
    const b = await tx`
      SELECT id FROM product_batches WHERE id = ${batchId} AND product_variant_id = ${variantId}
    `
    if (b.length === 0) throw new Error("Selected batch does not belong to the selected product variant")
  }

  return { variantId, batchId, quantity: qty }
}

export interface JobCardProductInput {
  productId: number
  productName?: string
  variantId?: number
  batchId?: number
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
  crmLeadId?: number
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

        const txResult = await sql.begin(async (tx: any) => {
      // 1. CRM Lead Validation and Locking
      if (input.crmLeadId && session) {
        const leadRes = await tx`
          SELECT converted_sale_id, converted_customer_id, company_id 
          FROM crm_leads 
          WHERE id = ${input.crmLeadId} AND company_id = ${session.companyId}
          FOR UPDATE
        `
        if (leadRes.length === 0) {
          throw new Error("Lead not found or unauthorized")
        }
        
        const lead = leadRes[0]
        if (lead.converted_sale_id) {
          return { alreadyConverted: true, saleId: lead.converted_sale_id }
        }
        if (lead.converted_customer_id !== resolvedCustomerId) {
          throw new Error("Customer mismatch for this CRM lead.")
        }
      }

      let trackingId = ""
      let saleId = 0
      let updateSuccess = false
      let retries = 5

      while (!updateSuccess && retries > 0) {
        try {
          await tx.savepoint(async (sp: any) => {
            // Find next available DOD ID
            const activeIdsResult = await sp`
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

            // Insert Sale (Status: Pending)
            const saleRows = await sp`
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
          })
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

      // 5. Insert Sale Items (validated; variant and batch are stored so stock moves against the right rows)
      for (const p of input.products) {
        const line = await resolveJobCardLine(tx, deviceId, p)
        await tx`
          INSERT INTO sale_items (
            sale_id,
            product_id,
            product_variant_id,
            batch_id,
            quantity,
            price,
            cost
          ) VALUES (
            ${saleId},
            ${p.productId},
            ${line.variantId},
            ${line.batchId},
            ${line.quantity},
            ${p.price},
            ${p.costPrice}
          )
        `
      }

      if (input.crmLeadId && session) {
        await tx`
          UPDATE crm_leads
          SET
            converted_sale_id = ${saleId},
            status = 'Converted',
            updated_at = NOW()
          WHERE id = ${input.crmLeadId}
            AND company_id = ${session.companyId}
        `
        
        const { logLeadActivity } = await import("./lead-actions")
        await logLeadActivity(tx, {
          lead_id: input.crmLeadId,
          company_id: session.companyId,
          staff_id: session.staffId,
          activity_type: 'SALE_CREATED',
          note: `Sale #${saleId} created from CRM lead.`
        })
      }

      return { success: true, data: { saleId, trackingId } }
    })

    if (txResult && txResult.alreadyConverted) {
      return { success: false, alreadyConverted: true, saleId: txResult.saleId, message: "A sale has already been created for this CRM lead." }
    }

    const { saleId, trackingId } = txResult.data

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

    // 4./5. Replace the sale items atomically. When the sale's stock is currently deducted, the stock
    // difference between the old and new lines is applied in the same transaction (edit 5 -> 3 returns 2).
    const saleDeviceId = Number(existingSale[0].device_id) || deviceId
    await sql.begin(async (tx: any) => {
      const cur = await tx`
        SELECT status, delivery_status, fulfillment_type FROM sales WHERE id = ${id} FOR UPDATE
      `
      const stockDeducted = await isSaleStockDeducted(cur[0]?.status, cur[0]?.delivery_status, cur[0]?.fulfillment_type)

      // Snapshot of what is currently deducted, taken before the lines are replaced
      const beforeLines = stockDeducted ? await getSaleStockLines(id, tx) : null

      await tx`DELETE FROM sale_items WHERE sale_id = ${id}`

      for (const p of input.products) {
        const line = await resolveJobCardLine(tx, saleDeviceId, p)
        await tx`
          INSERT INTO sale_items (
            sale_id,
            product_id,
            product_variant_id,
            batch_id,
            quantity,
            price,
            cost
          ) VALUES (
            ${id},
            ${p.productId},
            ${line.variantId},
            ${line.batchId},
            ${line.quantity},
            ${p.price},
            ${p.costPrice}
          )
        `
      }

      // Only the difference moves: extra units are deducted, removed units restored, unchanged lines untouched
      if (stockDeducted && beforeLines) {
        const afterLines = await getSaleStockLines(id, tx)
        await applyStockDelta(id, saleDeviceId, beforeLines, afterLines, `Job Card #${id} edited`, tx)
      }
    })

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

export async function getTodayJobCards(monthStr?: string, searchTerm?: string, fromDate?: string, toDate?: string) {
  noStore()
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized. Staff session not found.", data: [] }
    }

    const deviceId = session.deviceId

    // Handle search pattern
    const searchPattern = searchTerm ? `%${searchTerm.toLowerCase()}%` : null;
    
    // Determine date boundaries
    let dateStart: string | null = null;
    let dateEndExclusive: string | null = null;

    if (fromDate && toDate) {
      // Use explicit date range (takes priority over monthStr)
      dateStart = fromDate;
      // Exclusive upper bound: day AFTER toDate
      const endD = new Date(toDate + 'T12:00:00');
      endD.setDate(endD.getDate() + 1);
      dateEndExclusive = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
    } else if (monthStr && monthStr.match(/^\d{4}-\d{2}$/)) {
      dateStart = monthStr + '-01';
      // Use interval '1 month' approach via explicit calculation
      const mDate = new Date(dateStart + 'T12:00:00');
      const nextMonth = mDate.getMonth() === 11 ? 0 : mDate.getMonth() + 1;
      const nextYear = mDate.getMonth() === 11 ? mDate.getFullYear() + 1 : mDate.getFullYear();
      dateEndExclusive = `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-01`;
    }

    let sales;

    if (dateStart && dateEndExclusive && searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name, COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone, c.street as customer_street, c.city as customer_city, c.district as customer_district, c.state as customer_state, c.pincode as customer_pincode, c.landmark as customer_landmark, c.address as customer_address, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= ${dateStart}::date
          AND s.sale_date < ${dateEndExclusive}::date
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
    } else if (dateStart && dateEndExclusive && !searchPattern) {
      sales = await sql`
        SELECT s.*, COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name, COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone, c.street as customer_street, c.city as customer_city, c.district as customer_district, c.state as customer_state, c.pincode as customer_pincode, c.landmark as customer_landmark, c.address as customer_address, d.name as branch_name, d.name as device_name, d.logo_url as device_logo
        FROM sales s 
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN devices d ON s.device_id = d.id
        WHERE s.device_id = ${deviceId}
          AND s.staff_id = ${session.staffId}
          AND s.sale_date >= ${dateStart}::date
          AND s.sale_date < ${dateEndExclusive}::date
          AND (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
          AND (s.sale_type = 'job_card' OR s.tracking_id LIKE 'JC-%')
        ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
      `
    } else if (!dateStart && searchPattern) {
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

export async function getStaffSalesAnalytics(deviceId: number, targetMonthStr?: string, fromDate?: string, toDate?: string) {
  noStore()
  try {
    const session = await getStaffSession()
    if (!session) {
      return { success: false, message: "Unauthorized", data: [] }
    }

    let startDate: string
    let endDate: string

    if (fromDate && toDate) {
      // Use explicit date range
      startDate = fromDate
      // Exclusive upper bound: day AFTER toDate
      const endD = new Date(toDate + 'T12:00:00')
      endD.setDate(endD.getDate() + 1)
      endDate = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`
    } else {
      // Fall back to month-based (backward compatible)
      const date = targetMonthStr ? new Date(targetMonthStr + 'T12:00:00') : new Date()
      const year = date.getFullYear()
      const month = date.getMonth() + 1 // 1-12
      startDate = `${year}-${String(month).padStart(2, '0')}-01`
      
      const nextMonth = month === 12 ? 1 : month + 1
      const nextYear = month === 12 ? year + 1 : year
      endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
    }

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

    await sql.begin(async (tx: any) => {
      // Lock the sale so a double click cannot move the stock twice
      const rows = session
        ? await tx`
            SELECT status, delivery_status, fulfillment_type, device_id FROM sales
            WHERE id = ${saleId} AND staff_id = ${session.staffId} FOR UPDATE
          `
        : await tx`
            SELECT status, delivery_status, fulfillment_type, device_id FROM sales
            WHERE id = ${saleId} FOR UPDATE
          `
      if (rows.length === 0) throw new Error("Job Card not found or unauthorized")
      const cur = rows[0]
      const newDelivery =
        !cur.delivery_status || cur.delivery_status === "Pending" ? "Paid" : cur.delivery_status

      const wasDeducted = await isSaleStockDeducted(cur.status, cur.delivery_status || "Pending", cur.fulfillment_type)
      const nowDeducted = await isSaleStockDeducted(cur.status, newDelivery, cur.fulfillment_type)

      await tx`
        UPDATE sales
        SET
          payment_status = 'Paid',
          delivery_status = ${newDelivery},
          received_amount = total_amount,
          balance_amount = 0
        WHERE id = ${saleId}
      `

      if (wasDeducted !== nowDeducted) {
        await applyStockTransition(
          saleId,
          Number(cur.device_id) || deviceId,
          nowDeducted,
          nowDeducted ? "sale_delivery_deducted" : "sale_delivery_restored",
          `Job Card #${saleId} marked paid - stock ${nowDeducted ? "deducted" : "restored"}`,
          tx,
        )
      }
    })

    revalidatePath("/staff/dashboard")
    revalidatePath("/dashboard")
    return { success: true }
  } catch (error: any) {
    console.error("markJobCardPaid Error:", error)
    return { success: false, message: error.message || "Failed to update Job Card status" }
  }
}
