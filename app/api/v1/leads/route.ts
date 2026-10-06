import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { createCrmLead } from "@/app/actions/crm-actions"

export async function POST(req: NextRequest) {
  try {
    // 1. AUTHENTICATE
    const authHeader = req.headers.get("authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ success: false, message: "Invalid API credentials" }, { status: 401 })
    }

    const rawKey = authHeader.replace("Bearer ", "").trim()
    if (!rawKey) {
      return NextResponse.json({ success: false, message: "Invalid API credentials" }, { status: 401 })
    }

    const hashedKey = await hashPassword(rawKey)

    const agencies = await sql`
      SELECT id, company_id, device_id, status 
      FROM crm_agencies 
      WHERE api_key_hash = ${hashedKey}
      LIMIT 1
    `

    if (agencies.length === 0) {
      return NextResponse.json({ success: false, message: "Invalid API credentials" }, { status: 401 })
    }

    const agency = agencies[0]

    if (agency.status !== 'active') {
      return NextResponse.json({ success: false, message: "Agency is inactive" }, { status: 403 })
    }

    // 2. PARSE JSON
    let body: any
    try {
      body = await req.json()
    } catch (err) {
      return NextResponse.json({ success: false, message: "Invalid JSON" }, { status: 400 })
    }

    // 3. VALIDATE
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({
        success: false,
        message: "Invalid request",
        errors: { body: "Request body must be a JSON object" }
      }, { status: 400 })
    }

    const { external_lead_id, name } = body

    if (!external_lead_id || typeof external_lead_id !== 'string' || !external_lead_id.trim()) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid request", 
        errors: { external_lead_id: "external_lead_id is required" } 
      }, { status: 400 })
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ 
        success: false, 
        message: "Invalid request", 
        errors: { name: "name is required" } 
      }, { status: 400 })
    }

    // Field lengths mirror the database columns; longer values would otherwise fail the insert with a 500
    const MAX_LENGTHS: Record<string, number> = {
      external_lead_id: 255, name: 255, phone: 50, email: 255, source: 100, campaign: 255, ad_name: 255
    }
    const tooLong: Record<string, string> = {}
    for (const [field, max] of Object.entries(MAX_LENGTHS)) {
      const value = body[field]
      if (typeof value === 'string' && value.trim().length > max) {
        tooLong[field] = `${field} must be at most ${max} characters`
      }
    }
    if (Object.keys(tooLong).length > 0) {
      return NextResponse.json({ success: false, message: "Invalid request", errors: tooLong }, { status: 400 })
    }

    // Optional product references (shape only; existence/tenancy checked in createCrmLead)
    const products: { product_id: number; product_variant_id: number | null }[] = []
    if (body.products !== undefined && body.products !== null) {
      const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
      if (!Array.isArray(body.products) || body.products.length > 20) {
        return NextResponse.json({
          success: false,
          message: "Invalid request",
          errors: { products: "products must be an array of at most 20 items" }
        }, { status: 400 })
      }
      const seen = new Set<string>()
      for (const item of body.products) {
        const variantGiven = item && item.product_variant_id !== undefined && item.product_variant_id !== null
        if (!item || !isId(item.product_id) || (variantGiven && !isId(item.product_variant_id))) {
          return NextResponse.json({
            success: false,
            message: "Invalid request",
            errors: { products: "each product needs a positive integer product_id and optional product_variant_id" }
          }, { status: 400 })
        }
        const key = `${item.product_id}:${variantGiven ? item.product_variant_id : ''}`
        if (seen.has(key)) continue
        seen.add(key)
        products.push({ product_id: item.product_id, product_variant_id: variantGiven ? item.product_variant_id : null })
      }
    }

    // Prepare validated payload
    const payload = {
      external_lead_id: external_lead_id.trim(),
      name: name.trim(),
      phone: typeof body.phone === 'string' ? body.phone.trim() : null,
      email: typeof body.email === 'string' ? body.email.trim() : null,
      source: typeof body.source === 'string' ? body.source.trim() : null,
      campaign: typeof body.campaign === 'string' ? body.campaign.trim() : null,
      ad_name: typeof body.ad_name === 'string' ? body.ad_name.trim() : null,
      message: typeof body.message === 'string' ? body.message.trim() : null,
      products
    }

    // 4. INSERT LEAD
    const result = await createCrmLead(
      Number(agency.id),
      Number(agency.company_id),
      agency.device_id ? Number(agency.device_id) : null,
      payload
    )

    if (!result.success) {
      // the HTTP status travels in the response status line, not in the body
      const { status, ...errorBody } = result as any
      return NextResponse.json(errorBody, { status: status ?? 500 })
    }

    // 5. RESPOND
    return NextResponse.json(result, { status: result.data?.created ? 201 : 200 })

  } catch (error: any) {
    console.error("API /api/v1/leads error:", error)
    return NextResponse.json(
      { success: false, message: "Internal Server Error" },
      { status: 500 }
    )
  }
}
