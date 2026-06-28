import { cookies } from "next/headers"

const STAFF_SESSION_PREFIX = "motocart_staff_session_"

export function getStaffSessionCookieName(deviceId: number) {
  return `${STAFF_SESSION_PREFIX}${deviceId}`
}

export async function getStaffSessionStaffId(deviceId: number): Promise<number | null> {
  if (!deviceId) return null

  const cookieStore = await cookies()
  const raw = cookieStore.get(getStaffSessionCookieName(deviceId))?.value
  if (!raw) return null

  const staffId = Number.parseInt(raw, 10)
  return Number.isNaN(staffId) ? null : staffId
}

export async function setStaffSessionCookie(deviceId: number, staffId: number) {
  const cookieStore = await cookies()
  cookieStore.set(getStaffSessionCookieName(deviceId), String(staffId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  })
}

export async function clearStaffSessionCookie(deviceId: number) {
  const cookieStore = await cookies()
  cookieStore.delete(getStaffSessionCookieName(deviceId))
}
