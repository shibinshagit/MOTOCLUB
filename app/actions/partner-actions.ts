"use server"

import { sql } from "@/lib/db"
import { getStaffSession } from "@/lib/staff-session"

export type PartnerOrderFilterParams = {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  orderType?: string
  dateRange?: string
  fromDate?: string
  toDate?: string
  tracking?: string
}

function getPartnerDateBounds(dateRange?: string, fromDate?: string, toDate?: string) {
  const range = (dateRange || "This Month").trim()
  const now = new Date()
  
  let start: Date
  let end: Date

  if (range === "Today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  } else if (range === "Yesterday") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  } else if (range === "Last 7 Days") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  } else if (range === "Last 30 Days") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)
  } else if (range === "This Month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)
  } else if (range === "Last Month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  } else if (range === "Custom Range" && (fromDate || toDate)) {
    const fStr = (fromDate || toDate || "").trim()
    const tStr = (toDate || fromDate || "").trim()
    const [fy, fm, fd] = fStr.split("-").map(Number)
    const [ty, tm, td] = tStr.split("-").map(Number)
    
    start = new Date(fy || 1970, (fm ? fm - 1 : 0), fd || 1, 0, 0, 0, 0)
    end = new Date(ty || 2099, (tm ? tm - 1 : 11), (td || 31) + 1, 0, 0, 0, 0)
  } else {
    start = new Date(1970, 0, 1, 0, 0, 0, 0)
    end = new Date(2099, 11, 31, 23, 59, 59, 999)
  }

  const formatLocalDate = (d: Date) => {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const day = String(d.getDate()).padStart(2, "0")
    const hours = String(d.getHours()).padStart(2, "0")
    const minutes = String(d.getMinutes()).padStart(2, "0")
    const seconds = String(d.getSeconds()).padStart(2, "0")
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
  }

  return {
    range,
    startDateStr: formatLocalDate(start),
    endDateStr: formatLocalDate(end),
    startDateObj: start,
    endDateObj: end,
    isAllTime: range === "All",
  }
}

