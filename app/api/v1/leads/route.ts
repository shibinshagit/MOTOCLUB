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

    // Prepare validated payload
    const payload = {
      external_lead_id: external_lead_id.trim(),
      name: name.trim(),
      phone: typeof body.phone === 'string' ? body.phone.trim() : null,
      email: typeof body.email === 'string' ? body.email.trim() : null,
      source: typeof body.source === 'string' ? body.source.trim() : null,
      campaign: typeof body.campaign === 'string' ? body.campaign.trim() : null,
      ad_name: typeof body.ad_name === 'string' ? body.ad_name.trim() : null,
      message: typeof body.message === 'string' ? body.message.trim() : null
    }

    // 4. INSERT LEAD
    const result = await createCrmLead(
      Number(agency.id),
      Number(agency.company_id),
      agency.device_id ? Number(agency.device_id) : null,
      payload
    )

    if (!result.success) {
      return NextResponse.json(result, { status: 500 })
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
