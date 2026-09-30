import "server-only"
import { sql } from "@/lib/db"

/**
 * Resolves the owning company of a device (devices.company_id).
 * Returns null when the device is unknown so callers never attribute a
 * transaction to a default company.
 */
export async function getDeviceCompanyId(deviceId: number | null | undefined): Promise<number | null> {
  if (!deviceId) return null
  const rows = await sql`SELECT company_id FROM devices WHERE id = ${deviceId} LIMIT 1`
  const companyId = rows[0]?.company_id
  return companyId == null ? null : Number(companyId)
}
