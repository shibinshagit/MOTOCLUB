import { sql, resetConnectionState } from "@/lib/db"

export type CrmLeadProductRef = { product_id: number; product_variant_id: number | null }

class CrmLeadValidationError extends Error {}

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
    const products: CrmLeadProductRef[] = Array.isArray(data.products) ? data.products : []

    if (!external_lead_id || !name) {
      return { success: false, message: "Missing required fields: external_lead_id, name" }
    }

    // Attempt to insert or return existing on conflict
    const leadNumber = `LD-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 1000)}`

    const row = await sql.begin(async (tx: any) => {
      // Validate product references against the agency's company before creating anything
      for (const ref of products) {
        const productRows = await tx`
          SELECT p.id FROM products p
          WHERE p.id = ${ref.product_id}
            AND p.created_by IN (SELECT d.id FROM devices d WHERE d.company_id = ${companyId})
        `
        if (productRows.length === 0) {
          throw new CrmLeadValidationError(`Product ${ref.product_id} not found`)
        }
        if (ref.product_variant_id !== null) {
          const variantRows = await tx`
            SELECT id FROM product_variants
            WHERE id = ${ref.product_variant_id} AND product_id = ${ref.product_id}
          `
          if (variantRows.length === 0) {
            throw new CrmLeadValidationError(
              `Variant ${ref.product_variant_id} not found for product ${ref.product_id}`
            )
          }
        }
      }

      const result = await tx`
        INSERT INTO crm_leads (
          lead_number, agency_id, company_id, device_id, external_lead_id,
          name, phone, email, source, campaign, ad_name, message,
          status, created_at, updated_at
        )
        VALUES (
          ${leadNumber}, ${agencyId}, ${companyId}, ${deviceId}, ${external_lead_id},
          ${name}, ${phone || null}, ${email || null}, ${source || null},
          ${campaign || null}, ${ad_name || null}, ${message || null},
          'New', NOW(), NOW()
        )
        ON CONFLICT (agency_id, external_lead_id) DO UPDATE SET updated_at = NOW()
        RETURNING id, lead_number, (xmax = 0) AS inserted
      `
      const leadRow = result[0]

      // Retries only add missing product links; existing links are never removed or overwritten
      for (const ref of products) {
        await tx`
          INSERT INTO crm_lead_products (lead_id, product_id, product_variant_id)
          VALUES (${leadRow.id}, ${ref.product_id}, ${ref.product_variant_id})
          ON CONFLICT DO NOTHING
        `
      }
      return leadRow
    })

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
    if (error instanceof CrmLeadValidationError) {
      return { success: false, status: 400, message: "Invalid request", errors: { products: error.message } }
    }
    console.error("createCrmLead error:", error)
    return { success: false, message: "Failed to create lead" }
  }
}
