import { sql, resetConnectionState } from "@/lib/db"

export async function createCrmLead(agencyId: number, companyId: number, deviceId: number | null, data: any) {
  resetConnectionState()
  try {
    const {
      external_lead_id,
      name,
      phone,
      email,
      source,
      campaign,
      ad_name,
      message
    } = data

    if (!external_lead_id || !name) {
      return { success: false, message: "Missing required fields: external_lead_id, name" }
    }

    // Attempt to insert or return existing on conflict
    const leadNumber = `LD-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`

    const result = await sql`
      INSERT INTO crm_leads (
        lead_number,
        agency_id,
        company_id,
        device_id,
        external_lead_id,
        name,
        phone,
        email,
        source,
        campaign,
        ad_name,
        message,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${leadNumber},
        ${agencyId},
        ${companyId},
        ${deviceId},
        ${external_lead_id},
        ${name},
        ${phone || null},
        ${email || null},
        ${source || null},
        ${campaign || null},
        ${ad_name || null},
        ${message || null},
        'New',
        NOW(),
        NOW()
      )
      ON CONFLICT (agency_id, external_lead_id) DO UPDATE SET updated_at = NOW()
      RETURNING id, lead_number, (xmax = 0) AS inserted
    `

    const row = result[0]
    return {
      success: true,
      message: row.inserted ? "Lead created successfully" : "Lead already exists",
      data: {
        lead_id: Number(row.id),
        lead_number: String(row.lead_number),
        created: row.inserted
      }
    }
  } catch (error: any) {
    console.error("createCrmLead error:", error)
    return { success: false, message: "Failed to create lead" }
  }
}
