"use server"

import { sql } from "@/lib/db"
import { unstable_noStore as noStore } from "next/cache"
import { format, addDays, parseISO } from "date-fns"
import { isPendingSale, isCriticalSale } from "@/lib/sale-shipping"

function isEcomAllowedDevice(deviceId?: number): boolean {
  if (!deviceId) return true
  const allowed = process.env.ECOMMERCE_DEVICE_IDS
    ? process.env.ECOMMERCE_DEVICE_IDS.split(",").map((id) => Number(id.trim()))
    : [1, 4]
  return allowed.includes(Number(deviceId))
}

export async function getJobCardsSummary(
  deviceId?: number,
  options?: { dateFrom?: string; dateTo?: string; searchTerm?: string }
) {
  noStore()
  try {
    const allowEcom = isEcomAllowedDevice(deviceId)
    const dateFrom = options?.dateFrom || null
    const endExclusive = options?.dateTo
      ? format(addDays(parseISO(options.dateTo), 1), "yyyy-MM-dd")
      : null
    
    let searchTerm = null
    if (options?.searchTerm?.trim()) {
      searchTerm = `%${options.searchTerm.toLowerCase()}%`
    }

    let sales = []
    if (deviceId && deviceId > 0) {
      sales = await sql`
        SELECT 
          s.id,
          s.total_amount,
          s.status,
          s.payment_status,
          s.delivery_status,
          s.received_amount,
          s.sale_type,
          s.tracking_id,
          s.fulfillment_type
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN staff cp ON cp.id = s.courier_partner_id
        LEFT JOIN master_data md_partner ON md_partner.id = s.courier_partner_id
        WHERE s.device_id = ${deviceId}
          AND (${allowEcom} OR s.source IS NULL OR s.source != 'ECOMMERCE')
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
    } else {
      sales = await sql`
        SELECT 
          s.id,
          s.total_amount,
          s.status,
          s.payment_status,
          s.delivery_status,
          s.received_amount,
          s.sale_type,
          s.tracking_id,
          s.fulfillment_type
        FROM sales s
        LEFT JOIN customers c ON s.customer_id = c.id
        LEFT JOIN staff cp ON cp.id = s.courier_partner_id
        LEFT JOIN master_data md_partner ON md_partner.id = s.courier_partner_id
        WHERE (s.status != 'Cancelled' OR s.delivery_status = 'Returned')
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
    }

    const totalCount = sales.length
    const totalSalesAmount = sales.reduce((sum: number, sale: any) => sum + Number(sale.total_amount || 0), 0)

    const pendingSalesList = sales.filter(isPendingSale)
    const pendingCount = pendingSalesList.length
    const pendingSalesAmount = pendingSalesList.reduce((sum: number, sale: any) => sum + Number(sale.total_amount || 0), 0)

    const criticalSalesList = sales.filter(isCriticalSale)
    const criticalCount = criticalSalesList.length
    const criticalSalesAmount = criticalSalesList.reduce((sum: number, sale: any) => sum + Number(sale.total_amount || 0), 0)

    return {
      success: true,
      data: {
        totalCount,
        totalSalesAmount,
        pendingCount,
        pendingSalesAmount,
        criticalCount,
        criticalSalesAmount
      }
    }
  } catch (error: any) {
    console.error("getJobCardsSummary Error:", error)
    return { success: false, message: error.message || "Failed to fetch summary" }
  }
}
