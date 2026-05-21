import { type NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const saleId = Number.parseInt(params.id)

    if (!saleId || isNaN(saleId)) {
      return NextResponse.json({ success: false, message: "Invalid sale ID" }, { status: 400 })
    }

    const saleResult = await sql`
      SELECT device_id, created_by
      FROM sales
      WHERE id = ${saleId}
      LIMIT 1
    `

    const stockDeviceId = Number(saleResult[0]?.device_id || saleResult[0]?.created_by || 0)

    // Get sale items with comprehensive product and service information
    const itemsResult = await sql`
      SELECT 
        si.*,
        p.name as product_name,
        p.category as product_category,
        COALESCE(pds.stock, 0) as stock,
        p.barcode,
        p.description as product_description,
        p.wholesale_price as product_wholesale_price,
        s.name as service_name,
        s.category as service_category,
        s.description as service_description,
        s.duration_minutes,
        COALESCE(si.cost, si.wholesale_price, 0) as actual_cost,
        CASE 
          WHEN s.id IS NOT NULL THEN 'service'
          WHEN p.id IS NOT NULL THEN 'product'
          ELSE 'unknown'
        END as item_type
      FROM sale_items si
      LEFT JOIN products p ON si.product_id = p.id AND NOT EXISTS (SELECT 1 FROM services srv WHERE srv.id = si.product_id)
      LEFT JOIN product_device_stock pds ON pds.product_id = p.id AND pds.device_id = ${stockDeviceId}
      LEFT JOIN services s ON si.product_id = s.id
      WHERE si.sale_id = ${saleId}
      ORDER BY si.id
    `

    return NextResponse.json({
      success: true,
      data: itemsResult,
    })
  } catch (error) {
    console.error("Error fetching sale items:", error)
    return NextResponse.json({ success: false, message: "Failed to fetch sale items" }, { status: 500 })
  }
}