export async function getFilteredPartnerOrders(params: PartnerOrderFilterParams = {}) {
  try {
    const session = await getStaffSession()
    if (!session || session.role !== "partner") {
      return {
        success: false,
        message: "Unauthorized access to partner portal",
        data: [],
        replacementShipments: [],
        totalCount: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
        pendingReplacementsCount: 0,
      }
    }

    const partnerId = session.staffId
    const page = Math.max(1, Number(params.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20))
    const offset = (page - 1) * pageSize

    const search = (params.search || "").trim()
    const status = (params.status || "All").trim()
    const orderType = (params.orderType || "All").trim()
    const dateRange = (params.dateRange || "This Month").trim()
    const fromDate = (params.fromDate || "").trim()
    const toDate = (params.toDate || "").trim()
    const tracking = (params.tracking || "All").trim()

    const cleanNumStr = search.replace(/^(#|MC-|RS-)/i, "").trim()
    const digitsOnly = search.replace(/\D/g, "")

    const { startDateStr, endDateStr, isAllTime } = getPartnerDateBounds(dateRange, fromDate, toDate)

    let combinedOrders: any[] = []
    let totalCount = 0

    if (orderType === "Normal Orders") {
      const [salesRes, countRes] = await Promise.all([
        sql`
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
            COALESCE(NULLIF(s.shipping_address, ''), c.address) as shipping_address,
            COALESCE(NULLIF(s.shipping_street, ''), c.street) as shipping_street,
            COALESCE(NULLIF(s.shipping_city, ''), c.city) as shipping_city,
            COALESCE(NULLIF(s.shipping_district, ''), c.district) as shipping_district,
            COALESCE(NULLIF(s.shipping_state, ''), c.state) as shipping_state,
            COALESCE(NULLIF(s.shipping_pincode, ''), c.pincode) as shipping_pincode,
            COALESCE(NULLIF(s.shipping_landmark, ''), c.landmark) as shipping_landmark,
            COALESCE(NULLIF(s.shipping_address_type, ''), c.address_type) as shipping_address_type,
            c.street as customer_street,
            c.city as customer_city,
            c.district as customer_district,
            c.state as customer_state,
            c.pincode as customer_pincode,
            c.landmark as customer_landmark,
            c.address as customer_address,
            s.expense_courier,
            s.weight_kg,
            s.courier_service_name,
            s.shipping_date,
            s.created_at,
            COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name,
            COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone,
            false as is_replacement
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE (
            s.courier_partner_id = ${partnerId}
            OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
            OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
          )
          AND (${status === "All"} OR LOWER(s.delivery_status) = LOWER(${status}))
          AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND s.tracking_id IS NOT NULL AND TRIM(s.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (s.tracking_id IS NULL OR TRIM(s.tracking_id) = '')))
          AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
          AND (
            ${!search}
            OR s.id::text ILIKE ${'%' + cleanNumStr + '%'}
            OR s.tracking_id ILIKE ${'%' + search + '%'}
            OR COALESCE(NULLIF(s.customer_name_override, ''), c.name) ILIKE ${'%' + search + '%'}
            OR COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) ILIKE ${'%' + search + '%'}
            OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
            OR s.courier_service_name ILIKE ${'%' + search + '%'}
            OR EXISTS (
              SELECT 1 FROM sale_items si 
              LEFT JOIN products p ON si.product_id = p.id 
              LEFT JOIN product_variants pv ON si.product_variant_id = pv.id 
              WHERE si.sale_id = s.id AND (
                p.name ILIKE ${'%' + search + '%'} 
                OR pv.name ILIKE ${'%' + search + '%'}
                OR pv.sku ILIKE ${'%' + search + '%'}
                OR p.barcode ILIKE ${'%' + search + '%'}
              )
            )
          )
          ORDER BY COALESCE(s.sale_date, s.created_at) DESC, s.id DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        sql`
          SELECT COUNT(*)::int as count
          FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE (
            s.courier_partner_id = ${partnerId}
            OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
            OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
          )
          AND (${status === "All"} OR LOWER(s.delivery_status) = LOWER(${status}))
          AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND s.tracking_id IS NOT NULL AND TRIM(s.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (s.tracking_id IS NULL OR TRIM(s.tracking_id) = '')))
          AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
          AND (
            ${!search}
            OR s.id::text ILIKE ${'%' + cleanNumStr + '%'}
            OR s.tracking_id ILIKE ${'%' + search + '%'}
            OR COALESCE(NULLIF(s.customer_name_override, ''), c.name) ILIKE ${'%' + search + '%'}
            OR COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) ILIKE ${'%' + search + '%'}
            OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
            OR s.courier_service_name ILIKE ${'%' + search + '%'}
            OR EXISTS (
              SELECT 1 FROM sale_items si 
              LEFT JOIN products p ON si.product_id = p.id 
              LEFT JOIN product_variants pv ON si.product_variant_id = pv.id 
              WHERE si.sale_id = s.id AND (
                p.name ILIKE ${'%' + search + '%'} 
                OR pv.name ILIKE ${'%' + search + '%'}
                OR pv.sku ILIKE ${'%' + search + '%'}
                OR p.barcode ILIKE ${'%' + search + '%'}
              )
            )
          )
        `
      ])
      combinedOrders = salesRes
      totalCount = Number(countRes[0]?.count || 0)
    } else if (orderType === "Replacement Shipments") {
      const [rsRes, countRes] = await Promise.all([
        sql`
          SELECT 
            rs.id,
            rs.replacement_number,
            rs.sale_id,
            rs.reason,
            rs.status as delivery_status,
            rs.status,
            rs.tracking_id,
            COALESCE(NULLIF(rs.shipping_address, ''), c.address) as shipping_address,
            COALESCE(NULLIF(rs.shipping_street, ''), c.street) as shipping_street,
            COALESCE(NULLIF(rs.shipping_city, ''), c.city) as shipping_city,
            COALESCE(NULLIF(rs.shipping_pincode, ''), c.pincode) as shipping_pincode,
            COALESCE(NULLIF(rs.shipping_landmark, ''), c.landmark) as shipping_landmark,
            COALESCE(NULLIF(rs.shipping_address_type, ''), c.address_type) as shipping_address_type,
            c.street as customer_street,
            c.city as customer_city,
            c.district as customer_district,
            c.state as customer_state,
            c.pincode as customer_pincode,
            c.landmark as customer_landmark,
            c.address as customer_address,
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
          AND (${status === "All"} OR LOWER(rs.status) = LOWER(${status}))
          AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND rs.tracking_id IS NOT NULL AND TRIM(rs.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (rs.tracking_id IS NULL OR TRIM(rs.tracking_id) = '')))
          AND (${isAllTime} OR (rs.created_at >= ${startDateStr}::timestamp AND rs.created_at < ${endDateStr}::timestamp))
          AND (
            ${!search}
            OR rs.replacement_number ILIKE ${'%' + search + '%'}
            OR rs.sale_id::text ILIKE ${'%' + cleanNumStr + '%'}
            OR rs.tracking_id ILIKE ${'%' + search + '%'}
            OR c.name ILIKE ${'%' + search + '%'}
            OR c.phone ILIKE ${'%' + search + '%'}
            OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
            OR rs.courier_service_name ILIKE ${'%' + search + '%'}
            OR EXISTS (
              SELECT 1 FROM replacement_shipment_items rsi 
              LEFT JOIN products p ON rsi.product_id = p.id 
              LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id 
              WHERE rsi.replacement_shipment_id = rs.id AND (
                p.name ILIKE ${'%' + search + '%'} 
                OR pv.name ILIKE ${'%' + search + '%'}
                OR pv.sku ILIKE ${'%' + search + '%'}
                OR p.barcode ILIKE ${'%' + search + '%'}
              )
            )
          )
          ORDER BY rs.created_at DESC, rs.id DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        sql`
          SELECT COUNT(*)::int as count
          FROM replacement_shipments rs
          LEFT JOIN customers c ON rs.customer_id = c.id
          WHERE (
            rs.courier_partner_id = ${partnerId}
            OR rs.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
            OR (rs.courier_service_id IS NOT NULL AND rs.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
          )
          AND (${status === "All"} OR LOWER(rs.status) = LOWER(${status}))
          AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND rs.tracking_id IS NOT NULL AND TRIM(rs.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (rs.tracking_id IS NULL OR TRIM(rs.tracking_id) = '')))
          AND (${isAllTime} OR (rs.created_at >= ${startDateStr}::timestamp AND rs.created_at < ${endDateStr}::timestamp))
          AND (
            ${!search}
            OR rs.replacement_number ILIKE ${'%' + search + '%'}
            OR rs.sale_id::text ILIKE ${'%' + cleanNumStr + '%'}
            OR rs.tracking_id ILIKE ${'%' + search + '%'}
            OR c.name ILIKE ${'%' + search + '%'}
            OR c.phone ILIKE ${'%' + search + '%'}
            OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
            OR rs.courier_service_name ILIKE ${'%' + search + '%'}
            OR EXISTS (
              SELECT 1 FROM replacement_shipment_items rsi 
              LEFT JOIN products p ON rsi.product_id = p.id 
              LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id 
              WHERE rsi.replacement_shipment_id = rs.id AND (
                p.name ILIKE ${'%' + search + '%'} 
                OR pv.name ILIKE ${'%' + search + '%'}
                OR pv.sku ILIKE ${'%' + search + '%'}
                OR p.barcode ILIKE ${'%' + search + '%'}
              )
            )
          )
        `
      ])
      combinedOrders = rsRes
      totalCount = Number(countRes[0]?.count || 0)
    } else {
      // orderType === "All"
      const [rowsRes, countRes] = await Promise.all([
        sql`
          SELECT * FROM (
            SELECT 
              'normal' as record_type,
              s.id as id,
              NULL as replacement_number,
              NULL as sale_id,
              NULL as reason,
              s.total_amount,
              s.status,
              s.payment_status,
              s.sale_date,
              s.payment_method,
              s.fulfillment_type,
              s.delivery_status,
              s.tracking_id,
              COALESCE(NULLIF(s.shipping_address, ''), c.address) as shipping_address,
              COALESCE(NULLIF(s.shipping_street, ''), c.street) as shipping_street,
              COALESCE(NULLIF(s.shipping_city, ''), c.city) as shipping_city,
              COALESCE(NULLIF(s.shipping_district, ''), c.district) as shipping_district,
              COALESCE(NULLIF(s.shipping_state, ''), c.state) as shipping_state,
              COALESCE(NULLIF(s.shipping_pincode, ''), c.pincode) as shipping_pincode,
              COALESCE(NULLIF(s.shipping_landmark, ''), c.landmark) as shipping_landmark,
              COALESCE(NULLIF(s.shipping_address_type, ''), c.address_type) as shipping_address_type,
              c.street as customer_street,
              c.city as customer_city,
              c.district as customer_district,
              c.state as customer_state,
              c.pincode as customer_pincode,
              c.landmark as customer_landmark,
              c.address as customer_address,
              s.expense_courier,
              s.weight_kg,
              s.courier_service_name,
              s.shipping_date,
              s.created_at,
              COALESCE(s.sale_date, s.created_at) as sort_date,
              COALESCE(NULLIF(s.customer_name_override, ''), c.name) as customer_name,
              COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) as customer_phone,
              false as is_replacement
            FROM sales s
            LEFT JOIN customers c ON s.customer_id = c.id
            WHERE (
              s.courier_partner_id = ${partnerId}
              OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
              OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
            )
            AND (${status === "All"} OR LOWER(s.delivery_status) = LOWER(${status}))
            AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND s.tracking_id IS NOT NULL AND TRIM(s.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (s.tracking_id IS NULL OR TRIM(s.tracking_id) = '')))
            AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
            AND (
              ${!search}
              OR s.id::text ILIKE ${'%' + cleanNumStr + '%'}
              OR s.tracking_id ILIKE ${'%' + search + '%'}
              OR COALESCE(NULLIF(s.customer_name_override, ''), c.name) ILIKE ${'%' + search + '%'}
              OR COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) ILIKE ${'%' + search + '%'}
              OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
              OR s.courier_service_name ILIKE ${'%' + search + '%'}
              OR EXISTS (
                SELECT 1 FROM sale_items si 
                LEFT JOIN products p ON si.product_id = p.id 
                LEFT JOIN product_variants pv ON si.product_variant_id = pv.id 
                WHERE si.sale_id = s.id AND (
                  p.name ILIKE ${'%' + search + '%'} 
                  OR pv.name ILIKE ${'%' + search + '%'}
                  OR pv.sku ILIKE ${'%' + search + '%'}
                  OR p.barcode ILIKE ${'%' + search + '%'}
                )
              )
            )

            UNION ALL

            SELECT 
              'replacement' as record_type,
              rs.id as id,
              rs.replacement_number,
              rs.sale_id,
              rs.reason,
              0 as total_amount,
              rs.status,
              'Paid' as payment_status,
              rs.created_at as sale_date,
              'N/A' as payment_method,
              rs.fulfillment_type,
              rs.status as delivery_status,
              rs.tracking_id,
              COALESCE(NULLIF(rs.shipping_address, ''), c.address) as shipping_address,
              COALESCE(NULLIF(rs.shipping_street, ''), c.street) as shipping_street,
              COALESCE(NULLIF(rs.shipping_city, ''), c.city) as shipping_city,
              c.district as shipping_district,
              c.state as shipping_state,
              COALESCE(NULLIF(rs.shipping_pincode, ''), c.pincode) as shipping_pincode,
              COALESCE(NULLIF(rs.shipping_landmark, ''), c.landmark) as shipping_landmark,
              COALESCE(NULLIF(rs.shipping_address_type, ''), c.address_type) as shipping_address_type,
              c.street as customer_street,
              c.city as customer_city,
              c.district as customer_district,
              c.state as customer_state,
              c.pincode as customer_pincode,
              c.landmark as customer_landmark,
              c.address as customer_address,
              0 as expense_courier,
              NULL as weight_kg,
              rs.courier_service_name,
              rs.shipping_date,
              rs.created_at,
              rs.created_at as sort_date,
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
            AND (${status === "All"} OR LOWER(rs.status) = LOWER(${status}))
            AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND rs.tracking_id IS NOT NULL AND TRIM(rs.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (rs.tracking_id IS NULL OR TRIM(rs.tracking_id) = '')))
            AND (${isAllTime} OR (rs.created_at >= ${startDateStr}::timestamp AND rs.created_at < ${endDateStr}::timestamp))
            AND (
              ${!search}
              OR rs.replacement_number ILIKE ${'%' + search + '%'}
              OR rs.sale_id::text ILIKE ${'%' + cleanNumStr + '%'}
              OR rs.tracking_id ILIKE ${'%' + search + '%'}
              OR c.name ILIKE ${'%' + search + '%'}
              OR c.phone ILIKE ${'%' + search + '%'}
              OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
              OR rs.courier_service_name ILIKE ${'%' + search + '%'}
              OR EXISTS (
                SELECT 1 FROM replacement_shipment_items rsi 
                LEFT JOIN products p ON rsi.product_id = p.id 
                LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id 
                WHERE rsi.replacement_shipment_id = rs.id AND (
                  p.name ILIKE ${'%' + search + '%'} 
                  OR pv.name ILIKE ${'%' + search + '%'}
                  OR pv.sku ILIKE ${'%' + search + '%'}
                  OR p.barcode ILIKE ${'%' + search + '%'}
                )
              )
            )
          ) combined
          ORDER BY sort_date DESC, id DESC
          LIMIT ${pageSize} OFFSET ${offset}
        `,
        sql`
          SELECT (
            (
              SELECT COUNT(*)::int
              FROM sales s
              LEFT JOIN customers c ON s.customer_id = c.id
              WHERE (
                s.courier_partner_id = ${partnerId}
                OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
                OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
              )
              AND (${status === "All"} OR LOWER(s.delivery_status) = LOWER(${status}))
              AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND s.tracking_id IS NOT NULL AND TRIM(s.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (s.tracking_id IS NULL OR TRIM(s.tracking_id) = '')))
              AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
              AND (
                ${!search}
                OR s.id::text ILIKE ${'%' + cleanNumStr + '%'}
                OR s.tracking_id ILIKE ${'%' + search + '%'}
                OR COALESCE(NULLIF(s.customer_name_override, ''), c.name) ILIKE ${'%' + search + '%'}
                OR COALESCE(NULLIF(s.customer_phone_override, ''), c.phone) ILIKE ${'%' + search + '%'}
                OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(NULLIF(s.customer_phone_override, ''), c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
                OR s.courier_service_name ILIKE ${'%' + search + '%'}
                OR EXISTS (
                  SELECT 1 FROM sale_items si 
                  LEFT JOIN products p ON si.product_id = p.id 
                  LEFT JOIN product_variants pv ON si.product_variant_id = pv.id 
                  WHERE si.sale_id = s.id AND (
                    p.name ILIKE ${'%' + search + '%'} 
                    OR pv.name ILIKE ${'%' + search + '%'}
                    OR pv.sku ILIKE ${'%' + search + '%'}
                    OR p.barcode ILIKE ${'%' + search + '%'}
                  )
                )
              )
            ) + (
              SELECT COUNT(*)::int
              FROM replacement_shipments rs
              LEFT JOIN customers c ON rs.customer_id = c.id
              WHERE (
                rs.courier_partner_id = ${partnerId}
                OR rs.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
                OR (rs.courier_service_id IS NOT NULL AND rs.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
              )
              AND (${status === "All"} OR LOWER(rs.status) = LOWER(${status}))
              AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND rs.tracking_id IS NOT NULL AND TRIM(rs.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (rs.tracking_id IS NULL OR TRIM(rs.tracking_id) = '')))
              AND (${isAllTime} OR (rs.created_at >= ${startDateStr}::timestamp AND rs.created_at < ${endDateStr}::timestamp))
              AND (
                ${!search}
                OR rs.replacement_number ILIKE ${'%' + search + '%'}
                OR rs.sale_id::text ILIKE ${'%' + cleanNumStr + '%'}
                OR rs.tracking_id ILIKE ${'%' + search + '%'}
                OR c.name ILIKE ${'%' + search + '%'}
                OR c.phone ILIKE ${'%' + search + '%'}
                OR (${digitsOnly.length >= 3} AND regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g') LIKE ${'%' + digitsOnly + '%'})
                OR rs.courier_service_name ILIKE ${'%' + search + '%'}
                OR EXISTS (
                  SELECT 1 FROM replacement_shipment_items rsi 
                  LEFT JOIN products p ON rsi.product_id = p.id 
                  LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id 
                  WHERE rsi.replacement_shipment_id = rs.id AND (
                    p.name ILIKE ${'%' + search + '%'} 
                    OR pv.name ILIKE ${'%' + search + '%'}
                    OR pv.sku ILIKE ${'%' + search + '%'}
                    OR p.barcode ILIKE ${'%' + search + '%'}
                  )
                )
              )
            )
          )::int as count
        `
      ])

      combinedOrders = rowsRes
      totalCount = Number(countRes[0]?.count || 0)
    }

    if (combinedOrders && combinedOrders.length > 0) {
      const replacementIds: number[] = []
      const saleIds: number[] = []

      for (const order of combinedOrders) {
        if (order.is_replacement || order.record_type === "replacement") {
          replacementIds.push(Number(order.id))
        } else {
          saleIds.push(Number(order.id))
        }
      }

      const rsItemsMap: Record<number, any[]> = {}
      if (replacementIds.length > 0) {
        const rsItems = await sql`
          SELECT 
            rsi.id,
            rsi.replacement_shipment_id,
            rsi.sale_item_id,
            rsi.product_id,
            rsi.product_variant_id,
            rsi.batch_id,
            rsi.quantity,
            COALESCE(p.name, 'Product') as product_name,
            pv.name as variant_name,
            pv.sku as variant_sku
          FROM replacement_shipment_items rsi
          LEFT JOIN products p ON rsi.product_id = p.id
          LEFT JOIN product_variants pv ON rsi.product_variant_id = pv.id
          WHERE rsi.replacement_shipment_id = ANY(${replacementIds})
          ORDER BY rsi.id ASC
        `
        for (const item of rsItems) {
          const rsId = Number(item.replacement_shipment_id)
          if (!rsItemsMap[rsId]) rsItemsMap[rsId] = []
          rsItemsMap[rsId].push(item)
        }
      }

      const saleItemsMap: Record<number, any[]> = {}
      if (saleIds.length > 0) {
        const saleItems = await sql`
          SELECT 
            si.id,
            si.sale_id,
            si.product_id,
            si.product_variant_id,
            si.quantity,
            si.price,
            COALESCE(p.name, 'Product') as product_name,
            pv.name as variant_name,
            pv.sku as variant_sku
          FROM sale_items si
          LEFT JOIN products p ON si.product_id = p.id
          LEFT JOIN product_variants pv ON si.product_variant_id = pv.id
          WHERE si.sale_id = ANY(${saleIds})
          ORDER BY si.id ASC
        `
        for (const item of saleItems) {
          const sId = Number(item.sale_id)
          if (!saleItemsMap[sId]) saleItemsMap[sId] = []
          saleItemsMap[sId].push(item)
        }
      }

      combinedOrders = combinedOrders.map((order: any) => {
        const isRs = Boolean(order.is_replacement || order.record_type === "replacement")
        const orderId = Number(order.id)
        const items = isRs ? (rsItemsMap[orderId] || []) : (saleItemsMap[orderId] || [])
        return {
          ...order,
          items,
        }
      })
    }

    const pendingReplacementsRes = await sql`
      SELECT COUNT(*)::int as count
      FROM replacement_shipments rs
      WHERE (
        rs.courier_partner_id = ${partnerId}
        OR rs.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (rs.courier_service_id IS NOT NULL AND rs.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      AND LOWER(rs.status) IN ('pending', 'processing')
    `
    const pendingReplacementsCount = Number(pendingReplacementsRes[0]?.count || 0)

    const totalPages = Math.ceil(totalCount / pageSize) || 1

    return {
      success: true,
      data: combinedOrders,
      totalCount,
      page,
      pageSize,
      totalPages,
      pendingReplacementsCount,
    }
  } catch (error) {
    console.error("Error in getFilteredPartnerOrders:", error)
    return {
      success: false,
      message: "Failed to load partner orders",
      data: [],
      replacementShipments: [],
      totalCount: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
      pendingReplacementsCount: 0,
    }
  }
}

