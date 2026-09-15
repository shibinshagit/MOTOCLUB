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
    const dateRange = (params.dateRange || "All").trim()
    const fromDate = (params.fromDate || "").trim()
    const toDate = (params.toDate || "").trim()
    const tracking = (params.tracking || "All").trim()

    const cleanNumStr = search.replace(/^(#|MC-|RS-)/i, "").trim()
    const digitsOnly = search.replace(/\D/g, "")

    const hasFromDate = Boolean(dateRange === "Custom Range" && fromDate)
    const fromDateVal = hasFromDate ? `${fromDate} 00:00:00` : "1970-01-01 00:00:00"
    const toDateVal = hasFromDate ? `${toDate || fromDate} 23:59:59.999` : "2099-12-31 23:59:59.999"

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
            s.shipping_address,
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
          AND (
            ${dateRange === "All"}
            OR (${dateRange === "Today"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE)
            OR (${dateRange === "Yesterday"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE - INTERVAL '1 day')
            OR (${dateRange === "Last 7 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '7 days')
            OR (${dateRange === "Last 30 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '30 days')
            OR (${hasFromDate} AND COALESCE(s.sale_date, s.created_at) >= ${fromDateVal}::timestamp AND COALESCE(s.sale_date, s.created_at) <= ${toDateVal}::timestamp)
          )
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
          AND (
            ${dateRange === "All"}
            OR (${dateRange === "Today"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE)
            OR (${dateRange === "Yesterday"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE - INTERVAL '1 day')
            OR (${dateRange === "Last 7 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '7 days')
            OR (${dateRange === "Last 30 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '30 days')
            OR (${hasFromDate} AND COALESCE(s.sale_date, s.created_at) >= ${fromDateVal}::timestamp AND COALESCE(s.sale_date, s.created_at) <= ${toDateVal}::timestamp)
          )
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
          AND (${status === "All"} OR LOWER(rs.status) = LOWER(${status}))
          AND (${tracking === "All"} OR (${tracking === "With Tracking"} AND rs.tracking_id IS NOT NULL AND TRIM(rs.tracking_id) != '') OR (${tracking === "Without Tracking"} AND (rs.tracking_id IS NULL OR TRIM(rs.tracking_id) = '')))
          AND (
            ${dateRange === "All"}
            OR (${dateRange === "Today"} AND DATE(rs.created_at) = CURRENT_DATE)
            OR (${dateRange === "Yesterday"} AND DATE(rs.created_at) = CURRENT_DATE - INTERVAL '1 day')
            OR (${dateRange === "Last 7 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '7 days')
            OR (${dateRange === "Last 30 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '30 days')
            OR (${hasFromDate} AND rs.created_at >= ${fromDateVal}::timestamp AND rs.created_at <= ${toDateVal}::timestamp)
          )
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
          AND (
            ${dateRange === "All"}
            OR (${dateRange === "Today"} AND DATE(rs.created_at) = CURRENT_DATE)
            OR (${dateRange === "Yesterday"} AND DATE(rs.created_at) = CURRENT_DATE - INTERVAL '1 day')
            OR (${dateRange === "Last 7 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '7 days')
            OR (${dateRange === "Last 30 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '30 days')
            OR (${hasFromDate} AND rs.created_at >= ${fromDateVal}::timestamp AND rs.created_at <= ${toDateVal}::timestamp)
          )
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
              s.shipping_address,
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
            AND (
              ${dateRange === "All"}
              OR (${dateRange === "Today"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE)
              OR (${dateRange === "Yesterday"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE - INTERVAL '1 day')
              OR (${dateRange === "Last 7 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '7 days')
              OR (${dateRange === "Last 30 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '30 days')
              OR (${hasFromDate} AND COALESCE(s.sale_date, s.created_at) >= ${fromDateVal}::timestamp AND COALESCE(s.sale_date, s.created_at) <= ${toDateVal}::timestamp)
            )
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
              rs.shipping_address,
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
            AND (
              ${dateRange === "All"}
              OR (${dateRange === "Today"} AND DATE(rs.created_at) = CURRENT_DATE)
              OR (${dateRange === "Yesterday"} AND DATE(rs.created_at) = CURRENT_DATE - INTERVAL '1 day')
              OR (${dateRange === "Last 7 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '7 days')
              OR (${dateRange === "Last 30 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '30 days')
              OR (${hasFromDate} AND rs.created_at >= ${fromDateVal}::timestamp AND rs.created_at <= ${toDateVal}::timestamp)
            )
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
              AND (
                ${dateRange === "All"}
                OR (${dateRange === "Today"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE)
                OR (${dateRange === "Yesterday"} AND DATE(COALESCE(s.sale_date, s.created_at)) = CURRENT_DATE - INTERVAL '1 day')
                OR (${dateRange === "Last 7 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '7 days')
                OR (${dateRange === "Last 30 Days"} AND COALESCE(s.sale_date, s.created_at) >= CURRENT_DATE - INTERVAL '30 days')
                OR (${hasFromDate} AND COALESCE(s.sale_date, s.created_at) >= ${fromDateVal}::timestamp AND COALESCE(s.sale_date, s.created_at) <= ${toDateVal}::timestamp)
              )
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
              AND (
                ${dateRange === "All"}
                OR (${dateRange === "Today"} AND DATE(rs.created_at) = CURRENT_DATE)
                OR (${dateRange === "Yesterday"} AND DATE(rs.created_at) = CURRENT_DATE - INTERVAL '1 day')
                OR (${dateRange === "Last 7 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '7 days')
                OR (${dateRange === "Last 30 Days"} AND rs.created_at >= CURRENT_DATE - INTERVAL '30 days')
                OR (${hasFromDate} AND rs.created_at >= ${fromDateVal}::timestamp AND rs.created_at <= ${toDateVal}::timestamp)
              )
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
          ) as count
        `
      ])

      combinedOrders = rowsRes
      totalCount = Number(countRes[0]?.count || 0)
    }

    // Populate replacement shipment items if replacements exist in current page
    const replacementRecordsInPage = combinedOrders.filter((r: any) => r.is_replacement || r.record_type === "replacement")
    if (replacementRecordsInPage.length > 0) {
      const rsIds = replacementRecordsInPage.map((r: any) => r.id)
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
      for (const rs of replacementRecordsInPage) {
        rs.items = itemsMap[rs.id] || []
      }
    }

    // Pending replacement shipments count for dashboard banner
    const pendingReplacementsCountRes = await sql`
      SELECT COUNT(*)::int as count
      FROM replacement_shipments rs
      WHERE (
        rs.courier_partner_id = ${partnerId}
        OR rs.courier_partner_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL)
        OR (rs.courier_service_id IS NOT NULL AND rs.courier_service_id = (SELECT linked_partner_id FROM staff WHERE id = ${partnerId} AND linked_partner_id IS NOT NULL))
      )
      AND LOWER(rs.status) NOT IN ('delivered', 'cancelled', 'failed', 'returned')
    `

    const totalPages = Math.ceil(totalCount / pageSize) || 1

    return {
      success: true,
      data: combinedOrders,
      replacementShipments: replacementRecordsInPage,
      totalCount,
      page,
      pageSize,
      totalPages,
      pendingReplacementsCount: Number(pendingReplacementsCountRes[0]?.count || 0),
    }
  } catch (error) {
    console.error("Error fetching filtered partner orders:", error)
    return {
      success: false,
      message: "Failed to fetch partner orders",
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
