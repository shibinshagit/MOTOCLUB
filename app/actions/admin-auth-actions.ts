"use server"

import { sql } from "@/lib/db"
import { hashPassword } from "@/lib/password"
import { cookies } from "next/headers"

const ADMIN_COOKIE = "adminAuthToken"

export async function adminLogin(formData: FormData) {
  try {
    const email = (formData.get("email") as string)?.trim().toLowerCase()
    const password = formData.get("password") as string

    if (!email || !password) {
      return { success: false, message: "Email and password are required" }
    }

    const passwordHash = await hashPassword(password)
    const admins = await sql`
      SELECT id, name, email
      FROM admins
      WHERE email = ${email}
        AND password_hash = ${passwordHash}
        AND is_active = TRUE
    `

    if (admins.length === 0) {
      return { success: false, message: "Invalid email or password" }
    }

    const admin = admins[0]
    const token = crypto.randomUUID()

    await sql`
      UPDATE admins
      SET auth_token = ${token}, updated_at = NOW()
      WHERE id = ${admin.id}
    `

    cookies().set({
      name: ADMIN_COOKIE,
      value: token,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    })

    return {
      success: true,
      message: "Login successful",
      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
    }
  } catch (error) {
    console.error("Admin login error:", error)
    return {
      success: false,
      message: "Unable to sign in. Check database connection and try again.",
    }
  }
}

export async function adminLogout() {
  try {
    const token = cookies().get(ADMIN_COOKIE)?.value

    if (token) {
      await sql`
        UPDATE admins
        SET auth_token = NULL, updated_at = NOW()
        WHERE auth_token = ${token}
      `
    }

    cookies().delete(ADMIN_COOKIE)

    return { success: true }
  } catch (error) {
    console.error("Admin logout error:", error)
    cookies().delete(ADMIN_COOKIE)
    return { success: true }
  }
}

export async function getAdminSession() {
  try {
    const token = cookies().get(ADMIN_COOKIE)?.value
    if (!token) {
      return { authenticated: false as const }
    }

    const admins = await sql`
      SELECT id, name, email
      FROM admins
      WHERE auth_token = ${token}
        AND is_active = TRUE
    `

    if (admins.length === 0) {
      cookies().delete(ADMIN_COOKIE)
      return { authenticated: false as const }
    }

    return {
      authenticated: true as const,
      admin: {
        id: admins[0].id,
        name: admins[0].name,
        email: admins[0].email,
      },
    }
  } catch (error) {
    console.error("Admin session error:", error)
    return { authenticated: false as const }
  }
}

export async function requireAdmin() {
  const session = await getAdminSession()
  if (!session.authenticated) {
    throw new Error("Admin authentication required")
  }
  return session.admin
}
