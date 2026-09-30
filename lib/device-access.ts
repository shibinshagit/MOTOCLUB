import "server-only"
import { cookies } from "next/headers"
import { sql } from "@/lib/db"
import { getAdminSession } from "@/app/actions/admin-auth-actions"
import { getStaffSession } from "@/lib/staff-session"

export type ServerActor =
  | { kind: "platform_admin" }
  | { kind: "staff_admin"; deviceId: number }
  | { kind: "staff"; deviceId: number }
  | { kind: "device"; deviceId: number }

/** Who is making this request, decided only from server-side sessions/cookies. */
export async function getServerActor(): Promise<ServerActor | null> {
  try {
    const platform = await getAdminSession()
    if (platform.authenticated && platform.admin) return { kind: "platform_admin" }
  } catch {
    // fall through to staff / device sessions
  }

  const staff = await getStaffSession()
  if (staff?.deviceId) {
    return staff.role === "admin"
      ? { kind: "staff_admin", deviceId: Number(staff.deviceId) }
      : { kind: "staff", deviceId: Number(staff.deviceId) }
  }

  const authToken = (await cookies()).get("authToken")?.value
  if (authToken) {
    const rows = await sql`SELECT id FROM devices WHERE auth_token = ${authToken} LIMIT 1`
    if (rows.length > 0) return { kind: "device", deviceId: Number(rows[0].id) }
  }
  return null
}

/**
 * The device whose data may be read. A client-supplied id is only honoured for a
 * platform admin (who can open any device); everyone else is pinned to their session device.
 */
export async function resolveAuthorizedDeviceId(requestedDeviceId: number): Promise<number | null> {
  const actor = await getServerActor()
  if (!actor) return null
  if (actor.kind === "platform_admin") {
    const rows = await sql`SELECT id FROM devices WHERE id = ${requestedDeviceId} LIMIT 1`
    return rows.length > 0 ? Number(rows[0].id) : null
  }
  return actor.deviceId
}