export async function getPartnerSales(partnerId: number) {
  return getFilteredPartnerOrders({})
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

export async function getPartnerDashboardStats(partnerId: number, params: PartnerOrderFilterParams = {}) {
  try {
    const { startDateStr, endDateStr, isAllTime } = getPartnerDateBounds(params.dateRange, params.fromDate, params.toDate)
    
    // Total Orders and Active Orders in date range
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
      AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
    `
    
    // Total Earnings (sum of expense_courier) in date range
    const earningsResult = await sql`
      SELECT SUM(COALESCE(expense_courier, 0)) as total_earnings
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
    `
    
    // Period Activity
    const activityResult = await sql`
      SELECT COUNT(*) as period_activity
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      AND (${isAllTime} OR (
        (s.created_at >= ${startDateStr}::timestamp AND s.created_at < ${endDateStr}::timestamp)
        OR (s.updated_at >= ${startDateStr}::timestamp AND s.updated_at < ${endDateStr}::timestamp)
      ))
    `

    return {
      success: true,
      data: {
        totalOrders: Number(ordersResult[0]?.total_orders || 0),
        activeOrders: Number(ordersResult[0]?.active_orders || 0),
        totalEarnings: Number(earningsResult[0]?.total_earnings || 0),
        todayActivity: Number(activityResult[0]?.period_activity || 0)
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

export async function getPartnerSalesAnalytics(partnerId: number, params: PartnerOrderFilterParams | string = {}) {
  try {
    let dateParams: PartnerOrderFilterParams = {}
    if (typeof params === "string") {
      // Backwards compatibility if called with monthStr
      dateParams = { dateRange: "This Month" }
    } else {
      dateParams = params
    }

    const { startDateStr, endDateStr, startDateObj, endDateObj, isAllTime } = getPartnerDateBounds(
      dateParams.dateRange,
      dateParams.fromDate,
      dateParams.toDate
    )

    const rawRows = await sql`
      SELECT 
        TO_CHAR(COALESCE(s.sale_date, s.created_at), 'YYYY-MM-DD') as date,
        SUM(COALESCE(s.expense_courier, 0)) as earnings_amount,
        COUNT(*) as order_count
      FROM sales s
      WHERE (
        s.courier_partner_id = ${partnerId}
        OR s.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (s.courier_service_id IS NOT NULL AND s.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      AND (${isAllTime} OR (COALESCE(s.sale_date, s.created_at) >= ${startDateStr}::timestamp AND COALESCE(s.sale_date, s.created_at) < ${endDateStr}::timestamp))
      GROUP BY TO_CHAR(COALESCE(s.sale_date, s.created_at), 'YYYY-MM-DD')
      ORDER BY date ASC
    `

    const rowMap = new Map<string, number>()
    for (const r of rawRows) {
      if (r.date) {
        rowMap.set(r.date, Number(r.earnings_amount || 0))
      }
    }

    let cur = new Date(startDateObj)
    let last = new Date(endDateObj)
    last.setDate(last.getDate() - 1)

    if (isAllTime) {
      if (rawRows.length > 0 && rawRows[0].date) {
        const [sy, sm, sd] = rawRows[0].date.split("-").map(Number)
        cur = new Date(sy, sm - 1, sd)
        const lastRowDate = rawRows[rawRows.length - 1].date
        const [ey, em, ed] = lastRowDate.split("-").map(Number)
        last = new Date(ey, em - 1, ed)
      } else {
        const now = new Date()
        cur = new Date(now.getFullYear(), now.getMonth(), 1)
        last = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      }
    }

    const series: Array<{ date: string; dayStr: string; earnings: number }> = []
    let steps = 0

    while (cur <= last && steps < 366) {
      const year = cur.getFullYear()
      const month = String(cur.getMonth() + 1).padStart(2, "0")
      const day = String(cur.getDate()).padStart(2, "0")
      const dateStr = `${year}-${month}-${day}`
      const dayStr = `${cur.getDate()}/${cur.getMonth() + 1}`
      const earnings = rowMap.get(dateStr) || 0

      series.push({
        date: dateStr,
        dayStr,
        earnings,
      })

      cur.setDate(cur.getDate() + 1)
      steps++
    }

    return {
      success: true,
      data: series,
      startDate: series[0]?.date || startDateStr.split(" ")[0],
      endDate: series[series.length - 1]?.date || endDateStr.split(" ")[0],
    }
  } catch (error) {
    console.error("Error fetching partner analytics:", error)
    return { success: false, message: "Failed to load analytics", data: [] }
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
