import { cookies } from "next/headers"
import { SignJWT, jwtVerify, type JWTPayload } from "jose"
import { sql } from "@/lib/db"
import { getAdminSession } from "@/app/actions/admin-auth-actions"
import { getStaffSession } from "@/lib/staff-session"

const DASHBOARD_UNLOCK_COOKIE = "admin_dashboard_unlocked"
const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback_super_secret_key_for_development_only_12345!"
)
const DEFAULT_PIN = process.env.ADMIN_DASHBOARD_PIN || "1234"

export interface DashboardUnlockPayload extends JWTPayload {
  unlocked: boolean
  adminRole: "PLATFORM_ADMIN" | "DEVICE_ADMIN" | "STAFF_ADMIN"
  actorId?: number
  deviceId?: number
}

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin.trim())
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

/**
 * Checks whether the current request is from an authorized Administrator:
 * - Platform Super Admin (from /admin portal)
 * - Device Admin / Staff with role "admin"
 * Returns unauthorized for normal "staff" or "partner".
 */
export async function getAdminActor() {
  try {
    // 1. Check Platform Super Admin
    const platformSession = await getAdminSession()
    if (platformSession.authenticated && platformSession.admin) {
      return {
        isAuthorized: true,
        adminRole: "PLATFORM_ADMIN" as const,
        actorId: platformSession.admin.id,
        name: platformSession.admin.name,
      }
    }

    // 2. Check Staff Session
    const staffSession = await getStaffSession()
    if (staffSession) {
      // Strictly verify role is "admin"
      if (staffSession.role === "admin") {
        return {
          isAuthorized: true,
          adminRole: "STAFF_ADMIN" as const,
          actorId: staffSession.staffId,
          deviceId: staffSession.deviceId,
          name: staffSession.staffName,
        }
      }

      // Explicitly reject staff or partner
      return {
        isAuthorized: false,
        adminRole: null,
        error: "Staff and partner accounts do not have permission to access the Admin Dashboard.",
      }
    }

    // 3. Fallback: If no staff session or platform session, check if device authToken is active
    const cookieStore = await cookies()
    const authToken = cookieStore.get("authToken")?.value
    if (authToken) {
      const devices = await sql`
        SELECT id, name, company_id FROM devices WHERE auth_token = ${authToken} LIMIT 1
      `
      if (devices.length > 0) {
        return {
          isAuthorized: true,
          adminRole: "DEVICE_ADMIN" as const,
          actorId: devices[0].id,
          deviceId: devices[0].id,
          name: devices[0].name,
        }
      }
    }

    return {
      isAuthorized: false,
      adminRole: null,
      error: "No active admin session found. Please sign in as an Administrator.",
    }
  } catch (error) {
    console.error("getAdminActor error:", error)
    return {
      isAuthorized: false,
      adminRole: null,
      error: "Error verifying admin privileges.",
    }
  }
}

/**
 * Validates the entered PIN against the database stored hash or default environment PIN.
 */
export async function verifyDashboardPin(inputPin: string): Promise<boolean> {
  if (!inputPin || typeof inputPin !== "string" || !inputPin.trim()) {
    return false
  }

  const inputHash = await hashPin(inputPin)

  try {
    const settings = await sql`
      SELECT admin_dashboard_pin_hash FROM platform_settings WHERE id = 1 LIMIT 1
    `

    const storedHash = settings[0]?.admin_dashboard_pin_hash
    if (storedHash && typeof storedHash === "string" && storedHash.trim()) {
      return storedHash.trim() === inputHash
    }

    // Fallback to configured or default PIN hash
    const defaultHash = await hashPin(DEFAULT_PIN)
    return inputHash === defaultHash
  } catch (error) {
    console.error("verifyDashboardPin error:", error)
    // Fallback comparison
    const defaultHash = await hashPin(DEFAULT_PIN)
    return inputHash === defaultHash
  }
}

/**
 * Creates a cryptographically signed, HTTP-only cookie indicating the dashboard is unlocked.
 */
export async function setDashboardUnlockedSession(actor: {
  adminRole: "PLATFORM_ADMIN" | "DEVICE_ADMIN" | "STAFF_ADMIN"
  actorId?: number
  deviceId?: number
}) {
  const claims: DashboardUnlockPayload = {
    unlocked: true,
    adminRole: actor.adminRole,
    actorId: actor.actorId,
    deviceId: actor.deviceId,
  }

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("2h") // 2 hours unlock session
    .sign(SECRET_KEY)

  const cookieStore = await cookies()
  cookieStore.set(DASHBOARD_UNLOCK_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 2, // 2 hours
  })
}

/**
 * Invalidates the dashboard unlock session.
 */
export async function clearDashboardUnlockedSession() {
  const cookieStore = await cookies()
  cookieStore.delete(DASHBOARD_UNLOCK_COOKIE)
}

/**
 * Verifies if the dashboard unlock session is currently valid and active.
 */
export async function isDashboardUnlockedSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(DASHBOARD_UNLOCK_COOKIE)?.value
    if (!token) return false

    const { payload } = await jwtVerify(token, SECRET_KEY)
    return Boolean((payload as DashboardUnlockPayload).unlocked)
  } catch {
    return false
  }
}
