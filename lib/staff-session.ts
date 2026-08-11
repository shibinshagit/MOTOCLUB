import { cookies } from "next/headers"
import { SignJWT, jwtVerify, type JWTPayload } from "jose"

const STAFF_SESSION_COOKIE = "ims_staff_session"
const SECRET_KEY = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback_super_secret_key_for_development_only_12345!"
)

export interface StaffSessionPayload extends JWTPayload {
  staffId: number
  staffName?: string
  companyId: number | null
  deviceId: number
  deviceName?: string
  branchId: number
  role: string
  phoneNumber: string
  permissions: {
    restricted_pages: string[]
    restricted_values: string[]
  }
}

export async function setStaffSessionCookie(payload: Omit<StaffSessionPayload, "exp" | "iat">) {
  // We use object spread to ensure payload is a clean, plain JS object for jose.
  const claims = { ...payload }

  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(SECRET_KEY)

  const cookieStore = await cookies()
  cookieStore.set(STAFF_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12, // 12 hours
  })
}

export async function getStaffSession(): Promise<StaffSessionPayload | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(STAFF_SESSION_COOKIE)?.value
    
    if (!token) return null
    
    const { payload } = await jwtVerify(token, SECRET_KEY)
    return payload as StaffSessionPayload
  } catch (error) {
    return null
  }
}

export async function clearStaffSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(STAFF_SESSION_COOKIE)
}

// Keeping this for backwards compatibility if it's used elsewhere, 
// though it should ideally be migrated to getStaffSession()
export async function getStaffSessionStaffId(deviceId: number): Promise<number | null> {
  const session = await getStaffSession()
  if (session && session.deviceId === deviceId) {
    return session.staffId
  }
  return null
}
